// `.parchment` files from Parchment (the user's iPad notes app): a binary
// plist of NotebookArchive { magic: "parchment-archive", version, notebook,
// drawings, pdf?, coverImage? }, most likely written by Swift's
// PropertyListEncoder. Only typed text survives: handwriting that was never
// converted to text is PencilKit drawing data, not words.
//
// Field names below the top level are guesses from a description of the
// Swift source, so every lookup accepts a few spellings.

import type { NoteDocument } from "@ship/shared-types";
import { isBplist, parseBplist, PlistUid } from "./bplist.js";
import { APPLE_REFERENCE_EPOCH_MS, toEpochMs } from "../time.js";
import { asArray, asDict, asId, asNumber, asText, baseName, isDict, pickLoose, randomId } from "../values.js";
import type { Dict, IdFactory } from "../values.js";

export const PARCHMENT_MAGIC = "parchment-archive";

export interface ParchmentArchiveOptions {
  /** Used for the title when the notebook has none. */
  fileName?: string;
  /** For notebooks without an id of their own. */
  newId?: IdFactory;
}

export interface ParchmentArchiveResult {
  note: NoteDocument;
  version: number | null;
  warnings: string[];
}

const HANDWRITING_WARNING =
  "Handwriting that was never converted to text isn't in the file, so only typed text was imported.";

/**
 * NSKeyedArchiver output is a flat `$objects` table linked by UIDs. Rebuild
 * the object graph on a best-effort basis: NSDictionary/NSArray/NSString/
 * NSDate/NSData become plain values, other objects become dicts of their keys.
 */
export function resolveKeyedArchive(root: Dict): unknown {
  const objects = asArray(root["$objects"]);
  const top = asDict(root["$top"]);
  const memo = new Map<number, unknown>();
  const resolving = new Set<number>();

  const resolve = (value: unknown): unknown => {
    if (value instanceof PlistUid) return resolveRef(value.value);
    if (Array.isArray(value)) return value.map(resolve);
    return value;
  };

  const resolveRef = (index: number): unknown => {
    if (memo.has(index)) return memo.get(index);
    if (resolving.has(index)) return null; // a cycle; drop the back-reference
    const obj = objects[index];
    if (obj === "$null" || obj === undefined) return null;
    if (!isDict(obj)) return obj;
    resolving.add(index);
    let out: unknown;
    if (Array.isArray(obj["NS.keys"]) && Array.isArray(obj["NS.objects"])) {
      const dict: Dict = {};
      const keys = obj["NS.keys"].map(resolve);
      const values = obj["NS.objects"].map(resolve);
      keys.forEach((k, i) => {
        if (typeof k === "string") dict[k] = values[i];
      });
      out = dict;
    } else if (Array.isArray(obj["NS.objects"])) {
      out = obj["NS.objects"].map(resolve);
    } else if (obj["NS.string"] !== undefined) {
      out = resolve(obj["NS.string"]);
    } else if (typeof obj["NS.time"] === "number") {
      out = new Date(APPLE_REFERENCE_EPOCH_MS + obj["NS.time"] * 1000);
    } else if (obj["NS.bytes"] !== undefined || obj["NS.data"] !== undefined) {
      out = resolve(obj["NS.bytes"] ?? obj["NS.data"]);
    } else {
      const dict: Dict = {};
      for (const [k, v] of Object.entries(obj)) if (k !== "$class") dict[k] = resolve(v);
      out = dict;
    }
    resolving.delete(index);
    memo.set(index, out);
    return out;
  };

  const rootRef = top?.["root"] ?? Object.values(top ?? {})[0];
  return rootRef === undefined ? null : resolve(rootRef);
}

function decodeTop(bytes: Uint8Array, warnings: string[]): unknown {
  if (isBplist(bytes)) {
    const plist = parseBplist(bytes);
    const dict = asDict(plist);
    if (dict && dict["$archiver"] !== undefined && Array.isArray(dict["$objects"])) {
      warnings.push("This file was saved with NSKeyedArchiver; it was read on a best-effort basis.");
      return resolveKeyedArchive(dict);
    }
    return plist;
  }
  const head = new TextDecoder().decode(bytes.subarray(0, 64)).trimStart();
  if (head.startsWith("{")) return JSON.parse(new TextDecoder().decode(bytes));
  if (head.startsWith("PK")) throw new Error("This .parchment file is a zip archive, which Ship can't read yet.");
  if (head.startsWith("<?xml") || head.startsWith("<plist")) {
    throw new Error("This .parchment file is an XML plist; Ship only reads the binary kind.");
  }
  throw new Error("This doesn't look like a Parchment notebook (.parchment) file.");
}

/** `text` may be a String, or an AttributedString encoded as runs. */
function blockText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const runs = value.filter((v): v is string => typeof v === "string");
    return runs.length > 0 ? runs.join("") : null;
  }
  const dict = asDict(value);
  if (dict) {
    const inner = pickLoose(dict, ["string", "text", "plainText", "content", "runs"]);
    return inner === undefined ? null : blockText(inner);
  }
  return null;
}

