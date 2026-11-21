// What the top bar and the Log in window show about cloud sync. Not saved:
// cloud sync works it out again each time the page loads.

import { create } from "zustand";

export type SyncStatus =
  /** Not signed in, or sync hasn't started. */
  | "off"
  | "starting"
  | "synced"
  | "saving"
  /** Both this browser and the account have progress; the sailor picks which to keep. */
  | "needs-choice"
  /** The sailor closed that question; nothing syncs until they sign in again or pick. */
  | "paused"
  | "error";

export type SyncChoice = "cloud" | "local";

export interface SyncState {
  status: SyncStatus;
  /** Plain-language detail for "error" and "paused". */
  message: string | null;
  lastSyncedAt: number | null;
  /** Notes too big to store in the cloud, by title. */
  tooBig: string[];
  /** Set by cloud sync while it waits for the first-sync choice. */
  choose: ((choice: SyncChoice | null) => void) | null;
}

export const useSync = create<SyncState>()(() => ({
  status: "off",
  message: null,
  lastSyncedAt: null,
  tooBig: [],
  choose: null,
}));
