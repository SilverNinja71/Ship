// SM-2, kept in step with Parchment's ReviewSchedule.next() so imported cards
// keep their schedule. Ratings are Parchment's 1–5 scale, used directly as
// SM-2's quality q.

import type { RecallRating, ReviewSchedule } from "@ship/shared-types";

export const MINUTE_MS = 60_000;
export const DAY_MS = 86_400_000;

/** A failed card comes back in 1 minute (Forgot) or 10 minutes (Wrong). */
export const RELEARN_DELAY_MS: Record<1 | 2, number> = { 1: MINUTE_MS, 2: 10 * MINUTE_MS };

export const MIN_EASE = 1.3;

export function nextEase(ease: number, rating: RecallRating): number {
  const miss = 5 - rating;
  return Math.max(MIN_EASE, ease + 0.1 - miss * (0.08 + miss * 0.02));
}

export function sm2Next(schedule: ReviewSchedule, rating: RecallRating, now: number): ReviewSchedule {
  let { interval, repetitions, lapses } = schedule;
  let due: number;

  if (rating <= 2) {
    // Only a card that had been learned can lapse.
    if (repetitions > 0) lapses += 1;
    repetitions = 0;
    interval = 0;
    due = now + RELEARN_DELAY_MS[rating as 1 | 2];
  } else {
    // The interval uses the ease from before this review, as in classic SM-2.
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.max(1, Math.round(interval * schedule.ease));
    repetitions += 1;
    due = now + interval * DAY_MS;
  }

  return {
    ...schedule,
    ease: nextEase(schedule.ease, rating),
    interval,
    repetitions,
    lapses,
    due,
    lastReviewed: now,
  };
}
