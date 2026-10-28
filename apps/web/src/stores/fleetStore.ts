// The Fleet Log: connected services and what they brought in (deadlines,
// library files, notes). Tokens live in this browser's localStorage only.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Assignment, IntegrationId, IntegrationSettings, IntegrationStatus, LibraryItem, NoteDocument } from "@ship/shared-types";
import { HttpError, importFile, parseIcs, requestText, syncCanvas, syncGoogleDrive, syncTodoist } from "@ship/integrations";
import { browserFetch, describeError, directThenRelay, relayFetch, requestDriveToken } from "../lib/network.js";
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
  importFiles(files: { name: string; data: Uint8Array | string }[]): ImportSummary;
  toggleDone(assignmentId: string): void;
  removeNote(id: string): void;
}

const EMPTY_SETTINGS: IntegrationSettings = { canvas: null, todoist: null, lodestar: null, googleDrive: null };

/** Turns a failed request into something a sailor can act on. */
function friendly(e: unknown, service: string): string {
  if (e instanceof HttpError) {
    if (e.isAuthError) return `${service} didn't accept the token. Check it and try again.`;
    return e.message;
  }
  if (e instanceof TypeError) {
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
            s.settings.canvas && s.syncCanvas(),
            s.settings.todoist && s.syncTodoist(),
            s.calendarFeedUrl && s.syncCalendar(),
            s.settings.googleDrive?.accessToken && s.syncDrive(),
          ]);
        },

        importFiles: (files) => {
          const summary: ImportSummary = { files: files.length, cards: 0, decks: 0, notes: 0, assignments: 0, warnings: [] };
          for (const file of files) {
            const result = importFile(file.name, file.data);
            const added = useRecall.getState().importCards(result);
            summary.cards += added.cards;
            summary.decks += added.decks;
            if (result.notes.length) {
              const ids = new Set(result.notes.map((n) => n.id));
              set({ notes: [...get().notes.filter((n) => !ids.has(n.id)), ...result.notes] });
              summary.notes += result.notes.length;
            }
            if (result.assignments.length) {
              const ids = new Set(result.assignments.map((a) => a.id));
              set({ assignments: [...get().assignments.filter((a) => !ids.has(a.id)), ...result.assignments] });
              summary.assignments += result.assignments.length;
            }
            summary.warnings.push(...result.warnings.map((w) => `${file.name}: ${w}`));
          }
          return summary;
        },

        toggleDone: (assignmentId) => set({ done: { ...get().done, [assignmentId]: !get().done[assignmentId] } }),

        removeNote: (id) => set({ notes: get().notes.filter((n) => n.id !== id) }),
      };
    },
    {
      name: storageKey("fleet"),
      storage: shipStorage,
      version: 1,
      partialize: ({ settings, calendarFeedUrl, statuses, assignments, library, notes, done }) => ({
        settings,
        calendarFeedUrl,
        statuses,
        assignments,
        library,
        notes,
        done,
      }),
    },
  ),
);

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
