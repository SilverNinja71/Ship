// The Captain's Log blurt check: pull weighted key concepts out of reference
// notes, then fuzzy-match a blurt (everything the sailor remembered, written
// from memory) against them.
//
// Concept extraction is a small RAKE-style keyphrase finder: phrases are
// runs of words between stopwords and punctuation, scored by how often their
// words recur, how specific they look, and where they sit (definition terms,
// bold text and headings count most).

import type { BlurtConcept, BlurtConceptResult, BlurtResult } from "@ship/shared-types";
import { isNumber, isStopword, normalizeWord, stem, wordMatch, words } from "./text.js";
import type { Word } from "./text.js";

export interface ExtractOptions {
  /** Upper bound on concepts, however long the notes are. */
  maxConcepts?: number;
}

type SegmentKind = "heading" | "term" | "body";

interface Segment {
  text: string;
  kind: SegmentKind;
  /** The sentence this came from, shown next to a missed concept. */
  sentence: string;
}

const BULLET = /^\s*(?:[-*+•▪◦‣>]|\d{1,3}[.)])\s+/;
const HEADING = /^\s*#{1,6}\s+(.+?)\s*#*\s*$/;
// "Term: definition", "Term - definition", "Term — definition", "Term = definition".
const DEFINITION = /^([^:=–—.!?]{1,60}?)\s*(?::\s|\s[-=]\s|\s*[–—]\s*)(.+)$/;
const EMPHASIS = /\*\*(.+?)\*\*|__(.+?)__|==(.+?)==/g;
const NOT_TERMS = new Set(["note", "notes", "example", "examples", "eg", "ex", "tip", "remember", "important", "summary", "definition", "def", "key", "answer", "question", "q", "see"]);
const MAX_PHRASE_WORDS = 4;
const MAX_TERM_WORDS = 5;

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function contentCount(text: string): number {
  return words(text).filter((w) => !isStopword(w.norm)).length;
}

/** Notes → headings, defined terms, bold text and plain sentences. */
function segment(notes: string): Segment[] {
  const out: Segment[] = [];
  for (const rawLine of notes.split(/\r?\n/)) {
    let line = rawLine.replace(BULLET, "").trim();
    if (!line) continue;

    const heading = HEADING.exec(line);
    if (heading) {
      out.push({ text: heading[1], kind: "heading", sentence: heading[1] });
      continue;
    }
    if (line.endsWith(":") && contentCount(line) <= MAX_TERM_WORDS) {
      const text = line.slice(0, -1);
      out.push({ text, kind: "heading", sentence: text });
      continue;
    }

    for (const m of line.matchAll(EMPHASIS)) {
      const text = m[1] ?? m[2] ?? m[3];
      out.push({ text, kind: "term", sentence: line.replace(EMPHASIS, "$1$2$3") });
    }
    line = line.replace(EMPHASIS, "$1$2$3");

    const def = DEFINITION.exec(line);
    if (def) {
      const term = def[1].trim();
      const termWords = words(term);
      if (termWords.length && termWords.length <= MAX_TERM_WORDS && !NOT_TERMS.has(termWords[0].norm)) {
        out.push({ text: term, kind: "term", sentence: line });
        for (const s of splitSentences(def[2])) out.push({ text: s, kind: "body", sentence: line });
        continue;
      }
    }
    for (const s of splitSentences(line)) out.push({ text: s, kind: "body", sentence: s });
  }
  return out;
}

