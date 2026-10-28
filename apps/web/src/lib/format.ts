// Friendly formatting for times, dates and numbers.

import { DAY_MS, dayKey } from "./voyageLogic.js";

/** 25:00, or 1:05:00 past an hour. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return h ? `${h}:${mm}:${String(s).padStart(2, "0")}` : `${mm}:${String(s).padStart(2, "0")}`;
}

/** "45 m", "2 h 5 m". */
export function formatMinutes(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} m` : `${h} h`;
}

const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const date = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

/** "Today 5:00 PM", "Tomorrow 9:00 AM", "Fri 11:59 PM", "Nov 14", "Overdue: Oct 20". */
export function formatDue(dueAt: number | null, now = Date.now()): string {
  if (dueAt === null) return "No due date";
  const today = dayKey(now);
  const key = dayKey(dueAt);
  const days = Math.round((startOfDay(dueAt) - startOfDay(now)) / DAY_MS);
  const clock = time.format(dueAt);
  if (dueAt < now) return key === today ? `Overdue (${clock})` : `Overdue: ${date.format(dueAt)}`;
  if (key === today) return `Today ${clock}`;
  if (days === 1) return `Tomorrow ${clock}`;
  if (days < 7) return `${weekday.format(dueAt)} ${clock}`;
  return date.format(dueAt);
}

export type DueBucket = "overdue" | "today" | "week" | "later" | "undated";

export function dueBucket(dueAt: number | null, now = Date.now()): DueBucket {
  if (dueAt === null) return "undated";
  if (dueAt < now) return "overdue";
  const days = Math.round((startOfDay(dueAt) - startOfDay(now)) / DAY_MS);
  if (days === 0) return "today";
  if (days < 7) return "week";
  return "later";
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat().format(Math.round(n));
}

export function relativeTime(at: number, now = Date.now()): string {
  const s = Math.round((now - at) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return date.format(at);
}
