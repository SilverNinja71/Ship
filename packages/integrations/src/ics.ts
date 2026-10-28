// A forgiving iCalendar (RFC 5545) reader that turns VEVENTs and VTODOs into
// Assignments. Used for Lodestar exports and also works on Canvas calendar
// feeds. Recurring items are imported once (their first occurrence).

import type { Assignment, AssignmentKind, IntegrationId } from "@ship/shared-types";
import { guessKind } from "./kind.js";
import { endOfLocalDay } from "./time.js";
import { stableHash } from "./values.js";

export interface IcsImport {
  assignments: Assignment[];
  /** X-WR-CALNAME, when the feed has one. */
  calendarName: string | null;
  warnings: string[];
}

interface IcsProperty {
  name: string;
  params: Record<string, string>;
  value: string;
}

type Component = Map<string, IcsProperty[]>;

/** Undo line folding: a line break followed by a space or tab continues the line. */
export function unfoldIcsLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n")
    .filter((line) => line.trim() !== "");
}

/** `NAME;PARAM=a;PARAM2="b:c":value` → parts. Quoted params may contain `:` and `;`. */
export function parseIcsLine(line: string): IcsProperty | null {
  let i = 0;
  let inQuotes = false;
  const parts: string[] = [];
  let current = "";
  for (; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    if (!inQuotes && (c === ";" || c === ":")) {
      parts.push(current);
      current = "";
      if (c === ":") break;
      continue;
    }
    current += c;
  }
  if (i >= line.length) return null;
  const [name, ...rawParams] = parts;
  if (!name) return null;
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"(.*)"$/, "$1");
  }
  return { name: name.toUpperCase(), params, value: line.slice(i + 1) };
}

/** Unescapes TEXT values: `\n`, `\,`, `\;`, `\\`. */
export function unescapeIcsText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

// Outlook writes Windows zone names; map the common ones so they still resolve.
const WINDOWS_ZONES: Record<string, string> = {
  "eastern standard time": "America/New_York",
  "central standard time": "America/Chicago",
  "mountain standard time": "America/Denver",
  "us mountain standard time": "America/Phoenix",
  "pacific standard time": "America/Los_Angeles",
  "alaskan standard time": "America/Anchorage",
  "hawaiian standard time": "Pacific/Honolulu",
  "atlantic standard time": "America/Halifax",
  "gmt standard time": "Europe/London",
  "w. europe standard time": "Europe/Berlin",
  "romance standard time": "Europe/Paris",
  "central europe standard time": "Europe/Budapest",
  "aus eastern standard time": "Australia/Sydney",
  "tokyo standard time": "Asia/Tokyo",
  "china standard time": "Asia/Shanghai",
  "india standard time": "Asia/Kolkata",
  utc: "UTC",
};

const formatters = new Map<string, Intl.DateTimeFormat | null>();

function formatterFor(zone: string): Intl.DateTimeFormat | null {
  if (!formatters.has(zone)) {
    let fmt: Intl.DateTimeFormat | null = null;
    try {
      fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      fmt = null;
    }
    formatters.set(zone, fmt);
  }
  return formatters.get(zone) ?? null;
}

/** Tries the TZID as given, then its trailing "Area/City" (e.g. "/mozilla.org/.../America/New_York"). */
function resolveZone(tzid: string): Intl.DateTimeFormat | null {
  const clean = tzid.trim();
  const candidates = [clean, WINDOWS_ZONES[clean.toLowerCase()] ?? ""];
  const segments = clean.split("/").filter(Boolean);
  if (segments.length >= 2) candidates.push(segments.slice(-2).join("/"));
  if (segments.length >= 3) candidates.push(segments.slice(-3).join("/"));
  for (const zone of candidates) {
    const fmt = zone ? formatterFor(zone) : null;
    if (fmt) return fmt;
  }
  return null;
}

/** Wall-clock time in a named zone → epoch ms (two passes so DST edges land right). */
function zonedWallTimeToEpoch(fmt: Intl.DateTimeFormat, wall: number): number {
  const offsetAt = (t: number) => {
    const parts = fmt.formatToParts(new Date(t));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
    return asUtc - t;
  };
  const first = wall - offsetAt(wall);
  return wall - offsetAt(first);
}

export interface IcsTime {
  epochMs: number;
  /** VALUE=DATE: no time of day. */
  dateOnly: boolean;
  /** A TZID we couldn't resolve, read as local time instead. */
  unknownZone: string | null;
}

/** Reads DTSTART / DUE / DTEND style values. */
export function parseIcsTime(prop: IcsProperty): IcsTime | null {
  const value = prop.value.trim();
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (date || prop.params["VALUE"] === "DATE") {
    const d = date ?? /^(\d{4})(\d{2})(\d{2})/.exec(value);
    if (!d) return null;
    return { epochMs: endOfLocalDay(Number(d[1]), Number(d[2]), Number(d[3])), dateOnly: true, unknownZone: null };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? "0"].map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (m[7]) return { epochMs: Date.UTC(y, mo - 1, d, h, mi, s), dateOnly: false, unknownZone: null };
  const tzid = prop.params["TZID"];
  if (tzid) {
    const fmt = resolveZone(tzid);
    if (fmt) return { epochMs: zonedWallTimeToEpoch(fmt, Date.UTC(y, mo - 1, d, h, mi, s)), dateOnly: false, unknownZone: null };
    return { epochMs: new Date(y, mo - 1, d, h, mi, s).getTime(), dateOnly: false, unknownZone: tzid };
  }
  // "Floating" time: the same wall-clock time wherever the user is.
  return { epochMs: new Date(y, mo - 1, d, h, mi, s).getTime(), dateOnly: false, unknownZone: null };
}

