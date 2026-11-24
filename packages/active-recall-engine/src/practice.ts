// Practice modes in the style of Quizlet's Learn, Test and Match, and cards
// made from notes. Practice never touches review schedules: it is for working
// through a deck now, while reviews decide when a card comes back.

import type { BlurtConcept } from "@ship/shared-types";
import { extractConcepts } from "./blurt.js";
import { acceptedAnswers, gradeTypedAnswer } from "./grading.js";
import { normalize } from "./text.js";

/** What practice needs from a card. */
export interface PracticeCard {
  id: string;
  front: string;
  back: string;
}

export type Rng = () => number;

/** A repeatable random source (mulberry32), so a test or a board can be rebuilt from its seed. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const key = (s: string) => normalize(s);

/** Wrong answers for a card, taken from other cards' answers, never one that means the same as its own. */
export function distractors(card: PracticeCard, pool: readonly PracticeCard[], count: number, rng: Rng): string[] {
  const own = new Set([key(card.back), ...acceptedAnswers(card.back).map(key)]);
  const seen = new Set<string>();
  const options: string[] = [];
  for (const other of pool) {
    const k = key(other.back);
    if (!k || own.has(k) || seen.has(k)) continue;
    seen.add(k);
    options.push(other.back);
  }
  return shuffle(options, rng).slice(0, count);
}

/** The card's answer among up to `count - 1` wrong ones, shuffled; null when no other answer exists to choose from. */
export function choicesFor(card: PracticeCard, pool: readonly PracticeCard[], rng: Rng, count = 4): string[] | null {
  const wrong = distractors(card, pool, count - 1, rng);
  return wrong.length ? shuffle([card.back, ...wrong], rng) : null;
}

// ---- Test ---------------------------------------------------------------------------------------

export type TestQuestionKind = "written" | "choice" | "truefalse" | "match";

export type TestQuestion =
  | { kind: "written"; card: PracticeCard }
  | { kind: "choice"; card: PracticeCard; options: string[] }
  | { kind: "truefalse"; card: PracticeCard; shown: string; isTrue: boolean }
  /** Fronts down one side, their answers shuffled down the other. */
  | { kind: "match"; cards: PracticeCard[]; answers: string[] };

export interface TestOptions {
  /** How many cards the test covers. */
  count: number;
  kinds: readonly TestQuestionKind[];
}

/** A matching question takes this many cards at most. */
export const MATCH_GROUP = 4;

/**
 * A practice test over a random selection of cards. Question kinds are spread
 * evenly; a kind a deck can't support (multiple choice with only one distinct
 * answer, say) falls back to a written question.
 */
export function buildTest(cards: readonly PracticeCard[], options: TestOptions, rng: Rng): TestQuestion[] {
  const picked = shuffle(cards, rng).slice(0, Math.max(1, options.count));
  const kinds = options.kinds.length ? [...options.kinds] : (["written"] as TestQuestionKind[]);
  const questions: TestQuestion[] = [];
  let rest = picked;
  if (kinds.includes("match") && picked.length >= 3) {
    const share = kinds.length === 1 ? picked.length : Math.max(3, Math.round(picked.length / kinds.length));
    const matched = picked.slice(0, Math.min(picked.length, share));
    rest = picked.slice(matched.length);
    for (let i = 0; i < matched.length; i += MATCH_GROUP) {
      let group = matched.slice(i, i + MATCH_GROUP);
      // A last group of one or two isn't much of a match: fold it into the one before.
      if (group.length < 3 && questions.length && questions[questions.length - 1]!.kind === "match") {
        const prev = questions.pop() as Extract<TestQuestion, { kind: "match" }>;
        group = [...prev.cards, ...group];
      }
      questions.push({ kind: "match", cards: group, answers: shuffle(group.map((c) => c.back), rng) });
    }
  }
  const others = kinds.filter((k) => k !== "match");
  const order = others.length ? others : (["written"] as TestQuestionKind[]);
  rest.forEach((card, i) => {
    const kind = order[i % order.length]!;
    if (kind === "choice") {
      const opts = choicesFor(card, cards, rng);
      if (opts) return void questions.push({ kind: "choice", card, options: opts });
    } else if (kind === "truefalse") {
      const wrong = distractors(card, cards, 1, rng)[0];
      if (wrong) {
        const isTrue = rng() < 0.5;
        return void questions.push({ kind: "truefalse", card, shown: isTrue ? card.back : wrong, isTrue });
      }
    }
    questions.push({ kind: "written", card });
  });
  return shuffle(questions, rng);
}

