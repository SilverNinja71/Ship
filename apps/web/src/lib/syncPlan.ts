// Cloud sync's rules, with no Firebase in sight so they can be tested on their own.
// cloudSync.ts does the talking to Firestore; this file decides what to send,
// what to keep and who wins.
//
// Each synced store saves `{ state, version }` under a "ship:" key. Only the
// fields listed here travel. Everything else stays in this browser: secrets
// (the Gemini key, Canvas and Todoist tokens, calendar feed links), settings
// that belong to one device (sound, camera view, crew server), and the live
// timer, so a voyage running on one device doesn't start ticking on another.
// A new field stays on the device until someone adds it here on purpose.

import type { NoteDocument } from "@ship/shared-types";
import { storageKey } from "./storage.js";

export const SYNCED_FIELDS: Readonly<Record<string, readonly string[]>> = {
  [storageKey("planner")]: [
    "weeklyTitle",
    "weeklyGoal",
    "weekStartedAt",
    "weeklyCells",
    "weeklyStickers",
    "sessionStickers",
    "habits",
    "pomodoros",
    "monthTitle",
    "monthCells",
    "monthNotes",
    "lastCheckInDay",
    "kanban",
    "plannedDays",
    "picks",
    "picksDay",
    "lastMonthlyStatsMonth",
    "lastActiveMonth",
  ],
  [storageKey("voyage")]: ["records", "tree", "breakReflections", "sessionTasks"],
  [storageKey("economy")]: ["doubloons", "xp", "inventory", "paidRewardIds", "unlockedThemes", "ledger"],
  [storageKey("recall")]: ["decks", "cards", "reviewLog", "blurts"],
  [storageKey("customizer")]: ["activeShipId", "loadouts", "avatar"],
  [storageKey("fleet")]: ["assignments", "library", "done"],
  [storageKey("settings")]: [
    "scheduler",
    "visualStyle",
    "portTheme",
    "activeThemeId",
    "showAffirmations",
    "pomodoroCycles",
    "presetId",
    "customFocusMinutes",
    "customBreakMinutes",
    "soundTrack",
  ],
};

export const SYNCED_KEYS: readonly string[] = Object.keys(SYNCED_FIELDS);

/** The Firestore document id for a storage key: "ship:planner" is stored as "planner". */
export const docIdForKey = (key: string) => key.replace(/^ship:/, "");
export const keyForDocId = (id: string) => `ship:${id}`;

export interface Persisted {
  state: Record<string, unknown>;
  version: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Reads zustand's `{ state, version }` from a stored string; null when missing or not that shape. */
export function parsePersisted(raw: string | null): Persisted | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || !isRecord(value.state)) return null;
    return { state: value.state, version: typeof value.version === "number" ? value.version : 0 };
  } catch {
    return null;
  }
}

/** The part of a store that syncs: only its listed fields, and only those it has. */
export function projectForSync(key: string, persisted: Persisted): Persisted {
  const state: Record<string, unknown> = {};
  for (const field of SYNCED_FIELDS[key] ?? []) if (field in persisted.state) state[field] = persisted.state[field];
  return { state, version: persisted.version };
}

/** A synced copy laid over this browser's own: synced fields come from the cloud, the rest stay as they are. */
export function mergeIntoLocal(key: string, local: Persisted | null, remote: Persisted): Persisted {
  const synced = projectForSync(key, remote).state;
  return { state: { ...(local?.state ?? {}), ...synced }, version: remote.version };
}

/** JSON with object keys sorted, so the same data always gives the same text. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** A short fingerprint (FNV-1a, 53 bits), to tell whether data changed without keeping a second copy. */
export function fingerprint(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
  }
  return (h2 & 0x1fffff).toString(36) + h1.toString(36);
}

/** The fingerprint of a store's synced part, or "" when the store has nothing saved. */
export function syncFingerprint(key: string, raw: string | null): string {
  const persisted = parsePersisted(raw);
  return persisted ? fingerprint(stableStringify(projectForSync(key, persisted))) : "";
}

// ---- What this browser remembers about the last sync -------------------------------------------

export interface KeyMeta {
  /** Fingerprint of the synced part when it last matched the cloud. */
  hash: string;
  /** The cloud copy's revision at that moment; null when the cloud had none. */
  rev: string | null;
  /** When this browser last changed it without the cloud knowing yet (ms). */
  dirtyAt?: number;
}

export interface SyncMeta {
  /** The account this browser last synced with. A different account starts over. */
  uid: string;
  keys: Record<string, KeyMeta>;
  /** Note ids that were in the cloud at the last sync, to tell a deletion from a new note. */
  notes: string[];
}

export function parseMeta(raw: string | null): SyncMeta | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || typeof value.uid !== "string" || !isRecord(value.keys) || !Array.isArray(value.notes)) return null;
    return { uid: value.uid, keys: value.keys as Record<string, KeyMeta>, notes: value.notes.filter((n): n is string => typeof n === "string") };
  } catch {
    return null;
  }
}

