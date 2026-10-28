import { describe, expect, it } from "vitest";
import { icsPriorityToShip, parseIcs, parseIcsLine, parseIcsTime, unescapeIcsText, unfoldIcsLines } from "./ics.js";
import { importLodestarCalendar } from "./lodestar.js";

const crlf = (lines: string[]) => lines.join("\r\n") + "\r\n";

const CANVAS_FEED = crlf([
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Instructure//Canvas//EN",
  "X-WR-CALNAME:Ada Lovelace Calendar (Canvas)",
  "BEGIN:VEVENT",
  "UID:event-assignment-5001",
  "DTSTART:20261030T035900Z",
  "DTEND:20261030T035900Z",
  "SUMMARY:Lab report 1 [BIO 110]",
  "DESCRIPTION:Write up the osmosis lab\\, with graphs\\nSee rubric.",
  "URL:https://school.instructure.com/courses/101/assignments/5001",
  "BEGIN:VALARM",
  "ACTION:DISPLAY",
  "DESCRIPTION:Reminder",
  "TRIGGER:-PT15M",
  "END:VALARM",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:event-assignment-5003",
  "DTSTART;VALUE=DATE:20261105",
  "DTEND;VALUE=DATE:20261106",
  "SUMMARY:Midterm Exam [BIO 110]",
  "END:VEVENT",
  "END:VCALENDAR",
]);

describe("ICS primitives", () => {
  it("unfolds continuation lines", () => {
    expect(unfoldIcsLines("SUMMARY:Long ti\r\n tle here\r\nUID:1\n\tcontinued\n")).toEqual(["SUMMARY:Long title here", "UID:1continued"]);
  });

  it("parses params, including quoted ones with colons", () => {
    expect(parseIcsLine('DTSTART;TZID="America/New_York";X-A=1:20261030T120000')).toEqual({
      name: "DTSTART",
      params: { TZID: "America/New_York", "X-A": "1" },
      value: "20261030T120000",
    });
    expect(parseIcsLine('ATTENDEE;CN="Doe: Jane":mailto:j@x.org')?.value).toBe("mailto:j@x.org");
    expect(parseIcsLine("no colon here")).toBeNull();
  });

  it("unescapes text", () => {
    expect(unescapeIcsText("a\\, b\\; c\\\\d\\ne\\Nf")).toBe("a, b; c\\d\ne\nf");
  });

  it("reads UTC, floating, all-day and zoned times", () => {
    const t = (line: string) => parseIcsTime(parseIcsLine(line)!);
    expect(t("DUE:20261030T120000Z")?.epochMs).toBe(Date.UTC(2026, 9, 30, 12));
    expect(t("DUE:20261030T120000")?.epochMs).toBe(new Date(2026, 9, 30, 12).getTime());
    expect(t("DUE;VALUE=DATE:20261030")).toEqual({ epochMs: new Date(2026, 9, 30, 23, 59, 59, 999).getTime(), dateOnly: true, unknownZone: null });
    // New York is UTC-4 in late October (EDT) and UTC-5 after the switch (EST).
    expect(t("DTSTART;TZID=America/New_York:20261030T120000")?.epochMs).toBe(Date.UTC(2026, 9, 30, 16));
    expect(t("DTSTART;TZID=America/New_York:20261110T120000")?.epochMs).toBe(Date.UTC(2026, 10, 10, 17));
    expect(t("DTSTART;TZID=/mozilla.org/20050126_1/Asia/Tokyo:20261030T090000")?.epochMs).toBe(Date.UTC(2026, 9, 30, 0));
    expect(t("DTSTART;TZID=Pacific Standard Time:20261030T090000")?.epochMs).toBe(Date.UTC(2026, 9, 30, 16));
    expect(t("DTSTART;TZID=Mars/Olympus_Mons:20261030T090000")?.unknownZone).toBe("Mars/Olympus_Mons");
    expect(t("DTSTART:garbage")).toBeNull();
  });

  it("maps RFC 5545 priorities", () => {
    expect([0, 1, 2, 4, 5, 6, 9, 10].map(icsPriorityToShip)).toEqual([null, 4, 3, 3, 2, 1, 1, null]);
  });
});

