// The Fleet Log: connected services and what they brought in (deadlines,
// library files, notes). Tokens live in this browser's localStorage only, and
// notes in IndexedDB (see lib/noteVault.ts).

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Assignment, ImportResult, IntegrationId, IntegrationSettings, IntegrationStatus, LibraryItem, NoteDocument } from "@ship/shared-types";
import { HttpError, importFileAsync, importLink, parseIcs, requestText, syncCanvas, syncGoogleDrive, syncTodoist } from "@ship/integrations";
import type { GeminiReader } from "@ship/integrations";
import { isHostedSite } from "../lib/hosting.js";
import { browserFetch, describeError, directThenRelay, relayFetch, requestDriveToken } from "../lib/network.js";
import { deleteNote, loadNotes, saveNotes } from "../lib/noteVault.js";
import { pdfWorkerUrl } from "../lib/pdfWorker.js";
import { shipStorage, storageKey } from "../lib/storage.js";
import { useRecall } from "./recallStore.js";
import { useSettings } from "./settingsStore.js";

export interface ImportSummary {
  files: number;
  cards: number;
  decks: number;
  notes: number;
  assignments: number;
  warnings: string[];
}

export interface FleetState {
  settings: IntegrationSettings;
  /** An iCalendar feed (Lodestar export, or a Canvas calendar feed). */
  calendarFeedUrl: string;
  statuses: Partial<Record<IntegrationId, IntegrationStatus>>;
  busy: Partial<Record<IntegrationId, boolean>>;
  assignments: Assignment[];
  library: LibraryItem[];
  notes: NoteDocument[];
  /** Assignments the sailor ticked off by hand, by id. */
  done: Record<string, boolean>;
  setCanvas(baseUrl: string, token: string): void;
  setTodoist(token: string): void;
  setCalendarFeed(url: string): void;
  setDriveClientId(clientId: string): void;
  disconnect(id: IntegrationId): void;
  syncCanvas(): Promise<void>;
  syncTodoist(): Promise<void>;
  syncCalendar(): Promise<void>;
  /** Opens Google's sign-in window (call from a click), then syncs. */
  connectDrive(): Promise<void>;
  syncDrive(): Promise<void>;
  syncAll(): Promise<void>;
  importFiles(files: { name: string; data: Uint8Array | string }[]): Promise<ImportSummary>;
  /** Reads each link in pasted text, separated by spaces or new lines. */
  importLinks(text: string): Promise<ImportSummary>;
  toggleDone(assignmentId: string): void;
  removeNote(id: string): void;
}

const EMPTY_SETTINGS: IntegrationSettings = { canvas: null, todoist: null, lodestar: null, googleDrive: null };

/** Gemini, when the sailor has added a key. */
function geminiReader(): GeminiReader | null {
  const { geminiApiKey, geminiModel } = useSettings.getState();
  const apiKey = geminiApiKey.trim();
  return apiKey ? { fetch: browserFetch, apiKey, model: geminiModel } : null;
}

/** A long link cut down for a message. */
function linkLabel(link: string): string {
  return link.length > 60 ? `${link.slice(0, 57)}…` : link;
}

/** Adds notes, replacing any with the same id, in the order a person would look for them (Lecture 2 before Lecture 10). */
export function mergeNotes(current: readonly NoteDocument[], fresh: readonly NoteDocument[]): NoteDocument[] {
  const byId = new Map(current.map((n) => [n.id, n]));
  for (const note of fresh) byId.set(note.id, note);
  return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }));
}

/** Turns a failed request into something a sailor can act on. */
function friendly(e: unknown, service: string): string {
  if (e instanceof HttpError) {
    if (e.isAuthError) return `${service} didn't accept the token. Check it and try again.`;
    return e.message;
  }
  if (e instanceof TypeError) {
    if (isHostedSite) return `Couldn't reach ${service}. It may block requests from websites. Try the Import files tab, or run Ship on your own computer.`;
    const server = useSettings.getState().crewServer;
    return `Couldn't reach ${service}. If it goes through the crew server, make sure it's running at ${server} (npm run dev).`;
  }
  return describeError(e);
}