/** RFC 5545 PRIORITY (1 highest .. 9 lowest, 0 undefined) → Ship's 1 (low) .. 4 (urgent). */
export function icsPriorityToShip(value: number): number | null {
  if (!Number.isInteger(value) || value < 1 || value > 9) return null;
  if (value === 1) return 4;
  if (value <= 4) return 3;
  if (value === 5) return 2;
  return 1;
}

function first(component: Component, name: string): IcsProperty | undefined {
  return component.get(name)?.[0];
}

function text(component: Component, name: string): string | null {
  const prop = first(component, name);
  if (!prop) return null;
  const value = unescapeIcsText(prop.value).trim();
  return value === "" ? null : value;
}

export interface IcsOptions {
  /** Kind for items whose title gives no hint. Defaults: VTODO → task, VEVENT → assignment. */
  defaultKind?: AssignmentKind;
}

export function parseIcs(input: string, source: IntegrationId, options: IcsOptions = {}): IcsImport {
  const lines = unfoldIcsLines(input.replace(/^﻿/, ""));
  const warnings: string[] = [];
  if (!lines.some((l) => /^BEGIN:VCALENDAR$/i.test(l.trim()))) {
    return { assignments: [], calendarName: null, warnings: ["This doesn't look like a calendar (.ics) file."] };
  }

  let calendarName: string | null = null;
  const items: { type: "VEVENT" | "VTODO"; props: Component }[] = [];
  const stack: string[] = [];
  let current: Component | null = null;

  for (const line of lines) {
    const prop = parseIcsLine(line);
    if (!prop) continue;
    if (prop.name === "BEGIN") {
      const type = prop.value.trim().toUpperCase();
      stack.push(type);
      if ((type === "VEVENT" || type === "VTODO") && stack.length === 2) {
        current = new Map();
        items.push({ type, props: current });
      }
      continue;
    }
    if (prop.name === "END") {
      const type = stack.pop();
      if (type === "VEVENT" || type === "VTODO") current = null;
      continue;
    }
    if (stack.length === 1 && prop.name === "X-WR-CALNAME") calendarName = unescapeIcsText(prop.value).trim() || null;
    // Only the item's own properties; nested VALARMs have their own DESCRIPTION etc.
    if (current && stack.length === 2) {
      const list = current.get(prop.name) ?? [];
      list.push(prop);
      current.set(prop.name, list);
    }
  }

  const assignments: Assignment[] = [];
  const seen = new Set<string>();
  const unknownZones = new Set<string>();
  let recurring = 0;
  let cancelled = 0;

  for (const { type, props } of items) {
    const status = text(props, "STATUS")?.toUpperCase() ?? null;
    if (status === "CANCELLED") {
      cancelled++;
      continue;
    }
    const summary = text(props, "SUMMARY") ?? "Untitled";
    // Canvas feeds title items "Essay 1 [ENG 101]"; the brackets name the course.
    const bracket = /^(.*\S)\s*\[([^\]]+)\]\s*$/.exec(summary);
    const title = bracket?.[1] ?? summary;
    const course = bracket?.[2]?.trim() ?? null;

    const timeProp =
      type === "VTODO"
        ? (first(props, "DUE") ?? first(props, "DTEND") ?? first(props, "DTSTART"))
        : (first(props, "DTSTART") ?? first(props, "DTEND"));
    let time = timeProp ? parseIcsTime(timeProp) : null;
    // An all-day DTEND is exclusive (the day after), so step back to the real last day.
    if (time?.dateOnly && timeProp?.name === "DTEND" && !first(props, "DTSTART")) {
      time = { ...time, epochMs: time.epochMs - 24 * 60 * 60 * 1000 };
    }
    if (time?.unknownZone) unknownZones.add(time.unknownZone);

    const recurrenceId = first(props, "RECURRENCE-ID")?.value.trim();
    if (first(props, "RRULE")) recurring++;
    const uid = text(props, "UID") ?? `nouid-${stableHash(`${summary}|${timeProp?.value ?? ""}`)}`;
    const remoteId = recurrenceId ? `${uid}#${recurrenceId}` : uid;
    if (seen.has(remoteId)) continue;
    seen.add(remoteId);

    const percent = Number(text(props, "PERCENT-COMPLETE") ?? "0");
    const priority = Number(text(props, "PRIORITY") ?? "0");
    const description = text(props, "DESCRIPTION");
    const url = text(props, "URL") ?? /https?:\/\/[^\s<>"]+/.exec(description ?? "")?.[0] ?? null;

    assignments.push({
      id: `${source}:${remoteId}`,
      source,
      remoteId,
      title,
      course,
      courseColor: null,
      dueAt: time?.epochMs ?? null,
      kind: guessKind(title, options.defaultKind ?? (type === "VTODO" ? "task" : "assignment")),
      groupWeight: null,
      pointsPossible: null,
      url,
      completed: status === "COMPLETED" || first(props, "COMPLETED") !== undefined || percent >= 100,
      priority: icsPriorityToShip(priority),
    });
  }

  if (recurring > 0) warnings.push(`${recurring} repeating item(s) were imported once, at their first date.`);
  if (cancelled > 0) warnings.push(`Skipped ${cancelled} cancelled item(s).`);
  for (const zone of unknownZones) warnings.push(`Unknown time zone "${zone}"; those times were read as your local time.`);
  if (assignments.length === 0 && cancelled === 0) warnings.push("The calendar has no events or tasks.");
  return { assignments, calendarName, warnings };
}
