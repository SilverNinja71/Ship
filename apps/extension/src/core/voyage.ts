// Whether the Lookout should be guarding right now. Ship tells us about the
// voyage; if it goes quiet (tab closed, computer slept) we stop guarding
// rather than block the web forever.

import type { LookoutVoyageState } from "@ship/shared-types";
import { normalize } from "@ship/active-recall-engine";
import { ENDS_AT_GRACE_MS, HEARTBEAT_STALE_MS } from "./constants.js";

export interface StoredVoyage {
  state: LookoutVoyageState;
  /** Our own clock when the last voyage message arrived (the heartbeat), not the app's updatedAt. */
  receivedAt: number;
}

export type GuardStatus =
  | "guarding"
  /** Ship has never checked in. */
  | "no-voyage"
  /** Docked, on shore leave or paused. */
  | "not-focus"
  /** No heartbeat for a few minutes. */
  | "stale"
  /** The block's end time passed a while ago. */
  | "ended";

export function guardStatus(stored: StoredVoyage | null, now: number): GuardStatus {
  if (!stored) return "no-voyage";
  if (!stored.state.guarding) return "not-focus";
  if (now - stored.receivedAt > HEARTBEAT_STALE_MS) return "stale";
  const { endsAt } = stored.state;
  if (endsAt !== null && now > endsAt + ENDS_AT_GRACE_MS) return "ended";
  return "guarding";
}

export function isGuarding(stored: StoredVoyage | null, now: number): boolean {
  return guardStatus(stored, now) === "guarding";
}

/** What the sailor is studying, for Gemini and the keyword check. */
export interface StudyContext {
  assignment: string | null;
  course: string | null;
  objective: string | null;
}

export function studyContext(state: LookoutVoyageState | null): StudyContext {
  return {
    assignment: state?.assignment?.title || null,
    course: state?.assignment?.course || null,
    objective: state?.objective || null,
  };
}

/** Verdicts depend on what's being studied, so the cache keys on this too. */
export function studyContextKey(ctx: StudyContext): string {
  return [ctx.assignment, ctx.course, ctx.objective].map((s) => normalize(s ?? "")).join("|");
}

/** Changes whenever guarding turns on/off or the study context changes; tabs re-check when it does. */
export function guardKey(stored: StoredVoyage | null, now: number): string {
  return isGuarding(stored, now) ? `on|${studyContextKey(studyContext(stored?.state ?? null))}` : "off";
}
