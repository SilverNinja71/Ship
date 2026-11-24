// Talks to the Lookout extension's bridge content script with
// window.postMessage. Every message carries a `source`, and anything from
// another source (or another window) is ignored. If the extension isn't
// installed, nothing answers and nothing breaks.

import { useEffect } from "react";
import { BRIDGE_PROTOCOL_VERSION, LOOKOUT_SOURCE, WEB_SOURCE } from "@ship/shared-types";
import type { GateCard, LookoutToWeb, LookoutVoyageState, WebToLookout } from "@ship/shared-types";
import { noteFromClip } from "../lib/clipNotes.js";
import { blockEndsAt } from "../lib/voyageLogic.js";
import { useEconomy } from "../stores/economyStore.js";
import { useFleet } from "../stores/fleetStore.js";
import { useLookout } from "../stores/lookoutStore.js";
import { dueNow, useRecall } from "../stores/recallStore.js";
import { useUi } from "../stores/uiStore.js";
import { useVoyage } from "../stores/voyageStore.js";

const HEARTBEAT_MS = 30_000;
const CLAIM_MS = 15_000;
const GATE_CARDS = 20;

type Outgoing = WebToLookout extends infer M ? (M extends { source: string } ? Omit<M, "source"> : never) : never;

function post(msg: Outgoing): void {
  window.postMessage({ ...msg, source: WEB_SOURCE } as WebToLookout, window.location.origin);
}

export function lookoutVoyageState(now = Date.now()): LookoutVoyageState {
  const v = useVoyage.getState();
  const assignment = v.assignmentId ? useFleet.getState().assignments.find((a) => a.id === v.assignmentId) : undefined;
  return {
    phase: v.phase,
    guarding: v.phase === "sailing",
    endsAt: blockEndsAt(v, now),
    objective: v.objective,
    assignment: assignment ? { title: assignment.title, course: assignment.course } : null,
    updatedAt: now,
  };
}

function gateCards(): GateCard[] {
  const { cards } = useRecall.getState();
  const due = dueNow(cards, Date.now(), GATE_CARDS);
  // With few due cards, top up with any cards so the Siren Gate still has questions.
  const pool = due.length >= GATE_CARDS ? due : [...due, ...cards.filter((c) => !due.includes(c))].slice(0, GATE_CARDS);
  return pool.map((c) => ({ id: c.id, front: c.front, back: c.back }));
}

function isLookoutMessage(data: unknown): data is LookoutToWeb {
  return typeof data === "object" && data !== null && (data as { source?: unknown }).source === LOOKOUT_SOURCE && typeof (data as { t?: unknown }).t === "string";
}

export function useLookoutBridge(): void {
  useEffect(() => {
    const lookout = useLookout.getState;
    // Clips already filed this visit, in case one arrives twice before the Lookout hears the ack.
    const filed = new Set<string>();

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || !isLookoutMessage(event.data)) return;
      const msg = event.data;
      lookout().set({ connected: true, lastSeenAt: Date.now() });
      switch (msg.t) {
        case "hello":
          lookout().set({ version: msg.version, stats: msg.stats });
          post({ t: "voyage", voyage: lookoutVoyageState() });
          post({ t: "cards", cards: gateCards() });
          post({ t: "claim-rewards" });
          post({ t: "claim-clips" });
          break;
        case "stats":
          lookout().set({ stats: msg.stats });
          break;
        case "rewards": {
          if (!Array.isArray(msg.events) || !msg.events.length) break;
          const before = useEconomy.getState().doubloons;
          const settled = useEconomy.getState().payLookoutRewards(msg.events);
          const gained = useEconomy.getState().doubloons - before;
          if (gained > 0) useUi.getState().toast(`The Lookout paid you ${gained} doubloons for steering back to the ship.`, "reward");
          post({ t: "ack-rewards", ids: settled });
          break;
        }
        case "clips": {
          if (!Array.isArray(msg.clips) || !msg.clips.length) break;
          const ids = msg.clips.map((c) => (typeof c?.id === "string" ? c.id : "")).filter(Boolean);
          const notes = msg.clips.filter((c) => !filed.has(c?.id)).map(noteFromClip).filter((n) => n !== null);
          for (const id of ids) filed.add(id);
          if (notes.length) {
            useFleet.getState().putNotes(notes, []);
            useUi.getState().toast(notes.length === 1 ? `✂ Clipped "${notes[0]!.title}" into the Note Nook.` : `✂ ${notes.length} clips landed in the Note Nook.`, "reward");
          }
          // Malformed ones are acknowledged too, so they don't come back.
          post({ t: "ack-clips", ids });
          break;
        }
      }
    };

    window.addEventListener("message", onMessage);
    post({ t: "hello", version: BRIDGE_PROTOCOL_VERSION });

    const sendVoyage = () => {
      if (!lookout().connected) post({ t: "hello", version: BRIDGE_PROTOCOL_VERSION });
      post({ t: "voyage", voyage: lookoutVoyageState() });
    };
    const sendCards = () => post({ t: "cards", cards: gateCards() });
    const claim = () => {
      if (!lookout().connected) post({ t: "hello", version: BRIDGE_PROTOCOL_VERSION });
      post({ t: "claim-rewards" });
      post({ t: "claim-clips" });
    };

    // Voyage changes go out right away; the heartbeat lets the Lookout notice a closed tab.
    const unVoyage = useVoyage.subscribe((s, prev) => {
      if (s.phase !== prev.phase || s.objective !== prev.objective || s.assignmentId !== prev.assignmentId || s.breakEndsAt !== prev.breakEndsAt) sendVoyage();
    });
    let lastCards = useRecall.getState().cards;
    const unCards = useRecall.subscribe((s) => {
      if (s.cards === lastCards) return;
      lastCards = s.cards;
      sendCards();
    });

    const heartbeat = setInterval(sendVoyage, HEARTBEAT_MS);
    const claimer = setInterval(claim, CLAIM_MS);
    window.addEventListener("focus", claim);

    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("focus", claim);
      clearInterval(heartbeat);
      clearInterval(claimer);
      unVoyage();
      unCards();
    };
  }, []);
}
