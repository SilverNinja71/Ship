// The voyage timer, its records, and the citrus tree that grows with it.
// Rewards are paid as each focused minute is earned, so abandoning a voyage
// keeps what was already sailed; finishing adds the completion bonus.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DOUBLOONS_PER_FOCUS_MINUTE, VOYAGE_COMPLETION_BONUS, VOYAGE_PRESETS, XP_PER_FOCUS_MINUTE, ZEST_COIN_VALUE } from "@ship/shared-types";
import type { VoyagePresetId, VoyageRecord } from "@ship/shared-types";
import { newId } from "../lib/ids.js";
import { shipStorage, storageKey } from "../lib/storage.js";
import {
  DOCKED,
  beginShoreLeave,
  dock,
  focusedMs,
  fruitForVoyage,
  isBreakOver,
  isFocusDone,
  makeRecord,
  pause,
  resume,
  startVoyage,
  unpaidMinutes,
} from "../lib/voyageLogic.js";
import type { PauseReason, VoyageClock } from "../lib/voyageLogic.js";
import { useCustomizer } from "./shipCustomizer.js";
import { useEconomy } from "./economyStore.js";

/** Resting between voyages, blooming while one runs, wilted after one is abandoned. */
export type TreeState = "resting" | "blooming" | "wilted";

export interface CitrusTree {
  state: TreeState;
  /** Ripe fruit waiting to be picked (one zest coin each). */
  fruit: number;
}

export type VoyageEventKind = "started" | "focus-complete" | "break-over" | "abandoned";

export interface VoyageStartOptions {
  presetId: VoyagePresetId;
  focusMinutes?: number;
  breakMinutes?: number;
  objective?: string | null;
  assignmentId?: string | null;
}

export interface VoyageState extends VoyageClock {
  objective: string | null;
  assignmentId: string | null;
  records: VoyageRecord[];
  tree: CitrusTree;
  start(opts: VoyageStartOptions): void;
  pause(reason?: PauseReason): void;
  resume(): void;
  /** Ends the voyage early. Minutes already sailed stay paid; the tree wilts. */
  abandon(): void;
  /** Cuts shore leave short and docks. */
  endBreak(): void;
  /** Advances the clock to `now`: pays new minutes and moves between phases. */
  tick(now?: number): void;
  /** Picks the ripe fruit and returns the doubloons it paid. */
  harvest(): number;
}

type Listener<T> = (value: T) => void;
const minuteListeners = new Set<Listener<number>>();
const eventListeners = new Set<Listener<VoyageEventKind>>();

/** Called with each batch of newly paid focus minutes (the crew quest listens). */
export function onFocusMinutes(fn: Listener<number>): () => void {
  minuteListeners.add(fn);
  return () => minuteListeners.delete(fn);
}

/** Called when a voyage starts, finishes, docks or is abandoned (chimes and toasts listen). */
export function onVoyageEvent(fn: Listener<VoyageEventKind>): () => void {
  eventListeners.add(fn);
  return () => eventListeners.delete(fn);
}

const emit = <T>(set: Set<Listener<T>>, value: T) => set.forEach((fn) => fn(value));

const MAX_RECORDS = 1000;

function clockOf(s: VoyageState): VoyageClock {
  const { phase, presetId, focusMinutes, breakMinutes, voyageStartedAt, segmentStartedAt, bankedMs, pausedReason, breakEndsAt, paidMinutes } = s;
  return { phase, presetId, focusMinutes, breakMinutes, voyageStartedAt, segmentStartedAt, bankedMs, pausedReason, breakEndsAt, paidMinutes };
}

function payMinutes(minutes: number): void {
  if (minutes <= 0) return;
  useEconomy.getState().earn(minutes * DOUBLOONS_PER_FOCUS_MINUTE, minutes * XP_PER_FOCUS_MINUTE, `Sailed ${minutes} focus minute${minutes === 1 ? "" : "s"}`);
  emit(minuteListeners, minutes);
}