/** Runs of content words, broken at stopwords and punctuation. */
function phrases(text: string): Word[][] {
  const ws = words(text);
  const out: Word[][] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) out.push(cur);
    cur = [];
  };
  ws.forEach((w, i) => {
    const gap = i > 0 ? text.slice(ws[i - 1].end, w.start) : "";
    // Keep "December 7, 1941" together; any other punctuation ends the phrase.
    const dateComma = gap.trim() === "," && /^\d{1,2}$/.test(ws[i - 1].norm) && /^\d{4}$/.test(w.norm);
    if (/[^\s\-'’]/.test(gap) && !dateComma) flush();
    if (isStopword(w.norm) || (w.norm.length < 2 && !isNumber(w.norm))) return flush();
    cur.push(w);
  });
  flush();
  return out.flatMap((p) => {
    if (p.length <= MAX_PHRASE_WORDS) return [p];
    // Very long runs are usually several ideas; cut them into even chunks of ≤ 3.
    const pieces = Math.ceil(p.length / 3);
    const size = Math.ceil(p.length / pieces);
    const chunks: Word[][] = [];
    for (let i = 0; i < p.length; i += size) chunks.push(p.slice(i, i + size));
    return chunks;
  });
}

interface Candidate {
  key: string;
  words: Word[];
  display: string;
  sentence: string;
  kind: SegmentKind;
  /** Segment index then character offset, for ordering by appearance. */
  order: number;
  occurrences: number;
  /** Set when the phrase opens its segment: its first word is capitalized for grammar, not meaning. */
  sentenceStart: boolean;
  score: number;
}

const KIND_BOOST: Record<SegmentKind, number> = { heading: 1.6, term: 2.2, body: 1 };

function wordScore(w: Word, freq: Map<string, number>, atSentenceStart: boolean): number {
  const f = freq.get(stem(w.norm)) ?? 1;
  const repeat = 1 + 0.5 * (f - 1);
  const length = isNumber(w.norm) ? 1 : Math.min(1.4, Math.max(0.6, w.norm.length / 7));
  let caps = 1;
  if (/^\p{Lu}{2,}s?$/u.test(w.raw)) caps = 1.4; // acronyms: ATP, DNA, WWII
  else if (/^\p{Lu}/u.test(w.raw) && !atSentenceStart) caps = 1.2; // proper nouns mid-sentence
  return repeat * length * caps;
}

export function extractConcepts(notes: string, options: ExtractOptions = {}): BlurtConcept[] {
  const maxConcepts = options.maxConcepts ?? 30;
  const segments = segment(notes);
  if (!segments.length) return [];

  const candidates = new Map<string, Candidate>();
  segments.forEach((seg, si) => {
    const segWords = words(seg.text);
    const firstWordStart = segWords[0]?.start;
    // A short heading or defined term is one concept as written ("D-Day", "Causes of WW1").
    const whole = seg.kind !== "body" && segWords.length <= MAX_TERM_WORDS;
    const runs = whole ? [segWords.filter((w) => !isStopword(w.norm))].filter((r) => r.length) : phrases(seg.text);
    for (const run of runs) {
      const key = [...new Set(run.map((w) => stem(w.norm)))].sort().join(" ");
      const existing = candidates.get(key);
      if (existing) {
        existing.occurrences++;
        if (KIND_BOOST[seg.kind] > KIND_BOOST[existing.kind]) existing.kind = seg.kind;
        continue;
      }
      candidates.set(key, {
        key,
        words: run,
        display: seg.text.slice(run[0].start, run[run.length - 1].end),
        sentence: seg.sentence,
        kind: seg.kind,
        order: si * 100_000 + run[0].start,
        occurrences: 1,
        sentenceStart: run[0].start === firstWordStart,
        score: 0,
      });
    }
  });

  const freq = new Map<string, number>();
  for (const c of candidates.values()) {
    for (const w of c.words) freq.set(stem(w.norm), (freq.get(stem(w.norm)) ?? 0) + c.occurrences);
  }
  for (const c of candidates.values()) {
    // Headings and terms are often Title Case, so only acronyms count as special there.
    const scores = c.words.map((w, i) => wordScore(w, freq, c.kind !== "body" || (c.sentenceStart && i === 0)));
    const top = Math.max(...scores);
    const rest = scores.reduce((a, b) => a + b, 0) - top;
    // A lone past-tense word ("attacked") is nearly always a verb, not an idea.
    const loneVerb = c.kind === "body" && c.words.length === 1 && /\p{Ll}ed$/u.test(c.words[0].raw) ? 0.35 : 1;
    c.score = (top + 0.35 * rest) * KIND_BOOST[c.kind] * (1 + 0.25 * (c.occurrences - 1)) * loneVerb;
  }

  const ranked = [...candidates.values()].sort((a, b) => b.score - a.score || a.order - b.order);
  const bodySentences = segments.filter((s) => s.kind === "body").length;
  // Roughly three ideas per sentence, plus every heading and defined term.
  const limit = Math.min(maxConcepts, Math.max(3, bodySentences * 3 + segments.length - bodySentences));
  const topScore = ranked[0].score;

  const chosen: Candidate[] = [];
  const chosenStems: Set<string>[] = [];
  for (const c of ranked) {
    if (chosen.length >= limit || c.score < topScore * 0.2) break;
    const stems = new Set(c.key.split(" "));
    // A phrase already covered by a chosen one adds nothing to check.
    if (chosenStems.some((s) => [...stems].every((x) => s.has(x)))) continue;
    chosen.push(c);
    chosenStems.push(stems);
  }

  return chosen
    .sort((a, b) => a.order - b.order)
    .map((c, i) => {
      let weight = c.score >= topScore * 0.6 ? 3 : c.score >= topScore * 0.35 ? 2 : 1;
      if (c.kind === "term") weight = 3;
      else if (c.kind === "heading") weight = Math.max(weight, 2);
      return {
        id: `c${i + 1}`,
        term: c.words.map((w) => w.norm).join(" "),
        display: c.display,
        weight,
        sentence: c.sentence,
      };
    });
}

export const MASTERED_SCORE = 0.75;
// Just over a third, so one shared word out of three isn't "partial".
export const PARTIAL_SCORE = 0.34;
const MAX_EXTRA_TERMS = 20;

interface PoolEntry {
  norm: string;
  raws: string[];
}

/** The blurt's content words, plus adjacent pairs joined ("photo synthesis" meets "photosynthesis"). */
function blurtPool(blurt: string): { pool: PoolEntry[]; content: Word[] } {
  const content = words(blurt).filter((w) => !isStopword(w.norm));
  const pool: PoolEntry[] = content.map((w) => ({ norm: w.norm, raws: [w.raw] }));
  for (let i = 1; i < content.length; i++) {
    pool.push({ norm: content[i - 1].norm + content[i].norm, raws: [content[i - 1].raw, content[i].raw] });
  }
  return { pool, content };
}

export interface GradeBlurtOptions {
  /** The full notes, so words that appear in them don't count as extra terms. */
  notes?: string;
}

export function gradeBlurt(blurt: string, concepts: readonly BlurtConcept[], options: GradeBlurtOptions = {}): BlurtResult {
  const { pool, content } = blurtPool(blurt);

  const results: BlurtConceptResult[] = concepts.map((concept) => {
    const termWords = concept.term.split(" ").filter(Boolean);
    const matched = new Set<string>();
    let total = 0;
    for (const tw of termWords) {
      let best = 0;
      let bestEntry: PoolEntry | null = null;
      for (const entry of pool) {
        const m = wordMatch(tw, entry.norm);
        if (m > best) {
          best = m;
          bestEntry = entry;
          if (m === 1) break;
        }
      }
      total += best;
      bestEntry?.raws.forEach((r) => matched.add(r));
    }
    const score = termWords.length ? total / termWords.length : 0;
    const status = score >= MASTERED_SCORE ? "mastered" : score >= PARTIAL_SCORE ? "partial" : "missed";
    return { concept, status, score, matchedWith: [...matched] };
  });

  const totalWeight = concepts.reduce((a, c) => a + c.weight, 0);
  const credit = (r: BlurtConceptResult) => (r.status === "mastered" ? 1 : r.status === "partial" ? r.score : 0);
  const coverage = totalWeight ? results.reduce((a, r) => a + r.concept.weight * credit(r), 0) / totalWeight : 0;

  // Extra terms: blurt words that neither hit a concept nor appear anywhere in the notes.
  const known = new Set<string>();
  for (const c of concepts) {
    c.term.split(" ").forEach((w) => known.add(w));
    words(c.sentence).forEach((w) => known.add(w.norm));
  }
  if (options.notes) words(options.notes).forEach((w) => known.add(w.norm));
  const knownList = [...known];
  const extras = new Map<string, string>();
  for (const w of content) {
    if (extras.size >= MAX_EXTRA_TERMS) break;
    if (extras.has(w.norm) || (w.norm.length < 4 && !isNumber(w.norm))) continue;
    if (knownList.some((k) => wordMatch(w.norm, k) > 0)) continue;
    extras.set(w.norm, w.raw);
  }

  return { coverage, concepts: results, extraTerms: [...extras.values()] };
}

/** Extract concepts from the notes and grade the blurt against them in one go. */
export function checkBlurt(blurt: string, notes: string, options: ExtractOptions = {}): BlurtResult {
  return gradeBlurt(blurt, extractConcepts(notes, options), { notes });
}

export type HighlightStatus = BlurtConceptResult["status"] | "extra";

export interface TextSpan {
  text: string;
  status: HighlightStatus | null;
  conceptId?: string;
}

interface Mark {
  start: number;
  end: number;
  status: HighlightStatus;
  conceptId?: string;
}

function toSpans(text: string, marks: Mark[]): TextSpan[] {
  const spans: TextSpan[] = [];
  let at = 0;
  for (const m of [...marks].sort((a, b) => a.start - b.start)) {
    if (m.start < at) continue;
    if (m.start > at) spans.push({ text: text.slice(at, m.start), status: null });
    spans.push({ text: text.slice(m.start, m.end), status: m.status, conceptId: m.conceptId });
    at = m.end;
  }
  if (at < text.length) spans.push({ text: text.slice(at), status: null });
  return spans;
}

/** The notes split into spans, with each concept colored by how well it was recalled. */
export function annotateNotes(notes: string, result: BlurtResult): TextSpan[] {
  const lower = notes.toLowerCase();
  const marks: Mark[] = [];
  const overlaps = (s: number, e: number) => marks.some((m) => s < m.end && e > m.start);
  let cursor = 0;
  for (const r of result.concepts) {
    const needle = r.concept.display.toLowerCase();
    if (!needle) continue;
    let idx = lower.indexOf(needle, cursor);
    while (idx >= 0 && overlaps(idx, idx + needle.length)) idx = lower.indexOf(needle, idx + 1);
    if (idx < 0) {
      idx = lower.indexOf(needle);
      while (idx >= 0 && overlaps(idx, idx + needle.length)) idx = lower.indexOf(needle, idx + 1);
    }
    if (idx < 0) continue;
    marks.push({ start: idx, end: idx + needle.length, status: r.status, conceptId: r.concept.id });
    cursor = idx + needle.length;
  }
  return toSpans(notes, marks);
}

/** The blurt split into spans: words that hit a concept, and extra terms. */
export function annotateBlurt(blurt: string, result: BlurtResult): TextSpan[] {
  const rank: Record<HighlightStatus, number> = { mastered: 3, partial: 2, extra: 1, missed: 0 };
  const byWord = new Map<string, { status: HighlightStatus; conceptId?: string }>();
  for (const r of result.concepts) {
    if (r.status === "missed") continue;
    for (const raw of r.matchedWith) {
      const norm = normalizeWord(raw);
      const prev = byWord.get(norm);
      if (!prev || rank[r.status] > rank[prev.status]) byWord.set(norm, { status: r.status, conceptId: r.concept.id });
    }
  }
  for (const raw of result.extraTerms) {
    const norm = normalizeWord(raw);
    if (!byWord.has(norm)) byWord.set(norm, { status: "extra" });
  }
  const marks: Mark[] = [];
  for (const w of words(blurt)) {
    const hit = byWord.get(w.norm);
    if (hit) marks.push({ start: w.start, end: w.end, ...hit });
  }
  return toSpans(blurt, marks);
}