export type TestAnswer = string | boolean | Record<string, string> | null;

export interface QuestionResult {
  /** 0 to 1; a matching question scores the share of pairs it got right. */
  score: number;
  /** Written answers that were close rather than exact. */
  close?: boolean;
}

export function gradeTestQuestion(q: TestQuestion, answer: TestAnswer): QuestionResult {
  switch (q.kind) {
    case "written": {
      if (typeof answer !== "string" || !answer.trim()) return { score: 0 };
      const verdict = gradeTypedAnswer(answer, q.card.back).verdict;
      return verdict === "correct" ? { score: 1 } : verdict === "close" ? { score: 1, close: true } : { score: 0 };
    }
    case "choice":
      return { score: answer === q.card.back ? 1 : 0 };
    case "truefalse":
      return { score: answer === q.isTrue ? 1 : 0 };
    case "match": {
      const picks = typeof answer === "object" && answer !== null ? (answer as Record<string, string>) : {};
      const right = q.cards.filter((c) => picks[c.id] !== undefined && key(picks[c.id]!) === key(c.back)).length;
      return { score: right / q.cards.length };
    }
  }
}

/** Questions count by how many cards they cover, so a four-pair matching question weighs four. */
export function testPercent(questions: readonly TestQuestion[], results: readonly QuestionResult[]): number {
  let got = 0;
  let total = 0;
  questions.forEach((q, i) => {
    const weight = q.kind === "match" ? q.cards.length : 1;
    total += weight;
    got += (results[i]?.score ?? 0) * weight;
  });
  return total ? Math.round((got / total) * 100) : 0;
}

// ---- Learn --------------------------------------------------------------------------------------

/** 0 = not yet known, 1 = picked right from choices, 2 = typed right: mastered. */
export type LearnStage = 0 | 1 | 2;

export interface LearnState {
  order: string[];
  stage: Record<string, LearnStage>;
  /** The cards in play this round. */
  active: string[];
  /** Cards still to ask in this pass over the round. */
  pending: string[];
  round: number;
  roundSize: number;
}

/** Rounds of a few cards at a time: each is asked as multiple choice, then typed, and comes back until it's mastered. */
export function startLearn(cards: readonly PracticeCard[], rng: Rng, roundSize = 7): LearnState {
  const order = shuffle(cards.map((c) => c.id), rng);
  const stage: Record<string, LearnStage> = {};
  for (const id of order) stage[id] = 0;
  return { order, stage, active: [], pending: [], round: 0, roundSize };
}

export type LearnQuestion = { kind: "choice"; card: PracticeCard; options: string[] } | { kind: "written"; card: PracticeCard };

/** Moves the session along to its next question; returns the new state and the question, or null when every card is mastered. */
export function nextLearn(state: LearnState, cards: readonly PracticeCard[], rng: Rng): { state: LearnState; question: LearnQuestion | null } {
  const byId = new Map(cards.map((c) => [c.id, c]));
  let s = state;
  if (!s.pending.length) {
    let active = s.active.filter((id) => s.stage[id] !== 2 && byId.has(id));
    let round = s.round;
    if (!active.length) {
      active = s.order.filter((id) => s.stage[id] !== 2 && byId.has(id)).slice(0, s.roundSize);
      round += 1;
    }
    if (!active.length) return { state: { ...s, active: [], pending: [] }, question: null };
    s = { ...s, active, pending: shuffle(active, rng), round };
  }
  const id = s.pending[0]!;
  const card = byId.get(id)!;
  if (s.stage[id] === 0) {
    const options = choicesFor(card, cards, rng);
    if (options) return { state: s, question: { kind: "choice", card, options } };
  }
  return { state: s, question: { kind: "written", card } };
}

