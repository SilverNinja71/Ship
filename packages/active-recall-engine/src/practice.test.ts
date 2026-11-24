import { describe, expect, it } from "vitest";
import type { Flashcard, RecallRating, ReviewLogEntry } from "@ship/shared-types";
import { newReviewSchedule } from "@ship/shared-types";
import {
  MATCH_GROUP,
  answerLearn,
  buildTest,
  cardsFromNotes,
  choicesFor,
  clozeFront,
  distractors,
  gradeTestQuestion,
  learnProgress,
  matchBoard,
  nextLearn,
  seededRng,
  startLearn,
  testPercent,
} from "./practice.js";
import type { LearnState, PracticeCard, TestQuestion } from "./practice.js";
import { dayStart, newCardsStartedToday, reviewStats, studyQueue } from "./stats.js";

const deck: PracticeCard[] = [
  { id: "a", front: "Powerhouse of the cell", back: "Mitochondria" },
  { id: "b", front: "Site of photosynthesis", back: "Chloroplast" },
  { id: "c", front: "Makes proteins", back: "Ribosome" },
  { id: "d", front: "Holds DNA", back: "Nucleus" },
  { id: "e", front: "Packages proteins", back: "Golgi apparatus" },
  { id: "f", front: "Controls what enters the cell", back: "Cell membrane" },
  { id: "g", front: "Energy currency of the cell", back: "ATP" },
  { id: "h", front: "Breaks down waste", back: "Lysosome" },
];

describe("multiple choice", () => {
  it("offers the right answer among other cards' answers, never a twin of it", () => {
    const twins = [...deck, { id: "z", front: "Another way to say it", back: "mitochondria" }];
    const wrong = distractors(twins[0]!, twins, 10, seededRng(1));
    expect(wrong).not.toContain("Mitochondria");
    expect(wrong).not.toContain("mitochondria");
    const options = choicesFor(deck[0]!, deck, seededRng(2))!;
    expect(options).toHaveLength(4);
    expect(options).toContain("Mitochondria");
    expect(new Set(options).size).toBe(4);
  });

  it("has nothing to offer when every card shares one answer", () => {
    expect(choicesFor(deck[0]!, [deck[0]!], seededRng(1))).toBeNull();
  });
});

describe("tests", () => {
  it("cover the requested number of cards with the kinds asked for", () => {
    const test = buildTest(deck, { count: 8, kinds: ["written", "choice", "truefalse", "match"] }, seededRng(7));
    const covered = test.flatMap((q) => (q.kind === "match" ? q.cards.map((c) => c.id) : [q.card.id]));
    expect(covered.sort()).toEqual(deck.map((c) => c.id).sort());
    expect(new Set(test.map((q) => q.kind))).toEqual(new Set(["written", "choice", "truefalse", "match"]));
    for (const q of test) if (q.kind === "match") expect(q.cards.length).toBeGreaterThanOrEqual(3);
  });

  it("only matching splits into groups of a few", () => {
    const test = buildTest(deck, { count: 8, kinds: ["match"] }, seededRng(3));
    expect(test.every((q) => q.kind === "match")).toBe(true);
    expect(test.every((q) => q.kind === "match" && q.cards.length <= MATCH_GROUP + 2)).toBe(true);
  });

  it("falls back to written questions when a deck can't support choices", () => {
    const test = buildTest([deck[0]!], { count: 1, kinds: ["choice", "truefalse"] }, seededRng(1));
    expect(test.map((q) => q.kind)).toEqual(["written"]);
  });

  it("grades every kind and weighs matching by its pairs", () => {
    const card = deck[0]!;
    expect(gradeTestQuestion({ kind: "written", card }, "mitochondria")).toEqual({ score: 1 });
    expect(gradeTestQuestion({ kind: "written", card }, "mitochondira").score).toBe(1);
    expect(gradeTestQuestion({ kind: "written", card }, "ribosome")).toEqual({ score: 0 });
    expect(gradeTestQuestion({ kind: "written", card }, "")).toEqual({ score: 0 });
    expect(gradeTestQuestion({ kind: "choice", card, options: [] }, "Mitochondria").score).toBe(1);
    expect(gradeTestQuestion({ kind: "truefalse", card, shown: "Ribosome", isTrue: false }, false).score).toBe(1);
    const match: TestQuestion = { kind: "match", cards: deck.slice(0, 4), answers: [] };
    const half = gradeTestQuestion(match, { a: "Mitochondria", b: "Chloroplast", c: "Nucleus", d: "Ribosome" });
    expect(half.score).toBe(0.5);
    expect(testPercent([match, { kind: "written", card }], [half, { score: 1 }])).toBe(60);
  });
});

