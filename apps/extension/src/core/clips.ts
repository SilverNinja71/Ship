// Clips from the Web Clipper, waiting in the Lookout until Ship collects them.
// The page that makes a clip is any website, so everything is checked and capped.

import type { LookoutClip } from "@ship/shared-types";

/** Clips kept waiting at most; the oldest go first. */
export const MAX_CLIPS = 30;
/** About 400 kB of Markdown: a long article, not a whole site. */
export const MAX_CLIP_CHARS = 400_000;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A well-formed clip, trimmed to size, or null. Only http(s) pages can be clipped. */
export function sanitizeClip(raw: unknown): LookoutClip | null {
  if (!isRecord(raw)) return null;
  const { id, title, url, markdown, at } = raw;
  if (typeof id !== "string" || !id || id.length > 100) return null;
  if (typeof url !== "string" || !/^https?:\/\//i.test(url) || url.length > 4000) return null;
  if (typeof markdown !== "string" || !markdown.trim()) return null;
  if (typeof at !== "number" || !Number.isFinite(at)) return null;
  const name = typeof title === "string" ? title.replace(/\s+/g, " ").trim().slice(0, 300) : "";
  return { id, title: name || url, url, markdown: markdown.slice(0, MAX_CLIP_CHARS), at };
}

/** Adds a clip (replacing one with the same id), keeping the newest MAX_CLIPS. */
export function enqueueClip(list: readonly LookoutClip[], clip: LookoutClip): LookoutClip[] {
  return [...list.filter((c) => c.id !== clip.id), clip].slice(-MAX_CLIPS);
}

export function ackClips(list: readonly LookoutClip[], ids: readonly string[]): LookoutClip[] {
  const done = new Set(ids);
  return list.filter((c) => !done.has(c.id));
}

/**
 * An obsidian:// link that makes a note from the clipboard, as Obsidian's own Web Clipper does:
 * the Markdown is copied first, because a long note doesn't fit in a link.
 */
export function obsidianNewNoteUrl(fileName: string, folder: string, vault: string): string {
  const path = [folder.trim().replace(/^\/+|\/+$/g, ""), fileName].filter(Boolean).join("/");
  const params = [`file=${encodeURIComponent(path)}`, "clipboard"];
  if (vault.trim()) params.unshift(`vault=${encodeURIComponent(vault.trim())}`);
  return `obsidian://new?${params.join("&")}`;
}
