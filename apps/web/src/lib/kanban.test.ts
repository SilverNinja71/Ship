import { describe, expect, it } from "vitest";
import { kanbanToMarkdown, localDayKey, moveCard, planStreak, togglePick } from "./kanban.js";
import type { KanbanCard } from "./kanban.js";

const card = (id: string, column: KanbanCard["column"], extra: Partial<KanbanCard> = {}): KanbanCard => ({ id, text: id, column, due: null, createdAt: 0, doneAt: null, ...extra });

describe("the Kanban board", () => {
  const board = [card("a", "todo"), card("b", "todo"), card("x", "doing"), card("c", "todo")];

  it("moves a card to the end of another column, leaving the rest in order", () => {
    const next = moveCard(board, "a", "doing", null, 5);
    expect(next.filter((c) => c.column === "doing").map((c) => c.id)).toEqual(["x", "a"]);
    expect(next.filter((c) => c.column === "todo").map((c) => c.id)).toEqual(["b", "c"]);
  });

  it("drops a card before another one, and stamps Done", () => {
    const next = moveCard(board, "c", "todo", "a");
    expect(next.filter((c) => c.column === "todo").map((c) => c.id)).toEqual(["c", "a", "b"]);
    const done = moveCard(board, "x", "done", null, 42);
    expect(done.find((c) => c.id === "x")).toMatchObject({ column: "done", doneAt: 42 });
    expect(moveCard(done, "x", "todo").find((c) => c.id === "x")!.doneAt).toBeNull();
  });

  it("keeps today's picks to three", () => {
    expect(togglePick(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    expect(togglePick(["a", "b", "c"], "d")).toEqual(["a", "b", "c"]);
    expect(togglePick(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  it("writes a board the Obsidian Kanban plugin opens", () => {
    const md = kanbanToMarkdown([card("Read ch. 3", "todo", { due: "2026-11-25" }), card("Lab\nreport", "doing"), card("Quiz", "done", { doneAt: 1 })]);
    expect(md.startsWith("---\n\nkanban-plugin: board\n\n---\n\n## To do\n\n- [ ] Read ch. 3 @{2026-11-25}\n")).toBe(true);
    expect(md).toContain("## Doing\n\n- [ ] Lab report\n");
    expect(md).toContain("## Done\n\n**Complete**\n- [x] Quiz\n");
    expect(md).toContain('%% kanban:settings\n```\n{"kanban-plugin":"board"');
  });
});

describe("the daily plan streak", () => {
  it("counts days in a row on the sailor's own calendar", () => {
    expect(localDayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(planStreak(["2026-11-21", "2026-11-22", "2026-11-23"], "2026-11-23")).toBe(3);
    // Today isn't planned yet: yesterday's streak still stands.
    expect(planStreak(["2026-11-21", "2026-11-22"], "2026-11-23")).toBe(2);
    expect(planStreak(["2026-11-20", "2026-11-22"], "2026-11-23")).toBe(1);
    expect(planStreak(["2026-11-20"], "2026-11-23")).toBe(0);
    // Across a month end.
    expect(planStreak(["2026-10-31", "2026-11-01"], "2026-11-01")).toBe(2);
  });
});
