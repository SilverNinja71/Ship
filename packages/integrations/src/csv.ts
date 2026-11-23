// CSV / TSV flashcard import (Quizlet, Anki, spreadsheets). RFC 4180 quoting,
// delimiter auto-detection, an optional header row and an optional deck
// column. Anki's "Notes in Plain Text" export is read too: its "#separator:"
// style header lines say how the file is laid out, and its HTML is turned
// back into plain text. Cards start with a fresh schedule.

import { newReviewSchedule } from "@ship/shared-types";
import type { Deck, Flashcard, ImportResult } from "@ship/shared-types";
import { randomId, systemClock } from "./values.js";
import type { Clock, IdFactory } from "./values.js";

export type CsvDelimiter = "," | "\t" | ";";

export interface CsvParseResult {
  rows: string[][];
  /** A quoted field was still open at the end of the text. */
  unterminatedQuote: boolean;
}

/** RFC 4180, leniently: `""` is a quote inside quotes, newlines may sit inside quotes, CRLF/LF/CR all end rows. */
export function parseDelimited(text: string, delimiter: string): CsvParseResult {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let atFieldStart = true;
  let rowHasContent = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"' && atFieldStart) {
      inQuotes = true;
      atFieldStart = false;
      rowHasContent = true;
      continue;
    }
    if (c === delimiter) {
      row.push(field);
      field = "";
      atFieldStart = true;
      rowHasContent = true;
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      atFieldStart = true;
      rowHasContent = false;
      continue;
    }
    field += c;
    atFieldStart = false;
    rowHasContent = true;
  }
  if (rowHasContent || inQuotes) {
    row.push(field);
    rows.push(row);
  }
  return { rows, unterminatedQuote: inQuotes };
}

const isBlankRow = (row: string[]) => row.every((cell) => cell.trim() === "");

/**
 * Picks the delimiter that splits the most rows into 2+ fields, most
 * consistently. Ties go to tab, then semicolon, then comma, since commas
 * show up inside answers far more often than tabs do.
 */
export function detectDelimiter(text: string): CsvDelimiter {
  const sample = text.slice(0, 64 * 1024);
  let best: CsvDelimiter = ",";
  let bestScore = 0;
  for (const delimiter of ["\t", ";", ","] as const) {
    const rows = parseDelimited(sample, delimiter).rows.filter((r) => !isBlankRow(r)).slice(0, 50);
    if (rows.length === 0) continue;
    const multi = rows.filter((r) => r.length >= 2).length;
    if (multi === 0) continue;
    const counts = new Map<number, number>();
    for (const r of rows) counts.set(r.length, (counts.get(r.length) ?? 0) + 1);
    const consistency = Math.max(...counts.values()) / rows.length;
    const score = multi / rows.length + consistency;
    if (score > bestScore) {
      best = delimiter;
      bestScore = score;
    }
  }
  return best;
}

const normalizeHeader = (cell: string) => cell.toLowerCase().replace(/[^a-z0-9]/g, "");
const FRONT_HEADERS = new Set(["front", "frontside", "term", "terms", "question", "questions", "prompt", "word", "q", "side1", "sidea", "cardfront"]);
const BACK_HEADERS = new Set(["back", "backside", "definition", "definitions", "answer", "answers", "meaning", "response", "a", "side2", "sideb", "cardback", "explanation"]);
const DECK_HEADERS = new Set(["deck", "deckname", "set", "category", "topic", "subject", "group"]);

interface Columns {
  front: number;
  back: number;
  deck: number | null;
}

/** Column positions if `row` is a recognizable header, else null. */
export function detectHeader(row: readonly string[]): Columns | null {
  const cells = row.map(normalizeHeader);
  const front = cells.findIndex((c) => FRONT_HEADERS.has(c));
  const back = cells.findIndex((c, i) => i !== front && BACK_HEADERS.has(c));
  if (front < 0 || back < 0) return null;
  const deck = cells.findIndex((c, i) => i !== front && i !== back && DECK_HEADERS.has(c));
  return { front, back, deck: deck >= 0 ? deck : null };
}

/** What the "#key:value" lines at the top of an Anki plain-text export say. */
export interface AnkiHeader {
  delimiter?: CsvDelimiter;
  html: boolean;
  /** 0-based columns that hold Anki's own data (guid, note type, tags, deck) rather than card fields. */
  special: Set<number>;
  deck: number | null;
  /** How many lines the header takes. */
  lines: number;
}

const ANKI_SEPARATORS: Record<string, CsvDelimiter> = { tab: "\t", comma: ",", semicolon: ";", "\t": "\t", ",": ",", ";": ";" };