describe("learn", () => {
  function playToTheEnd(answer: (card: PracticeCard, kind: string, step: number) => boolean) {
    const rng = seededRng(5);
    let state: LearnState = startLearn(deck, rng, 3);
    const asked: string[] = [];
    for (let step = 0; step < 500; step++) {
      const next = nextLearn(state, deck, rng);
      if (!next.question) return { state: next.state, asked };
      state = next.state;
      asked.push(`${next.question.kind}:${next.question.card.id}`);
      state = answerLearn(state, next.question.card.id, answer(next.question.card, next.question.kind, step));
    }
    throw new Error("Learn never finished");
  }

  it("asks each card as a choice, then typed, and finishes with all mastered", () => {
    const { state, asked } = playToTheEnd(() => true);
    expect(learnProgress(state)).toEqual({ notYet: 0, familiar: 0, mastered: deck.length });
    expect(asked).toHaveLength(deck.length * 2);
    for (const c of deck) expect(asked.indexOf(`choice:${c.id}`)).toBeLessThan(asked.indexOf(`written:${c.id}`));
  });

  it("brings missed cards back until they're right", () => {
    const { state, asked } = playToTheEnd((_c, _k, step) => step % 3 !== 0);
    expect(learnProgress(state).mastered).toBe(deck.length);
    expect(asked.length).toBeGreaterThan(deck.length * 2);
  });

  it("works through a few cards at a time", () => {
    const rng = seededRng(9);
    const { state } = nextLearn(startLearn(deck, rng, 3), deck, rng);
    expect(state.active).toHaveLength(3);
    expect(state.round).toBe(1);
  });
});

describe("match", () => {
  it("lays out a question and an answer tile for each card, without two equal answers", () => {
    const twins = [...deck, { id: "z", front: "Same answer again", back: "ATP" }];
    const tiles = matchBoard(twins, seededRng(4), 6);
    expect(tiles).toHaveLength(12);
    const cards = new Set(tiles.map((t) => t.cardId));
    expect(cards.size).toBe(6);
    const backs = tiles.filter((t) => t.side === "back").map((t) => t.text.toLowerCase());
    expect(new Set(backs).size).toBe(backs.length);
  });
});

describe("cards from notes", () => {
  it("asks for the term from its definition, then blanks out key ideas", () => {
    const notes = [
      "# Cell respiration",
      "- **Glycolysis**: splits glucose into two pyruvate molecules",
      "Krebs cycle - releases carbon dioxide and makes NADH",
      "The electron transport chain makes most of the cell's ATP.",
      "See https://example.com: not a definition",
    ].join("\n");
    const cards = cardsFromNotes(notes, 10);
    expect(cards[0]).toEqual({ front: "splits glucose into two pyruvate molecules", back: "Glycolysis" });
    expect(cards[1]).toEqual({ front: "releases carbon dioxide and makes NADH", back: "Krebs cycle" });
    expect(cards.some((c) => c.front.includes("_____"))).toBe(true);
    expect(cards.every((c) => !c.back.includes("http"))).toBe(true);
    expect(new Set(cards.map((c) => c.back.toLowerCase())).size).toBe(cards.length);
  });

  it("stops at the number asked for", () => {
    const notes = Array.from({ length: 30 }, (_, i) => `Term ${i}: the meaning of term number ${i}`).join("\n");
    expect(cardsFromNotes(notes, 5)).toHaveLength(5);
  });

  it("keeps cloze cards that still say something", () => {
    expect(clozeFront("ATP", "Mitochondria make ATP.")).toBe("Mitochondria make _____.");
    expect(clozeFront("Glycolysis", "Glycolysis")).toBeNull();
  });
});

