// The Siren Gate's flashcard quiz: answer GATE_CARDS_REQUIRED cards right
// (typed, graded like the review screen) to earn a leisure pass. Each card is
// asked once; a miss shows the answer and moves on to another card.

import type { GateCard } from "@ship/shared-types";
import { GATE_CARDS_REQUIRED } from "@ship/shared-types";
import { gradeTypedAnswer, type AnswerGrade } from "@ship/active-recall-engine";

export type QuizPhase =
  | "asking"
  /** The last answer was wrong; the right one is showing until nextCard(). */
  | "missed"
  | "passed"
  /** Too few cards left to reach the target. */
  | "exhausted";

export interface QuizResult {
  card: GateCard;
  given: string;
  grade: AnswerGrade;
  accepted: boolean;
}

export interface QuizState {
  cards: GateCard[];
  index: number;
  correct: number;
  required: number;
  phase: QuizPhase;
  last: QuizResult | null;
  /** When the current card was shown, for the grader's response time. */
  askedAt: number;
}

export function canQuiz(cards: readonly GateCard[], required = GATE_CARDS_REQUIRED): boolean {
  return cards.length >= required;
}

export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function startQuiz(cards: readonly GateCard[], now: number, required = GATE_CARDS_REQUIRED): QuizState {
  const state: QuizState = { cards: [...cards], index: 0, correct: 0, required, phase: "asking", last: null, askedAt: now };
  return cards.length < required ? { ...state, phase: "exhausted" } : state;
}

export function currentCard(state: QuizState): GateCard | null {
  return state.phase === "asking" || state.phase === "missed" ? (state.cards[state.index] ?? null) : null;
}

function advance(state: QuizState, now: number): QuizState {
  const index = state.index + 1;
  const left = state.cards.length - index;
  const phase: QuizPhase = left < state.required - state.correct ? "exhausted" : "asking";
  return { ...state, index, phase, askedAt: now };
}

/** Grades a typed answer. "close" counts: the gate is friction, not an exam. Blank answers are ignored. */
export function submitAnswer(state: QuizState, given: string, now: number): QuizState {
  const card = currentCard(state);
  if (state.phase !== "asking" || !card || !given.trim()) return state;
  const grade = gradeTypedAnswer(given, card.back, { responseMs: Math.max(0, now - state.askedAt) });
  const accepted = grade.verdict !== "incorrect";
  const last: QuizResult = { card, given, grade, accepted };
  if (!accepted) return { ...state, phase: "missed", last };
  const correct = state.correct + 1;
  if (correct >= state.required) return { ...state, correct, phase: "passed", last };
  return advance({ ...state, correct, last }, now);
}

export function nextCard(state: QuizState, now: number): QuizState {
  return state.phase === "missed" ? advance(state, now) : state;
}
