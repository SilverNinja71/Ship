// The Note Nook: every note in Ship (uploads, clippings and an Obsidian vault)
// read the way Obsidian shows Markdown, with [[links]] to follow, #tags to
// filter by and "Linked from" backlinks. The vault card at the top opens,
// syncs and closes the sailor's vault.

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, MouseEvent } from "react";
import type { NoteDocument } from "@ship/shared-types";
import { noteTags, pathForNoteId, wikilinks, writeFrontmatter } from "@ship/integrations";
import { headingSlug, renderMarkdown } from "../../lib/markdown.js";
import { canOpenVault } from "../../lib/obsidianVault.js";
import { useFleet } from "../../stores/fleetStore.js";
import { useRecall } from "../../stores/recallStore.js";
import { useUi } from "../../stores/uiStore.js";
import { obsidianOpenUrl, useVault } from "../../stores/vaultStore.js";
import type { VaultOptions } from "../../lib/obsidianVault.js";
import { IconNotebook, IconRefresh } from "../icons.js";
import { PastelMinionBadge } from "../PastelMinionBadge.js";
import { Button, Panel, TextInput, Toggle, cx } from "../ui.js";

const SOURCE_LABEL: Partial<Record<NoteDocument["source"], string>> = {
  obsidian: "vault",
  clip: "clip",
  file: "upload",
  "google-drive": "Drive",
  parchment: "Parchment",
};

const SOURCE_TINT: Partial<Record<NoteDocument["source"], string>> = {
  obsidian: "bg-[oklch(0.93_0.045_300)] text-[oklch(0.38_0.07_300)]",
  clip: "bg-[oklch(0.94_0.05_20)] text-[oklch(0.42_0.08_20)]",
  file: "bg-[oklch(0.94_0.045_168)] text-[oklch(0.38_0.06_168)]",
};

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const textOf = (note: NoteDocument) => note.pages.map((p) => p.text).join("\n\n");

interface Indexed {
  note: NoteDocument;
  tags: string[];
  haystack: string;
}

/** Tags, search text and links for every note, worked out once per change to the notes. */
function useNoteIndex(notes: readonly NoteDocument[]) {
  return useMemo(() => {
    const byPath = new Map<string, NoteDocument>();
    const byName = new Map<string, NoteDocument>();
    for (const note of notes) {
      const path = pathForNoteId(note.id);
      if (path) byPath.set(path.replace(/\.md$/i, "").toLowerCase(), note);
      if (path) byName.set(path.split("/").pop()!.replace(/\.md$/i, "").toLowerCase(), note);
    }
    for (const note of notes) if (!byName.has(note.title.toLowerCase())) byName.set(note.title.toLowerCase(), note);
    /** Obsidian's rule: a full path wins, then the shortest name that matches. */
    const resolve = (target: string): NoteDocument | null => {
      const want = target.replace(/\.md$/i, "").toLowerCase();
      return byPath.get(want) ?? byName.get(want.split("/").pop()!) ?? null;
    };

    const items: Indexed[] = [];
    const backlinks = new Map<string, Set<string>>();
    const tagCounts = new Map<string, number>();
    for (const note of notes) {
      const text = textOf(note);
      const tags = noteTags((note.properties ? writeFrontmatter(note.properties) : "") + text);
      for (const t of tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
      items.push({ note, tags, haystack: `${note.title}\n${note.subject ?? ""}\n${text}`.toLowerCase() });
      for (const link of wikilinks(text)) {
        const target = link.target ? resolve(link.target) : null;
        if (!target || target.id === note.id) continue;
        if (!backlinks.has(target.id)) backlinks.set(target.id, new Set());
        backlinks.get(target.id)!.add(note.id);
      }
    }
    const topTags = [...tagCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 14).map(([t]) => t);
    return { items, resolve, backlinks, topTags };
  }, [notes]);
}

export function NoteNookPanel({ onClose }: { onClose: () => void }) {
  const notes = useFleet((s) => s.notes);
  const index = useNoteIndex(notes);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [heading, setHeading] = useState<string | null>(null);

  const selected = notes.find((n) => n.id === selectedId) ?? null;
  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return index.items.filter((i) => (!tag || i.tags.some((t) => t === tag || t.startsWith(`${tag}/`))) && words.every((w) => i.haystack.includes(w)));
  }, [index, query, tag]);

  const open = (id: string, h: string | null = null) => {
    setSelectedId(id);
    setHeading(h);
  };

  return (
    <Panel title="Note Nook" subtitle="Your notes, clippings and Obsidian vault" icon={<IconNotebook />} onClose={onClose} wide>
      <div className="grid gap-5 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <aside className={cx("min-w-0 space-y-3", selected && "hidden sm:block")}>
          <VaultCard />
          <TextInput type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notes" aria-label="Search notes" />
          {index.topTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label="Filter by tag">
              {index.topTags.map((t) => (
                <TagChip key={t} tag={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)} />
              ))}
              {tag && !index.topTags.includes(tag) && <TagChip tag={tag} active onClick={() => setTag(null)} />}
            </div>
          )}
          <NoteList items={shown} total={notes.length} selectedId={selectedId} onOpen={(id) => open(id)} />
        </aside>

        <section className={cx("min-w-0", !selected && "hidden sm:block")}>
          {selected ? (
            <Reader
              key={selected.id}
              note={selected}
              heading={heading}
              backlinks={[...(index.backlinks.get(selected.id) ?? [])].map((id) => notes.find((n) => n.id === id)).filter((n): n is NoteDocument => !!n)}
              resolve={index.resolve}
              onOpen={open}
              onTag={(t) => {
                setTag(t);
                setSelectedId(null);
              }}
              onBack={() => setSelectedId(null)}
            />
          ) : (
            <Welcome hasNotes={notes.length > 0} />
          )}
        </section>
      </div>
    </Panel>
  );
}