describe("the daily cap on new cards", () => {
  const now = new Date(2026, 10, 23, 15, 0).getTime();
  const card = (id: string, reviewed: boolean, due = 0): Flashcard => ({
    id,
    deckId: "d",
    front: id,
    back: id,
    created: 0,
    schedule: reviewed ? { ...newReviewSchedule(), interval: 3, repetitions: 2, due, lastReviewed: due - 1 } : newReviewSchedule(),
  });
  const log = (cardId: string, at: number, rating: RecallRating = 4): ReviewLogEntry => ({ cardId, at, rating });

  it("lets through every due review but only what's left of today's new cards", () => {
    const cards = [card("r1", true, now - 1000), card("r2", true, now + 86_400_000), card("n1", false), card("n2", false), card("n3", false), card("n4", false)];
    const startedToday = [log("x", now - 3600_000), log("y", now - 1800_000)];
    const queue = studyQueue(cards, startedToday, now, 3).map((c) => c.id);
    expect(queue).toEqual(["r1", "n1"]);
    expect(studyQueue(cards, [], now, 0).map((c) => c.id)).toEqual(["r1", "n1", "n2", "n3", "n4"]);
  });

  it("counts a card as new today only the first time it's ever reviewed", () => {
    const yesterday = dayStart(now, -1) + 3600_000;
    expect(newCardsStartedToday([log("a", yesterday), log("a", now - 10), log("b", now - 20)], now)).toBe(1);
  });
});

describe("review stats", () => {
  const now = new Date(2026, 10, 23, 15, 0).getTime();
  const at = (daysAgo: number) => dayStart(now, -daysAgo) + 9 * 3600_000;

  it("counts days, a streak, retention, card maturity and the week ahead", () => {
    const log: ReviewLogEntry[] = [
      { cardId: "a", at: at(0), rating: 4 },
      { cardId: "b", at: at(0), rating: 1 },
      { cardId: "a", at: at(1), rating: 3 },
      { cardId: "a", at: at(2), rating: 5 },
      { cardId: "a", at: at(5), rating: 2 },
    ];
    const base = newReviewSchedule();
    const cards: Flashcard[] = [
      { id: "a", deckId: "d", front: "", back: "", created: 0, schedule: { ...base, interval: 30, due: dayStart(now, 2) + 1, lastReviewed: at(0) } },
      { id: "b", deckId: "d", front: "", back: "", created: 0, schedule: { ...base, interval: 0.01, due: now - 1, lastReviewed: at(0) } },
      { id: "c", deckId: "d", front: "", back: "", created: 0, schedule: { ...base, interval: 4, due: dayStart(now, 1) + 5, lastReviewed: at(1) } },
      { id: "n", deckId: "d", front: "", back: "", created: 0, schedule: base },
    ];
    const stats = reviewStats(cards, log, now, 28);
    expect(stats.daily).toHaveLength(28);
    expect(stats.daily.at(-1)).toEqual({ day: dayStart(now), count: 2 });
    expect(stats.today).toEqual({ reviews: 2, newCards: 1 });
    expect(stats.streak).toBe(3);
    expect(stats.retention).toBeCloseTo(3 / 5);
    expect(stats.forecast.map((d) => d.count)).toEqual([1, 1, 1, 0, 0, 0, 0]);
    expect(stats.counts).toEqual({ new: 1, learning: 1, young: 1, mature: 1 });
  });

  it("keeps a streak alive until today ends, and has no retention without reviews", () => {
    const stats = reviewStats([], [{ cardId: "a", at: at(1), rating: 4 }, { cardId: "a", at: at(2), rating: 4 }], now, 7);
    expect(stats.streak).toBe(2);
    expect(reviewStats([], [], now).retention).toBeNull();
  });
});
