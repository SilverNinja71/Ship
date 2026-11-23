// Syncing with an Obsidian vault: a folder on the sailor's computer, opened
// with the browser's File System Access API (Chrome and Edge on a computer).
//
// Each kind of thing has one home, so the two sides never fight over a file:
// - the sailor's own notes live in the vault: Ship reads them (and their
//   `question::answer` cards) and never changes them;
// - what Ship makes is written into the vault: clippings into Clippings/ (where
//   Obsidian Web Clipper puts them too, after which they are vault notes like
//   any other), and the planner, decks and uploaded notes into Ship/.

import type { Deck, Flashcard, NoteDocument } from "@ship/shared-types";
import {
  CLIPPINGS_FOLDER,
  SHIP_FOLDER,
  cardsForVaultNote,
  deckToMarkdown,
  isVaultNotePath,
  noteFromMarkdown,
  noteIdForPath,
  safeFileName,
  writeFrontmatter,
} from "@ship/integrations";

// The few File System Access calls Ship uses. Real handles fit these shapes; tests use an in-memory folder.
export interface VaultWritable {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}
export interface VaultFileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<{ text(): Promise<string>; lastModified: number; size: number }>;
  createWritable(): Promise<VaultWritable>;
}
export interface VaultDirHandle {
  kind: "directory";
  name: string;
  entries(): AsyncIterable<[string, VaultFileHandle | VaultDirHandle]>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<VaultDirHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<VaultFileHandle>;
  removeEntry(name: string): Promise<void>;
}

export interface VaultOptions {
  /** Move clips from the Lookout into Clippings/. */
  clippings: boolean;
  /** Keep Ship/Planner.md up to date with Banana Planna. */
  planner: boolean;
  /** Write each flashcard deck to Ship/Flashcards/ as question::answer lines. */
  decks: boolean;
  /** Copy uploaded notes (PDF, Word, PowerPoint, links) into Ship/Notes/. */
  notes: boolean;
}

export const DEFAULT_VAULT_OPTIONS: VaultOptions = { clippings: true, planner: true, decks: true, notes: false };

export interface VaultManifest {
  /** Vault note path -> its last-modified time when Ship last read it. */
  files: Record<string, number>;
  /** Path -> fingerprint of what Ship last wrote there. */
  written: Record<string, string>;
}

export const emptyManifest = (): VaultManifest => ({ files: {}, written: {} });

/** What Ship wants in the vault this time. */
export interface VaultOutbox {
  clips: NoteDocument[];
  planner: string | null;
  decks: { deck: Deck; cards: Pick<Flashcard, "front" | "back">[] }[];
  notes: NoteDocument[];
}

export interface VaultCardSet {
  path: string;
  deck: Deck;
  cards: Omit<Flashcard, "schedule">[];
}

export interface VaultSyncResult {
  /** Vault notes that are new or changed. */
  upserts: NoteDocument[];
  /** Ids of vault notes whose files are gone. */
  removed: string[];
  /** Card decks from notes that changed (empty `cards` when a note no longer has any). */
  cardSets: VaultCardSet[];
  /** Vault paths whose notes are gone, so their decks go too. */
  removedPaths: string[];
  /** Clip notes now saved in the vault, to drop from Ship (the vault copy replaces them). */
  clipsMoved: string[];
  manifest: VaultManifest;
  read: number;
  written: number;
  errors: string[];
}

/** Vault files bigger than this are skipped: no study note is this long, and reading one would stall the page. */
const MAX_FILE_BYTES = 2_000_000;

const fingerprint = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return `${s.length}:${h.toString(36)}`;
};

async function* walk(dir: VaultDirHandle, prefix = ""): AsyncGenerator<{ path: string; handle: VaultFileHandle }> {
  for await (const [name, entry] of dir.entries()) {
    if (name.startsWith(".")) continue;
    const path = prefix ? `${prefix}/${name}` : name;
    if (entry.kind === "directory") {
      if (!prefix && name === SHIP_FOLDER) continue;
      yield* walk(entry, path);
    } else yield { path, handle: entry };
  }
}

async function folder(root: VaultDirHandle, path: string[]): Promise<VaultDirHandle> {
  let dir = root;
  for (const part of path) dir = await dir.getDirectoryHandle(part, { create: true });
  return dir;
}

