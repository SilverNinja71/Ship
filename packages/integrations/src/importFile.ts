// One entry point for files the user drops on Ship: picks the right reader
// from the file name and contents. Never throws for a bad file; problems
// come back as warnings.

import type { ImportResult, IntegrationId, NoteDocument } from "@ship/shared-types";
import { importCsvCards } from "./csv.js";
import type { CsvImportOptions } from "./csv.js";
import { parseIcs } from "./ics.js";
import { isBplist } from "./parchment/bplist.js";
import { parseParchmentArchive } from "./parchment/archive.js";
import { looksLikeParchmentStudy, parseParchmentStudy } from "./parchment/study.js";
import type { ParchmentStudyOptions } from "./parchment/study.js";
import { baseName, randomId, systemClock } from "./values.js";
import type { Clock, IdFactory } from "./values.js";

export interface ImportFileOptions {
  now?: Clock;
  newId?: IdFactory;
  /**
   * Treat .txt/.md as a Paper (the art app) export: always a note with
   * `source: "paper"`, never cards. Paper support is undecided otherwise.
   */
  paper?: boolean;
  /** Who an .ics file belongs to. Defaults to Lodestar. */
  icsSource?: IntegrationId;
  csv?: Pick<CsvImportOptions, "delimiter" | "hasHeader" | "deckName">;
  study?: Pick<ParchmentStudyOptions, "numericDates">;
}

const empty = (): ImportResult => ({ notes: [], decks: [], cards: [], assignments: [], warnings: [] });

/** Decodes text, honoring a UTF-8 or UTF-16 byte-order mark. */
export function decodeText(data: Uint8Array | string): string {
  if (typeof data === "string") return data.replace(/^﻿/, "");
  if (data[0] === 0xff && data[1] === 0xfe) return new TextDecoder("utf-16le").decode(data.subarray(2));
  if (data[0] === 0xfe && data[1] === 0xff) return new TextDecoder("utf-16be").decode(data.subarray(2));
  return new TextDecoder("utf-8").decode(data).replace(/^﻿/, "");
}

function extensionOf(name: string): string {
  const file = name.split(/[\\/]/).pop() ?? name;
  const dot = file.lastIndexOf(".");
  return dot > 0 ? file.slice(dot + 1).toLowerCase() : "";
}

function textNote(name: string, text: string, source: IntegrationId, newId: IdFactory): NoteDocument {
  const id = newId();
  return {
    id,
    source,
    title: baseName(name) || "Untitled note",
    subject: null,
    created: null,
    modified: null,
    pages: text.trim() === "" ? [] : [{ id: "1", text: text.trim() }],
  };
}

export function importFile(name: string, data: Uint8Array | string, options: ImportFileOptions = {}): ImportResult {
  const now = options.now ?? systemClock;
  const newId = options.newId ?? randomId;
  const ext = extensionOf(name);
  const result = empty();
  const bytes = typeof data === "string" ? null : data;

  try {
    if (ext === "parchment" || (bytes && isBplist(bytes))) {
      const archive = parseParchmentArchive(bytes ?? new TextEncoder().encode(data as string), { fileName: name, newId });
      result.notes.push(archive.note);
      result.warnings.push(...archive.warnings);
      return result;
    }

    const text = decodeText(data);
    const trimmed = text.trimStart();

    if (ext === "ics" || ext === "ical" || ext === "ifb" || /^BEGIN:VCALENDAR/i.test(trimmed)) {
      const calendar = parseIcs(text, options.icsSource ?? "lodestar");
      result.assignments.push(...calendar.assignments);
      result.warnings.push(...calendar.warnings);
      return result;
    }

    if (ext === "json" || (ext === "" && trimmed.startsWith("{"))) {
      const json: unknown = JSON.parse(text);
      if (!looksLikeParchmentStudy(json)) {
        result.warnings.push(`${name} isn't a Parchment study file, so nothing was imported.`);
        return result;
      }
      return { ...parseParchmentStudy(json, { now, ...options.study }), assignments: [] };
    }

    if (ext === "csv" || ext === "tsv") {
      const csv = importCsvCards(text, {
        deckName: baseName(name),
        ...options.csv,
        ...(ext === "tsv" && !options.csv?.delimiter ? { delimiter: "\t" as const } : {}),
        now,
        newId,
      });
      return { notes: [], decks: csv.decks, cards: csv.cards, assignments: [], warnings: csv.warnings };
    }

    if (ext === "txt" || ext === "md" || ext === "markdown" || ext === "") {
      if (options.paper) {
        result.notes.push(textNote(name, text, "paper", newId));
        return result;
      }
      // Quizlet and Anki export cards as tab-separated .txt; prose has commas but rarely tabs.
      if (ext === "txt" || ext === "") {
        const csvOptions = { deckName: baseName(name), ...options.csv, now };
        // Trial run with throwaway ids so a rejected guess doesn't use up the caller's ids.
        const trial = importCsvCards(text, { ...csvOptions, newId: () => "" });
        const looksLikeCards =
          trial.cards.length > 0 && (trial.delimiter === "\t" || trial.hasHeader) && trial.skippedRows <= trial.cards.length / 4;
        if (looksLikeCards) {
          const csv = importCsvCards(text, { ...csvOptions, newId });
          return { notes: [], decks: csv.decks, cards: csv.cards, assignments: [], warnings: csv.warnings };
        }
      }
      // IntegrationId has no neutral "file" value yet, so plain text notes are filed under Paper.
      result.notes.push(textNote(name, text, "paper", newId));
      return result;
    }

    result.warnings.push(`Ship doesn't know how to import .${ext} files.`);
    return result;
  } catch (e) {
    result.warnings.push(`Couldn't read ${name}: ${e instanceof Error ? e.message : String(e)}`);
    return result;
  }
}
