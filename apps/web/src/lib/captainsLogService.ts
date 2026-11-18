// Domain helpers & ingestion service for Study Sheets (extracted from CaptainsLogPanel).

import type { NoteDocument } from "@ship/shared-types";

export const LONG_FILE_PAGES = 20;
export const FIRST_STRETCH = 10;

export const DEFAULT_TAG_SUGGESTIONS = [
  "#biology",
  "#math",
  "#history",
  "#english",
  "#unit1",
  "#unit2",
  "#chapter1",
  "#week1",
  "#student-council",
] as const;

export interface NoteSource {
  id: string;
  title: string;
  pages: { label: string; text: string }[];
}

export function normalizeHashtag(raw: string): string | null {
  const cleaned = raw.trim().replace(/^#+/, "").replace(/\s+/g, "-");
  return cleaned ? `#${cleaned}` : null;
}

export function mergeHashtags(existing: readonly string[], rawInput: string): string[] {
  const parts = rawInput
    .split(/[\s,]+/)
    .map(normalizeHashtag)
    .filter((x): x is string => Boolean(x));
  if (parts.length === 0) return [...existing];
  return Array.from(new Set([...existing, ...parts]));
}

export function suggestHashtags(
  blurts: readonly { hashtags?: readonly string[] }[],
  selected: readonly string[],
  draft: string,
  limit = 6,
): string[] {
  const known = Array.from(new Set([...blurts.flatMap((b) => b.hashtags ?? []), ...DEFAULT_TAG_SUGGESTIONS]));
  const query = draft.trim().replace(/^#+/, "").toLowerCase();
  return known
    .filter((t) => !selected.includes(t) && (!query || t.toLowerCase().includes(query)))
    .slice(0, limit);
}

export function buildNoteSources(
  imported: readonly NoteDocument[],
  library: readonly { id: string; title: string; text?: string | null }[],
): NoteSource[] {
  return [
    ...imported.map((n) => ({
      id: n.id,
      title: n.title,
      pages: n.pages.map((p, i) => ({
        label: /^\d+$/.test(p.id) ? p.id : `${i + 1}`,
        text: p.text,
      })),
    })),
    ...library
      .filter((l) => Boolean(l.text))
      .map((l) => ({
        id: l.id,
        title: l.title,
        pages: [{ label: "1", text: l.text ?? "" }],
      })),
  ];
}
