// Grades a typed flashcard answer against the card's back and suggests a
// 1–5 rating. Used by the review screen and by the Lookout's Siren Gate.

import type { RecallRating } from "@ship/shared-types";
import { NEGATIONS, contentWords, isNumber, normalize, similarity, wordMatch } from "./text.js";

export type AnswerVerdict = "correct" | "close" | "incorrect";

export interface AnswerGrade {
  /** 0..1 */
  score: number;
  verdict: AnswerVerdict;
  suggestedRating: RecallRating;
  /** Expected words the answer didn't contain, for feedback. */
  missing: string[];
  /** The accepted answer it was compared against (cards can list several). */
  matchedAgainst: string;
}

export interface GradeOptions {
  /** How long the sailor took. A fast, exact answer suggests Easy. */
  responseMs?: number;
}

export const CORRECT_SCORE = 0.9;
export const CLOSE_SCORE = 0.7;
const FAST_ANSWER_MS = 5000;
// Long texts make Levenshtein slow and meaningless; token overlap covers them.
const MAX_CHAR_COMPARE = 400;

/**
 * Accepted answers: the whole back, plus its parts when it lists
 * alternatives ("car / automobile", "a; b") or has a parenthetical aside.
 */
export function acceptedAnswers(back: string): string[] {
  const whole = back.trim();
  const out = new Set<string>([whole]);
  const parts = whole.split(/\s*(?:[;|\n]|\s\/\s)\s*/).filter((p) => p.trim());
  if (parts.length > 1) parts.forEach((p) => out.add(p.trim()));
  for (const a of [...out]) {
    const bare = a.replace(/\s*\([^)]*\)\s*/g, " ").trim();
    if (bare && bare !== a) out.add(bare);
  }
  return [...out];
}

interface Comparison {
  score: number;
  missing: string[];
}

function bestMatch(word: string, pool: string[]): number {
  let best = 0;
  for (const p of pool) {
    best = Math.max(best, wordMatch(word, p));
    if (best === 1) break;
  }
  return best;
}

function compare(given: string, expected: string): Comparison {
  const g = normalize(given);
  const e = normalize(expected);
  if (!e) return { score: g ? 0 : 1, missing: [] };
  if (g === e) return { score: 1, missing: [] };
  if (!g) return { score: 0, missing: contentWords(expected) };

  const charScore = g.length <= MAX_CHAR_COMPARE && e.length <= MAX_CHAR_COMPARE ? similarity(g, e) : 0;

  const ew = contentWords(expected);
  const gw = contentWords(given);
  const eMatch = ew.map((w) => bestMatch(w, gw));
  const recall = eMatch.reduce((a, b) => a + b, 0) / ew.length;
  const precision = gw.reduce((a, w) => a + bestMatch(w, ew), 0) / gw.length;
  // F2: recall matters more than precision, but padding still costs a little.
  const tokenScore = recall + precision === 0 ? 0 : (5 * precision * recall) / (4 * precision + recall);

  let score = Math.max(charScore, tokenScore);

  // A wrong number or a flipped "not" makes an otherwise similar answer wrong.
  const gAll = g.split(" ");
  const numbersOk = e.split(" ").filter(isNumber).every((n) => gAll.includes(n));
  if (!numbersOk) score = Math.min(score, 0.4);
  const negations = (s: string) => s.split(" ").filter((w) => NEGATIONS.has(w)).length % 2;
  if (negations(g) !== negations(e)) score = Math.min(score, 0.5);

  return { score, missing: ew.filter((_, i) => eMatch[i] === 0) };
}

export function verdictFor(score: number): AnswerVerdict {
  if (score >= CORRECT_SCORE) return "correct";
  if (score >= CLOSE_SCORE) return "close";
  return "incorrect";
}

export function gradeTypedAnswer(given: string, back: string, options: GradeOptions = {}): AnswerGrade {
  let best: Comparison & { against: string } = { score: -1, missing: [], against: back };
  for (const accepted of acceptedAnswers(back)) {
    const c = compare(given, accepted);
    if (c.score > best.score) best = { ...c, against: accepted };
    if (c.score === 1) break;
  }
  const score = Math.max(0, best.score);
  const verdict = verdictFor(score);

  let suggestedRating: RecallRating;
  if (verdict === "correct") {
    const fast = options.responseMs !== undefined && options.responseMs <= FAST_ANSWER_MS;
    suggestedRating = score === 1 && fast ? 5 : 4;
  } else if (verdict === "close") suggestedRating = 3;
  else suggestedRating = score >= 0.4 ? 2 : 1;

  return { score, verdict, suggestedRating, missing: best.missing, matchedAgainst: best.against };
}
