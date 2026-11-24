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
 * so a rescue reshuffles; written when no wrong answers exist.
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
  const options = choicesFor(asked, cards, seededRng(seed * 31 + turn));
  return options ? { kind: "choice", card: asked, options } : { kind: "written", card: asked };
}

/**
 * Tidy the Deck boards: patches = min(seats, floor(usable/4)); pairs = min(pairsPerPatch,
 * floor(usable/patches)); [] when usable < 4.
 */
export function tidyPatches(cards: readonly PracticeCard[], seed: number, seats: number, pairsPerPatch = 6): MatchTile[][] {
  const usable = playableCards(cards);
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