async function readText(root: VaultDirHandle, path: string): Promise<string | null> {
  try {
    const parts = path.split("/");
    let dir = root;
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
    return await (await (await dir.getFileHandle(parts.at(-1)!)).getFile()).text();
  } catch {
    return null;
  }
}

async function writeText(root: VaultDirHandle, path: string, text: string): Promise<void> {
  const parts = path.split("/");
  const dir = await folder(root, parts.slice(0, -1));
  const writable = await (await dir.getFileHandle(parts.at(-1)!, { create: true })).createWritable();
  await writable.write(text);
  await writable.close();
}

async function removeFile(root: VaultDirHandle, path: string): Promise<void> {
  try {
    const parts = path.split("/");
    let dir = root;
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
    await dir.removeEntry(parts.at(-1)!);
  } catch {
    // Already gone.
  }
}

const noteText = (note: NoteDocument) => note.pages.map((p) => p.text).join("\n\n");

/** A note as a Markdown file: its properties block (if it has one), then its text. */
export const noteMarkdown = (note: NoteDocument) => (note.properties ? writeFrontmatter(note.properties) : "") + noteText(note);

/** An uploaded note as a vault file: its source and dates as properties, then its text. */
export function uploadedNoteMarkdown(note: NoteDocument): string {
  const day = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : null);
  return `${writeFrontmatter({ title: note.title, source: note.url ?? null, created: day(note.created), tags: ["ship"] })}${noteText(note).trim()}\n`;
}

