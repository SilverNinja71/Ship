// The voyage timer's rules as plain functions of (state, now), so the store
// stays thin and the rules are easy to test. Time is always computed from
// timestamps, never by counting ticks, so a throttled background tab can't
// drift.

import type { VoyagePhase, VoyagePresetId, VoyageRecord } from "@ship/shared-types";

export const MINUTE_MS = 60_000;
export const DAY_MS = 86_400_000;

export type PauseReason = "manual" | "idle";

export interface VoyageClock {
  phase: VoyagePhase;
  presetId: VoyagePresetId;
  focusMinutes: number;
  breakMinutes: number;
  /** When the voyage was first set sailing. */
  voyageStartedAt: number | null;
  /** Start of the current sailing stretch (pauses split a voyage into stretches). */
  segmentStartedAt: number | null;
  /** Focus time banked from earlier stretches. */
  bankedMs: number;
  pausedReason: PauseReason | null;
  breakEndsAt: number | null;
  /** Whole focus minutes already paid out this voyage. */
  paidMinutes: number;
}

export const DOCKED: VoyageClock = {
  phase: "docked",
  presetId: "coastal",
  focusMinutes: 25,
  breakMinutes: 5,
  voyageStartedAt: null,
  segmentStartedAt: null,
  bankedMs: 0,
  pausedReason: null,
  breakEndsAt: null,
  paidMinutes: 0,
};

export function focusedMs(c: VoyageClock, now: number): number {
  const running = c.phase === "sailing" && c.segmentStartedAt !== null ? Math.max(0, now - c.segmentStartedAt) : 0;
  return Math.min(c.focusMinutes * MINUTE_MS, c.bankedMs + running);
}

export function remainingFocusMs(c: VoyageClock, now: number): number {
  return Math.max(0, c.focusMinutes * MINUTE_MS - focusedMs(c, now));
}

/** 0..1 through the focus block (stays at its value while drifting). */
export function focusProgress(c: VoyageClock, now: number): number {
  if (c.phase === "docked") return 0;
  if (c.phase === "shore-leave") return 1;
  return focusedMs(c, now) / (c.focusMinutes * MINUTE_MS);
}

/** When the current block ends, if a clock is running. */
export function blockEndsAt(c: VoyageClock, now: number): number | null {
  if (c.phase === "sailing") return now + remainingFocusMs(c, now);
  if (c.phase === "shore-leave") return c.breakEndsAt;
  return null;
}

export function startVoyage(presetId: VoyagePresetId, focusMinutes: number, breakMinutes: number, now: number): VoyageClock {
  return {
    ...DOCKED,
    phase: "sailing",
    presetId,
    focusMinutes: clampMinutes(focusMinutes, 1, 240),
    breakMinutes: clampMinutes(breakMinutes, 0, 60),
    voyageStartedAt: now,
    segmentStartedAt: now,
  };
}

function clampMinutes(m: number, lo: number, hi: number): number {
  return Math.round(Math.min(hi, Math.max(lo, Number.isFinite(m) ? m : lo)));
}

export function pause(c: VoyageClock, reason: PauseReason, now: number): VoyageClock {
  if (c.phase !== "sailing") return c;
  return { ...c, phase: "drifting", bankedMs: focusedMs(c, now), segmentStartedAt: null, pausedReason: reason };
}

export function resume(c: VoyageClock, now: number): VoyageClock {
  if (c.phase !== "drifting") return c;
  return { ...c, phase: "sailing", segmentStartedAt: now, pausedReason: null };
}

/** Whole minutes earned but not yet paid. */
export function unpaidMinutes(c: VoyageClock, now: number): number {
  if (c.phase !== "sailing" && c.phase !== "drifting") return 0;
  return Math.max(0, Math.floor(focusedMs(c, now) / MINUTE_MS) - c.paidMinutes);
}

export function isFocusDone(c: VoyageClock, now: number): boolean {
  return c.phase === "sailing" && remainingFocusMs(c, now) === 0;
}

/** Focus block finished: go ashore for the break (or straight to dock when the break is 0). */
export function beginShoreLeave(c: VoyageClock, now: number): VoyageClock {
  const banked = c.focusMinutes * MINUTE_MS;
  if (c.breakMinutes <= 0) return { ...DOCKED, presetId: c.presetId, focusMinutes: c.focusMinutes, breakMinutes: c.breakMinutes };
  return { ...c, phase: "shore-leave", bankedMs: banked, segmentStartedAt: null, pausedReason: null, breakEndsAt: now + c.breakMinutes * MINUTE_MS };
}

export function isBreakOver(c: VoyageClock, now: number): boolean {
  return c.phase === "shore-leave" && c.breakEndsAt !== null && now >= c.breakEndsAt;
}

export function dock(c: VoyageClock): VoyageClock {
  return { ...DOCKED, presetId: c.presetId, focusMinutes: c.focusMinutes, breakMinutes: c.breakMinutes };
}

export function makeRecord(c: VoyageClock, now: number, completed: boolean, shipId: string, objective: string | null, id: string): VoyageRecord {
  return {
    id,
    startedAt: c.voyageStartedAt ?? now,
    endedAt: now,
    plannedMinutes: c.focusMinutes,
    focusedMinutes: Math.floor(focusedMs(c, now) / MINUTE_MS),
    completed,
    shipId,
    objective,
  };
}

/** Local calendar day key, e.g. "2026-10-28". */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function previousDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d - 1, 12).getTime());
}

/**
 * Consecutive calendar days with at least one completed voyage, ending today.
 * A streak that ended yesterday still counts until today is over.
 */
export function streakDays(records: readonly VoyageRecord[], now: number): number {
  const days = new Set(records.filter((r) => r.completed).map((r) => dayKey(r.endedAt)));
  let key = dayKey(now);
  if (!days.has(key)) key = previousDay(key);
  let streak = 0;
  while (days.has(key)) {
    streak++;
    key = previousDay(key);
  }
  return streak;
}

export function minutesOnDay(records: readonly VoyageRecord[], now: number): number {
  const today = dayKey(now);
  return records.filter((r) => dayKey(r.endedAt) === today).reduce((a, r) => a + r.focusedMinutes, 0);
}

/** Citrus fruit a completed voyage ripens: one per 10 planned minutes, at least one. */
export function fruitForVoyage(focusMinutes: number): number {
  return Math.max(1, Math.floor(focusMinutes / 10));
}
