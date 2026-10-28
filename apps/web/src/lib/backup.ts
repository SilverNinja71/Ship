// Backups: every "ship:" key in localStorage as one JSON file. The Gemini key
// stays out of the file, since backups get copied and shared around, and a
// restore keeps whatever key this browser already has.

import { storageKey } from "./storage.js";

export interface ShipBackup {
  app: "ship";
  exportedAt: string;
  data: Record<string, unknown>;
}

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

export function makeBackup(storage: Storage, now = new Date()): ShipBackup {
  const data: Record<string, unknown> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith("ship:")) continue;
    let value = readJson(storage, key);
    const state = key === SETTINGS_KEY ? settingsState(value) : null;
    if (state && isRecord(value)) {
      const clean = { ...state };
      for (const field of SECRET_SETTINGS) delete clean[field];
      value = { ...value, state: clean };
    }
    data[key] = value;
  }
  return { app: "ship", exportedAt: now.toISOString(), data };
}

/** Writes a parsed backup file into storage. Throws if it isn't a Ship backup. Returns how many keys were restored. */
export function restoreBackup(storage: Storage, parsed: unknown): number {
  if (!isRecord(parsed) || parsed.app !== "ship" || !isRecord(parsed.data)) throw new Error("not a Ship backup");
  const current = settingsState(readJson(storage, SETTINGS_KEY));
  let restored = 0;
  for (const [key, raw] of Object.entries(parsed.data)) {
    if (!key.startsWith("ship:")) continue;
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
  return restored;
}
