// The sailor's Obsidian vault: which folder is open, what Ship writes into it,
// and the last sync. All of it stays on this device (not in SYNCED_FIELDS):
// a folder on one computer means nothing on another. The folder handle itself
// lives in IndexedDB (lib/obsidianVault.ts), since localStorage can't hold it.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { buildObsidianMarkdown } from "../lib/plannerExport.js";
import { storageKey, shipStorage } from "../lib/storage.js";
import {
  DEFAULT_VAULT_OPTIONS,
  emptyManifest,
  forgetVaultHandle,
  importVaultFiles,
  loadVaultHandle,
  pickVault,
  saveVaultHandle,
  syncVault,
  vaultPermission,
} from "../lib/obsidianVault.js";
import type { VaultDirHandle, VaultManifest, VaultOptions, VaultOutbox } from "../lib/obsidianVault.js";
import { notesLoaded, useFleet } from "./fleetStore.js";
import { useRecall } from "./recallStore.js";

export interface VaultSummary {
  read: number;
  written: number;
  notes: number;
  cards: number;
  errors: string[];
}

export interface VaultState {
  /** The vault folder's name, as Obsidian shows it (also the name `obsidian://` links need). */
  name: string | null;
  /** "folder": opened with read and write access; "imported": a one-time, read-only copy. */
  mode: "folder" | "imported" | null;
  options: VaultOptions;
  manifest: VaultManifest;
  lastSyncAt: number | null;
  lastSummary: VaultSummary | null;
  /** This visit only: whether the browser still lets Ship use the folder. */
  permission: PermissionState | null;
  busy: boolean;
  error: string | null;
  /** Opens the folder picker (call from a click), then syncs. */
  connect(): Promise<void>;
  /** Asks the browser for access again (call from a click), then syncs. */
  reconnect(): Promise<void>;
  /** Syncs if the folder is open and allowed; never asks for permission. */
  sync(): Promise<void>;
  /** Reads a folder picked with <input webkitdirectory>, for browsers that can't open one. */
  importFolder(files: readonly File[]): Promise<void>;
  setOption<K extends keyof VaultOptions>(key: K, value: VaultOptions[K]): void;
  /** Forgets the folder and the notes read from it. Flashcards and their progress stay. */
  disconnect(): Promise<void>;
}

let handle: VaultDirHandle | null = null;
let again = false;