/** Reads an Anki export's header lines; null when the text doesn't start with one. */
export function readAnkiHeader(text: string): AnkiHeader | null {
  const lines = text.split(/\r?\n/);
  const header: AnkiHeader = { html: false, special: new Set(), deck: null, lines: 0 };
  for (const line of lines) {
    const m = /^#([a-z ]+):(.*)$/i.exec(line);
    if (!m) break;
    header.lines++;
    const name = m[1]!.trim().toLowerCase();
    const value = m[2]!.trim();
    const column = Number.parseInt(value, 10) - 1;
    if (name === "separator") header.delimiter = ANKI_SEPARATORS[value.toLowerCase()];
    else if (name === "html") header.html = value.toLowerCase() === "true";
    else if (/^(tags|guid|notetype) column$/.test(name) && column >= 0) header.special.add(column);
    else if (name === "deck column" && column >= 0) {
      header.special.add(column);
      header.deck = column;
    }
  }
  return header.lines > 0 ? header : null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Anki stores fields as HTML: line breaks become newlines, other tags go, entities are decoded. */
export function ankiHtmlToText(html: string): string {
  return html
    // Anki writes a new line as "<br>" or as "<div>…</div>".
    .replace(/<br\s*\/?>|<div[^>]*>|<\/(?:p|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
      if (code[0] === "#") {
        const n = code[1] === "x" || code[1] === "X" ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
      }
      return ENTITIES[code.toLowerCase()] ?? whole;
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface CsvImportOptions {
  delimiter?: CsvDelimiter;
  /** Force header handling; by default a header is detected from its names. */
  hasHeader?: boolean;
  /** Deck name for rows without a deck column. */
  deckName?: string;
  now?: Clock;
  newId?: IdFactory;
}

export interface CsvImportResult extends ImportResult {
  delimiter: CsvDelimiter;
  hasHeader: boolean;
  /** Non-blank rows that didn't become a card. */
  skippedRows: number;
}

export function importCsvCards(input: string, options: CsvImportOptions = {}): CsvImportResult {
  const now = options.now ?? systemClock;
  const newId = options.newId ?? randomId;
  const raw = input.replace(/^\uFEFF/, "");
  const anki = readAnkiHeader(raw);
  const text = anki ? raw.split(/\r?\n/).slice(anki.lines).join("\n") : raw;
  const delimiter = options.delimiter ?? anki?.delimiter ?? detectDelimiter(text);
  const { rows: allRows, unterminatedQuote } = parseDelimited(text, delimiter);
  const rows = allRows.filter((r) => !isBlankRow(r));
  const warnings: string[] = [];

  const detected = !anki && rows[0] ? detectHeader(rows[0]) : null;
  const hasHeader = anki ? false : (options.hasHeader ?? detected !== null);
  const columns: Columns = (hasHeader ? detected : null) ?? { front: 0, back: 1, deck: anki?.deck ?? null };
  // In an Anki export the card's fields are whichever columns aren't Anki's own (guid, note type, deck, tags).
  const fieldsOf = (row: string[]): string[] => (anki ? row.filter((_, i) => !anki.special.has(i)) : row);
  const clean = (cell: string | undefined): string => (anki?.html ? ankiHtmlToText(cell ?? "") : (cell ?? "").trim());
  const body = hasHeader ? rows.slice(1) : rows;

  const defaultDeckName = options.deckName?.trim() || "Imported cards";
  const decksByName = new Map<string, Deck>();
  const deckFor = (name: string): Deck => {
    let deck = decksByName.get(name);
    if (!deck) {
      deck = { id: newId(), name, subject: null, created: now(), source: "csv" };
      decksByName.set(name, deck);
    }
    return deck;
  };

  const cards: Flashcard[] = [];
  let skippedRows = 0;
  for (const row of body) {
    const fields = fieldsOf(row);
    const front = clean(anki ? fields[0] : row[columns.front]);
    const back = clean(anki ? fields[1] : row[columns.back]);
    if (!front || !back) {
      skippedRows++;
      continue;
    }
    const deck = deckFor((columns.deck !== null ? row[columns.deck]?.trim() : "") || defaultDeckName);
    cards.push({ id: newId(), deckId: deck.id, front, back, created: now(), schedule: newReviewSchedule() });
  }

  if (unterminatedQuote) warnings.push("A quoted field was never closed; the last card may be cut short.");
  if (skippedRows > 0) warnings.push(`Skipped ${skippedRows} row(s) without both a front and a back.`);
  if (cards.length === 0) warnings.push("No flashcards were found. Each row needs a front and a back.");
  return { notes: [], decks: [...decksByName.values()], cards, assignments: [], warnings, delimiter, hasHeader, skippedRows };
}
