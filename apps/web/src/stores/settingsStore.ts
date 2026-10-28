// The sailor's preferences. Sound is off until they turn it on.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SIGNALING_DEFAULT_PORT } from "@ship/shared-types";
import type { SchedulerKind, VoyagePresetId } from "@ship/shared-types";
import { shipStorage, storageKey } from "../lib/storage.js";

export type MotionPreference = "system" | "reduce" | "full";
export type CameraView = "deck" | "quarters";

export interface SettingsState {
  soundOn: boolean;
  ambienceVolume: number;
  chimesOn: boolean;
  /** Minutes with no mouse or keyboard input (tab visible) before the voyage drifts. 0 turns it off. */
  idleMinutes: number;
  /** The crew server's http origin; the WebSocket and the relay live there. */
  crewServer: string;
  scheduler: SchedulerKind;
  motion: MotionPreference;
  view: CameraView;
  presetId: VoyagePresetId;
  customFocusMinutes: number;
  customBreakMinutes: number;
  /** Draw the clickable areas on the canvas (handy while building). */
  showHitRegions: boolean;
  set(patch: Partial<Omit<SettingsState, "set">>): void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      soundOn: false,
      ambienceVolume: 0.35,
      chimesOn: true,
      idleMinutes: 10,
      crewServer: `http://localhost:${SIGNALING_DEFAULT_PORT}`,
      scheduler: "sm2",
      motion: "system",
      view: "deck",
      presetId: "coastal",
      customFocusMinutes: 40,
      customBreakMinutes: 8,
      showHitRegions: false,
      set: (patch) => set(patch),
    }),
    { name: storageKey("settings"), storage: shipStorage, version: 1 },
  ),
);

export function prefersReducedMotion(motion: MotionPreference): boolean {
  if (motion !== "system") return motion === "reduce";
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** ws://host:port for the crew server's http origin. */
export function crewSocketUrl(httpOrigin: string): string {
  return httpOrigin.trim().replace(/\/+$/, "").replace(/^http(s?):\/\//i, (_, s: string) => `ws${s}://`);
}