/** What Ship wants in the vault right now. */
function outbox(): VaultOutbox {
  const notes = useFleet.getState().notes;
  const { decks, cards } = useRecall.getState();
  return {
    clips: notes.filter((n) => n.source === "clip"),
    planner: buildObsidianMarkdown(),
    // Decks read from the vault are already there.
    decks: decks.filter((d) => d.source !== "obsidian").map((deck) => ({ deck, cards: cards.filter((c) => c.deckId === deck.id) })),
    notes: notes.filter((n) => n.source === "file"),
  };
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const useVault = create<VaultState>()(
  persist(
    (set, get) => {
      const open = async (h: VaultDirHandle) => {
        const fresh = get().name !== h.name || get().mode !== "folder";
        handle = h;
        await saveVaultHandle(h).catch((e: unknown) => console.warn("Ship couldn't remember the vault folder.", e));
        // A different folder starts from scratch: its notes replace the old folder's.
        if (fresh) {
          dropVaultNotes();
          set({ manifest: emptyManifest(), lastSummary: null });
        }
        set({ name: h.name, mode: "folder", permission: "granted", error: null });
        await get().sync();
      };

      return {
        name: null,
        mode: null,
        options: DEFAULT_VAULT_OPTIONS,
        manifest: emptyManifest(),
        lastSyncAt: null,
        lastSummary: null,
        permission: null,
        busy: false,
        error: null,

        connect: async () => {
          try {
            await open(await pickVault());
          } catch (e) {
            // Closing the picker isn't a problem.
            if ((e as { name?: string })?.name !== "AbortError") set({ error: `Ship couldn't open that folder: ${message(e)}` });
          }
        },

        reconnect: async () => {
          try {
            handle ??= await loadVaultHandle();
            if (!handle) return void set({ permission: null, error: "Ship lost track of the folder. Open your vault again." });
            const permission = await vaultPermission(handle, true);
            set({ permission, error: permission === "granted" ? null : "The browser didn't allow Ship to use the folder." });
            if (permission === "granted") await get().sync();
          } catch (e) {
            set({ error: message(e) });
          }
        },

        sync: async () => {
          if (get().mode !== "folder") return;
          if (get().busy) {
            again = true;
            return;
          }
          set({ busy: true });
          try {
            handle ??= await loadVaultHandle();
            if (!handle) return void set({ permission: null });
            const permission = await vaultPermission(handle, false);
            set({ permission });
            if (permission !== "granted") return;
            await notesLoaded;
            // A vault note missing here (erased, or never saved) is read again.
            const have = new Set(useFleet.getState().notes.map((n) => n.id));
            const manifest = { ...get().manifest, files: Object.fromEntries(Object.entries(get().manifest.files).filter(([path]) => have.has(`obsidian:${path}`))) };
            const r = await syncVault(handle, manifest, outbox(), get().options);
            useFleet.getState().putNotes(r.upserts, r.removed);
            for (const id of r.clipsMoved) useFleet.getState().removeNote(id);
            useRecall.getState().syncVaultCards(r.cardSets, r.removedPaths);
            set({
              manifest: r.manifest,
              lastSyncAt: Date.now(),
              lastSummary: { read: r.read, written: r.written, notes: r.upserts.length, cards: r.cardSets.reduce((n, s) => n + s.cards.length, 0), errors: r.errors.slice(0, 5) },
              error: null,
            });
          } catch (e) {
            // A folder that was moved or deleted shows up here as NotFoundError.
            set({ error: (e as { name?: string })?.name === "NotFoundError" ? "The vault folder has moved or been deleted. Open it again." : `Sync stopped: ${message(e)}` });
          } finally {
            set({ busy: false });
            if (again) {
              again = false;
              void get().sync();
            }
          }
        },

        importFolder: async (files) => {
          if (!files.length) return;
          set({ busy: true, error: null });
          try {
            const { notes, cardSets } = await importVaultFiles(files);
            const name = files[0]!.webkitRelativePath.split("/")[0] || "Vault";
            handle = null;
            await forgetVaultHandle().catch(() => undefined);
            // A new import replaces the last one.
            const keep = new Set(notes.map((n) => n.id));
            const gone = useFleet.getState().notes.filter((n) => n.source === "obsidian" && !keep.has(n.id)).map((n) => n.id);
            useFleet.getState().putNotes(notes, gone);
            useRecall.getState().syncVaultCards(cardSets, gone.map((id) => id.replace(/^obsidian:/, "")));
            set({
              name,
              mode: "imported",
              manifest: emptyManifest(),
              permission: null,
              lastSyncAt: Date.now(),
              lastSummary: { read: notes.length, written: 0, notes: notes.length, cards: cardSets.reduce((n, s) => n + s.cards.length, 0), errors: [] },
            });
          } catch (e) {
            set({ error: `Ship couldn't read that folder: ${message(e)}` });
          } finally {
            set({ busy: false });
          }
        },

        setOption: (key, value) => {
          set({ options: { ...get().options, [key]: value } });
          void get().sync();
        },

        disconnect: async () => {
          handle = null;
          await forgetVaultHandle().catch(() => undefined);
          dropVaultNotes();
          set({ name: null, mode: null, manifest: emptyManifest(), lastSyncAt: null, lastSummary: null, permission: null, error: null });
        },
      };
    },
    {
      name: storageKey("vault"),
      storage: shipStorage,
      version: 1,
      partialize: ({ name, mode, options, manifest, lastSyncAt, lastSummary }) => ({ name, mode, options, manifest, lastSyncAt, lastSummary }),
      merge: (saved, current) => {
        const s = (saved ?? {}) as Partial<VaultState>;
        return { ...current, ...s, options: { ...DEFAULT_VAULT_OPTIONS, ...s.options }, manifest: s.manifest ?? emptyManifest() };
      },
    },
  ),
);

/** Removes the notes read from a vault. Their flashcards stay, so review progress isn't lost. */
function dropVaultNotes(): void {
  const ids = useFleet.getState().notes.filter((n) => n.source === "obsidian").map((n) => n.id);
  useFleet.getState().putNotes([], ids);
}

/** An `obsidian://open` link for a vault note, so the sailor can jump to it in Obsidian. */
export function obsidianOpenUrl(vault: string, path: string): string {
  return `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(path.replace(/\.md$/i, ""))}`;
}
