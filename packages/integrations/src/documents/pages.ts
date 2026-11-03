// What the PDF, Word and PowerPoint readers share: turning styled runs into the
// plain text the blurt check understands (# headings, **bold**, "- " bullets,
// "Term - definition"), and cutting long files into pages.

import type { NoteDocument } from "@ship/shared-types";
import { baseName } from "../values.js";

export type DocumentPage = NoteDocument["pages"][number];

/** Files with no page information are cut up at about this length, so a blurt can cover part of them. */
export const MAX_PAGE_CHARS = 4000;

export interface TextRun {
  text: string;
  bold: boolean;
}

const tidySpaces = (text: string) => text.replace(/\s+/g, " ").trim();

/** Joins runs into one line, marking bold stretches with ** unless the whole line is plain. */
export function renderRuns(runs: readonly TextRun[]): string {
  const merged: TextRun[] = [];
  for (const run of runs) {
    const last = merged.at(-1);
    if (last && (last.bold === run.bold || run.text.trim() === "")) last.text += run.text;
    else merged.push({ ...run });
  }
  return tidySpaces(
    merged
      .map((run) => {
        const inner = run.text.trim();
        if (!run.bold || !/[\p{L}\p{N}]/u.test(inner)) return run.text;
        const lead = run.text.startsWith(inner) ? "" : " ";
        const trail = run.text.endsWith(inner) ? "" : " ";
        return `${lead}**${inner}**${trail}`;
      })
      .join(""),
  );
}

/** A heading line. Headings already count as key ideas, so bold marks inside them are dropped. */
export function headingLine(text: string): string {
  return `# ${tidySpaces(text.replaceAll("**", ""))}`;
}

/**
 * Collects a file's lines in order. A table row folds into one line, so a
 * two-column "term, definition" table reads as definitions.
 */
export class BlockCollector {
  readonly blocks: string[] = [];
  private readonly rows: string[][] = [];
  private readonly cells: string[][] = [];

  add(text: string): void {
    if (!text) return;
    const cell = this.cells.at(-1);
    if (cell) cell.push(text);
    else this.blocks.push(text);
  }

  get inTable(): boolean {
    return this.cells.length > 0;
  }

  openRow(): void {
    this.rows.push([]);
  }

  openCell(): void {
    this.cells.push([]);
  }

  closeCell(): void {
    const cell = this.cells.pop();
    this.rows.at(-1)?.push((cell ?? []).join(" "));
  }

  closeRow(): void {
    const row = (this.rows.pop() ?? []).filter(Boolean);
    this.add(row.join(row.length === 2 ? " - " : " | "));
  }
}

/** Cuts a page that's too long at paragraph boundaries. */
export function splitLongPage(paragraphs: readonly string[], max = MAX_PAGE_CHARS): string[][] {
  const pages: string[][] = [];
  let current: string[] = [];
  let size = 0;
  for (const paragraph of paragraphs) {
    if (current.length > 0 && size + paragraph.length > max) {
      pages.push(current);
      current = [];
      size = 0;
    }
    current.push(paragraph);
    size += paragraph.length;
  }
  if (current.length > 0) pages.push(current);
  return pages;
}

function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return `${(hash >>> 0).toString(36)}-${text.length.toString(36)}`;
}

/** For a file whose notes come out a little different each time, like an image Gemini reads. */
export function fingerprintBytes(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) hash = Math.imul(hash ^ bytes[i], 0x01000193);
  return `${(hash >>> 0).toString(36)}-${bytes.length.toString(36)}`;
}

/**
 * A note for an uploaded file. The id comes from the contents: importing the
 * same file again replaces it, while two classes' different "Lecture 1.pdf"
 * files stay separate.
 */
export function documentNote(name: string, pages: DocumentPage[]): NoteDocument {
  return {
    id: `file:${fingerprint(pages.map((p) => p.text).join("\n"))}`,
    source: "file",
    title: baseName(name) || "Untitled file",
    subject: null,
    created: null,
    modified: null,
    pages,
  };
}
