// FSRS-4.5 with its default weights. Ship's 1–5 ratings map onto FSRS's four
// grades as 1–2 → Again, 3 → Hard, 4 → Good, 5 → Easy. Failed cards come
// back in 1 or 10 minutes, the same as SM-2, and the SM-2 ease keeps being
// updated so a deck can switch schedulers without starting over.

import type { RecallRating, ReviewSchedule } from "@ship/shared-types";
import { DAY_MS, RELEARN_DELAY_MS, nextEase } from "./sm2.js";

export const FSRS_DEFAULT_WEIGHTS: readonly number[] = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587,
  0.2272, 2.8755,
];

/** FSRS grades: 1 Again, 2 Hard, 3 Good, 4 Easy. */
export type FsrsGrade = 1 | 2 | 3 | 4;

export interface FsrsOptions {
  weights?: readonly number[];
  /** Probability of remembering a card on its due day. */
  requestRetention?: number;
  /** Days. */
  maximumInterval?: number;
}

const DECAY = -0.5;
// Chosen so that retrievability is exactly 0.9 when elapsed time equals stability.
const FACTOR = 19 / 81;
const MIN_STABILITY = 0.01;

export function fsrsGrade(rating: RecallRating): FsrsGrade {
  return rating <= 2 ? 1 : ((rating - 1) as FsrsGrade);
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Chance of recalling a card `elapsedDays` after its last review. */
export function retrievability(elapsedDays: number, stability: number): number {
  return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / stability, DECAY);
}

/** Days until retrievability falls to `requestRetention`. */
export function intervalForStability(stability: number, requestRetention = 0.9): number {
  return (stability / FACTOR) * (Math.pow(requestRetention, 1 / DECAY) - 1);
}

export function initialStability(grade: FsrsGrade, w: readonly number[] = FSRS_DEFAULT_WEIGHTS): number {
  return Math.max(w[grade - 1], MIN_STABILITY);
}

export function initialDifficulty(grade: FsrsGrade, w: readonly number[] = FSRS_DEFAULT_WEIGHTS): number {
  return clamp(w[4] - (grade - 3) * w[5], 1, 10);
}

export function nextDifficulty(d: number, grade: FsrsGrade, w: readonly number[] = FSRS_DEFAULT_WEIGHTS): number {
  const shifted = d - w[6] * (grade - 3);
  // Mean reversion towards the difficulty of a card first rated Good.
  return clamp(w[7] * initialDifficulty(3, w) + (1 - w[7]) * shifted, 1, 10);
}

export function stabilityAfterRecall(d: number, s: number, r: number, grade: FsrsGrade, w: readonly number[] = FSRS_DEFAULT_WEIGHTS): number {
  const hardPenalty = grade === 2 ? w[15] : 1;
  const easyBonus = grade === 4 ? w[16] : 1;
  return s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp(w[10] * (1 - r)) - 1) * hardPenalty * easyBonus);
}

export function stabilityAfterLapse(d: number, s: number, r: number, w: readonly number[] = FSRS_DEFAULT_WEIGHTS): number {
  const next = w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r));
  // Forgetting a card should never make its memory stronger.
  return Math.max(MIN_STABILITY, Math.min(next, s));
}

/**
 * Memory state for a card FSRS hasn't seen. New cards have none; cards
 * reviewed under SM-2 get an estimate from their interval and ease.
 */
function priorMemory(schedule: ReviewSchedule, w: readonly number[]): { s: number; d: number } | null {
  if (schedule.stability !== undefined && schedule.difficulty !== undefined) {
    return { s: Math.max(schedule.stability, MIN_STABILITY), d: schedule.difficulty };
  }
  if (schedule.lastReviewed === null) return null;
  // Ease 2.5 (SM-2's start) reads as middling difficulty 5; ease 1.3 as the hardest, 10.
  const d = clamp(5 + (2.5 - schedule.ease) * (5 / 1.2), 1, 10);
  const s = schedule.interval > 0 ? schedule.interval : w[0];
  return { s, d };
}

export function fsrsNext(schedule: ReviewSchedule, rating: RecallRating, now: number, options: FsrsOptions = {}): ReviewSchedule {
  const w = options.weights ?? FSRS_DEFAULT_WEIGHTS;
  const requestRetention = options.requestRetention ?? 0.9;
  const maximumInterval = options.maximumInterval ?? 36500;
  const grade = fsrsGrade(rating);
  const prior = priorMemory(schedule, w);

  let stability: number;
  let difficulty: number;
  if (!prior) {
    stability = initialStability(grade, w);
    difficulty = initialDifficulty(grade, w);
  } else {
    const elapsedDays = schedule.lastReviewed === null ? 0 : (now - schedule.lastReviewed) / DAY_MS;
    const r = retrievability(elapsedDays, prior.s);
    difficulty = nextDifficulty(prior.d, grade, w);
    stability = grade === 1 ? stabilityAfterLapse(prior.d, prior.s, r, w) : stabilityAfterRecall(prior.d, prior.s, r, grade, w);
  }

  let { repetitions, lapses } = schedule;
  let interval: number;
  let due: number;
  if (grade === 1) {
    if (repetitions > 0) lapses += 1;
    repetitions = 0;
    interval = 0;
    due = now + RELEARN_DELAY_MS[rating as 1 | 2];
  } else {
    repetitions += 1;
    interval = clamp(Math.round(intervalForStability(stability, requestRetention)), 1, maximumInterval);
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
    stability,
    difficulty,
  };
}
