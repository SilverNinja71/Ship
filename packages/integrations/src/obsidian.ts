// Obsidian, without any file system: reading a vault's Markdown into notes and
// cards, writing Ship's things back as Markdown, and the clip format the
// Lookout shares with Obsidian Web Clipper. The web app does the folder work
// (File System Access) and the Lookout the clipping; both lean on this.

import type { Deck, Flashcard, NoteDocument } from "@ship/shared-types";

// ---- Properties (YAML frontmatter) --------------------------------------------------------------

export type PropertyValue = string | string[];

export interface Frontmatter {
  properties: Record<string, PropertyValue>;
  /** The note after the frontmatter block. */
  body: string;
}

const unquote = (v: string): string => {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    const inner = t.slice(1, -1);
    return t[0] === '"' ? inner.replace(/\\"/g, '"').replace(/\\\\/g, "\\") : inner.replace(/''/g, "'");
  }
  return t;
};

/**
 * Obsidian's properties block: `---`, YAML lines, `---`. Ship reads the simple
 * YAML Obsidian writes (key: value, inline [a, b] lists and "- item" lists);
 * anything fancier is kept as text. A note without one has no properties.
 */
export function parseFrontmatter(text: string): Frontmatter {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return { properties: {}, body: text };
  const properties: Record<string, PropertyValue> = {};
  let listKey: string | null = null;
  for (const line of m[1]!.split(/\r?\n/)) {
    const item = /^\s+-\s*(.*)$/.exec(line) ?? (listKey ? /^-\s+(.*)$/.exec(line) : null);
    if (item && listKey) {
      const list = properties[listKey];
      (Array.isArray(list) ? list : (properties[listKey] = [])).push(unquote(item[1]!));
      continue;
    }
    const kv = /^([^:#\s][^:]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1]!.trim();
    const value = kv[2]!.trim();
    listKey = null;
    if (!value) {
      listKey = key;
      properties[key] = [];
    } else if (value.startsWith("[") && value.endsWith("]")) {
      properties[key] = value
        .slice(1, -1)
        .split(",")
        .map(unquote)
        .filter(Boolean);
    } else {
      properties[key] = unquote(value);
    }
  }
  return { properties, body: text.slice(m[0].length) };
}

const yamlString = (v: string) => (/^[\w .,/@()-]*$/.test(v) && v.trim() === v && v !== "" && !/^(true|false|null|yes|no|\d)/i.test(v) ? v : JSON.stringify(v));

/** Writes properties the way Obsidian does: strings quoted when needed, lists one item per line. */
export function writeFrontmatter(properties: Record<string, PropertyValue | null | undefined>): string {
  const lines = ["---"];
  for (const [key, value] of Object.entries(properties)) {
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      if (!value.length) continue;
      lines.push(`${key}:`, ...value.map((v) => `  - ${yamlString(v)}`));
    } else lines.push(`${key}: ${yamlString(value)}`);
  }
  lines.push("---", "");
  return lines.join("\n");
}

// ---- Reading a vault ----------------------------------------------------------------------------

/** The folder Ship writes into; never read back as the sailor's own notes. */
export const SHIP_FOLDER = "Ship";
/** Where Obsidian Web Clipper, and the Lookout's clipper, put clippings. */
export const CLIPPINGS_FOLDER = "Clippings";

/**
 * Whether a vault file is one of the sailor's notes: Markdown, outside Obsidian's
 * own folders (.obsidian, .trash, anything hidden) and outside Ship's folder.
 */
export function isVaultNotePath(path: string, shipFolder = SHIP_FOLDER): boolean {
  const parts = path.split("/");
  if (parts.some((p) => p.startsWith(".") || p === "node_modules")) return false;
  if (parts[0] === shipFolder) return false;
  return /\.md$/i.test(path);
}

export const noteIdForPath = (path: string) => `obsidian:${path}`;
export const pathForNoteId = (id: string) => (id.startsWith("obsidian:") ? id.slice("obsidian:".length) : null);

const basename = (path: string) => path.split("/").pop()!.replace(/\.md$/i, "");

/** Long notes are split at their headings, so a page range can pick a part of them; short ones stay whole. */
export function splitMarkdownPages(body: string, longerThan = 4000): { id: string; text: string }[] {
  const text = body.trim();
  if (text.length <= longerThan) return [{ id: "1", text }];
  const pages: string[] = [];
  let current: string[] = [];
  let inFence = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence && /^#{1,2}\s/.test(line) && current.join("\n").trim()) {
      pages.push(current.join("\n").trim());
      current = [];
    }
    current.push(line);
  }
  if (current.join("\n").trim()) pages.push(current.join("\n").trim());
  return pages.map((t, i) => ({ id: String(i + 1), text: t }));
}

