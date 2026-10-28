// Words the gate and the popup show, kept in one place so both say the same thing.

import type { LookoutVerdict, VoyagePhase } from "@ship/shared-types";
import type { GuardStatus } from "./voyage.js";

/** Who made the call. A keyword-check verdict must always say so. */
export function verdictSourceLabel(verdict: Pick<LookoutVerdict, "source">, model: string | null): string {
  switch (verdict.source) {
    case "gemini":
      return model ? `Judged by Gemini (${model})` : "Judged by Gemini";
    case "cache":
      return "Gemini's earlier verdict on this video";
    case "heuristic":
      return "Keyword check (heuristic), not Gemini";
    case "always-blocked":
      return "Always blocked during focus";
    case "leisure-pass":
      return "Leisure pass";
  }
}

/** The same, short enough for "cleared by …" in the popup. */
export function verdictSourceShort(verdict: Pick<LookoutVerdict, "source">): string {
  switch (verdict.source) {
    case "gemini":
      return "Gemini";
    case "cache":
      return "Gemini (remembered)";
    case "heuristic":
      return "the keyword check (heuristic)";
    case "always-blocked":
      return "the always-blocked list";
    case "leisure-pass":
      return "a leisure pass";
  }
}

export const PHASE_LABELS: Record<VoyagePhase, string> = {
  docked: "Docked",
  sailing: "Sailing (focus)",
  "shore-leave": "Shore leave (break)",
  drifting: "Drifting (paused)",
};

export const GUARD_STATUS_LABELS: Record<GuardStatus, string> = {
  guarding: "On watch: guarding this focus block",
  "no-voyage": "Off watch: Ship hasn't checked in yet. Open Ship to connect.",
  "not-focus": "Off watch: no focus block is running",
  stale: "Off watch: Ship stopped checking in. Is its tab still open?",
  ended: "Off watch: the focus block's time is up",
};

/** "23 min left", "45 s left", or "time's up". */
export function formatTimeLeft(ms: number): string {
  if (ms <= 0) return "time's up";
  if (ms < 60_000) return `${Math.ceil(ms / 1000)} s left`;
  return `${Math.ceil(ms / 60_000)} min left`;
}

/** "24:59" for countdowns. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
