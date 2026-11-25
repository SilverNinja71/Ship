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
  focusEndsAt,
  fruitForVoyage,
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
  cycles?: number;
  prep?: boolean;
  /** With `prep`: when the prep minute ends (local ms), so a crew can start together. Capped at 5 minutes ahead; a time already past starts at once. */
  prepUntil?: number;
  objective?: string | null;
  assignmentId?: string | null;
}

export interface SessionTask {
  id: string;
  text: string;
  done: boolean;
}

export interface BreakReflection {
  id: string;
  at: number;
  cycle: number;
  howWasSession: string;
  whatWorked: string;
  nextAdjustment: string;
}

export interface VoyageState extends VoyageClock {
  objective: string | null;
  assignmentId: string | null;
  records: VoyageRecord[];
  tree: CitrusTree;
  prepEndsAt: number | null;
  cyclesTotal: number;
  cyclesCompleted: number;
  showBreakReflection: boolean;
  breakReflections: BreakReflection[];
  sessionTasks: SessionTask[];
  start(opts: VoyageStartOptions): void;
  skipPrep(): void;
  cancelPrep(): void;
  pause(reason?: PauseReason): void;
  resume(): void;
  /** Ends the voyage early. Minutes already sailed stay paid; the tree wilts. */
  abandon(): void;
  /** Cuts shore leave short and docks (or starts next cycle). */
  endBreak(): void;
  /** Advances the clock to `now`: pays new minutes and moves between phases. */
  tick(now?: number): void;
  /** Picks the ripe fruit and returns the doubloons it paid. */
  harvest(): number;
  addSessionTask(text: string): void;
  toggleSessionTask(id: string): void;
  removeSessionTask(id: string): void;
  submitBreakReflection(entry: Omit<BreakReflection, "id" | "at" | "cycle">): void;
  dismissBreakReflection(): void;
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
/** At most this many timer changes in one tick (8 legs of focus and break, plus the prep). */
const MAX_CATCH_UP = 20;

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
        prepEndsAt: null,
        cyclesTotal: 2,
        cyclesCompleted: 0,
        showBreakReflection: false,
        breakReflections: [],
        sessionTasks: [],

        start: (opts) => {
          const s = get();
          if (s.phase === "sailing" || s.phase === "drifting" || s.prepEndsAt !== null) return;
          const preset = VOYAGE_PRESETS[opts.presetId];
          const focusMinutes = opts.focusMinutes ?? preset.focusMinutes;
          const breakMinutes = opts.breakMinutes ?? preset.breakMinutes;
          const cycles = Math.max(1, Math.min(8, opts.cycles ?? 1));
          const now = Date.now();
          const prepEndsAt = !opts.prep ? null : opts.prepUntil === undefined ? now + 60_000 : Math.min(opts.prepUntil, now + 300_000);
          if (prepEndsAt !== null && prepEndsAt > now) {
            set({
              presetId: opts.presetId,
              focusMinutes,
              breakMinutes,
              cyclesTotal: cycles,
              cyclesCompleted: 0,
              prepEndsAt,
              objective: opts.objective?.trim() || null,
              assignmentId: opts.assignmentId ?? null,
              showBreakReflection: false,
            });
            return;
          }
          const clock = startVoyage(opts.presetId, focusMinutes, breakMinutes, now);
          set({
            ...clock,
            prepEndsAt: null,
            cyclesTotal: cycles,
            cyclesCompleted: 0,
            showBreakReflection: false,
            objective: opts.objective?.trim() || null,
            assignmentId: opts.assignmentId ?? null,
            tree: { ...s.tree, state: "blooming" },
          });
          emit(eventListeners, "started");
        },

        skipPrep: () => {
          const s = get();
          if (s.prepEndsAt === null) return;
          const clock = startVoyage(s.presetId, s.focusMinutes, s.breakMinutes, Date.now());
          set({ ...clock, prepEndsAt: null, tree: { ...s.tree, state: "blooming" } });
          emit(eventListeners, "started");
        },

