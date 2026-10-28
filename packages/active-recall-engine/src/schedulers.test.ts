import { describe, expect, it } from "vitest";
import { newReviewSchedule } from "@ship/shared-types";
import type { Flashcard, RecallRating, ReviewSchedule } from "@ship/shared-types";
import {
  DAY_MS,
  FSRS_DEFAULT_WEIGHTS,
  MINUTE_MS,
  dueCards,
  formatInterval,
  fsrsGrade,
  fsrsNext,
  intervalForStability,
  nextDifficulty,
  nextSchedule,
  previewIntervals,
  retrievability,
  sm2Next,
} from "./index.js";

const T0 = Date.UTC(2026, 9, 27, 12);

function run(ratings: RecallRating[], next: (s: ReviewSchedule, r: RecallRating, now: number) => ReviewSchedule) {
  let s = newReviewSchedule();
  let now = T0;
  const out: ReviewSchedule[] = [];
  for (const r of ratings) {
    s = next(s, r, now);
    out.push(s);
    now = s.due;
  }
  return out;
}

describe("SM-2", () => {
  it("follows 1, 6, then interval × ease, with Parchment's ease formula", () => {
    const [a, b, c, d] = run([4, 4, 5, 3], sm2Next);
    expect([a.interval, a.repetitions, a.ease]).toEqual([1, 1, 2.5]);
    expect([b.interval, b.repetitions, b.ease]).toEqual([6, 2, 2.5]);
    expect(c.interval).toBe(15);
    expect(c.ease).toBeCloseTo(2.6, 10);
    // Interval uses the ease from before this review (2.6), then ease drops.
    expect(d.interval).toBe(39);
    expect(d.ease).toBeCloseTo(2.46, 10);
    expect(d.due).toBe(c.due + 39 * DAY_MS);
  });

  it("resets a forgotten card and brings it back in 1 or 10 minutes", () => {
    const learned = run([4, 4, 5], sm2Next)[2];
    const forgot = sm2Next(learned, 1, T0);
    expect(forgot).toMatchObject({ repetitions: 0, interval: 0, lapses: 1, due: T0 + MINUTE_MS, lastReviewed: T0 });
    expect(forgot.ease).toBeCloseTo(2.6 + 0.1 - 4 * (0.08 + 4 * 0.02), 10);

    const wrong = sm2Next(learned, 2, T0);
    expect(wrong.due).toBe(T0 + 10 * MINUTE_MS);
    // Failing again while relearning isn't another lapse.
    expect(sm2Next(forgot, 2, T0).lapses).toBe(1);
  });

  it("never lets ease drop below 1.3", () => {
    const states = run([2, 2, 2, 2, 1, 1], sm2Next);
    expect(Math.min(...states.map((s) => s.ease))).toBe(1.3);
  });

  it("starts relearned cards over at 1 day", () => {
    const [, , , again] = run([4, 4, 1, 4], sm2Next);
    expect(again.interval).toBe(1);
    expect(again.repetitions).toBe(1);
  });
});

