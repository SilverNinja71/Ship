import { describe, expect, it } from "vitest";
import type { GateCard } from "@ship/shared-types";
import { canQuiz, currentCard, nextCard, shuffled, startQuiz, submitAnswer } from "./quiz.js";

const cards: GateCard[] = [
  { id: "1", front: "Powerhouse of the cell?", back: "mitochondria" },
  { id: "2", front: "What does an enzyme lower?", back: "activation energy" },
  { id: "3", front: "H2O is?", back: "water" },
];

describe("gate quiz", () => {
  it("passes after two right answers", () => {
    let q = startQuiz(cards, 0);
    expect(currentCard(q)?.id).toBe("1");
    q = submitAnswer(q, "Mitochondria", 1000);
    expect(q).toMatchObject({ phase: "asking", correct: 1, index: 1 });
    expect(q.last?.accepted).toBe(true);
    q = submitAnswer(q, "activation energy", 2000);
    expect(q).toMatchObject({ phase: "passed", correct: 2 });
    expect(currentCard(q)).toBeNull();
  });

  it("accepts a close answer (a typo)", () => {
    const q = submitAnswer(startQuiz(cards, 0), "mitochondira", 1000);
    expect(q.last?.grade.verdict).not.toBe("incorrect");
    expect(q.correct).toBe(1);
  });

  it("on a miss, shows the right answer and moves on to another card", () => {
    let q = submitAnswer(startQuiz(cards, 0), "ribosome", 1000);
    expect(q.phase).toBe("missed");
    expect(q.last).toMatchObject({ accepted: false, given: "ribosome", card: { back: "mitochondria" } });
    expect(currentCard(q)?.id).toBe("1");
    // Answers are ignored until the sailor moves on.
    expect(submitAnswer(q, "mitochondria", 1500)).toBe(q);
    q = nextCard(q, 2000);
    expect(q).toMatchObject({ phase: "asking", index: 1, correct: 0, askedAt: 2000 });
    q = submitAnswer(q, "activation energy", 2500);
    q = submitAnswer(q, "water", 3000);
    expect(q.phase).toBe("passed");
  });

  it("runs out when too few cards are left to reach the target", () => {
    let q = submitAnswer(startQuiz(cards, 0), "no idea", 1000);
    q = nextCard(q, 1000);
    q = submitAnswer(q, "no idea", 2000);
    q = nextCard(q, 2000);
    expect(q.phase).toBe("exhausted");
    expect(currentCard(q)).toBeNull();
  });

  it("ignores blank answers", () => {
    const q = startQuiz(cards, 0);
    expect(submitAnswer(q, "   ", 10)).toBe(q);
  });

  it("needs enough cards to start", () => {
    expect(canQuiz(cards.slice(0, 1))).toBe(false);
    expect(canQuiz(cards.slice(0, 2))).toBe(true);
    expect(startQuiz(cards.slice(0, 1), 0).phase).toBe("exhausted");
  });

  it("shuffles without losing cards", () => {
    let seed = 0.42;
    const random = () => (seed = (seed * 9301 + 0.49297) % 1);
    const out = shuffled(cards, random);
    expect(out.map((c) => c.id).sort()).toEqual(["1", "2", "3"]);
    expect(cards.map((c) => c.id)).toEqual(["1", "2", "3"]);
  });
});
