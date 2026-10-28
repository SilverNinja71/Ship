// CSV / TSV flashcard import (Quizlet, Anki, spreadsheets). RFC 4180 quoting,
// delimiter auto-detection, an optional header row and an optional deck
// column. Cards start with a fresh schedule.

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
  const text = input.replace(/^﻿/, "");
  const delimiter = options.delimiter ?? detectDelimiter(text);
  const { rows: allRows, unterminatedQuote } = parseDelimited(text, delimiter);
  const rows = allRows.filter((r) => !isBlankRow(r));
  const warnings: string[] = [];

  const detected = rows[0] ? detectHeader(rows[0]) : null;
  const hasHeader = options.hasHeader ?? detected !== null;
  const columns: Columns = (hasHeader ? detected : null) ?? { front: 0, back: 1, deck: null };
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
    const front = row[columns.front]?.trim() ?? "";
    const back = row[columns.back]?.trim() ?? "";
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