export const useFleet = create<FleetState>()(
  persist(
    (set, get) => {
      const status = (id: IntegrationId, patch: Partial<IntegrationStatus>) =>
        set({
          statuses: {
            ...get().statuses,
            [id]: { id, connected: true, lastSyncAt: null, error: null, ...get().statuses[id], ...patch },
          },
        });

      /** Replaces every assignment from `source` with a fresh list. */
      const newSummary = (files: number): ImportSummary => ({ files, cards: 0, decks: 0, notes: 0, assignments: 0, warnings: [] });

      /** Files what an import brought in, naming its source in any warnings. */
      const absorb = async (label: string, result: ImportResult, summary: ImportSummary) => {
        const added = useRecall.getState().importCards(result);
        summary.cards += added.cards;
        summary.decks += added.decks;
        if (result.notes.length) {
          set({ notes: mergeNotes(get().notes, result.notes) });
          summary.notes += result.notes.length;
          await saveNotes(result.notes).catch(() => {
            summary.warnings.push(`${label}: The browser wouldn't save it, so it will be gone when this page closes.`);
          });
        }
        if (result.assignments.length) {
          const ids = new Set(result.assignments.map((a) => a.id));
          set({ assignments: [...get().assignments.filter((a) => !ids.has(a.id)), ...result.assignments] });
          summary.assignments += result.assignments.length;
        }
        summary.warnings.push(...result.warnings.map((w) => `${label}: ${w}`));
      };

      const replaceFrom = (source: IntegrationId, fresh: Assignment[]) =>
        set({ assignments: [...get().assignments.filter((a) => a.source !== source), ...fresh] });

      const run = async (id: IntegrationId, service: string, job: () => Promise<string[]>) => {
        if (get().busy[id]) return;
        set({ busy: { ...get().busy, [id]: true } });
        try {
          const warnings = await job();
          status(id, { connected: true, lastSyncAt: Date.now(), error: warnings.length ? warnings.join(" ") : null });
        } catch (e) {
          status(id, { error: friendly(e, service) });
        } finally {
          set({ busy: { ...get().busy, [id]: false } });
        }
      };

      return {
        settings: EMPTY_SETTINGS,
        calendarFeedUrl: "",
        statuses: {},
        busy: {},
        assignments: [],
        library: [],
        notes: [],
        done: {},

        setCanvas: (baseUrl, token) => {
          set({ settings: { ...get().settings, canvas: { baseUrl: baseUrl.trim(), token: token.trim() } } });
          status("canvas", { connected: true, error: null });
        },
        setTodoist: (token) => {
          set({ settings: { ...get().settings, todoist: { token: token.trim() } } });
          status("todoist", { connected: true, error: null });
        },
        setCalendarFeed: (url) => {
          set({ calendarFeedUrl: url.trim() });
          status("lodestar", { connected: Boolean(url.trim()), error: null });
        },
        setDriveClientId: (clientId) =>
          set({ settings: { ...get().settings, googleDrive: { clientId: clientId.trim(), accessToken: null, expiresAt: null } } }),

        disconnect: (id) => {
          const settings = { ...get().settings };
          if (id === "canvas") settings.canvas = null;
          if (id === "todoist") settings.todoist = null;
          if (id === "google-drive") settings.googleDrive = null;
          const statuses = { ...get().statuses };
          delete statuses[id];
          set({
            settings,
            statuses,
            calendarFeedUrl: id === "lodestar" ? "" : get().calendarFeedUrl,
            assignments: get().assignments.filter((a) => a.source !== id),
            library: id === "google-drive" ? [] : get().library,
          });
        },

        syncCanvas: () =>
          run("canvas", "Canvas", async () => {
            const canvas = get().settings.canvas;
            if (!canvas) throw new Error("Add your Canvas address and token first.");
            if (isHostedSite) throw new Error("Canvas only syncs when Ship runs on your own computer.");
            const result = await syncCanvas(relayFetch(), canvas);
            replaceFrom("canvas", result.assignments);
            return result.warnings;
          }),

        syncTodoist: () =>
          run("todoist", "Todoist", async () => {
            const todoist = get().settings.todoist;
            if (!todoist) throw new Error("Add your Todoist token first.");
            const result = await syncTodoist(directThenRelay(), todoist);
            replaceFrom("todoist", result.assignments);
            return result.warnings;
          }),

        syncCalendar: () =>
          run("lodestar", "the calendar feed", async () => {
            const url = get().calendarFeedUrl;
            if (!url) throw new Error("Add a calendar feed address first.");
            // webcal:// is just https:// for calendar apps.
            const text = await requestText(directThenRelay(), url.replace(/^webcal:\/\//i, "https://"), { headers: { accept: "text/calendar" } });
            const result = parseIcs(text, "lodestar");
            replaceFrom("lodestar", result.assignments);
            return result.warnings;
          }),

        connectDrive: async () => {
          const drive = get().settings.googleDrive;
          if (!drive?.clientId) {
            status("google-drive", { connected: false, error: "Add your Google OAuth client ID first." });
            return;
          }
          try {
            const token = await requestDriveToken(drive.clientId);
            set({ settings: { ...get().settings, googleDrive: { ...drive, ...token } } });
            await get().syncDrive();
          } catch (e) {
            status("google-drive", { error: friendly(e, "Google") });
          }
        },

        syncDrive: () =>
          run("google-drive", "Google Drive", async () => {
            const drive = get().settings.googleDrive;
            if (!drive) throw new Error("Add your Google OAuth client ID first.");
            const result = await syncGoogleDrive(browserFetch, drive, { includeText: true });
            set({ library: result.items });
            return result.warnings;
          }),

        syncAll: async () => {
          const s = get();
          await Promise.all([
            !isHostedSite && s.settings.canvas && s.syncCanvas(),
            s.settings.todoist && s.syncTodoist(),
            s.calendarFeedUrl && s.syncCalendar(),
            s.settings.googleDrive?.accessToken && s.syncDrive(),
          ]);
        },

        importFiles: async (files) => {
          const summary = newSummary(files.length);
          for (const file of files) {
            await absorb(file.name, await importFileAsync(file.name, file.data, { pdfWorkerSrc: pdfWorkerUrl, gemini: geminiReader() }), summary);
          }
          return summary;
        },

        importLinks: async (text) => {
          const links = [...new Set(text.split(/\s+/).filter(Boolean))];
          const summary = newSummary(links.length);
          const googleToken = get().settings.googleDrive?.accessToken ?? null;
          for (const link of links) {
            await absorb(linkLabel(link), await importLink(link, { fetch: browserFetch, gemini: geminiReader(), googleToken }), summary);
          }
          return summary;
        },

        toggleDone: (assignmentId) => set({ done: { ...get().done, [assignmentId]: !get().done[assignmentId] } }),

        removeNote: (id) => {
          set({ notes: get().notes.filter((n) => n.id !== id) });
          void deleteNote(id).catch((e: unknown) => console.warn("Ship couldn't remove a saved note.", e));
        },
      };
    },
    {
      name: storageKey("fleet"),
      storage: shipStorage,
      version: 1,
      partialize: ({ settings, calendarFeedUrl, statuses, assignments, library, done }) => ({
        settings,
        calendarFeedUrl,
        statuses,
        assignments,
        library,
        done,
      }),
    },
  ),
);

// Notes live in IndexedDB. Older saves kept them in localStorage, so those move across the first time.
async function loadSavedNotes(): Promise<void> {
  const older = useFleet.getState().notes;
  if (older.length > 0) await saveNotes(older);
  const saved = await loadNotes();
  useFleet.setState({ notes: mergeNotes(saved, useFleet.getState().notes) });
}
void loadSavedNotes().catch((e: unknown) => console.warn("Ship couldn't load its saved notes.", e));

export function isDone(a: Assignment, done: Record<string, boolean>): boolean {
  return done[a.id] ?? a.completed;
}

/** Upcoming work first (soonest due), then undated work, done items last. */
export function sortItinerary(assignments: readonly Assignment[], done: Record<string, boolean>): Assignment[] {
  return [...assignments].sort((a, b) => {
    const da = isDone(a, done) ? 1 : 0;
    const db = isDone(b, done) ? 1 : 0;
    if (da !== db) return da - db;
    return (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || a.title.localeCompare(b.title);
  });
}
