// One entry point for both schedulers, plus the helpers the review screen needs.

import type { Flashcard, RecallRating, ReviewSchedule, SchedulerKind } from "@ship/shared-types";
import { RECALL_RATINGS } from "@ship/shared-types";
import { fsrsNext } from "./fsrs.js";
import type { FsrsOptions } from "./fsrs.js";
import { DAY_MS, MINUTE_MS, sm2Next } from "./sm2.js";

export interface SchedulerOptions extends FsrsOptions {
  kind: SchedulerKind;
}

export const DEFAULT_SCHEDULER: SchedulerOptions = { kind: "sm2" };

export function nextSchedule(
  schedule: ReviewSchedule,
  rating: RecallRating,
  now: number,
  options: SchedulerOptions = DEFAULT_SCHEDULER,
): ReviewSchedule {
  return options.kind === "fsrs" ? fsrsNext(schedule, rating, now, options) : sm2Next(schedule, rating, now);
}

export function reviewCard(card: Flashcard, rating: RecallRating, now: number, options?: SchedulerOptions): Flashcard {
  return { ...card, schedule: nextSchedule(card.schedule, rating, now, options) };
}

export function isDue(schedule: ReviewSchedule, now: number): boolean {
  return schedule.due <= now;
}

export function isNew(schedule: ReviewSchedule): boolean {
  return schedule.lastReviewed === null;
}

/** Due cards, most overdue first. New cards (due 0) come after cards already in review. */
export function dueCards(cards: readonly Flashcard[], now: number, limit = Infinity): Flashcard[] {
  return cards
    .filter((c) => isDue(c.schedule, now))
    .sort((a, b) => Number(isNew(a.schedule)) - Number(isNew(b.schedule)) || a.schedule.due - b.schedule.due || a.created - b.created)
    .slice(0, limit);
}

/** How long until the card comes back for each rating, in ms, to label the rating buttons. */
export function previewIntervals(schedule: ReviewSchedule, now: number, options?: SchedulerOptions): Record<RecallRating, number> {
  const out = {} as Record<RecallRating, number>;
  for (const { rating } of RECALL_RATINGS) out[rating] = nextSchedule(schedule, rating, now, options).due - now;
  return out;
}

/** "1m", "10m", "3h", "4d", "2mo", "1.5y". */
export function formatInterval(ms: number): string {
  if (ms < 60 * MINUTE_MS) return `${Math.max(1, Math.round(ms / MINUTE_MS))}m`;
  if (ms < DAY_MS) return `${Math.round(ms / (60 * MINUTE_MS))}h`;
  const days = ms / DAY_MS;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  const years = days / 365;
  return `${years < 10 ? Math.round(years * 10) / 10 : Math.round(years)}y`;
}
