// Is the sailor at the keyboard? Drives the avatar's DRIFTING_IDLE state.

import { create } from "zustand";
import type { AvatarState, VoyagePhase } from "@ship/shared-types";

export interface ActivityState {
  /** No input for the idle limit while the tab was visible. */
  idle: boolean;
  /** The Ship tab is in the background. */
  hidden: boolean;
  set(patch: Partial<Pick<ActivityState, "idle" | "hidden">>): void;
}

export const useActivity = create<ActivityState>()((set) => ({
  idle: false,
  hidden: typeof document !== "undefined" ? document.hidden : false,
  set: (patch) => set(patch),
}));

/**
 * The sailor's avatar state. A hidden tab only changes the avatar: the voyage
 * keeps counting, because studying in another window is still studying (the
 * Lookout guards the distractions). Idling with Ship visible pauses the voyage.
 */
export function myAvatarState(phase: VoyagePhase, idle: boolean, hidden: boolean): AvatarState {
  if (phase === "drifting") return "DRIFTING_IDLE";
  if (phase === "sailing") return idle || hidden ? "DRIFTING_IDLE" : "SAILING_FOCUS";
  return "SHORE_LEAVE_BREAK";
}