/** Records an answer to the question at the head of the pass. A right answer moves the card up a stage; a wrong one keeps it where it is. */
export function answerLearn(state: LearnState, cardId: string, correct: boolean): LearnState {
  const current = state.stage[cardId] ?? 0;
  const stage = correct ? (Math.min(2, current + 1) as LearnStage) : current;
  return { ...state, stage: { ...state.stage, [cardId]: stage }, pending: state.pending.filter((id) => id !== cardId) };
}

export function learnProgress(state: LearnState): { notYet: number; familiar: number; mastered: number } {
  const values = state.order.map((id) => state.stage[id] ?? 0);
  return { notYet: values.filter((v) => v === 0).length, familiar: values.filter((v) => v === 1).length, mastered: values.filter((v) => v === 2).length };
}

// ---- Match --------------------------------------------------------------------------------------

export interface MatchTile {
  /** Unique on the board. */
  id: string;
  cardId: string;
  side: "front" | "back";
  text: string;
}

/** Seconds added for each wrong pairing, as in Quizlet. */
export const MATCH_PENALTY_MS = 1000;

/** A board of up to `pairs` cards, each split into a question tile and an answer tile, all shuffled. */
export function matchBoard(cards: readonly PracticeCard[], rng: Rng, pairs = 6): MatchTile[] {
  const picked: PracticeCard[] = [];
  const seenBacks = new Set<string>();
  for (const card of shuffle(cards, rng)) {
    // Two cards with the same answer would make the board ambiguous.
    const k = key(card.back);
    if (seenBacks.has(k)) continue;
    seenBacks.add(k);
    picked.push(card);
    if (picked.length === pairs) break;
  }
  const tiles = picked.flatMap((c) => [
    { id: `${c.id}:front`, cardId: c.id, side: "front" as const, text: c.front },
    { id: `${c.id}:back`, cardId: c.id, side: "back" as const, text: c.back },
  ]);
  return shuffle(tiles, rng);
}

// ---- Cards from notes ---------------------------------------------------------------------------

export interface DraftCard {
  front: string;
  back: string;
}

/**
 * The question side of a flashcard: the sentence with the concept blanked out.
 * A heading has no sentence around it to ask about, so it makes no card.
 */
export function clozeFront(concept: string, sentence: string): string | null {
  const escaped = concept.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const front = sentence.replace(new RegExp(escaped, "i"), "_____");
  if (front === sentence) return `What is “${concept}”?`;
  return /[\p{L}\p{N}]/u.test(front.replaceAll("_____", "")) ? front : null;
}

const DEFINITION = /^\s*(?:[-*•]\s+|\d+[.)]\s+)?(?:\*\*)?([^:—–]{2,60}?)(?:\*\*)?\s*(?::|—|–|\s-\s)\s*(.{3,240})$/;

/**
 * Flashcards from notes, made on the device with no AI. "Term: definition"
 * lines (and "Term - definition", "Term — definition") ask for the term from
 * its definition, which is easy to type; key ideas the blurt check finds become
 * fill-in-the-blank cards. Duplicates of an answer are dropped.
 */
export function cardsFromNotes(notes: string, max = 20, concepts?: readonly BlurtConcept[]): DraftCard[] {
  const out: DraftCard[] = [];
  const answers = new Set<string>();
  const add = (front: string, back: string) => {
    const k = key(back);
    if (!k || answers.has(k) || out.length >= max) return;
    answers.add(k);
    out.push({ front: front.trim(), back: back.trim() });
  };
  for (const line of notes.split(/\r?\n/)) {
    if (/^\s*#/.test(line) || /https?:\/\//.test(line)) continue;
    const m = DEFINITION.exec(line);
    if (!m) continue;
    const term = m[1]!.replace(/\*\*/g, "").trim();
    const definition = m[2]!.replace(/\*\*/g, "").trim();
    if (term.split(/\s+/).length > 6 || /[.?!]$/.test(term) || definition.split(/\s+/).length < 2) continue;
    add(definition, term);
  }
  for (const c of [...(concepts ?? extractConcepts(notes))].sort((a, b) => b.weight - a.weight)) {
    const front = clozeFront(c.display, c.sentence);
    if (front) add(front, c.display);
  }
  return out;
}
