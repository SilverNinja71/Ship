// SM-2, copied from Parchment's ReviewSchedule.next() so a card comes back at
// the same time in either app. Ratings are Parchment's 1–5 scale, used directly
// as SM-2's quality q. schedulers.test.ts checks this against numbers from
// Parchment's own code.

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
    // Missing a card counts as a lapse unless this is its very first review.
    if (schedule.lastReviewed !== null) lapses += 1;
    repetitions = 0;
    interval = 0;
    due = now + RELEARN_DELAY_MS[rating as 1 | 2];
  } else {
    repetitions += 1;
    if (repetitions === 1) interval = rating === 5 ? 3 : 1;
    else if (repetitions === 2) interval = rating === 5 ? 7 : rating === 3 ? 3 : 6;
    else {
      // Hard grows the gap a little, Good by the ease from before this review, Easy a bit more.
      const grown = rating === 3 ? interval * 1.2 : interval * schedule.ease * (rating === 5 ? 1.3 : 1);
      interval = Math.max(interval + 1, Math.round(grown));
    }
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
