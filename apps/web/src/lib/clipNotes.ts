// Clips from the Lookout's Web Clipper become notes in the Note Nook. A clip
// is a whole Obsidian-style note (properties, then Markdown), so it's read the
// same way as a vault note, then kept as a "clip" until a vault takes it.

import type { LookoutClip, NoteDocument } from "@ship/shared-types";
import { CLIPPINGS_FOLDER, noteFromMarkdown, safeFileName } from "@ship/integrations";

const MAX_CHARS = 400_000;

/** A clip as a note, or null if it isn't a well-formed clip of a web page. */
export function noteFromClip(clip: unknown): NoteDocument | null {
  const c = clip as Partial<LookoutClip> | null;
  if (!c || typeof c.id !== "string" || !c.id || c.id.length > 100) return null;
  if (typeof c.url !== "string" || !/^https?:\/\//i.test(c.url) || typeof c.markdown !== "string" || !c.markdown.trim()) return null;
  const at = typeof c.at === "number" && Number.isFinite(c.at) ? c.at : Date.now();
  const title = typeof c.title === "string" && c.title.trim() ? c.title.trim().slice(0, 300) : c.url;
  const note = noteFromMarkdown(`${CLIPPINGS_FOLDER}/${safeFileName(title)}.md`, c.markdown.slice(0, MAX_CHARS), at);
  return { ...note, id: `clip:${c.id}`, source: "clip", title, subject: CLIPPINGS_FOLDER, url: note.url ?? c.url, created: note.created ?? at };
}
