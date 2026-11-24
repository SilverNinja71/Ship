// Review statistics and Anki's daily cap on new cards. Days are local days:
// "today" starts at this computer's midnight.

import type { Flashcard, ReviewLogEntry } from "@ship/shared-types";
import { dueCards, isNew } from "./scheduler.js";

/** Local midnight at the start of the day `offset` days after the one holding `t`. */
export function dayStart(t: number, offset = 0): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset).getTime();
}

/** When each card was first reviewed, as far as the log remembers. */
function firstReviews(log: readonly ReviewLogEntry[]): Map<string, number> {
  const first = new Map<string, number>();
  for (const e of log) {
    const seen = first.get(e.cardId);
    if (seen === undefined || e.at < seen) first.set(e.cardId, e.at);
  }
  return first;
}

/** How many cards were reviewed for the first time today. */
export function newCardsStartedToday(log: readonly ReviewLogEntry[], now: number): number {
  const today = dayStart(now);
  let n = 0;
  for (const at of firstReviews(log).values()) if (at >= today) n++;
  return n;
}

/**
 * Today's queue under a daily cap on new cards, as in Anki: every review that's
 * due, plus new cards up to what's left of today's allowance. A cap of 0 means
 * no cap.
 */
export function studyQueue(cards: readonly Flashcard[], log: readonly ReviewLogEntry[], now: number, newPerDay: number, limit = Infinity): Flashcard[] {
  const due = dueCards(cards, now);
  if (!(newPerDay > 0)) return due.slice(0, limit);
  let allowance = Math.max(0, newPerDay - newCardsStartedToday(log, now));
  return due.filter((c) => !isNew(c.schedule) || allowance-- > 0).slice(0, limit);
}

/** A rating of 3 (Hard) or better counts as remembered, as Anki counts it. */
export const PASSING_RATING = 3;
/** Anki calls a card mature once its interval reaches 21 days. */
export const MATURE_DAYS = 21;

export interface DayCount {
  /** Local midnight of the day. */
  day: number;
  count: number;
}

export interface ReviewStats {
  /** Reviews per day for the last `days` days, oldest first, today last. */
  daily: DayCount[];
  today: { reviews: number; newCards: number };
  /** Days in a row with at least one review, counting back from today (or yesterday, if today has none yet). */
  streak: number;
  /** Share of the last 30 days' reviews rated Hard or better; null with none. */
  retention: number | null;
  /** Cards coming due on each of the next 7 days; today includes everything overdue. New cards aren't counted. */
  forecast: DayCount[];
  counts: { new: number; learning: number; young: number; mature: number };
}

export function reviewStats(cards: readonly Flashcard[], log: readonly ReviewLogEntry[], now: number, days = 112): ReviewStats {
  const perDay = new Map<number, number>();
  for (const e of log) {
    const d = dayStart(e.at);
    perDay.set(d, (perDay.get(d) ?? 0) + 1);
  }
  const daily: DayCount[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = dayStart(now, -i);
    daily.push({ day, count: perDay.get(day) ?? 0 });
  }

  let streak = 0;
  let offset = (perDay.get(dayStart(now)) ?? 0) > 0 ? 0 : -1;
  while ((perDay.get(dayStart(now, offset)) ?? 0) > 0) {
    streak++;
    offset--;
  }

  const monthAgo = dayStart(now, -29);
  const recent = log.filter((e) => e.at >= monthAgo);
  const retention = recent.length ? recent.filter((e) => e.rating >= PASSING_RATING).length / recent.length : null;

  const forecast: DayCount[] = [];
  for (let i = 0; i < 7; i++) {
    const from = i === 0 ? Number.NEGATIVE_INFINITY : dayStart(now, i);
    const to = dayStart(now, i + 1);
    forecast.push({ day: dayStart(now, i), count: cards.filter((c) => !isNew(c.schedule) && c.schedule.due >= from && c.schedule.due < to).length });
  }

  const counts = { new: 0, learning: 0, young: 0, mature: 0 };
  for (const c of cards) {
    if (isNew(c.schedule)) counts.new++;
    else if (c.schedule.interval < 1) counts.learning++;
    else if (c.schedule.interval < MATURE_DAYS) counts.young++;
    else counts.mature++;
  }

  return { daily, today: { reviews: perDay.get(dayStart(now)) ?? 0, newCards: newCardsStartedToday(log, now) }, streak, retention, forecast, counts };
}
