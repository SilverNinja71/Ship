// PDF: pdf.js gives back positioned scraps of text and no structure, so this
// rebuilds lines and paragraphs, spots headings by their size, and drops the
// repeated headers, footers and page numbers that would otherwise look like key
// ideas. Scans and pictures have no text to read. pdf.js is big, so it only
// loads when someone imports a PDF.

import type { DocumentPage } from "./pages.js";

export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hasEOL: boolean;
}

export interface PdfLine {
  text: string;
  y: number;
  height: number;
}

export interface PdfContents {
  pages: DocumentPage[];
  totalPages: number;
  /** Pages with no readable text. */
  blankPages: number;
}

export interface ReadPdfOptions {
  /** Where the browser finds pdf.js's worker file. Not needed in Node. */
  workerSrc?: string;
}

const BULLET_START = /^\s*(?:[-*+•▪◦‣●○■□➢►]|\d{1,3}[.)]|[a-z][.)])\s/;
const PAGE_NUMBER = /^(?:page\s+)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?$/i;
const HEADING_SCALE = 1.25;
const MAX_HEADING_WORDS = 14;
/** Shorter lines are slide bullets and labels, even on a page where nothing is longer. */
const MIN_WRAPPED_LINE = 35;
const LONE_BULLET = /^[-*+•▪◦‣●○■□➢►]$/;