/** Pulls the vault's notes into Ship and writes Ship's things into the vault, as `options` allows. */
export async function syncVault(root: VaultDirHandle, manifest: VaultManifest, outbox: VaultOutbox, options: VaultOptions, now = Date.now()): Promise<VaultSyncResult> {
  const result: VaultSyncResult = { upserts: [], removed: [], cardSets: [], removedPaths: [], clipsMoved: [], manifest: { files: { ...manifest.files }, written: { ...manifest.written } }, read: 0, written: 0, errors: [] };

  // Writes skip files whose content is already there, so Obsidian doesn't see needless changes.
  const put = async (path: string, text: string, owned: boolean): Promise<boolean> => {
    const print = fingerprint(text);
    if (result.manifest.written[path] === print) return true;
    const existing = await readText(root, path);
    if (existing === text) {
      result.manifest.written[path] = print;
      return true;
    }
    // Clippings belong to the sailor once written: never overwrite one, even one Ship wrote.
    if (existing !== null && !owned) return false;
    await writeText(root, path, text);
    result.manifest.written[path] = print;
    result.written++;
    return true;
  };

  // 1. Ship -> vault.
  try {
    if (options.clippings) {
      for (const clip of outbox.clips) {
        const base = safeFileName(clip.title);
        let saved = false;
        for (let n = 1; n <= 20 && !saved; n++) saved = await put(`${CLIPPINGS_FOLDER}/${n === 1 ? base : `${base} ${n}`}.md`, noteMarkdown(clip), false);
        if (saved) result.clipsMoved.push(clip.id);
      }
    }
    if (options.planner && outbox.planner) await put(`${SHIP_FOLDER}/Planner.md`, outbox.planner, true);
    // Decks and notes: one file each (two with the same name get " 2"), and files for ones deleted in Ship go too.
    const mirror = async (dir: string, items: { name: string; text: string }[]) => {
      const wanted = new Set<string>();
      for (const item of items) {
        const base = `${SHIP_FOLDER}/${dir}/${safeFileName(item.name)}`;
        let path = `${base}.md`;
        for (let n = 2; wanted.has(path); n++) path = `${base} ${n}.md`;
        wanted.add(path);
        await put(path, item.text, true);
      }
      for (const path of Object.keys(result.manifest.written)) {
        if (!path.startsWith(`${SHIP_FOLDER}/${dir}/`) || wanted.has(path)) continue;
        const existing = await readText(root, path);
        // Left alone if the sailor changed it in Obsidian.
        if (existing === null || fingerprint(existing) === result.manifest.written[path]) await removeFile(root, path);
        delete result.manifest.written[path];
      }
    };
    if (options.decks) await mirror("Flashcards", outbox.decks.filter((d) => d.cards.length).map(({ deck, cards }) => ({ name: deck.name, text: deckToMarkdown(deck, cards) })));
    if (options.notes) await mirror("Notes", outbox.notes.map((note) => ({ name: note.title, text: uploadedNoteMarkdown(note) })));
  } catch (e) {
    result.errors.push(`Couldn't write to the vault: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2. Vault -> Ship.
  const seen = new Set<string>();
  for await (const { path, handle } of walk(root)) {
    if (!isVaultNotePath(path)) continue;
    seen.add(path);
    try {
      const file = await handle.getFile();
      if (file.size > MAX_FILE_BYTES || result.manifest.files[path] === file.lastModified) continue;
      const text = await file.text();
      result.upserts.push(noteFromMarkdown(path, text, file.lastModified));
      const cards = cardsForVaultNote(path, text, now);
      // A note read before may have lost its cards; an empty set clears them.
      if (cards || result.manifest.files[path] !== undefined) result.cardSets.push({ path, deck: cards?.deck ?? { id: `obsidian:${path}`, name: path, subject: null, created: now, source: "obsidian" }, cards: cards?.cards ?? [] });
      result.manifest.files[path] = file.lastModified;
      result.read++;
    } catch (e) {
      result.errors.push(`Couldn't read ${path}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  for (const path of Object.keys(result.manifest.files)) {
    if (seen.has(path)) continue;
    delete result.manifest.files[path];
    result.removed.push(noteIdForPath(path));
    result.removedPaths.push(path);
  }
  return result;
}

/** Read-only import of a vault folder picked with <input webkitdirectory>, for browsers without File System Access. */
export async function importVaultFiles(files: readonly File[]): Promise<{ notes: NoteDocument[]; cardSets: VaultCardSet[] }> {
  const notes: NoteDocument[] = [];
  const cardSets: VaultCardSet[] = [];
  const now = Date.now();
  for (const file of files) {
    // webkitRelativePath starts with the picked folder's own name.
    const path = (file.webkitRelativePath || file.name).split("/").slice(file.webkitRelativePath ? 1 : 0).join("/");
    if (!isVaultNotePath(path) || file.size > MAX_FILE_BYTES) continue;
    const text = await file.text();
    notes.push(noteFromMarkdown(path, text, file.lastModified));
    const cards = cardsForVaultNote(path, text, now);
    if (cards) cardSets.push({ path, ...cards });
  }
  return { notes, cardSets };
}

// ---- The folder handle, kept across visits ------------------------------------------------------

type PermissionMode = { mode: "readwrite" };
type PermissionedHandle = VaultDirHandle & {
  queryPermission?(o: PermissionMode): Promise<PermissionState>;
  requestPermission?(o: PermissionMode): Promise<PermissionState>;
};

export const canOpenVault = () => typeof window !== "undefined" && "showDirectoryPicker" in window;

/** Asks the sailor to pick their vault folder (call from a click). */
export async function pickVault(): Promise<VaultDirHandle> {
  const picker = (window as unknown as { showDirectoryPicker(o: { id?: string; mode: "readwrite" }): Promise<VaultDirHandle> }).showDirectoryPicker;
  return picker.call(window, { id: "ship-obsidian-vault", mode: "readwrite" });
}

/** "granted" lets Ship sync now; "prompt" needs a click on Reconnect first. */
export async function vaultPermission(handle: VaultDirHandle, ask: boolean): Promise<PermissionState> {
  const h = handle as PermissionedHandle;
  if (!h.queryPermission) return "granted";
  const state = await h.queryPermission({ mode: "readwrite" });
  if (state === "granted" || !ask || !h.requestPermission) return state;
  return h.requestPermission({ mode: "readwrite" });
}

const DB = "ship-vault";
const STORE = "handles";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("The browser wouldn't open its storage."));
  });
}

async function handleTx<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = work(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("The browser wouldn't use its storage."));
    });
  } finally {
    db.close();
  }
}

/** The vault's folder handle survives a reload in IndexedDB; the browser asks again before Ship may use it. */
export const saveVaultHandle = (handle: VaultDirHandle) => handleTx("readwrite", (s) => s.put(handle, "vault")).then(() => undefined);
export const loadVaultHandle = () => (typeof indexedDB === "undefined" ? Promise.resolve(null) : handleTx<VaultDirHandle | undefined>("readonly", (s) => s.get("vault")).then((h) => h ?? null));
export const forgetVaultHandle = () => (typeof indexedDB === "undefined" ? Promise.resolve() : handleTx("readwrite", (s) => s.delete("vault")).then(() => undefined));
