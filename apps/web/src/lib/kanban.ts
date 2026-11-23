// The Kanban board and the 10-minute daily plan in Banana Planna. Pure rules
// here (moving cards, today's top 3, the planning streak, the board as an
// Obsidian Kanban note); the state lives in plannerStore.

export type KanbanColumnId = "todo" | "doing" | "done";

export interface KanbanCard {
  id: string;
  text: string;
  column: KanbanColumnId;
  /** Local YYYY-MM-DD, or null. */
  due: string | null;
  createdAt: number;
  doneAt: number | null;
}

export const KANBAN_COLUMNS: readonly { id: KanbanColumnId; label: string }[] = [
  { id: "todo", label: "To do" },
  { id: "doing", label: "Doing" },
  { id: "done", label: "Done" },
];

/** A gentle limit: more than 3 things "in progress" means none of them is. */
export const DOING_LIMIT = 3;
/** Today's top 3. */
export const TOP_PICKS = 3;
/** The daily planning ritual. */
export const PLAN_MINUTES = 10;

/** Today's date on the sailor's own clock (not UTC), as YYYY-MM-DD. */
export function localDayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const dayBefore = (key: string) => {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return localDayKey(new Date(y, m - 1, d - 1));
};

/** Days planned in a row, counting today if planned, or else up to yesterday (today isn't over yet). */
export function planStreak(plannedDays: readonly string[], today = localDayKey()): number {
  const days = new Set(plannedDays);
  let day = days.has(today) ? today : dayBefore(today);
  let n = 0;
  while (days.has(day)) {
    n++;
    day = dayBefore(day);
  }
  return n;
}

/**
 * Moves a card to a column, before `beforeId` (or to the end). Order in the array is order on the board.
 * Moving into Done stamps doneAt; moving out clears it.
 */
export function moveCard(cards: readonly KanbanCard[], id: string, column: KanbanColumnId, beforeId: string | null = null, now = Date.now()): KanbanCard[] {
  const card = cards.find((c) => c.id === id);
  if (!card || id === beforeId) return [...cards];
  const moved: KanbanCard = { ...card, column, doneAt: column === "done" ? (card.column === "done" ? card.doneAt : now) : null };
  const rest = cards.filter((c) => c.id !== id);
  const at = beforeId ? rest.findIndex((c) => c.id === beforeId && c.column === column) : -1;
  if (at >= 0) return [...rest.slice(0, at), moved, ...rest.slice(at)];
  // To the end of its column: after the column's last card, so other columns' order is untouched.
  let last = -1;
  rest.forEach((c, i) => {
    if (c.column === column) last = i;
  });
  return last >= 0 ? [...rest.slice(0, last + 1), moved, ...rest.slice(last + 1)] : [...rest, moved];
}

/** Picks or unpicks a card for today's top 3. Returns the same list when a fourth is asked for. */
export function togglePick(picks: readonly string[], id: string): string[] {
  if (picks.includes(id)) return picks.filter((p) => p !== id);
  return picks.length >= TOP_PICKS ? [...picks] : [...picks, id];
}

const oneLine = (s: string) => s.replace(/\s*\r?\n\s*/g, " ").trim();

/**
 * The board as a note the Obsidian Kanban plugin opens as a board: a `kanban-plugin: board` property,
 * one `##` heading per list, `- [ ]` cards with `@{date}` due dates, and Done marked complete.
 */
export function kanbanToMarkdown(cards: readonly KanbanCard[]): string {
  const lists = KANBAN_COLUMNS.map(({ id, label }) => {
    const items = cards
      .filter((c) => c.column === id && c.text.trim())
      .map((c) => `- [${id === "done" ? "x" : " "}] ${oneLine(c.text)}${c.due ? ` @{${c.due}}` : ""}`);
    return `## ${label}\n\n${id === "done" ? "**Complete**\n" : ""}${items.join("\n")}${items.length ? "\n" : ""}`;
  });
  const settings = JSON.stringify({ "kanban-plugin": "board", "list-collapse": KANBAN_COLUMNS.map(() => false) });
  return `---\n\nkanban-plugin: board\n\n---\n\n${lists.join("\n\n")}\n\n\n%% kanban:settings\n\`\`\`\n${settings}\n\`\`\`\n%%`;
}
