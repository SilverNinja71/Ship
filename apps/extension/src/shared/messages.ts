// Messages inside the extension: content scripts, popup and options talk to
// the background worker with chrome.runtime.sendMessage. (The page <-> bridge
// protocol is WebToLookout / LookoutToWeb in shared-types.)

import type { GateCard, LookoutStats, LookoutToWeb, LookoutVerdict, LookoutVoyageState, VideoInspection, WebToLookout } from "@ship/shared-types";
import type { GuardStatus } from "../core/voyage.js";

export type ToBackground =
  /** From the bridge: a message the Ship page posted. */
  | { t: "web"; msg: WebToLookout }
  /** From the guard: should this page be blocked? */
  | { t: "check"; url: string }
  /** From the guard on a watch page, after reading it. */
  | { t: "judge"; url: string; inspection: VideoInspection }
  /** The gate went up on this page (counts once per page view). */
  | { t: "blocked"; url: string }
  | { t: "gate-cards" }
  | { t: "gate-passed"; url: string }
  | { t: "steer-back"; url: string }
  | { t: "popup-state" }
  | { t: "open-ship" };

/** "lookout-refresh": guarding, passes or the blocklist changed, so check the page again. */
export type ToContent = { t: "lookout-refresh" } | { t: "lookout-stats"; stats: LookoutStats };

/** What the gate shows about the voyage it's protecting. */
export interface GateVoyageInfo {
  endsAt: number | null;
  objective: string | null;
  assignment: string | null;
  geminiModel: string | null;
}

export type GuardDecision =
  | { action: "allow"; verdict: LookoutVerdict | null; passUntil: number | null }
  /** A watch page: read the title and description, then send "judge". */
  | { action: "inspect"; site: string; videoId: string }
  | { action: "block"; site: string; verdict: LookoutVerdict; voyage: GateVoyageInfo };

export interface SteerBackResult {
  doubloons: number;
  /** True when an open Ship tab was focused; false when this tab is being sent to Ship. */
  focusedExistingTab: boolean;
}

export interface PopupState {
  now: number;
  voyage: LookoutVoyageState | null;
  status: GuardStatus;
  lastHeartbeat: number | null;
  stats: LookoutStats;
  geminiModel: string;
  geminiError: { at: number; message: string } | null;
  lastVerdict: { at: number; title: string; verdict: LookoutVerdict } | null;
  pendingRewards: number;
  pendingDoubloons: number;
  passes: { site: string; until: number }[];
  cards: number;
  shipUrl: string;
}

export interface BackgroundReplies {
  web: LookoutToWeb | null;
  check: GuardDecision;
  judge: GuardDecision;
  blocked: null;
  "gate-cards": { cards: GateCard[] };
  "gate-passed": { passUntil: number } | null;
  "steer-back": SteerBackResult | null;
  "popup-state": PopupState;
  "open-ship": null;
}

export type ReplyTo<M extends ToBackground> = BackgroundReplies[M["t"]];

/** Who sent a message, as the background sees it. */
export interface SenderInfo {
  tabId: number | null;
}