function TagChip({ tag, active, onClick }: { tag: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "rounded-full border px-2 py-0.5 text-xs transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]",
        active ? "border-transparent bg-[oklch(0.86_0.07_300)] text-[oklch(0.3_0.06_300)]" : "border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--muted-ink)] hover:text-[var(--page-ink)]",
      )}
    >
      #{tag}
      {active && <span aria-hidden="true"> ×</span>}
    </button>
  );
}

function NoteList({ items, total, selectedId, onOpen }: { items: Indexed[]; total: number; selectedId: string | null; onOpen: (id: string) => void }) {
  if (total === 0) return null;
  if (items.length === 0) return <p className="text-sm text-[var(--muted-ink)]">No notes match.</p>;
  return (
    <ul className="max-h-[52dvh] space-y-0.5 overflow-y-auto pr-1 sm:max-h-[56dvh]" aria-label="Notes">
      {items.map(({ note }) => (
        <li key={note.id}>
          <button
            type="button"
            onClick={() => onOpen(note.id)}
            aria-current={note.id === selectedId}
            className={cx(
              "flex w-full items-start gap-2 rounded-xl px-2 py-1.5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--page-ink)]",
              note.id === selectedId ? "bg-[var(--surface-3)]" : "hover:bg-[var(--surface-2)]",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] leading-snug">{note.title}</span>
              {note.subject && <span className="block truncate text-xs text-[var(--muted-ink)]">{note.subject}</span>}
            </span>
            <span className={cx("mt-0.5 shrink-0 rounded-full px-1.5 text-[11px]", SOURCE_TINT[note.source] ?? "bg-[var(--surface-3)] text-[var(--muted-ink)]")}>{SOURCE_LABEL[note.source] ?? note.source}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Welcome({ hasNotes }: { hasNotes: boolean }) {
  return (
    <div className="grid place-items-center gap-3 rounded-3xl border border-dashed border-[var(--border-subtle)] px-6 py-12 text-center">
      <PastelMinionBadge costume="pwedo" size={72} />
      <p className="text-lg">{hasNotes ? "Pick a note to read" : "Your notes will nest here"}</p>
      <p className="max-w-sm text-sm text-[var(--muted-ink)]">
        {hasNotes
          ? "Links in [[double brackets]] jump to other notes, and #tags filter the list."
          : "Open your Obsidian vault, clip a page with the Lookout, or upload a file in Study Sheets."}
      </p>
    </div>
  );
}

function Reader({
  note,
  heading,
  backlinks,
  resolve,
  onOpen,
  onTag,
  onBack,
}: {
  note: NoteDocument;
  heading: string | null;
  backlinks: NoteDocument[];
  resolve: (target: string) => NoteDocument | null;
  onOpen: (id: string, heading?: string | null) => void;
  onTag: (tag: string) => void;
  onBack: () => void;
}) {
  const vault = useVault((s) => (s.mode === "folder" ? s.name : null));
  const toast = useUi((s) => s.toast);
  const articleRef = useRef<HTMLDivElement>(null);
  const rendered = useMemo(() => renderMarkdown(textOf(note)), [note]);
  const path = pathForNoteId(note.id);
  const cardCount = useRecall((s) => (path ? s.cards.filter((c) => c.deckId === `obsidian:${path}`).length : 0));
  // A note that opens with "# Its title" shouldn't show the title twice.
  const firstHeading = /^<h1[^>]*>([^<]*)<\/h1>/.exec(rendered.html)?.[1]?.trim();
  const titleRepeats = firstHeading !== undefined && firstHeading === escapeHtml(note.title.trim());
  const properties = Object.entries(note.properties ?? {}).filter(([k]) => !["title", "tags", "tag", "cssclasses"].includes(k));

  useEffect(() => {
    if (!heading) return void articleRef.current?.closest(".overflow-y-auto")?.scrollTo({ top: 0 });
    articleRef.current?.querySelector(`[id="${CSS.escape(headingSlug(heading))}"]`)?.scrollIntoView({ block: "start" });
  }, [heading]);

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a.md-wikilink, a.md-tag");
    if (!a) return;
    e.preventDefault();
    if (a.dataset.tag) return onTag(a.dataset.tag);
    const target = a.dataset.wikilink ?? "";
    const found = target ? resolve(target) : note;
    if (found) onOpen(found.id, a.dataset.heading ?? null);
    else toast(`There's no note called "${target}" yet.`);
  };

  return (
    <article className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button size="sm" className="-ml-1.5 sm:hidden" onClick={onBack}>
          ← All notes
        </Button>
        <h3 className={cx("w-full font-display text-2xl leading-tight", titleRepeats && "sr-only")}>{note.title}</h3>
        <p className="text-xs text-[var(--muted-ink)]">
          {[SOURCE_LABEL[note.source] ?? note.source, path ?? note.subject, note.modified ? `edited ${new Date(note.modified).toLocaleDateString()}` : null].filter(Boolean).join(" · ")}
        </p>
        <div className="flex flex-wrap gap-x-1">
          <Button size="sm" variant="seafoam" onClick={() => useUi.getState().blurtNote(note.id)}>
            Blurt this
          </Button>
          {cardCount > 0 && (
            <Button size="sm" onClick={() => useUi.getState().openPanel("flashcards")}>
              {cardCount} flashcard{cardCount === 1 ? "" : "s"}
            </Button>
          )}
          {vault && path && (
            <a href={obsidianOpenUrl(vault, path)} className="px-1.5 py-0.5 text-sm text-[oklch(0.45_0.1_300)] underline-offset-4 hover:underline">
              Open in Obsidian
            </a>
          )}
          {note.url && (
            <a href={note.url} target="_blank" rel="noopener noreferrer" className="px-1.5 py-0.5 text-sm underline-offset-4 hover:underline">
              Original page
            </a>
          )}
          <Button
            size="sm"
            onClick={() =>
              navigator.clipboard
                ?.writeText((note.properties ? writeFrontmatter(note.properties) : "") + textOf(note))
                .then(() => toast("Copied as Markdown."))
                .catch(() => toast("The browser wouldn't copy it.", "warning"))
            }
          >
            Copy Markdown
          </Button>
        </div>
      </div>

      {properties.length > 0 && (
        <dl className="mb-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-2 text-sm">
          {properties.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-[var(--muted-ink)]">{k}</dt>
              <dd className="min-w-0 break-words">{Array.isArray(v) ? v.join(", ") : v}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* renderMarkdown escapes any HTML in the note, so this is safe to insert. */}
      <div ref={articleRef} className="md-note" onClick={onClick} dangerouslySetInnerHTML={{ __html: rendered.html }} />

      {backlinks.length > 0 && (
        <footer className="mt-6 border-t border-dashed border-[var(--border-subtle)] pt-3">
          <p className="mb-1 text-sm text-[var(--muted-ink)]">Linked from</p>
          <ul className="flex flex-wrap gap-1.5">
            {backlinks.map((b) => (
              <li key={b.id}>
                <button type="button" onClick={() => onOpen(b.id)} className="rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 text-sm hover:bg-[var(--surface-3)]">
                  ↩ {b.title}
                </button>
              </li>
            ))}
          </ul>
        </footer>
      )}
    </article>
  );
}

const OPTION_TEXT: Record<keyof VaultOptions, { label: string; hint: string }> = {
  clippings: { label: "Clippings", hint: "Lookout clips go to Clippings/, like Obsidian's Web Clipper." },
  planner: { label: "Banana Planna", hint: "Kept up to date in Ship/Planner.md." },
  kanban: { label: "Kanban board", hint: "Ship/Kanban.md, which Obsidian's Kanban plugin opens as a board." },
  decks: { label: "Flashcard decks", hint: "Written to Ship/Flashcards/ as question::answer lines." },
  notes: { label: "Uploaded notes", hint: "PDF, Word and PowerPoint notes copied to Ship/Notes/." },
};

function ago(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString();
}

function VaultCard() {
  const v = useVault();
  const [showOptions, setShowOptions] = useState(false);
  const folderRef = useRef<HTMLInputElement>(null);
  const onFolder = (e: ChangeEvent<HTMLInputElement>) => {
    void v.importFolder([...(e.target.files ?? [])]);
    e.target.value = "";
  };
  const folderInput = (
    // webkitdirectory picks a whole folder; React doesn't know the attribute, so it's passed as a string.
    <input ref={folderRef} type="file" className="hidden" onChange={onFolder} {...{ webkitdirectory: "", directory: "" }} multiple />
  );

  return (
    <div className="rounded-2xl border border-[oklch(0.85_0.05_300)] bg-[oklch(0.97_0.018_300)] p-3 text-sm text-[oklch(0.33_0.04_300)] [[data-visual-style=storybook]_&]:border-[var(--border-subtle)] [[data-visual-style=storybook]_&]:bg-[var(--surface-2)] [[data-visual-style=storybook]_&]:text-[var(--page-ink)]">
      {folderInput}
      <p className="mb-1 flex items-center gap-1.5 font-display text-base">
        <span aria-hidden="true">◆</span> Obsidian vault
      </p>

      {v.mode === null && (
        <>
          <p className="mb-2 text-xs leading-snug opacity-80">
            {canOpenVault()
              ? "Read your vault's notes here, and keep clippings, Banana Planna and decks in it. Ship never changes your own notes."
              : "This browser can't keep a folder open (Chrome, Edge and Opera can), so Ship reads a copy of your vault instead."}
          </p>
          {canOpenVault() ? (
            <Button variant="primary" className="-ml-2 font-semibold" onClick={() => void v.connect()}>
              Open my vault…
            </Button>
          ) : (
            <Button variant="primary" className="-ml-2 font-semibold" onClick={() => folderRef.current?.click()}>
              Read a vault folder…
            </Button>
          )}
        </>
      )}

      {v.mode === "folder" && (
        <>
          <p className="truncate">
            <strong className="font-semibold">{v.name}</strong>
            {v.permission === "granted" && <span className="opacity-75"> · {v.busy ? "syncing…" : v.lastSyncAt ? `synced ${ago(v.lastSyncAt)}` : "ready"}</span>}
          </p>
          {v.permission === "granted" ? (
            <>
              {v.lastSummary && (
                <p className="text-xs opacity-75">
                  Last sync: {v.lastSummary.notes} note{v.lastSummary.notes === 1 ? "" : "s"} read, {v.lastSummary.written} file{v.lastSummary.written === 1 ? "" : "s"} written.
                </p>
              )}
              <div className="-ml-2 mt-1 flex flex-wrap gap-x-1">
                <Button size="sm" onClick={() => void v.sync()} disabled={v.busy}>
                  <IconRefresh size={13} /> Sync now
                </Button>
                <Button size="sm" onClick={() => setShowOptions(!showOptions)} aria-expanded={showOptions}>
                  What Ship writes
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="mb-1 text-xs opacity-80">The browser asks again after it restarts. One click and Ship carries on.</p>
              <Button variant="primary" className="-ml-2 font-semibold" onClick={() => void v.reconnect()}>
                Reconnect
              </Button>
            </>
          )}
        </>
      )}

      {v.mode === "imported" && (
        <>
          <p className="truncate">
            <strong className="font-semibold">{v.name}</strong> <span className="opacity-75">· read {v.lastSyncAt ? ago(v.lastSyncAt) : ""}</span>
          </p>
          <p className="text-xs opacity-75">A copy: read it again to pick up changes.</p>
          <Button size="sm" className="-ml-2" onClick={() => folderRef.current?.click()} disabled={v.busy}>
            Read again…
          </Button>
        </>
      )}

      {showOptions && v.mode === "folder" && (
        <div className="mt-2 space-y-1 border-t border-dashed border-current/20 pt-2">
          {(Object.keys(OPTION_TEXT) as (keyof VaultOptions)[]).map((k) => (
            <Toggle key={k} checked={v.options[k]} onChange={(on) => v.setOption(k, on)} label={OPTION_TEXT[k].label} hint={OPTION_TEXT[k].hint} />
          ))}
          <p className="pt-1 text-xs opacity-75">
            Notes with <code>question::answer</code> lines become flashcards. Ship's folder in the vault is Ship's: edits there are written over.
          </p>
        </div>
      )}

      {v.error && <p className="mt-1 text-xs text-[#8A3B31]">{v.error}</p>}
      {v.lastSummary && v.lastSummary.errors.length > 0 && <p className="mt-1 text-xs text-[#8A3B31]">{v.lastSummary.errors[0]}</p>}

      {v.mode !== null && (
        <Button size="sm" variant="danger" className="-ml-2 mt-1" onClick={() => void v.disconnect()}>
          {v.mode === "folder" ? "Close vault" : "Forget it"}
        </Button>
      )}
    </div>
  );
}