describe("FSRS-4.5", () => {
  const w = FSRS_DEFAULT_WEIGHTS;

  it("maps Ship's five ratings onto Again/Hard/Good/Easy", () => {
    expect([1, 2, 3, 4, 5].map((r) => fsrsGrade(r as RecallRating))).toEqual([1, 1, 2, 3, 4]);
  });

  it("is calibrated so retrievability is 90% after one stability's worth of days", () => {
    expect(retrievability(7, 7)).toBeCloseTo(0.9, 10);
    expect(intervalForStability(7, 0.9)).toBeCloseTo(7, 10);
    expect(intervalForStability(7, 0.8)).toBeGreaterThan(7);
  });

  it("seeds new cards with the default weights", () => {
    const good = fsrsNext(newReviewSchedule(), 4, T0);
    expect(good.stability).toBeCloseTo(w[2], 10);
    expect(good.difficulty).toBeCloseTo(w[4], 10);
    expect(good.interval).toBe(4);

    const easy = fsrsNext(newReviewSchedule(), 5, T0);
    expect(easy.stability).toBeCloseTo(w[3], 10);
    expect(easy.difficulty).toBeCloseTo(w[4] - w[5], 10);
    expect(easy.interval).toBe(14);

    const hard = fsrsNext(newReviewSchedule(), 3, T0);
    expect(hard.interval).toBe(1);

    const again = fsrsNext(newReviewSchedule(), 1, T0);
    expect(again.stability).toBeCloseTo(w[0], 10);
    expect(again.difficulty).toBeCloseTo(w[4] + 2 * w[5], 10);
    expect(again.due).toBe(T0 + MINUTE_MS);
    expect(fsrsNext(newReviewSchedule(), 2, T0).due).toBe(T0 + 10 * MINUTE_MS);
  });

  it("grows stability on a successful review (worked by hand)", () => {
    const first = fsrsNext(newReviewSchedule(), 4, T0);
    const second = fsrsNext(first, 4, first.due);
    // S=3.7145, D=5.1618, 4 days elapsed → R≈0.8935 → S'≈14.81.
    expect(second.stability).toBeCloseTo(14.81, 1);
    expect(second.difficulty).toBeCloseTo(w[4], 10);
    expect(second.interval).toBe(15);
  });

  it("applies mean reversion to difficulty", () => {
    expect(nextDifficulty(w[4], 1)).toBeCloseTo(w[7] * w[4] + (1 - w[7]) * (w[4] + 2 * w[6]), 10);
    expect(nextDifficulty(10, 1)).toBe(10);
    expect(nextDifficulty(1, 4)).toBe(1);
  });

  it("never raises stability on a lapse, and counts it", () => {
    const learned = run([4, 4, 4], (s, r, now) => fsrsNext(s, r, now))[2];
    const lapsed = fsrsNext(learned, 1, learned.due + 30 * DAY_MS);
    expect(lapsed.stability!).toBeLessThanOrEqual(learned.stability!);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.repetitions).toBe(0);
  });

  it("orders intervals Hard ≤ Good ≤ Easy for a card in review", () => {
    const card = run([4, 4], (s, r, now) => fsrsNext(s, r, now))[1];
    const at = card.due;
    const [hard, good, easy] = ([3, 4, 5] as const).map((r) => fsrsNext(card, r, at).interval);
    expect(hard).toBeLessThanOrEqual(good);
    expect(good).toBeLessThanOrEqual(easy);
  });

  it("picks up cards reviewed under SM-2 without starting them over", () => {
    const sm2Card: ReviewSchedule = { ease: 2.5, interval: 10, repetitions: 3, lapses: 0, due: T0, lastReviewed: T0 - 10 * DAY_MS };
    const next = fsrsNext(sm2Card, 4, T0);
    // Treated as S=10, D=5, reviewed on time (R=0.9): stability must grow well past 10.
    expect(next.stability!).toBeGreaterThan(20);
    expect(next.interval).toBeGreaterThan(20);
    expect(next.repetitions).toBe(4);
  });

  it("keeps the SM-2 ease moving so decks can switch schedulers", () => {
    expect(fsrsNext(newReviewSchedule(), 1, T0).ease).toBeCloseTo(sm2Next(newReviewSchedule(), 1, T0).ease, 10);
  });
});

describe("scheduler helpers", () => {
  const card = (id: string, schedule: Partial<ReviewSchedule>, created = 0): Flashcard => ({
    id,
    deckId: "d",
    front: id,
    back: id,
    created,
    schedule: { ...newReviewSchedule(), ...schedule },
  });

  it("dispatches on the scheduler kind", () => {
    expect(nextSchedule(newReviewSchedule(), 4, T0).stability).toBeUndefined();
    expect(nextSchedule(newReviewSchedule(), 4, T0, { kind: "fsrs" }).stability).toBeDefined();
  });

  it("lists due review cards first (most overdue first), then new cards", () => {
    const cards = [
      card("new-b", {}, 2),
      card("later", { due: T0 + DAY_MS, lastReviewed: T0 - DAY_MS }),
      card("overdue", { due: T0 - 2 * DAY_MS, lastReviewed: T0 - 5 * DAY_MS }),
      card("new-a", {}, 1),
      card("due-now", { due: T0, lastReviewed: T0 - DAY_MS }),
    ];
    expect(dueCards(cards, T0).map((c) => c.id)).toEqual(["overdue", "due-now", "new-a", "new-b"]);
    expect(dueCards(cards, T0, 2)).toHaveLength(2);
  });

  it("previews each rating's next due time", () => {
    const p = previewIntervals(newReviewSchedule(), T0);
    expect(p).toEqual({ 1: MINUTE_MS, 2: 10 * MINUTE_MS, 3: DAY_MS, 4: DAY_MS, 5: DAY_MS });
    expect(formatInterval(p[1])).toBe("1m");
    expect(formatInterval(p[2])).toBe("10m");
  });

  it("formats intervals compactly", () => {
    expect(formatInterval(3 * 60 * MINUTE_MS)).toBe("3h");
    expect(formatInterval(4 * DAY_MS)).toBe("4d");
    expect(formatInterval(65 * DAY_MS)).toBe("2mo");
    expect(formatInterval(548 * DAY_MS)).toBe("1.5y");
  });
});
