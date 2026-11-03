// One entry point for files the user drops on Ship: picks the right reader
// from the file name and contents. Never throws for a bad file; problems
// come back as warnings.

import type { ImportResult, IntegrationId, NoteDocument } from "@ship/shared-types";
import { importCsvCards } from "./csv.js";
import type { CsvImportOptions } from "./csv.js";
import { parseIcs } from "./ics.js";
import { readDocx } from "./documents/docx.js";
import { MAX_INLINE_BYTES, describeGeminiFailure, readImageWithGemini } from "./documents/geminiNotes.js";
import type { GeminiReader } from "./documents/geminiNotes.js";
import { documentNote, fingerprintBytes } from "./documents/pages.js";
import { readPdf } from "./documents/pdf.js";
import { readPptx } from "./documents/pptx.js";
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
  /** Where the browser finds pdf.js's worker file. Only `importFileAsync` reads PDFs. */
  pdfWorkerSrc?: string;
  /** Reads images. Null when the sailor hasn't added a Gemini key. Only `importFileAsync` uses it. */
  gemini?: GeminiReader | null;
}

const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

// Formats Ship can't open, and what to do about each.
const SAVE_AS: Record<string, string> = {
  doc: "In Word, save it as .docx or a PDF, then import that.",
  ppt: "In PowerPoint, save it as .pptx or a PDF, then import that.",
  pages: "In Pages, export it as a PDF or Word file, then import that.",
  key: "In Keynote, export it as a PDF or PowerPoint file, then import that.",
  odt: "Save it as .docx or a PDF, then import that.",
  odp: "Save it as .pptx or a PDF, then import that.",
  rtf: "Save it as .docx or a PDF, then import that.",
  gif: "Save it as a PNG or JPEG, then import that.",
  bmp: "Save it as a PNG or JPEG, then import that.",
  tif: "Save it as a PNG or JPEG, then import that.",
  tiff: "Save it as a PNG or JPEG, then import that.",
  svg: "Save it as a PNG or JPEG, then import that.",
};

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

    // Word and PowerPoint leave a tiny "~$" file beside any document that's open.
    if ((ext === "docx" || ext === "pptx") && baseName(name).startsWith("~$")) {
      result.warnings.push("That's a temporary file Office makes while a document is open, not the document itself. Import the one without ~$ in its name.");
      return result;
    }

    if (ext === "docx") {
      const docx = readDocx(bytes ?? new TextEncoder().encode(data as string));
      if (docx.pages.length === 0) {
        result.warnings.push("It has no text to read, so nothing was imported.");
        return result;
      }
      result.notes.push(documentNote(name, docx.pages));
      if (docx.pictures > 0) result.warnings.push(`${docx.pictures} picture(s) weren't read. Only the text was imported.`);
      return result;
    }

    if (ext === "pptx") {
      const pptx = readPptx(bytes ?? new TextEncoder().encode(data as string));
      if (pptx.pages.length === 0) {
        result.warnings.push("Its slides have no text to read, so nothing was imported.");
        return result;
      }
      result.notes.push(documentNote(name, pptx.pages));
      if (pptx.blankSlides > 0) result.warnings.push(`${pptx.blankSlides} slide(s) had no text, only pictures, so they were left out.`);
      return result;
    }

    if (SAVE_AS[ext]) {
      result.warnings.push(`Ship can't read .${ext} files. ${SAVE_AS[ext]}`);
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
      result.notes.push(textNote(name, text, "file", newId));
      return result;
    }

    result.warnings.push(`Ship doesn't know how to import .${ext} files.`);
    return result;
  } catch (e) {
    result.warnings.push(`Couldn't read ${name}: ${e instanceof Error ? e.message : String(e)}`);
    return result;
  }
}

async function importImage(name: string, data: Uint8Array | string, mimeType: string, gemini: GeminiReader | null | undefined): Promise<ImportResult> {
  const result = empty();
  if (typeof data === "string") {
    result.warnings.push(`Couldn't read ${name}: it wasn't read as a file.`);
    return result;
  }
  if (!gemini) {
    result.warnings.push("Reading images needs a Gemini key. Add one in Settings, then upload it again.");
    return result;
  }
  if (data.length > MAX_INLINE_BYTES) {
    result.warnings.push(`It's over ${Math.floor(MAX_INLINE_BYTES / (1024 * 1024))} MB, which is too big to send to Gemini. Try a smaller photo.`);
    return result;
  }
  try {
    const notes = await readImageWithGemini(gemini, data, mimeType);
    result.notes.push({ id: `image:${fingerprintBytes(data)}`, source: "file", title: baseName(name) || "Image", subject: null, created: null, modified: null, pages: notes.pages });
    result.warnings.push("Gemini read this image, so check it for misread words.");
  } catch (e) {
    result.warnings.push(describeGeminiFailure(e));
  }
  return result;
}

/** Like `importFile`, and also reads PDFs and images, which take time and can't be done in one step. */
export async function importFileAsync(name: string, data: Uint8Array | string, options: ImportFileOptions = {}): Promise<ImportResult> {
  const ext = extensionOf(name);
  if (IMAGE_TYPES[ext]) return importImage(name, data, IMAGE_TYPES[ext], options.gemini);
  if (ext !== "pdf") return importFile(name, data, options);
  const result = empty();
  try {
    if (typeof data === "string") throw new Error("It wasn't read as a file.");
    const pdf = await readPdf(data, { workerSrc: options.pdfWorkerSrc });
    if (pdf.pages.length === 0) {
      result.warnings.push("It has no text to read. It's probably a scan or photos, which Ship can't read yet, so nothing was imported.");
      return result;
    }
    result.notes.push(documentNote(name, pdf.pages));
    if (pdf.blankPages > 0) result.warnings.push(`${pdf.blankPages} of ${pdf.totalPages} pages had no text to read (scans or pictures), so they were left out.`);
  } catch (e) {
    result.warnings.push(`Couldn't read ${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return result;
}