const stringProp = (v: PropertyValue | undefined) => (typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined);

/** A vault file as a Ship note. Its pages hold the Markdown without the properties block, which the reader shows separately. */
export function noteFromMarkdown(path: string, text: string, modified: number | null): NoteDocument {
  const { properties, body } = parseFrontmatter(text);
  const created = Date.parse(stringProp(properties.created) ?? "");
  const url = stringProp(properties.source) ?? stringProp(properties.url);
  return {
    id: noteIdForPath(path),
    source: "obsidian",
    title: stringProp(properties.title) || basename(path),
    subject: path.includes("/") ? path.split("/").slice(0, -1).join("/") : null,
    created: Number.isFinite(created) ? created : null,
    modified,
    pages: splitMarkdownPages(body),
    ...(url && /^https?:\/\//.test(url) ? { url } : {}),
    ...(Object.keys(properties).length ? { properties } : {}),
  };
}

export interface WikiLink {
  target: string;
  heading: string | null;
  alias: string | null;
  embed: boolean;
}

/** Every `[[link]]` and `![[embed]]` in a note, outside code. */
export function wikilinks(markdown: string): WikiLink[] {
  const out: WikiLink[] = [];
  const noCode = markdown.replace(/```[\s\S]*?```|`[^`\n]*`/g, "");
  for (const m of noCode.matchAll(/(!?)\[\[([^\]\n|#]*)(?:#([^\]\n|]*))?(?:\|([^\]\n]*))?\]\]/g)) {
    const target = m[2]!.trim();
    if (!target && !m[3]) continue;
    out.push({ target, heading: m[3]?.trim() || null, alias: m[4]?.trim() || null, embed: m[1] === "!" });
  }
  return out;
}

/** Tags written in the text (`#biology`, `#unit/2`) and in the tags property, without the #. */
export function noteTags(markdown: string): string[] {
  const { properties, body } = parseFrontmatter(markdown);
  const tags = new Set<string>();
  const prop = properties.tags ?? properties.tag;
  for (const t of Array.isArray(prop) ? prop : typeof prop === "string" ? prop.split(/[,\s]+/) : []) if (t) tags.add(t.replace(/^#/, ""));
  const noCode = body.replace(/```[\s\S]*?```|`[^`\n]*`/g, "");
  for (const m of noCode.matchAll(/(?:^|[\s(])#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)/gu)) if (!/^\d+$/.test(m[1]!)) tags.add(m[1]!);
  return [...tags];
}

/** Matches a link target to a note title the way Obsidian does: case doesn't matter, and a folder path may be given. */
export function resolveWikilink<T extends { id: string; title: string }>(target: string, notes: readonly T[]): T | null {
  const want = target.replace(/\.md$/i, "").toLowerCase();
  const name = want.split("/").pop()!;
  return (
    notes.find((n) => (pathForNoteId(n.id) ?? "").replace(/\.md$/i, "").toLowerCase() === want) ??
    notes.find((n) => n.title.toLowerCase() === name) ??
    notes.find((n) => basename(pathForNoteId(n.id) ?? "").toLowerCase() === name) ??
    null
  );
}

// ---- Flashcards in notes (Obsidian's Spaced Repetition plugin format) ----------------------------

export interface InlineCard {
  front: string;
  back: string;
  /** `:::` makes a card that's also asked the other way round. */
  reversed: boolean;
}

/** `Question::Answer` lines (and `Question:::Answer` for both ways), outside code, as the Spaced Repetition plugin writes them. */
export function inlineCards(markdown: string): InlineCard[] {
  const cards: InlineCard[] = [];
  let inFence = false;
  for (const raw of parseFrontmatter(markdown).body.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const line = raw.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").replace(/<!--SR:.*?-->/, "").trim();
    const m = /^(.+?)\s*(:::|::)\s*(.+)$/.exec(line);
    // A bare link ("https://…::x") or inline code isn't a question.
    if (!m || /^[a-z][\w+.-]*:\/\//i.test(m[1]!) || m[1]!.includes("`")) continue;
    cards.push({ front: m[1]!.trim(), back: m[3]!.trim(), reversed: m[2] === ":::" });
  }
  return cards;
}

const hash = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(36);
};

/**
 * The deck and cards a vault note's `::` lines make. Ids come from the note's
 * path and the question, so syncing again finds the same cards.
 */
export function cardsForVaultNote(path: string, markdown: string, now: number): { deck: Deck; cards: Omit<Flashcard, "schedule">[] } | null {
  const found = inlineCards(markdown);
  if (!found.length) return null;
  const deckId = `obsidian:${path}`;
  const deck: Deck = { id: deckId, name: basename(path), subject: null, created: now, source: "obsidian" };
  const cards: Omit<Flashcard, "schedule">[] = [];
  for (const c of found) {
    cards.push({ id: `${deckId}#${hash(c.front)}`, deckId, front: c.front, back: c.back, created: now });
    if (c.reversed) cards.push({ id: `${deckId}#r${hash(c.back)}`, deckId, front: c.back, back: c.front, created: now });
  }
  return { deck, cards };
}

/** A deck as a vault note the Spaced Repetition plugin can read: one `question::answer` per line. */
export function deckToMarkdown(deck: Pick<Deck, "name">, cards: readonly Pick<Flashcard, "front" | "back">[]): string {
  const oneLine = (s: string) => s.replace(/\s*\r?\n\s*/g, " ").replace(/::/g, ": :");
  return `${writeFrontmatter({ tags: ["flashcards"], deck: deck.name })}# ${deck.name}\n\n${cards.map((c) => `${oneLine(c.front)}::${oneLine(c.back)}`).join("\n")}\n`;
}

/** A title made safe as a file name everywhere Obsidian runs (no \ / : * ? " < > | # ^ [ ]). */
export function safeFileName(title: string, fallback = "Untitled"): string {
  const clean = title
    .replace(/[\\/:*?"<>|#^[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 120)
    .trim();
  return clean || fallback;
}

// ---- Clippings (the Obsidian Web Clipper format) ------------------------------------------------

export interface ClipInput {
  title: string;
  url: string;
  /** The page as Markdown. */
  content: string;
  author?: string | null;
  published?: string | null;
  description?: string | null;
  siteName?: string | null;
  tags?: readonly string[];
  /** When it was clipped (ms). */
  created: number;
}

const isoDay = (ms: number) => new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

/**
 * A clipping as Obsidian Web Clipper's default template writes it: title,
 * source, author, published, created, description and tags as properties, then
 * the page. Notes clipped by either tool look the same in a vault.
 */
export function clipToMarkdown(clip: ClipInput): string {
  const published = clip.published && !Number.isNaN(Date.parse(clip.published)) ? isoDay(Date.parse(clip.published)) : null;
  const properties = writeFrontmatter({
    title: clip.title,
    source: clip.url,
    author: clip.author ? [clip.author] : null,
    published,
    created: isoDay(clip.created),
    description: clip.description?.replace(/\s+/g, " ").trim() || null,
    tags: [...new Set(["clippings", ...(clip.tags ?? [])].map((t) => t.replace(/^#/, "").trim()).filter(Boolean))],
  });
  return `${properties}${clip.content.trim()}\n`;
}