export interface RemoteState {
  /** The synced part, as written by whichever device saved it. */
  persisted: Persisted;
  rev: string;
  /** Server time of that save (ms); 0 when not known yet. */
  updatedAt: number;
}

export type KeyAction = "none" | "push" | "pull";

/**
 * What to do with one store when both sides may have moved on since the last sync.
 * Only one side changed: that side wins. Both changed: the later change wins, and a
 * local change with no recorded time (a restored backup, say) counts as the later.
 */
export function decideKey(localHash: string, meta: KeyMeta | undefined, remote: RemoteState | null): KeyAction {
  if (!remote) return localHash ? "push" : "none";
  if (!meta) return "pull";
  const localChanged = localHash !== meta.hash;
  const remoteChanged = remote.rev !== meta.rev;
  if (!localChanged && !remoteChanged) return "none";
  if (localChanged && !remoteChanged) return localHash ? "push" : "pull";
  if (!localChanged && remoteChanged) return "pull";
  const localAt = meta.dirtyAt ?? Number.POSITIVE_INFINITY;
  return remote.updatedAt > localAt ? "pull" : "push";
}

/** A change came in from another device while this one has an unsent change to the same store. */
export function remoteBeatsPending(remoteUpdatedAt: number, dirtyAt: number | undefined): boolean {
  return dirtyAt === undefined || remoteUpdatedAt >= dirtyAt;
}

export interface NotePlan {
  upload: string[];
  download: string[];
  deleteLocal: string[];
  deleteRemote: string[];
}

/**
 * Notes are matched by id (an id comes from a note's contents, so it never changes).
 * A note on one side only is new, unless the last sync saw it on both: then the
 * other side deleted it.
 */
export function planNotes(local: readonly string[], remote: readonly string[], lastSynced: readonly string[] | null): NotePlan {
  const l = new Set(local);
  const r = new Set(remote);
  const seen = new Set(lastSynced ?? []);
  const plan: NotePlan = { upload: [], download: [], deleteLocal: [], deleteRemote: [] };
  for (const id of l) if (!r.has(id)) (lastSynced && seen.has(id) ? plan.deleteLocal : plan.upload).push(id);
  for (const id of r) if (!l.has(id)) (lastSynced && seen.has(id) ? plan.deleteRemote : plan.download).push(id);
  return plan;
}

// ---- The first sync on a browser ---------------------------------------------------------------

const countOf = (v: unknown) => (Array.isArray(v) ? v.length : 0);
const hasText = (v: unknown): boolean =>
  typeof v === "string" ? v.trim().length > 0 : Array.isArray(v) ? v.some(hasText) : isRecord(v) ? Object.values(v).some(hasText) : false;

/**
 * Whether this browser holds progress worth asking about before the cloud copy
 * replaces it. A fresh visitor's defaults don't count.
 */
export function localHasProgress(getItem: (key: string) => string | null, noteCount: number): boolean {
  if (noteCount > 0) return true;
  const state = (name: string) => parsePersisted(getItem(storageKey(name)))?.state ?? {};
  const voyage = state("voyage");
  const recall = state("recall");
  const economy = state("economy");
  const fleet = state("fleet");
  const planner = state("planner");
  if (countOf(voyage.records) > 0) return true;
  if (countOf(recall.cards) + countOf(recall.blurts) > 0) return true;
  if (Number(economy.doubloons) > 0 || Number(economy.xp) > 0) return true;
  if (countOf(fleet.assignments) + countOf(fleet.library) > 0) return true;
  const habits = Array.isArray(planner.habits) ? planner.habits : [];
  const habitTicked = habits.some((h) => isRecord(h) && Array.isArray(h.checks) && h.checks.some(Boolean));
  const pomodoroUsed = Array.isArray(planner.pomodoros) && planner.pomodoros.some((p) => isRecord(p) && (hasText(p.tasks) || hasText(p.improveNote)));
  return habitTicked || pomodoroUsed || hasText(planner.weeklyCells) || hasText(planner.monthCells) || hasText(planner.monthNotes) || hasText(planner.weeklyGoal);
}

// ---- Notes travel compressed --------------------------------------------------------------------

/** Firestore refuses a document over 1 MiB; this leaves room for the other fields. */
export const MAX_NOTE_BYTES = 1_000_000;

export async function packNote(note: NoteDocument): Promise<Uint8Array> {
  const stream = new Blob([JSON.stringify(note)]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function unpackNote(bytes: Uint8Array): Promise<NoteDocument | null> {
  try {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
    const value: unknown = JSON.parse(await new Response(stream).text());
    return isRecord(value) && typeof value.id === "string" && typeof value.title === "string" && Array.isArray(value.pages) ? (value as unknown as NoteDocument) : null;
  } catch {
    return null;
  }
}

/** Firestore document ids can't hold "/", so note ids are percent-encoded. */
export const noteDocId = (id: string) => encodeURIComponent(id);
