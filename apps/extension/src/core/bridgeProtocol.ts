// Checks what the Ship page posts before anything acts on it. Any script on
// the page can call window.postMessage, so shapes are verified and strings
// are trimmed and capped.

import { WEB_SOURCE, type GateCard, type LookoutVoyageState, type VoyagePhase, type WebToLookout } from "@ship/shared-types";
import { MAX_CARDS } from "./constants.js";

const PHASES = new Set<VoyagePhase>(["docked", "sailing", "shore-leave", "drifting"]);
const MAX_ACK_IDS = 1000;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

export function parseVoyageState(v: unknown): LookoutVoyageState | null {
  if (!isRecord(v)) return null;
  if (typeof v.phase !== "string" || !PHASES.has(v.phase as VoyagePhase)) return null;
  if (typeof v.guarding !== "boolean" || !finite(v.updatedAt)) return null;
  if (v.endsAt !== null && !finite(v.endsAt)) return null;
  if (v.objective !== null && typeof v.objective !== "string") return null;
  let assignment: LookoutVoyageState["assignment"] = null;
  if (v.assignment !== null) {
    if (!isRecord(v.assignment)) return null;
    const title = text(v.assignment.title, 300);
    if (title) assignment = { title, course: text(v.assignment.course, 200) };
  }
  return {
    phase: v.phase as VoyagePhase,
    guarding: v.guarding,
    endsAt: v.endsAt,
    objective: text(v.objective, 300),
    assignment,
    updatedAt: v.updatedAt,
  };
}

/** Keeps well-formed cards with both sides filled in, first copy of each id, at most MAX_CARDS. */
export function sanitizeCards(list: readonly unknown[]): GateCard[] {
  const out: GateCard[] = [];
  const seen = new Set<string>();
  for (const c of list) {
    if (out.length >= MAX_CARDS) break;
    if (!isRecord(c)) continue;
    const id = text(c.id, 200);
    const front = text(c.front, 1000);
    const back = text(c.back, 500);
    if (!id || !front || !back || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, front, back });
  }
  return out;
}

/** The message if it's a well-formed WebToLookout from the Ship page, else null. */
export function parseWebMessage(data: unknown): WebToLookout | null {
  if (!isRecord(data) || data.source !== WEB_SOURCE) return null;
  const source = WEB_SOURCE;
  switch (data.t) {
    case "hello":
      return finite(data.version) ? { source, t: "hello", version: data.version } : null;
    case "voyage": {
      const voyage = parseVoyageState(data.voyage);
      return voyage ? { source, t: "voyage", voyage } : null;
    }
    case "cards":
      return Array.isArray(data.cards) ? { source, t: "cards", cards: sanitizeCards(data.cards) } : null;
    case "claim-rewards":
      return { source, t: "claim-rewards" };
    case "ack-rewards":
      if (!Array.isArray(data.ids)) return null;
      return {
        source,
        t: "ack-rewards",
        ids: data.ids.filter((id): id is string => typeof id === "string" && id.length <= 200).slice(0, MAX_ACK_IDS),
      };
    default:
      return null;
  }
}