        cancelPrep: () => {
          set({ prepEndsAt: null });
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
          const s = get();
          if (s.phase !== "shore-leave") return;
          if (s.cyclesCompleted < s.cyclesTotal) {
            const clock = startVoyage(s.presetId, s.focusMinutes, s.breakMinutes, Date.now());
            set({ ...clock, showBreakReflection: false, tree: { ...s.tree, state: "blooming" } });
            emit(eventListeners, "started");
            return;
          }
          set({ ...dock(clockOf(s)), objective: null, assignmentId: null, showBreakReflection: false });
          emit(eventListeners, "break-over");
        },

        tick: (now = Date.now()) => {
          // Each change happens at its planned time, not whenever the tick finally runs: a phone that
          // slept (or a tab the browser froze) wakes in step with a crew that started together. The
          // focus block starts when the prep ended, the break when the block was planned to end, and
          // the next leg when the break was. Several changes due at once (a long sleep) all happen.
          for (let step = 0; step < MAX_CATCH_UP; step++) {
            const s = get();
            if (s.phase === "docked" && s.prepEndsAt !== null) {
              if (now < s.prepEndsAt) return;
              const clock = startVoyage(s.presetId, s.focusMinutes, s.breakMinutes, s.prepEndsAt);
              set({ ...clock, prepEndsAt: null, tree: { ...s.tree, state: "blooming" } });
              emit(eventListeners, "started");
              continue;
            }
            if (s.phase === "sailing" || s.phase === "drifting") {
              const endsAt = focusEndsAt(clockOf(s));
              if (endsAt === null || now < endsAt) {
                settle(now);
                return;
              }
              const clock = settle(endsAt);
              useEconomy.getState().earn(VOYAGE_COMPLETION_BONUS, 0, "Voyage complete!");
              const records = record(true, endsAt);
              const next = beginShoreLeave(clock, endsAt);
              const cyclesCompleted = s.cyclesCompleted + 1;
              const tree: CitrusTree = { state: "resting", fruit: get().tree.fruit + fruitForVoyage(clock.focusMinutes) };
              set({
                ...next,
                records,
                tree,
                cyclesCompleted,
                showBreakReflection: next.phase === "shore-leave",
                ...(next.phase === "docked" ? { objective: null, assignmentId: null } : {}),
              });
              emit(eventListeners, "focus-complete");
              continue;
            }
            if (s.phase === "shore-leave" && s.breakEndsAt !== null && now >= s.breakEndsAt) {
              if (s.cyclesCompleted < s.cyclesTotal) {
                const clock = startVoyage(s.presetId, s.focusMinutes, s.breakMinutes, s.breakEndsAt);
                set({ ...clock, showBreakReflection: false, tree: { ...s.tree, state: "blooming" } });
                emit(eventListeners, "started");
                continue;
              }
              set({ ...dock(clockOf(s)), objective: null, assignmentId: null, showBreakReflection: false });
              emit(eventListeners, "break-over");
            }
            return;
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

        addSessionTask: (text) => {
          const trimmed = text.trim();
          if (!trimmed) return;
          set((s) => ({
            sessionTasks: [...s.sessionTasks, { id: newId("task"), text: trimmed, done: false }],
          }));
        },

        toggleSessionTask: (id) => {
          set((s) => ({
            sessionTasks: s.sessionTasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
          }));
        },

        removeSessionTask: (id) => {
          set((s) => ({
            sessionTasks: s.sessionTasks.filter((t) => t.id !== id),
          }));
        },

        submitBreakReflection: (entry) => {
          const s = get();
          const item: BreakReflection = {
            id: newId("reflect"),
            at: Date.now(),
            cycle: s.cyclesCompleted,
            ...entry,
          };
          set({
            breakReflections: [item, ...s.breakReflections].slice(0, 100),
            showBreakReflection: false,
          });
        },

        dismissBreakReflection: () => set({ showBreakReflection: false }),
      };
    },
    {
      name: storageKey("voyage"),
      storage: shipStorage,
      version: 1,
      partialize: (s) => ({
        ...clockOf(s),
        objective: s.objective,
        assignmentId: s.assignmentId,
        records: s.records,
        tree: s.tree,
        prepEndsAt: s.prepEndsAt,
        cyclesTotal: s.cyclesTotal,
        cyclesCompleted: s.cyclesCompleted,
        breakReflections: s.breakReflections,
        sessionTasks: s.sessionTasks,
      }),
    },
  ),
);
