// Backups: every "ship:" key in localStorage, plus uploaded notes, as one JSON
// file. The Gemini key stays out of the file, since backups get copied and
// shared around, and a restore keeps whatever key this browser already has.

import type { NoteDocument } from "@ship/shared-types";
import { SYNC_META_KEY, storageKey } from "./storage.js";

export interface ShipBackup {
  app: "ship";
  exportedAt: string;
  data: Record<string, unknown>;
  /** Keys stored as plain text rather than JSON (the profile's name and email, the storage choice), kept word for word. */
  text?: Record<string, string>;
  /** Uploaded notes, which live in IndexedDB rather than localStorage. */
  notes?: NoteDocument[];
}

/** Keys that describe this browser alone and never go into a backup. */
const DEVICE_ONLY_KEYS: readonly string[] = [SYNC_META_KEY];

const backedUp = (key: string | null): key is string => Boolean(key?.startsWith("ship:")) && !DEVICE_ONLY_KEYS.includes(key as string);

const SETTINGS_KEY = storageKey("settings");
/** Settings fields that never leave this browser. */
const SECRET_SETTINGS = ["geminiApiKey"] as const;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Zustand's persisted shape is { state, version }; returns the settings `state`, if any. */
function settingsState(value: unknown): Record<string, unknown> | null {
  return isRecord(value) && isRecord(value.state) ? value.state : null;
}

function readJson(storage: Storage, key: string): unknown {
  try {
    return JSON.parse(storage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

export function makeBackup(storage: Storage, now = new Date(), notes: readonly NoteDocument[] = []): ShipBackup {
  const data: Record<string, unknown> = {};
  const text: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!backedUp(key)) continue;
    const raw = storage.getItem(key);
    if (raw === null) continue;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      text[key] = raw;
      continue;
    }
    const state = key === SETTINGS_KEY ? settingsState(value) : null;
    if (state && isRecord(value)) {
      const clean = { ...state };
      for (const field of SECRET_SETTINGS) delete clean[field];
      value = { ...value, state: clean };
    }
    data[key] = value;
  }
  return {
    app: "ship",
    exportedAt: now.toISOString(),
    data,
    ...(Object.keys(text).length > 0 ? { text } : {}),
    ...(notes.length > 0 ? { notes: [...notes] } : {}),
  };
}

/** The uploaded notes in a parsed backup file, leaving out anything malformed. */
export function notesInBackup(parsed: unknown): NoteDocument[] {
  if (!isRecord(parsed) || !Array.isArray(parsed.notes)) return [];
  return parsed.notes.filter((n): n is NoteDocument => isRecord(n) && typeof n.id === "string" && typeof n.title === "string" && Array.isArray(n.pages));
}

/** Writes a parsed backup file into storage. Throws if it isn't a Ship backup. Returns how many keys were restored. */
export function restoreBackup(storage: Storage, parsed: unknown): number {
  if (!isRecord(parsed) || parsed.app !== "ship" || !isRecord(parsed.data)) throw new Error("not a Ship backup");
  const current = settingsState(readJson(storage, SETTINGS_KEY));
  let restored = 0;
  for (const [key, raw] of Object.entries(parsed.data)) {
    // Backups made before plain-text keys were kept hold null for them; writing that would replace a real value with the word "null".
    if (!backedUp(key) || raw === null) continue;
    let value = raw;
    const state = key === SETTINGS_KEY ? settingsState(value) : null;
    if (state && isRecord(value) && current) {
      const kept = { ...state };
      for (const field of SECRET_SETTINGS) if (typeof current[field] === "string" && current[field]) kept[field] = current[field];
      value = { ...value, state: kept };
    }
    storage.setItem(key, JSON.stringify(value));
    restored++;
  }
  if (isRecord(parsed.text)) {
    for (const [key, raw] of Object.entries(parsed.text)) {
      if (!backedUp(key) || typeof raw !== "string") continue;
      storage.setItem(key, raw);
      restored++;
    }
  }
  return restored;
}
