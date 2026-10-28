// Todoist, read with a personal API token through Todoist's unified API v1
// (https://api.todoist.com/api/v1, which replaced REST v2). Lists use cursor
// paging: `{ results, next_cursor }`. Todoist allows browser requests, so no
// relay is needed.

import type { Assignment, FetchLike, IntegrationSettings } from "@ship/shared-types";
import { bearer, getCursorPaged, withQuery } from "./http.js";
import { guessKind } from "./kind.js";
import { asBoolean, asDict, asId, asNumber, asString, asText } from "./values.js";
import { parseDateString } from "./time.js";

export type TodoistSettings = NonNullable<IntegrationSettings["todoist"]>;

export const TODOIST_API_BASE = "https://api.todoist.com/api/v1";
const SERVICE = "Todoist";
/** Todoist's maximum page size. */
const PAGE_LIMIT = 200;

/** Todoist's named project colors, as hex. */
export const TODOIST_COLORS: Record<string, string> = {
  berry_red: "#b8255f",
  red: "#db4035",
  orange: "#ff9933",
  yellow: "#fad000",
  olive_green: "#afb83b",
  lime_green: "#7ecc49",
  green: "#299438",
  mint_green: "#6accbc",
  teal: "#158fad",
  sky_blue: "#14aaf5",
  light_blue: "#96c3eb",
  blue: "#4073ff",
  grape: "#884dff",
  violet: "#af38eb",
  lavender: "#eb96eb",
  magenta: "#e05194",
  salmon: "#ff8d85",
  charcoal: "#808080",
  grey: "#b8b8b8",
  taupe: "#ccac93",
};

export interface TodoistProject {
  id: string;
  name: string;
  color: string | null;
  isInbox: boolean;
}

export interface TodoistSyncResult {
  projects: TodoistProject[];
  assignments: Assignment[];
  warnings: string[];
}

export async function listTodoistProjects(fetch: FetchLike, settings: TodoistSettings): Promise<TodoistProject[]> {
  const raw = await getCursorPaged(
    fetch,
    (cursor) => withQuery(`${TODOIST_API_BASE}/projects`, { limit: PAGE_LIMIT, cursor }),
    { method: "GET", headers: bearer(settings.token) },
    { service: SERVICE },
  );
  const projects: TodoistProject[] = [];
  for (const item of raw) {
    const p = asDict(item);
    const id = asId(p?.["id"]);
    if (!p || !id) continue;
    const colorName = asString(p["color"]);
    projects.push({
      id,
      name: asText(p["name"]) ?? "Untitled project",
      color: colorName ? (TODOIST_COLORS[colorName] ?? null) : null,
      isInbox: asBoolean(p["inbox_project"]) === true || asBoolean(p["is_inbox_project"]) === true,
    });
  }
  return projects;
}

/**
 * Active (unfinished) tasks, raw. With `filter`, uses Todoist's filter syntax
 * (e.g. "today | overdue", "#School") via /tasks/filter.
 */
export async function listTodoistTasks(
  fetch: FetchLike,
  settings: TodoistSettings,
  options: { filter?: string; projectId?: string } = {},
): Promise<unknown[]> {
  const pageUrl = (cursor: string | null) =>
    options.filter
      ? withQuery(`${TODOIST_API_BASE}/tasks/filter`, { query: options.filter, limit: PAGE_LIMIT, cursor })
      : withQuery(`${TODOIST_API_BASE}/tasks`, { project_id: options.projectId, limit: PAGE_LIMIT, cursor });
  return getCursorPaged(fetch, pageUrl, { method: "GET", headers: bearer(settings.token) }, { service: SERVICE });
}

/**
 * A Todoist due (`{ date, datetime?, timezone?, ... }`) or deadline
 * (`{ date }`) to epoch ms. `date` is "YYYY-MM-DD" for all-day tasks (end of
 * that local day) or a datetime for timed ones; a trailing `Z` means UTC,
 * none means the user's local wall time.
 */
export function parseTodoistDate(value: unknown): number | null {
  const due = asDict(value);
  const text = asText(due?.["datetime"]) ?? asText(due?.["date"]);
  return text ? parseDateString(text) : null;
}

export function mapTodoistTask(raw: unknown, projects: ReadonlyMap<string, TodoistProject>): Assignment | null {
  const task = asDict(raw);
  const remoteId = asId(task?.["id"]);
  if (!task || !remoteId || task["is_deleted"] === true) return null;
  const title = asText(task["content"]) ?? "Untitled task";
  const project = projects.get(asId(task["project_id"]) ?? "");
  const priority = asNumber(task["priority"]);
  return {
    id: `todoist:${remoteId}`,
    source: "todoist",
    remoteId,
    title,
    course: project && !project.isInbox ? project.name : null,
    courseColor: project && !project.isInbox ? project.color : null,
    // A deadline is the hard date; `due` is often just when the student plans to do it.
    dueAt: parseTodoistDate(task["deadline"]) ?? parseTodoistDate(task["due"]),
    kind: guessKind(title, "task"),
    groupWeight: null,
    pointsPossible: null,
    url: asText(task["url"]) ?? `https://app.todoist.com/app/task/${encodeURIComponent(remoteId)}`,
    completed: asBoolean(task["checked"]) === true || asBoolean(task["is_completed"]) === true,
    // Todoist's API already uses 1 = normal .. 4 = urgent (the app shows it reversed as P4..P1).
    priority: priority !== null && priority >= 1 && priority <= 4 ? Math.round(priority) : null,
  };
}

export async function syncTodoist(
  fetch: FetchLike,
  settings: TodoistSettings,
  options: { filter?: string } = {},
): Promise<TodoistSyncResult> {
  const warnings: string[] = [];
  const [projects, rawTasks] = await Promise.all([
    listTodoistProjects(fetch, settings).catch((e: unknown) => {
      warnings.push(`Couldn't read Todoist projects (${e instanceof Error ? e.message : String(e)}).`);
      return [] as TodoistProject[];
    }),
    listTodoistTasks(fetch, settings, options),
  ]);
  const byId = new Map(projects.map((p) => [p.id, p]));
  const assignments = rawTasks
    .map((t) => mapTodoistTask(t, byId))
    .filter((a): a is Assignment => a !== null);
  return { projects, assignments, warnings };
}