describe("parseIcs", () => {
  it("reads a Canvas calendar feed", () => {
    const result = parseIcs(CANVAS_FEED, "canvas");
    expect(result.calendarName).toBe("Ada Lovelace Calendar (Canvas)");
    expect(result.warnings).toEqual([]);
    expect(result.assignments).toEqual([
      {
        id: "canvas:event-assignment-5001",
        source: "canvas",
        remoteId: "event-assignment-5001",
        title: "Lab report 1",
        course: "BIO 110",
        courseColor: null,
        dueAt: Date.UTC(2026, 9, 30, 3, 59),
        kind: "assignment",
        groupWeight: null,
        pointsPossible: null,
        url: "https://school.instructure.com/courses/101/assignments/5001",
        completed: false,
        priority: null,
      },
      expect.objectContaining({
        title: "Midterm Exam",
        kind: "exam",
        dueAt: new Date(2026, 10, 5, 23, 59, 59, 999).getTime(),
      }),
    ]);
  });

  it("reads VTODOs as Lodestar tasks", () => {
    const ics = crlf([
      "BEGIN:VCALENDAR",
      "BEGIN:VTODO",
      "UID:task-1@lodestar",
      "SUMMARY:Outline essay",
      "DUE;TZID=America/Chicago:20261103T170000",
      "PRIORITY:1",
      "STATUS:NEEDS-ACTION",
      "DESCRIPTION:Draft at https://docs.google.com/document/d/abc and send",
      "END:VTODO",
      "BEGIN:VTODO",
      "UID:task-2@lodestar",
      "SUMMARY:Done thing",
      "STATUS:COMPLETED",
      "END:VTODO",
      "BEGIN:VTODO",
      "UID:task-3@lodestar",
      "SUMMARY:Half done",
      "PERCENT-COMPLETE:100",
      "END:VTODO",
      "END:VCALENDAR",
    ]);
    const { assignments, warnings } = importLodestarCalendar(ics);
    expect(warnings).toEqual([]);
    expect(assignments[0]).toEqual({
      id: "lodestar:task-1@lodestar",
      source: "lodestar",
      remoteId: "task-1@lodestar",
      title: "Outline essay",
      course: null,
      courseColor: null,
      dueAt: Date.UTC(2026, 10, 3, 23),
      kind: "task",
      groupWeight: null,
      pointsPossible: null,
      url: "https://docs.google.com/document/d/abc",
      completed: false,
      priority: 4,
    });
    expect(assignments.map((a) => a.completed)).toEqual([false, true, true]);
  });

  it("handles recurring, cancelled, missing-UID and unknown-zone items", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:weekly",
      "SUMMARY:Weekly quiz",
      "DTSTART:20261102T150000Z",
      "RRULE:FREQ=WEEKLY;COUNT=10",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:weekly",
      "RECURRENCE-ID:20261109T150000Z",
      "SUMMARY:Weekly quiz (moved)",
      "DTSTART:20261110T150000Z",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:gone",
      "SUMMARY:Cancelled lecture",
      "STATUS:CANCELLED",
      "DTSTART:20261102T150000Z",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "SUMMARY:No uid",
      "DTSTART;TZID=Nowhere/Land:20261102T150000",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");
    const once = parseIcs(ics, "lodestar");
    const again = parseIcs(ics, "lodestar");
    expect(once.assignments.map((a) => a.remoteId)).toEqual(["weekly", "weekly#20261109T150000Z", expect.stringMatching(/^nouid-[0-9a-f]{8}$/)]);
    // Ids without a UID are still stable across imports.
    expect(again.assignments[2]?.id).toBe(once.assignments[2]?.id);
    expect(once.assignments[0]?.kind).toBe("quiz");
    expect(once.warnings).toEqual([
      "1 repeating item(s) were imported once, at their first date.",
      "Skipped 1 cancelled item(s).",
      'Unknown time zone "Nowhere/Land"; those times were read as your local time.',
    ]);
  });

  it("uses an exclusive all-day DTEND correctly", () => {
    const ics = crlf(["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:x", "SUMMARY:Reading week", "DTEND;VALUE=DATE:20261107", "END:VEVENT", "END:VCALENDAR"]);
    expect(parseIcs(ics, "lodestar").assignments[0]?.dueAt).toBe(new Date(2026, 10, 6, 23, 59, 59, 999).getTime());
  });

  it("rejects text that isn't a calendar", () => {
    expect(parseIcs("hello", "lodestar").warnings).toEqual(["This doesn't look like a calendar (.ics) file."]);
    expect(parseIcs("BEGIN:VCALENDAR\nEND:VCALENDAR", "lodestar").warnings).toEqual(["The calendar has no events or tasks."]);
  });
});
