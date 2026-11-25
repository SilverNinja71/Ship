// Every store persists to localStorage under a "ship:" key. When storage is
// missing (tests, private mode) the stores simply don't persist.

import { createJSONStorage } from "zustand/middleware";
import type { StateStorage } from "zustand/middleware";

type WriteListener = (key: string) => void;
const writeListeners = new Set<WriteListener>();

/** Calls `fn` with the key after every save a store makes. Cloud sync uses it to notice changes. */
export function onShipStorageWrite(fn: WriteListener): () => void {
  writeListeners.add(fn);
  return () => writeListeners.delete(fn);
}

const watched: StateStorage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => {
    localStorage.setItem(key, value);
    for (const fn of writeListeners) fn(key);
  },
  removeItem: (key) => {
    localStorage.removeItem(key);
    for (const fn of writeListeners) fn(key);
  },
};

export const shipStorage = createJSONStorage(() => {
  if (typeof localStorage === "undefined") throw new Error("no localStorage");
  return watched;
});

export const storageKey = (name: string) => `ship:${name}`;

/** Cloud sync's bookkeeping. It describes this browser only, so backups and sync leave it out. */
export const SYNC_META_KEY = storageKey("sync-meta");

/**
 * Removes this tab's sessionStorage keys that start with `prefix` (a study room's uncredited
 * minutes and Tidy the Deck memory start with "ship:room-"). Start over and account deletion clear
 * every "ship:" key.
 */
export function clearSessionKeys(prefix = "ship:"): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    for (const k of keys) sessionStorage.removeItem(k);
  } catch {
    // Storage blocked: nothing was saved there either.
  }
}
