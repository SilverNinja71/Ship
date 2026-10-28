// Voyages are Ship's Pomodoro timers, and doubloons/XP are what they pay.

export type VoyagePhase =
  /** No timer running. */
  | "docked"
  /** Focus block running. */
  | "sailing"
  /** Break block running. */
  | "shore-leave"
  /** Focus block paused (manually, or because the sailor walked away). */
  | "drifting";

export type VoyagePresetId = "coastal" | "ocean" | "custom";

export interface VoyagePreset {
  id: VoyagePresetId;
  label: string;
  focusMinutes: number;
  breakMinutes: number;
}

export const VOYAGE_PRESETS: Record<VoyagePresetId, VoyagePreset> = {
  coastal: { id: "coastal", label: "Coastal Cruise", focusMinutes: 25, breakMinutes: 5 },
  ocean: { id: "ocean", label: "Ocean Voyage", focusMinutes: 50, breakMinutes: 10 },
  custom: { id: "custom", label: "Custom Expedition", focusMinutes: 40, breakMinutes: 8 },
};

/** A finished (or abandoned) focus block, kept for streaks, stats and ghost ships. */
export interface VoyageRecord {
  id: string;
  startedAt: number;
  endedAt: number;
  plannedMinutes: number;
  focusedMinutes: number;
  completed: boolean;
  shipId: string;
  objective: string | null;
}

// Economy. One place so the app, the extension and the server agree.
export const DOUBLOONS_PER_FOCUS_MINUTE = 2;
export const XP_PER_FOCUS_MINUTE = 10;
export const VOYAGE_COMPLETION_BONUS = 25;
export const STEER_BACK_BONUS = 50;
export const GATE_LEISURE_MINUTES = 5;
export const GATE_CARDS_REQUIRED = 2;
export const ZEST_COIN_VALUE = 3;

/** XP needed to reach `level` (level 1 = 0 XP). Gentle quadratic curve. */
export function xpForLevel(level: number): number {
  const n = Math.max(0, level - 1);
  return 250 * n + 50 * n * n;
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}