/** Symbol fonts keep their bullets in Unicode's private area, where they mean nothing as text. */
function cleanLine(text: string): string {
  return text
    .replace(/^\s*[-]\s*/, "• ")
    .replace(/[-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Rebuilds lines from pdf.js's scraps, in the order the file stores them. */
export function linesFromItems(items: readonly PdfTextItem[]): PdfLine[] {
  const lines: PdfLine[] = [];
  let text = "";
  let previous: PdfTextItem | null = null;
  let tallest = 0;
  let y = 0;

  const flush = () => {
    const clean = cleanLine(text);
    const last = lines.at(-1);
    // A bullet in its own font often reads as a separate line, just before its text.
    if (clean && last && LONE_BULLET.test(last.text) && Math.abs(last.y - y) <= Math.max(last.height, tallest) * 1.5) {
      lines[lines.length - 1] = { text: `${last.text} ${clean}`, y, height: tallest };
    } else if (clean) {
      lines.push({ text: clean, y, height: tallest });
    }
    text = "";
    tallest = 0;
    previous = null;
  };

  for (const item of items) {
    const prior = previous as PdfTextItem | null;
    if (prior && Math.abs(item.y - prior.y) > Math.max(prior.height, item.height) * 0.6) flush();
    const before = previous as PdfTextItem | null;
    if (before && item.str && !/\s$/.test(text) && !/^\s/.test(item.str) && item.x - (before.x + before.width) > before.height * 0.15) text += " ";
    if (!text) y = item.y;
    text += item.str;
    if (item.str.trim()) {
      tallest = Math.max(tallest, item.height);
      previous = item;
    }
    if (item.hasEOL) flush();
  }
  flush();
  return lines;
}

const repeatKey = (text: string) => text.toLowerCase().replace(/\d+/g, "#").trim();

/** Drops page numbers everywhere, and text repeated at the top or bottom of most pages. */
export function withoutRunningText(pages: readonly PdfLine[][]): PdfLine[][] {
  const edges = (lines: readonly PdfLine[]) => new Set([...lines.slice(0, 2), ...lines.slice(-2)].map((l) => repeatKey(l.text)));
  const counts = new Map<string, number>();
  for (const lines of pages) for (const key of edges(lines)) counts.set(key, (counts.get(key) ?? 0) + 1);
  const needed = Math.max(3, Math.ceil(pages.length * 0.5));
  return pages.map((lines) => {
    const atEdge = edges(lines);
    return lines.filter((line) => {
      if (PAGE_NUMBER.test(line.text)) return false;
      const key = repeatKey(line.text);
      return !(atEdge.has(key) && (counts.get(key) ?? 0) >= needed);
    });
  });
}

/** The size most of the file's characters are set in. */
export function bodyHeight(pages: readonly PdfLine[][]): number {
  const weight = new Map<number, number>();
  for (const lines of pages) {
    for (const line of lines) {
      const size = Math.round(line.height * 2) / 2;
      weight.set(size, (weight.get(size) ?? 0) + line.text.length);
    }
  }
  let best = 0;
  let bestWeight = -1;
  for (const [size, w] of weight) {
    if (w > bestWeight) {
      best = size;
      bestWeight = w;
    }
  }
  return best;
}

const isHeading = (line: PdfLine, body: number) =>
  body > 0 && line.height >= body * HEADING_SCALE && line.text.split(/\s+/).length <= MAX_HEADING_WORDS && !/[.,;]$/.test(line.text);

/** Whether `next` carries on the sentence in `line`, rather than starting something new. */
function continues(line: PdfLine, next: PdfLine, longest: number): boolean {
  const drop = line.y - next.y;
  if (drop <= 0 || drop > Math.max(line.height, next.height) * 1.7) return false; // a new column, or a gap
  if (BULLET_START.test(next.text)) return false;
  if (/^\p{Ll}/u.test(next.text)) return true;
  // A line that runs most of the way across the page and stops mid-sentence simply wrapped.
  return !/[.!?:;]["')\]]?$/.test(line.text) && line.text.length >= Math.max(MIN_WRAPPED_LINE, longest * 0.6);
}

/** One page's lines as text: headings on their own lines, wrapped lines joined back into sentences. */
export function pageText(lines: readonly PdfLine[], body: number): string {
  const longest = Math.max(0, ...lines.map((l) => l.text.length));
  const out: string[] = [];
  let open: PdfLine | null = null;
  for (const line of lines) {
    if (isHeading(line, body)) {
      const last = out.at(-1);
      // A big title that wrapped onto a second line.
      if (open === null && last?.startsWith("# ") && !line.text.startsWith("#")) out[out.length - 1] = `${last} ${line.text}`;
      else out.push(`# ${line.text}`);
      open = null;
      continue;
    }
    if (open && continues(open, line, longest)) {
      const joined = out[out.length - 1];
      const broken = /\p{Ll}-$/u.test(joined) && /^\p{Ll}/u.test(line.text);
      out[out.length - 1] = broken ? joined.slice(0, -1) + line.text : `${joined} ${line.text}`;
    } else {
      out.push(line.text);
    }
    open = line;
  }
  return out.join("\n");
}

export async function readPdf(bytes: Uint8Array, options: ReadPdfOptions = {}): Promise<PdfContents> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (options.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = options.workerSrc;
  const task = pdfjs.getDocument({ data: bytes.slice(), disableFontFace: true, verbosity: 0 });
  try {
    const document = await task.promise.catch((e: unknown) => {
      const name = e instanceof Error ? e.name : "";
      if (name === "PasswordException") throw new Error("It's password-protected. Remove the password, then import it again.");
      if (name === "InvalidPDFException") throw new Error("It isn't a valid PDF.");
      throw e;
    });
    const raw: PdfLine[][] = [];
    for (let n = 1; n <= document.numPages; n++) {
      const page = await document.getPage(n);
      const content = await page.getTextContent();
      const items: PdfTextItem[] = [];
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const [, , c, d, x, y] = item.transform as number[];
        items.push({ str: item.str, x, y, width: item.width, height: item.height || Math.hypot(c, d), hasEOL: item.hasEOL });
      }
      raw.push(linesFromItems(items));
      page.cleanup();
    }
    const cleaned = withoutRunningText(raw);
    const body = bodyHeight(cleaned);
    const pages: DocumentPage[] = [];
    cleaned.forEach((lines, i) => {
      const text = pageText(lines, body);
      if (text) pages.push({ id: `${i + 1}`, text });
    });
    return { pages, totalPages: document.numPages, blankPages: document.numPages - pages.length };
  } finally {
    await task.destroy();
  }
}
