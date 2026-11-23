// The sailor's preferences. Sound is off until they turn it on.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SIGNALING_DEFAULT_PORT } from "@ship/shared-types";
import { DEFAULT_GEMINI_MODEL } from "@ship/integrations";
import type { SchedulerKind, VoyagePresetId } from "@ship/shared-types";
import type { KawaiiThemeId } from "../ship-engine/kawaiiThemes.js";
import type { PortThemeId } from "../ship-engine/tinyInk.js";
import { shipStorage, storageKey } from "../lib/storage.js";

export type MotionPreference = "system" | "reduce" | "full";
export type CameraView = "deck" | "quarters";
export type VisualStyle = "tiny-ink" | "storybook";
export type SoundTrackId = "ocean" | "lofi" | "asmr" | "rain";

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
  visualStyle: VisualStyle;
  portTheme: PortThemeId;
  activeThemeId: KawaiiThemeId;
  showAffirmations: boolean;
  pomodoroCycles: number;
  soundTrack: SoundTrackId;
  view: CameraView;
  presetId: VoyagePresetId;
  customFocusMinutes: number;
  customBreakMinutes: number;
  /** Draw the clickable areas on the canvas (handy while building). */
  showHitRegions: boolean;
  /**
   * The sailor's own Gemini API key, for grading the Captain's Log. Stays in
   * this browser, is sent only to Google, and is left out of backups. Empty
   * means blurts are graded offline.
   */
  geminiApiKey: string;
  /** A setting because Gemini model ids change. */
  geminiModel: string;
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
      visualStyle: "tiny-ink",
      portTheme: "classic",
      activeThemeId: "matcha-cafe",
      showAffirmations: true,
      pomodoroCycles: 2,
      soundTrack: "rain",
      view: "deck",
      presetId: "coastal",
      customFocusMinutes: 40,
      customBreakMinutes: 8,
      showHitRegions: false,
      geminiApiKey: "",
      geminiModel: DEFAULT_GEMINI_MODEL,
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
