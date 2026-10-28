import { describe, expect, it } from "vitest";
import { mapTodoistTask, parseTodoistDate, syncTodoist } from "./todoist.js";
import { fakeFetch } from "./testing/fakeFetch.js";

const API = "https://api.todoist.com/api/v1";

describe("parseTodoistDate", () => {
  it("treats date-only dues as the end of that local day", () => {
    expect(parseTodoistDate({ date: "2026-11-03", is_recurring: false, string: "Nov 3" })).toBe(
      new Date(2026, 10, 3, 23, 59, 59, 999).getTime(),
    );
  });

  it("reads UTC and floating datetimes", () => {
    expect(parseTodoistDate({ date: "2026-11-03", datetime: "2026-11-03T17:00:00Z", timezone: "Europe/London" })).toBe(
      Date.UTC(2026, 10, 3, 17),
    );
    expect(parseTodoistDate({ date: "2026-11-03T09:30:00" })).toBe(new Date(2026, 10, 3, 9, 30).getTime());
    expect(parseTodoistDate(null)).toBeNull();
  });
});

describe("syncTodoist", () => {
  it("pages through projects and tasks with cursors and maps them", async () => {
    const fetch = fakeFetch((url) => {
      const u = new URL(url);
      const cursor = u.searchParams.get("cursor");
      if (u.pathname === "/api/v1/projects") {
        return { body: { results: [{ id: "P1", name: "Inbox", color: "grey", inbox_project: true }, { id: "P2", name: "Chemistry", color: "berry_red" }], next_cursor: null } };
      }
      if (u.pathname === "/api/v1/tasks" && !cursor) {
        return {
          body: {
            results: [
              {
                id: "T1",
                project_id: "P2",
                content: "Lab write-up",
                priority: 4,
                checked: false,
                due: { date: "2026-11-02", is_recurring: false, string: "Nov 2" },
                deadline: null,
              },
            ],
            next_cursor: "abc",
          },
        };
      }
      if (u.pathname === "/api/v1/tasks" && cursor === "abc") {
        return {
          body: {
            results: [
              { id: "T2", project_id: "P1", content: "Buy pens", priority: 1, due: null, url: "https://app.todoist.com/app/task/buy-pens-T2" },
              { id: "T3", project_id: "P2", content: "Chem midterm", priority: 3, due: { date: "2026-11-01" }, deadline: { date: "2026-11-10", lang: "en" } },
              { id: "T4", project_id: "P2", content: "Gone", is_deleted: true },
            ],
            next_cursor: null,
          },
        };
      }
      return undefined;
    });

    const result = await syncTodoist(fetch, { token: "tok" });
    expect(result.warnings).toEqual([]);
    expect(result.projects).toEqual([
      { id: "P1", name: "Inbox", color: "#b8b8b8", isInbox: true },
      { id: "P2", name: "Chemistry", color: "#b8255f", isInbox: false },
    ]);
    expect(result.assignments).toEqual([
      {
        id: "todoist:T1",
        source: "todoist",
        remoteId: "T1",
        title: "Lab write-up",
        course: "Chemistry",
        courseColor: "#b8255f",
        dueAt: new Date(2026, 10, 2, 23, 59, 59, 999).getTime(),
        kind: "task",
        groupWeight: null,
        pointsPossible: null,
        url: "https://app.todoist.com/app/task/T1",
        completed: false,
        priority: 4,
      },
      expect.objectContaining({ id: "todoist:T2", course: null, courseColor: null, dueAt: null, priority: 1, url: "https://app.todoist.com/app/task/buy-pens-T2" }),
      // The hard deadline wins over the planned due date.
      expect.objectContaining({ id: "todoist:T3", kind: "exam", dueAt: new Date(2026, 10, 10, 23, 59, 59, 999).getTime() }),
    ]);

    const taskCalls = fetch.calls.filter((c) => c.url.startsWith(`${API}/tasks`));
    expect(taskCalls.map((c) => c.url)).toEqual([`${API}/tasks?limit=200`, `${API}/tasks?limit=200&cursor=abc`]);
    expect(fetch.calls[0]?.init?.headers?.["Authorization"]).toBe("Bearer tok");
  });

  it("uses the filter endpoint and survives a project failure", async () => {
    const fetch = fakeFetch((url) => {
      const u = new URL(url);
      if (u.pathname === "/api/v1/projects") return { status: 500, body: "down" };
      if (u.pathname === "/api/v1/tasks/filter") return { body: { results: [{ id: "T9", project_id: "P2", content: "Read ch. 5", priority: 2 }], next_cursor: null } };
      return undefined;
    });
    const result = await syncTodoist(fetch, { token: "tok" }, { filter: "today | overdue" });
    expect(fetch.calls.some((c) => c.url === `${API}/tasks/filter?query=today+%7C+overdue&limit=200`)).toBe(true);
    expect(result.assignments[0]).toMatchObject({ id: "todoist:T9", course: null, kind: "reading", priority: 2 });
    expect(result.warnings[0]).toMatch(/Couldn't read Todoist projects/);
  });

  it("rejects out-of-range priorities", () => {
    expect(mapTodoistTask({ id: "x", content: "y", priority: 9 }, new Map())?.priority).toBeNull();
  });
});
