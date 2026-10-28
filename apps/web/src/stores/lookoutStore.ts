// What the web app knows about the Lookout extension, if it's installed.

import { create } from "zustand";
import type { LookoutStats } from "@ship/shared-types";

export interface LookoutState {
  connected: boolean;
  version: number | null;
  stats: LookoutStats | null;
  lastSeenAt: number | null;
  set(patch: Partial<Omit<LookoutState, "set">>): void;
}

export const useLookout = create<LookoutState>()((set) => ({
  connected: false,
  version: null,
  stats: null,
  lastSeenAt: null,
  set: (patch) => set(patch),
}));
