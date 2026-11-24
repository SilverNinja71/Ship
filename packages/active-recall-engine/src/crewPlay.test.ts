import { describe, expect, it } from "vitest";
import { bottleOrder, bottleQuestion, playableCards, tidyPatches } from "./crewPlay.js";
import type { PracticeCard } from "./practice.js";
import { normalize } from "./text.js";

const card = (id: string, front: string, back: string): PracticeCard => ({ id, front, back });

/** A deck of `count` cards with distinct answers. */
function deckOf(count: number): PracticeCard[] {
  return Array.from({ length: count }, (_, i) => card(String(i), `Question ${i}`, `Answer ${i}`));
}

const cells: PracticeCard[] = [
  card("0", "Powerhouse of the cell", "Mitochondria"),
  card("1", "Site of photosynthesis", "Chloroplast"),
  card("2", "Makes proteins", "Ribosome"),
  card("3", "Holds DNA", "Nucleus"),
  card("4", "Packages proteins", "Golgi apparatus"),
  card("5", "Controls what enters the cell", "Cell membrane"),
  card("6", "Energy currency of the cell", "ATP"),
  card("7", "Breaks down waste", "Lysosome"),
];

describe("playableCards", () => {
  it("drops blank sides and repeated answers, keeping the first and the order", () => {
    const messy = [
      card("a", "Holds DNA", "Nucleus"),
      card("b", "   ", "Ribosome"),
      card("c", "Makes proteins", ""),
      card("d", "Control centre of the cell", "nucleus!"),
      card("e", "Makes proteins", "Ribosome"),
      card("f", "Only punctuation", "?!"),
      card("g", "Site of photosynthesis", "Chloroplast"),
    ];
    expect(playableCards(messy).map((c) => c.id)).toEqual(["a", "e", "g"]);
  });

  it("stops at `max`", () => {
    expect(playableCards(deckOf(150))).toHaveLength(100);
    expect(playableCards(deckOf(10), 4).map((c) => c.id)).toEqual(["0", "1", "2", "3"]);
  });
});

describe("Pass the Bottle", () => {
  it("asks every card once, in an order rebuilt from the seed", () => {
    const order = bottleOrder(8, 42);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(bottleOrder(8, 42)).toEqual(order);
    expect(bottleOrder(8, 43)).not.toEqual(order);
    expect(bottleOrder(0, 42)).toEqual([]);
  });

  it("deals the same question on every device", () => {
    const order = bottleOrder(cells.length, 9);
    for (let turn = 0; turn < 6; turn++) {
      expect(bottleQuestion(cells, order, turn, 9, turn)).toEqual(bottleQuestion(cells, order, turn, 9, turn));
    }
    const q = bottleQuestion(cells, order, 2, 9, 4);
    expect(q.card).toBe(cells[order[2]!]);
    expect(q.kind).toBe("choice");
    if (q.kind === "choice") {
      expect(q.options).toHaveLength(4);
      expect(q.options).toContain(q.card.back);
      expect(new Set(q.options.map(normalize)).size).toBe(4);
    }
  });

  it("reshuffles the choices on a rescue (the same card on the next turn)", () => {
    const order = bottleOrder(cells.length, 5);
    const asked = (turn: number) => {
      const q = bottleQuestion(cells, order, 0, 5, turn);
      return q.kind === "choice" ? q.options.join("|") : "";
    };
    const seen = new Set<string>();
    for (let turn = 0; turn < 10; turn++) {
      expect(bottleQuestion(cells, order, 0, 5, turn).card).toBe(cells[order[0]!]);
      seen.add(asked(turn));
    }
    expect(seen.size).toBeGreaterThan(1);
    expect(asked(1)).not.toBe(asked(0));
  });

  it("asks a typed question when no wrong answers exist", () => {
    const same = [card("0", "2 + 2", "4"), card("1", "8 / 2", "4."), card("2", "Square root of 16", " 4 ")];
    const q = bottleQuestion(same, bottleOrder(same.length, 1), 0, 1, 0);
    expect(q.kind).toBe("written");
    const lonely = [card("0", "Capital of France", "Paris")];
    expect(bottleQuestion(lonely, [0], 0, 3, 0)).toEqual({ kind: "written", card: lonely[0] });
  });

  it("refuses an empty deck", () => {
    expect(() => bottleQuestion([], [], 0, 1, 0)).toThrow(RangeError);
  });
});

describe("Tidy the Deck", () => {
  it("deals the same patches on every device", () => {
    const deck = deckOf(30);
    expect(tidyPatches(deck, 77, 4)).toEqual(tidyPatches(deck, 77, 4));
    expect(tidyPatches(deck, 78, 4)).not.toEqual(tidyPatches(deck, 77, 4));
  });

  it("gives each seat a patch of up to 6 pairs while the cards last", () => {
    const full = tidyPatches(deckOf(100), 1, 6);
    expect(full).toHaveLength(6);
    for (const patch of full) expect(patch).toHaveLength(12);

    // 13 cards, 3 seats: 3 patches of 4 pairs.
    const three = tidyPatches(deckOf(13), 2, 3);
    expect(three).toHaveLength(3);
    for (const patch of three) expect(patch).toHaveLength(8);
  });

  it("never repeats an answer within a patch, or a card across patches", () => {
    const deck = [
      ...deckOf(20),
      card("dup1", "Another way to ask 3", "answer 3"),
      card("dup2", "Yet another", "ANSWER 7!"),
      card("blank", "", "Answer 99"),
    ];
    const patches = tidyPatches(deck, 11, 4);
    expect(patches).toHaveLength(4);
    const everyCard = new Set<string>();
    for (const patch of patches) {
      const backs = patch.filter((t) => t.side === "back").map((t) => normalize(t.text));
      expect(new Set(backs).size).toBe(backs.length);
      for (const tile of patch.filter((t) => t.side === "front")) {
        expect(everyCard.has(tile.cardId)).toBe(false);
        everyCard.add(tile.cardId);
      }
    }
    expect(everyCard.has("dup1")).toBe(false);
    expect(everyCard.has("blank")).toBe(false);
  });

  it("shares out a short deck: 5 cards and 3 seats make one patch of 5 pairs", () => {
    const patches = tidyPatches(deckOf(5), 3, 3);
    expect(patches).toHaveLength(1);
    expect(patches[0]).toHaveLength(10);
    expect(tidyPatches(deckOf(8), 3, 3)).toHaveLength(2);
  });

  it("deals nothing with fewer than 4 usable cards", () => {
    expect(tidyPatches(deckOf(3), 3, 2)).toEqual([]);
    const blanks = [...deckOf(3), card("x", "  ", "Answer x")];
    expect(tidyPatches(blanks, 3, 2)).toEqual([]);
  });
});
