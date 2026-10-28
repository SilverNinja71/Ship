// Guessing an AssignmentKind from a title, for sources that don't say
// (Todoist, calendar feeds) and as Canvas's fallback.

import type { AssignmentKind } from "@ship/shared-types";

const EXAM = /\b(exams?|mid-?terms?)\b/i;
// "Final" alone is an exam; "Final Project" or "Final Paper" is not.
const FINAL =
  /\bfinals?\b(?!\s+(project|paper|essay|draft|report|presentation|portfolio|submission|reflection|version|copy|grade)s?\b)/i;
const QUIZ = /\bquiz(zes)?\b/i;
const DISCUSSION = /\b(discussion|forum)\b/i;
const READING = /^read\b|\breadings?\b/i;

export function isExamTitle(title: string): boolean {
  return EXAM.test(title) || FINAL.test(title);
}

export function guessKind(title: string, fallback: AssignmentKind): AssignmentKind {
  if (isExamTitle(title)) return "exam";
  if (QUIZ.test(title)) return "quiz";
  if (DISCUSSION.test(title)) return "discussion";
  if (READING.test(title)) return "reading";
  return fallback;
}
