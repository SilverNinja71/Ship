// The Lookout extension <-> the Ship web app.
//
// The extension injects a "bridge" content script into the Ship web app page.
// The page and the bridge talk with window.postMessage; every message carries
// a `source` so each side ignores everything else on the page.

import type { VoyagePhase } from "./voyage.js";

export const BRIDGE_PROTOCOL_VERSION = 1;
export const WEB_SOURCE = "ship-web" as const;
export const LOOKOUT_SOURCE = "ship-lookout" as const;
/** The web app sets <meta name="ship-app" content="1"> so the bridge knows it's on the right page. */
export const SHIP_APP_META = "ship-app";

export interface LookoutVoyageState {
  phase: VoyagePhase;
  /** True while a focus block is running: the Lookout only guards then. */
  guarding: boolean;
  /** Epoch ms when the current block ends, or null. */
  endsAt: number | null;
  objective: string | null;
  /** The assignment being studied, for Gemini's "is this video relevant?" check. */
  assignment: { title: string; course: string | null } | null;
  updatedAt: number;
}

/** A due flashcard the Siren Gate can quiz on. */
export interface GateCard {
  id: string;
  front: string;
  back: string;
}

export type LookoutRewardKind = "steer-back" | "gate-passed" | "blocked";

export interface LookoutRewardEvent {
  /** Unique, so the web app never pays the same event twice. */
  id: string;
  kind: LookoutRewardKind;
  doubloons: number;
  site: string;
  at: number;
}

export interface LookoutStats {
  blockedToday: number;
  steeredBackToday: number;
  leisurePassesToday: number;
  geminiReady: boolean;
}

export type WebToLookout =
  | { source: typeof WEB_SOURCE; t: "hello"; version: number }
  | { source: typeof WEB_SOURCE; t: "voyage"; voyage: LookoutVoyageState }
  | { source: typeof WEB_SOURCE; t: "cards"; cards: GateCard[] }
  /** Ask the extension for reward events it has queued. */
  | { source: typeof WEB_SOURCE; t: "claim-rewards" }
  /** Confirm these event ids were paid so the extension can drop them. */
  | { source: typeof WEB_SOURCE; t: "ack-rewards"; ids: string[] };

export type LookoutToWeb =
  | { source: typeof LOOKOUT_SOURCE; t: "hello"; version: number; stats: LookoutStats }
  | { source: typeof LOOKOUT_SOURCE; t: "rewards"; events: LookoutRewardEvent[] }
  | { source: typeof LOOKOUT_SOURCE; t: "stats"; stats: LookoutStats };

/** What the Lookout reads off a YouTube watch page before judging it. */
export interface VideoInspection {
  videoId: string;
  title: string;
  channel: string;
  description: string;
  transcriptExcerpt: string | null;
  thumbnailUrl: string | null;
}

export interface LookoutVerdict {
  decision: "PROCEED" | "BLOCKED";
  reason: string;
  /** 0..1 */
  confidence: number;
  source: "gemini" | "heuristic" | "cache" | "always-blocked" | "leisure-pass";
}
