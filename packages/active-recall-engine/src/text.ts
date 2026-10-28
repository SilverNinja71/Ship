// Text helpers shared by answer grading and the blurt check: word splitting
// with offsets, normalization, stopwords, a light stemmer and Levenshtein.

export interface Word {
  /** As written. */
  raw: string;
  /** Lowercase, no accents or apostrophes, digit separators removed. */
  norm: string;
  start: number;
  end: number;
}

// Letters/digits, an optional apostrophe tail ("don't", "cell's"), and
// decimal or grouped numbers ("3.14", "1,000"). Hyphens split words.
const WORD_RE = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}]+)?(?:[.,]\p{N}+)*/gu;

export function normalizeWord(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/(\d),(\d)/g, "$1$2");
}

export function words(text: string): Word[] {
  const out: Word[] = [];
  for (const m of text.matchAll(WORD_RE)) {
    const norm = normalizeWord(m[0]);
    if (norm) out.push({ raw: m[0], norm, start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/** Lowercase words joined by single spaces, punctuation gone. "&" reads as "and". */
export function normalize(text: string): string {
  return words(text.replace(/&/g, " and "))
    .map((w) => w.norm)
    .join(" ");
}

export const STOPWORDS: ReadonlySet<string> = new Set(
  `a about above after again against all almost also although always am among an and another any anything are around as at
  be became because become becomes been before being below between both but by can cannot could did do does doing done down
  during each either else etc even ever every few for from further get gets getting give given gives go goes going got had has
  have having he her here hers him his how however i if in into is it its itself just less like made main make makes making
  many may me might more most much must my near neither no nor not now of off often on once one only onto or other others
  our out over own per quite rather really same several she should since so some something sometimes still such than that
  the their them themselves then there therefore these they thing things this those though through thus to too toward towards
  two three four five six seven eight nine ten under until up upon us used uses using usually very via was way we well were
  what whatever when where whether which while who whom whose why will with within without would yet you your
  called known found seen shown take takes taken took happen happens happened occur occurs occurred include includes included
  including involve involves involved help helps allow allows let lets lead leads result results cause causes caused mean
  means refer refers describe describes example examples eg ie vs important different various new good bad large small big
  little high low part parts kind kinds type types lot lots begin begins began begun end ends ended start starts started
  bring brings bringing brought release releases released produce produces produced contain contains contained form forms
  formed become came come comes place consist consists provide provides provided require requires required create creates
  created put set keep keeps kept show shows turn turns need needs needed seem seems try tries`.split(/\s+/),
);

export const NEGATIONS: ReadonlySet<string> = new Set(["not", "no", "never", "none", "nor", "cannot", "neither", "without", "isnt", "arent", "wasnt", "werent", "dont", "doesnt", "didnt", "cant", "wont", "shouldnt", "couldnt"]);

export function isStopword(norm: string): boolean {
  return STOPWORDS.has(norm);
}

export function isNumber(norm: string): boolean {
  return /^\p{N}+(?:\.\p{N}+)?$/u.test(norm);
}

const VOWEL = /[aeiouy]/;

/**
 * A deliberately light stemmer: plurals, -ed, -ing, -ly. Enough that "cells"
 * meets "cell" and "splitting" meets "split"; fuzzy matching covers the rest.
 */
export function stem(word: string): string {
  let w = word;
  if (w.length <= 3 || isNumber(w)) return w;
  if (w.endsWith("ies") && w.length > 4) w = w.slice(0, -3) + "y";
  else if (w.endsWith("sses")) w = w.slice(0, -2);
  else if (/(?:x|z|ch|sh)es$/.test(w)) w = w.slice(0, -2);
  else if (w.endsWith("s") && !/(?:ss|us|is)$/.test(w)) w = w.slice(0, -1);

  if (w.endsWith("ied") && w.length > 4) w = w.slice(0, -3) + "y";
  else if (w.endsWith("ed") && !w.endsWith("eed") && VOWEL.test(w.slice(0, -2)) && w.length > 4) w = restoreBase(w.slice(0, -2));
  else if (w.endsWith("ing") && VOWEL.test(w.slice(0, -3)) && w.length > 5) w = restoreBase(w.slice(0, -3));
  else if (w.endsWith("ly") && w.length > 5) w = w.slice(0, -2);
  return w;
}

/** "runn" → "run", "mak" → "make" (Porter's double-consonant and short-CVC rules). */
function restoreBase(w: string): string {
  if (/([^aeiouylsz])\1$/.test(w)) return w.slice(0, -1);
  if (/^[^aeiou]*[aeiouy][^aeiouwxy]$/.test(w)) return w + "e";
  return w;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let cur = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/** 1 for identical strings, 0 for nothing in common. */
export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  return longest === 0 ? 1 : 1 - levenshtein(a, b) / longest;
}

/** Typos allowed before two words stop counting as the same word. Short words must be exact. */
function allowedEdits(length: number): number {
  if (length <= 4) return 0;
  if (length <= 7) return 1;
  if (length <= 11) return 2;
  return 3;
}

/**
 * How well two single words match, 0..1. Stems equal → 1; otherwise a few
 * typos are forgiven on longer words. Numbers must match exactly.
 */
export function wordMatch(a: string, b: string): number {
  if (a === b) return 1;
  if (isNumber(a) || isNumber(b)) return 0;
  const sa = stem(a);
  const sb = stem(b);
  if (sa === sb) return 1;
  const longest = Math.max(sa.length, sb.length);
  if (Math.abs(sa.length - sb.length) > allowedEdits(longest)) return 0;
  const d = levenshtein(sa, sb);
  return d <= allowedEdits(longest) ? 1 - d / longest : 0;
}

/** Content words: normalized, stopwords dropped (unless that would leave nothing). */
export function contentWords(text: string): string[] {
  const all = normalize(text).split(" ").filter(Boolean);
  const content = all.filter((w) => !isStopword(w));
  return content.length ? content : all;
}