/** Where a block sits, for top-to-bottom order. Accepts {x,y}, {origin:{x,y}} or CGRect's [[x,y],[w,h]]. */
function blockPosition(block: Dict): { x: number; y: number } | null {
  const frame = pickLoose(block, ["frame", "rect", "bounds", "position", "origin", "center"]);
  const point = (v: unknown): { x: number; y: number } | null => {
    if (Array.isArray(v)) {
      if (Array.isArray(v[0])) return point(v[0]);
      const x = asNumber(v[0]);
      const y = asNumber(v[1]);
      return x !== null && y !== null ? { x, y } : null;
    }
    const d = asDict(v);
    if (!d) return null;
    if (d["origin"] !== undefined) return point(d["origin"]);
    const x = asNumber(d["x"]);
    const y = asNumber(d["y"]);
    return x !== null && y !== null ? { x, y } : null;
  };
  if (frame !== undefined) return point(frame);
  const x = asNumber(block["x"]);
  const y = asNumber(block["y"]);
  return x !== null && y !== null ? { x, y } : null;
}

function pageText(page: Dict): string {
  const blocks = asArray(pickLoose(page, ["textBlocks", "texts", "textBoxes", "blocks"]))
    .map(asDict)
    .filter((b): b is Dict => b !== null);
  const positions = blocks.map(blockPosition);
  const ordered = positions.every((p) => p !== null)
    ? blocks
        .map((block, i) => ({ block, pos: positions[i] as { x: number; y: number }, i }))
        .sort((a, b) => a.pos.y - b.pos.y || a.pos.x - b.pos.x || a.i - b.i)
        .map((entry) => entry.block)
    : blocks;
  const texts = ordered
    .map((b) => blockText(pickLoose(b, ["text", "string", "content", "attributedText"]))?.trim() ?? "")
    .filter((t) => t !== "");
  // Some versions may keep page text directly on the page.
  const direct = blockText(pickLoose(page, ["text", "typedText"]))?.trim();
  if (direct && texts.length === 0) texts.push(direct);
  return texts.join("\n\n");
}

/** Counts non-empty drawings whether stored as a dict, a Swift [UUID: Data] array, or a list. */
function countDrawings(value: unknown): number {
  const isFilled = (v: unknown) =>
    (v instanceof Uint8Array && v.length > 0) || (isDict(v) && Object.keys(v).length > 0) || typeof v === "string";
  if (Array.isArray(value)) return value.filter((v) => v instanceof Uint8Array || isDict(v)).filter(isFilled).length;
  const dict = asDict(value);
  return dict ? Object.values(dict).filter(isFilled).length : 0;
}

export function parseParchmentArchive(bytes: Uint8Array, options: ParchmentArchiveOptions = {}): ParchmentArchiveResult {
  const warnings: string[] = [];
  const top = asDict(decodeTop(bytes, warnings));
  if (!top) throw new Error("This Parchment file has no notebook in it.");

  const magic = asText(top["magic"]);
  if (magic !== PARCHMENT_MAGIC) {
    warnings.push(
      magic === null
        ? "The file has no Parchment signature; it was read anyway."
        : `Unexpected file signature "${magic}"; it was read anyway.`,
    );
  }
  const version = asNumber(top["version"]);
  // Tolerate a bare notebook at the top level.
  const notebook = asDict(pickLoose(top, ["notebook"])) ?? (top["pages"] !== undefined ? top : null);
  if (!notebook) throw new Error("This Parchment file has no notebook in it.");

  const remoteId = asId(pickLoose(notebook, ["id", "uuid", "identifier"]));
  const id = remoteId ? `parchment:${remoteId}` : `parchment:${(options.newId ?? randomId)()}`;
  const subjectValue = pickLoose(notebook, ["subject", "course", "class"]);
  const subject = asText(subjectValue) ?? asText(pickLoose(asDict(subjectValue), ["name", "title"]));

  let rawPages = asArray(pickLoose(notebook, ["pages"]));
  if (rawPages.length === 0) {
    rawPages = asArray(pickLoose(notebook, ["sections"])).flatMap((s) => asArray(pickLoose(asDict(s), ["pages"])));
  }

  const pages: NoteDocument["pages"] = [];
  let blankPages = 0;
  let pagesWithInk = 0;
  rawPages.forEach((raw, index) => {
    const page = asDict(raw);
    if (!page) return;
    const ink = pickLoose(page, ["drawing", "drawingData", "ink"]);
    if (ink instanceof Uint8Array && ink.length > 0) pagesWithInk++;
    const text = pageText(page);
    if (text === "") {
      blankPages++;
      return;
    }
    const pageId = asId(pickLoose(page, ["id", "uuid"])) ?? `${index + 1}`;
    pages.push({ id: pageId, text });
  });

  const drawings = Math.max(countDrawings(top["drawings"]), pagesWithInk);
  if (drawings > 0 || blankPages > 0) warnings.push(HANDWRITING_WARNING);
  if (blankPages > 0) warnings.push(`${blankPages} page(s) had no typed text and were left out.`);
  if (top["pdf"] instanceof Uint8Array && top["pdf"].length > 0) {
    warnings.push("The notebook's PDF wasn't read; text inside the PDF isn't imported.");
  }
  if (rawPages.length === 0) warnings.push("The notebook has no pages.");

  const title =
    asText(pickLoose(notebook, ["title", "name", "displayName"])) ??
    (options.fileName ? baseName(options.fileName) : null) ??
    "Untitled notebook";

  return {
    note: {
      id,
      source: "parchment",
      title,
      subject,
      created: toEpochMs(pickLoose(notebook, ["created", "createdAt", "creationDate", "dateCreated"])),
      modified: toEpochMs(
        pickLoose(notebook, ["modified", "modifiedAt", "updatedAt", "lastModified", "dateModified", "modificationDate"]),
      ),
      pages,
    },
    version,
    warnings,
  };
}