export const useVoyage = create<VoyageState>()(
  persist(
    (set, get) => {
      const record = (completed: boolean, now: number): VoyageRecord[] => {
        const s = get();
        const r = makeRecord(clockOf(s), now, completed, useCustomizer.getState().activeShipId, s.objective, newId("voyage"));
        return [...s.records, r].slice(-MAX_RECORDS);
      };

      /** Pays any whole minutes earned up to `now` and returns the clock with them marked paid. */
      const settle = (now: number): VoyageClock => {
        const clock = clockOf(get());
        const minutes = unpaidMinutes(clock, now);
        if (minutes > 0) {
          payMinutes(minutes);
          set({ paidMinutes: clock.paidMinutes + minutes });
        }
        return clockOf(get());
      };

      return {
        ...DOCKED,
        objective: null,
        assignmentId: null,
        records: [],
        tree: { state: "resting", fruit: 0 },

        start: (opts) => {
          const s = get();
          if (s.phase === "sailing" || s.phase === "drifting") return;
          const preset = VOYAGE_PRESETS[opts.presetId];
          const clock = startVoyage(opts.presetId, opts.focusMinutes ?? preset.focusMinutes, opts.breakMinutes ?? preset.breakMinutes, Date.now());
          set({ ...clock, objective: opts.objective?.trim() || null, assignmentId: opts.assignmentId ?? null, tree: { ...s.tree, state: "blooming" } });
          emit(eventListeners, "started");
        },

        pause: (reason = "manual") => {
          const now = Date.now();
          settle(now);
          set(pause(clockOf(get()), reason, now));
        },

        resume: () => set(resume(clockOf(get()), Date.now())),

        abandon: () => {
          const s = get();
          if (s.phase === "shore-leave") return get().endBreak();
          if (s.phase !== "sailing" && s.phase !== "drifting") return;
          const now = Date.now();
          const clock = settle(now);
          const sailed = focusedMs(clock, now) >= 60_000;
          set({
            ...dock(clock),
            records: sailed ? record(false, now) : get().records,
            tree: { ...get().tree, state: "wilted" },
            objective: null,
            assignmentId: null,
          });
          emit(eventListeners, "abandoned");
        },

        endBreak: () => {
          if (get().phase !== "shore-leave") return;
          set({ ...dock(clockOf(get())), objective: null, assignmentId: null });
          emit(eventListeners, "break-over");
        },

        tick: (now = Date.now()) => {
          const s = get();
          if (s.phase === "sailing" || s.phase === "drifting") {
            const clock = settle(now);
            if (isFocusDone(clock, now)) {
              useEconomy.getState().earn(VOYAGE_COMPLETION_BONUS, 0, "Voyage complete!");
              const records = record(true, now);
              const next = beginShoreLeave(clock, now);
              const tree: CitrusTree = { state: "resting", fruit: get().tree.fruit + fruitForVoyage(clock.focusMinutes) };
              set({ ...next, records, tree, ...(next.phase === "docked" ? { objective: null, assignmentId: null } : {}) });
              emit(eventListeners, "focus-complete");
            }
          } else if (isBreakOver(clockOf(s), now)) {
            set({ ...dock(clockOf(s)), objective: null, assignmentId: null });
            emit(eventListeners, "break-over");
          }
        },

        harvest: () => {
          const { fruit, state } = get().tree;
          if (fruit <= 0) return 0;
          const coins = fruit * ZEST_COIN_VALUE;
          useEconomy.getState().earn(coins, 0, `Picked ${fruit} zesty citrus`);
          set({ tree: { state, fruit: 0 } });
          return coins;
        },
      };
    },
    {
      name: storageKey("voyage"),
      storage: shipStorage,
      version: 1,
      partialize: (s) => ({ ...clockOf(s), objective: s.objective, assignmentId: s.assignmentId, records: s.records, tree: s.tree }),
    },
  ),
);
