// The Study Rooms' co-op break games, dealt from a seed. Every device in a room
// works out the same boards and questions from the room's seed and deck, so
// only small counters travel through the database. Like the rest of practice,
// nothing here touches review schedules.

import { ROOM_LIMITS } from "@ship/shared-types";
import type { LearnQuestion, MatchTile, PracticeCard } from "./practice.js";
import { choicesFor, matchBoard, seededRng, shuffle } from "./practice.js";
import { normalize } from "./text.js";

/** No blank sides and one card per answer (the first kept), in order, at most `max`. */
export function playableCards(cards: readonly PracticeCard[], max = 100): PracticeCard[] {
  const out: PracticeCard[] = [];
  const answers = new Set<string>();
  for (const card of cards) {
    if (out.length >= max) break;
    // The same answer key matchBoard and the multiple-choice options use, so two cards that
    // read as one answer never share a board; an answer of only punctuation counts as blank.
    const answer = normalize(card.back);
    if (!card.front.trim() || !answer || answers.has(answer)) continue;
    answers.add(answer);
    out.push(card);
  }
  return out;
}

/** The order Pass the Bottle asks cards in: shuffle of 0..count-1 with seededRng(seed). */
export function bottleOrder(count: number, seed: number): number[] {
  const indices = Array.from({ length: Math.max(0, Math.floor(count)) }, (_, i) => i);
  return shuffle(indices, seededRng(seed));
}

/**
 * The question for bottle `card` on `turn`: choicesFor(card, pool, seededRng(seed * 31 + turn)),
 * so a rescue reshuffles; written when no wrong answers exist. A wrong answer that reads the same
 * as the question itself (a deck with reversed cards has one) is left out of the pool.
 */
export function bottleQuestion(
  cards: readonly PracticeCard[],
  order: readonly number[],
  card: number,
  seed: number,
  turn: number,
): LearnQuestion {
  if (!cards.length || !order.length) throw new RangeError("Pass the Bottle needs at least one card.");
  // The game ends when the cards run out; wrapping keeps a late render from crashing meanwhile.
  const slot = ((Math.floor(card) % order.length) + order.length) % order.length;
  const asked = cards[order[slot]! % cards.length]!;
  const question = normalize(asked.front);
  const pool = cards.filter((c) => c === asked || normalize(c.back) !== question);
  const options = choicesFor(asked, pool, seededRng(seed * 31 + turn));
  return options ? { kind: "choice", card: asked, options } : { kind: "written", card: asked };
}

/**
 * The cards whose tiles can't be mistaken for another's: no side reads the same as any side of a
 * card already kept (a reversed card, A→B beside B→A, would put two identical tiles on a board,
 * and pairing them the "wrong" way would count as a mix-up), and no card reads the same both ways.
 */
export function distinctTileCards(cards: readonly PracticeCard[]): PracticeCard[] {
  const used = new Set<string>();
  const out: PracticeCard[] = [];
  for (const card of cards) {
    const front = normalize(card.front);
    const back = normalize(card.back);
    if (!front || !back || front === back || used.has(front) || used.has(back)) continue;
    used.add(front);
    used.add(back);
    out.push(card);
  }
  return out;
}

/**
 * Tidy the Deck boards from the playable cards whose tiles are all different (distinctTileCards):
 * patches = min(seats, floor(usable/4)); pairs = min(pairsPerPatch, floor(usable/patches)); []
 * when usable < 4.
 */
export function tidyPatches(cards: readonly PracticeCard[], seed: number, seats: number, pairsPerPatch = 6): MatchTile[][] {
  const usable = distinctTileCards(playableCards(cards));
  if (usable.length < 4) return [];
  // Each sailor's cleared patches travel as bits of a small number, so a room never has more patches than that holds.
  const patches = Math.min(Math.max(1, Math.floor(seats)), Math.floor(usable.length / 4), ROOM_LIMITS.tidy.maxPatches);
  const pairs = Math.min(Math.max(1, Math.floor(pairsPerPatch)), Math.floor(usable.length / patches));
  const dealt = shuffle(usable, seededRng(seed));
  const boards: MatchTile[][] = [];
  for (let i = 0; i < patches; i++) {
    boards.push(matchBoard(dealt.slice(i * pairs, (i + 1) * pairs), seededRng(seed + i + 1), pairs));
  }
  return boards;
}
