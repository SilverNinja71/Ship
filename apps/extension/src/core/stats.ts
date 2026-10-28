// Today's counters for the popup and the web app. "Today" is the local
// calendar day, like Ship's streaks, so they reset at local midnight.

import type { LookoutStats } from "@ship/shared-types";

export interface DailyStats {
  /** Local date, YYYY-MM-DD. */
  day: string;
  blocked: number;
  steeredBack: number;
  leisurePasses: number;
}

export type StatField = "blocked" | "steeredBack" | "leisurePasses";

export function localDayKey(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function emptyStats(now: number): DailyStats {
  return { day: localDayKey(now), blocked: 0, steeredBack: 0, leisurePasses: 0 };
}

const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

export function normalizeStats(raw: unknown, now: number): DailyStats {
  if (!raw || typeof raw !== "object") return emptyStats(now);
  const r = raw as Record<string, unknown>;
  return { day: typeof r.day === "string" ? r.day : "", blocked: count(r.blocked), steeredBack: count(r.steeredBack), leisurePasses: count(r.leisurePasses) };
}

/** The stats for today: yesterday's numbers are dropped once the date changes. */
export function currentStats(stats: DailyStats, now: number): DailyStats {
  return stats.day === localDayKey(now) ? stats : emptyStats(now);
}

export function bumpStat(stats: DailyStats, field: StatField, now: number): DailyStats {
  const today = currentStats(stats, now);
  return { ...today, [field]: today[field] + 1 };
}

export function statsView(stats: DailyStats, now: number, geminiReady: boolean): LookoutStats {
  const today = currentStats(stats, now);
  return { blockedToday: today.blocked, steeredBackToday: today.steeredBack, leisurePassesToday: today.leisurePasses, geminiReady };
}
