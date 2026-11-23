// Interactive Ship · Pwedo Pomo Studio planner state: Weekly Plan, Habit Tracker,
// Pomodoro Tracker, die-cut stickers, and Monthly Calendar, persisted locally.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { newId } from "../lib/ids.js";
import { localDayKey, moveCard, PLAN_MINUTES, togglePick } from "../lib/kanban.js";
import type { KanbanCard, KanbanColumnId } from "../lib/kanban.js";
import { shipStorage, storageKey } from "../lib/storage.js";
import { useEconomy } from "./economyStore.js";

export const DAYS = ["mon", "tue", "wed", "thur", "fri", "sat", "sun"] as const;
export type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface HabitRow {
  label: string;
  checks: boolean[];
}

export interface PomodoroTask {
  text: string;
  done: boolean;
}

export interface PomodoroSession {
  id: string;
  sessionNumber: string;
  focusMinutes: string;
  breakMinutes: string;
  focusChecks: boolean[];
  breakChecks: boolean[];
  tasks: PomodoroTask[];
  improveNote: string;
}

export interface PlannerState {
  weeklyTitle: string;
  weeklyGoal: string;
  /** YYYY-MM-DD (local Sunday 12:00 am) that the current Weekly Plan started. */
  weekStartedAt: string;
  /** 10 rows x 7 columns (mon..sun). */
  weeklyCells: string[][];
  /** Day index (0..6) -> up to 3 die-cut sticker IDs; resets every Sunday 12:00 am. */
  weeklyStickers: Record<number, string[]>;
  /** Session ID -> up to 3 die-cut sticker IDs. */
  sessionStickers: Record<string, string[]>;
  habits: HabitRow[];
  pomodoros: PomodoroSession[];
  monthTitle: string;
  /** 35 cells (5 weeks x 7 days). */
  monthCells: string[];
  monthNotes: string;
  /** YYYY-MM-DD of last daily check-in reward. */
  lastCheckInDay: string | null;
  /** YYYY-MM of the last month whose end-of-month stats modal was auto-shown. */
  lastMonthlyStatsMonth: string | null;
  /** YYYY-MM of the last month the user was active, for rollover detection. */
  lastActiveMonth: string | null;
  /** Transient modal open state for MonthlyStatsModal. */
  monthlyStatsOpen: boolean;
  /** Optional YYYY-MM target month to display in MonthlyStatsModal. */
  monthlyStatsTargetMonth: string | null;
  /** The Kanban board, in board order. */
  kanban: KanbanCard[];
  /** Local days (YYYY-MM-DD) the sailor finished the 10-minute daily plan; the newest 120. */
  plannedDays: string[];
  /** Today's top 3 card ids, for the day in `picksDay` (stale picks from another day count as none). */
  picks: string[];
  picksDay: string | null;
  /** This device only: the daily plan's step ticks, and its 10-minute timer. */
  planSteps: { day: string; done: boolean[] };
  planTimerEndsAt: number | null;
  /** Milliseconds left while paused. */
  planTimerLeft: number | null;

  setWeeklyTitle(title: string): void;
  setWeeklyGoal(goal: string): void;
  setWeeklyCell(row: number, col: number, text: string): void;
  toggleWeeklySticker(dayIdx: number, stickerId: string): void;
  toggleSessionSticker(sessionId: string, stickerId: string): void;
  checkAndResetWeek(now?: Date): boolean;
  setHabitLabel(row: number, label: string): void;
  toggleHabit(row: number, col: number): void;
  updatePomodoro(index: number, patch: Partial<PomodoroSession>): void;
  togglePomodoroTask(sessionIdx: number, taskIdx: number): void;
  setPomodoroTaskText(sessionIdx: number, taskIdx: number, text: string): void;
  togglePomodoroBox(sessionIdx: number, kind: "focus" | "break", boxIdx: number): void;
  setMonthTitle(title: string): void;
  setMonthCell(index: number, text: string): void;
  setMonthNotes(notes: string): void;
  claimDailyCheckIn(todayKey?: string): boolean;
  openMonthlyStats(monthKey?: string): void;
  closeMonthlyStats(): void;
  markMonthlyStatsSeen(monthKey: string): void;
  syncActiveMonth(monthKey: string): void;
  addKanbanCard(text: string, column?: KanbanColumnId, due?: string | null): KanbanCard | null;
  updateKanbanCard(id: string, patch: Partial<Pick<KanbanCard, "text" | "due">>): void;
  moveKanbanCard(id: string, column: KanbanColumnId, beforeId?: string | null): void;
  deleteKanbanCard(id: string): void;
  clearDoneCards(): void;
  togglePick(id: string): void;
  togglePlanStep(index: number): void;
  startPlanTimer(now?: number): void;
  pausePlanTimer(now?: number): void;
  resetPlanTimer(): void;
  /** Marks today planned and pays the daily reward once. False if today was already planned. */
  finishDailyPlan(): boolean;
}

const PLAN_MS = PLAN_MINUTES * 60_000;

/** Today's picks, or none if they were made on another day. */
export function todaysPicks(s: Pick<PlannerState, "picks" | "picksDay">, today = localDayKey()): string[] {
  return s.picksDay === today ? s.picks : [];
}

export function plannedToday(s: Pick<PlannerState, "plannedDays">, today = localDayKey()): boolean {
  return s.plannedDays.includes(today);
}

function makeEmptyWeeklyCells(): string[][] {
  return Array.from({ length: 10 }, () => Array.from({ length: 7 }, () => ""));
}

function makeDefaultHabits(): HabitRow[] {
  const defaults = [
    "Review flashcards",
    "Read 20 mins",
    "Drink water",
    "Tidy study desk",
    "",
    "",
    "",
    "",
  ];
  return defaults.map((label) => ({ label, checks: Array.from({ length: 7 }, () => false) }));
}

function makeSession(num: number): PomodoroSession {
  return {
    id: `pomo-${num}`,
    sessionNumber: String(num),
    focusMinutes: "25",
    breakMinutes: "5",
    focusChecks: [false, false, false, false],
    breakChecks: [false, false, false, false],
    tasks: Array.from({ length: 5 }, () => ({ text: "", done: false })),
    improveNote: "",
  };
}

/** The sailor's own calendar day (it used to be the UTC day, which rolled over at the wrong hour). */
export function todayDateKey(now = new Date()): string {
  return localDayKey(now);
}

/** Local Sunday 12:00 am week key (YYYY-MM-DD) for auto-resetting the Weekly Plan. */
export function getCurrentWeekStart(now = new Date()): string {
  const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  const y = sunday.getFullYear();
  const m = String(sunday.getMonth() + 1).padStart(2, "0");
  const d = String(sunday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Local YYYY-MM key for monthly stats tracking. */
export function currentMonthKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export const usePlanner = create<PlannerState>()(
  persist(
    (set, get) => ({
      weeklyTitle: "",
      weeklyGoal: "",
      weekStartedAt: getCurrentWeekStart(),
      weeklyCells: makeEmptyWeeklyCells(),
      weeklyStickers: {},
      sessionStickers: {},
      habits: makeDefaultHabits(),
      pomodoros: [makeSession(1), makeSession(2)],
      monthTitle: new Date().toLocaleString("en-US", { month: "long", year: "numeric" }),
      monthCells: Array.from({ length: 35 }, () => ""),
      monthNotes: "",
      lastCheckInDay: null,
      lastMonthlyStatsMonth: null,
      lastActiveMonth: null,
      monthlyStatsOpen: false,
      monthlyStatsTargetMonth: null,
      kanban: [],
      plannedDays: [],
      picks: [],
      picksDay: null,
      planSteps: { day: "", done: [] },
      planTimerEndsAt: null,
      planTimerLeft: null,

      setWeeklyTitle: (weeklyTitle) => set({ weeklyTitle }),
      setWeeklyGoal: (weeklyGoal) => set({ weeklyGoal }),
      setWeeklyCell: (row, col, text) =>
        set((s) => ({
          weeklyCells: s.weeklyCells.map((r, ri) => (ri === row ? r.map((c, ci) => (ci === col ? text : c)) : r)),
        })),
      toggleWeeklySticker: (dayIdx, stickerId) =>
        set((s) => {
          const current = s.weeklyStickers?.[dayIdx] ?? [];
          const next = current.includes(stickerId)
            ? current.filter((id) => id !== stickerId)
            : [...current, stickerId].slice(-3);
          return { weeklyStickers: { ...(s.weeklyStickers ?? {}), [dayIdx]: next } };
        }),
      toggleSessionSticker: (sessionId, stickerId) =>
        set((s) => {
          const current = s.sessionStickers?.[sessionId] ?? [];
          const next = current.includes(stickerId)
            ? current.filter((id) => id !== stickerId)
            : [...current, stickerId].slice(-3);
          return { sessionStickers: { ...(s.sessionStickers ?? {}), [sessionId]: next } };
        }),
      checkAndResetWeek: (now = new Date()) => {
        const currentWeek = getCurrentWeekStart(now);
        if (get().weekStartedAt === currentWeek) return false;
        set({
          weekStartedAt: currentWeek,
          weeklyTitle: "",
          weeklyGoal: "",
          weeklyCells: makeEmptyWeeklyCells(),
          weeklyStickers: {},
        });
        return true;
      },

      setHabitLabel: (row, label) =>
        set((s) => ({
          habits: s.habits.map((h, i) => (i === row ? { ...h, label } : h)),
        })),
      toggleHabit: (row, col) =>
        set((s) => ({
          habits: s.habits.map((h, i) => (i === row ? { ...h, checks: h.checks.map((v, ci) => (ci === col ? !v : v)) } : h)),
        })),

      updatePomodoro: (index, patch) =>
        set((s) => ({
          pomodoros: s.pomodoros.map((p, i) => (i === index ? { ...p, ...patch } : p)),
        })),
      togglePomodoroTask: (sessionIdx, taskIdx) =>
        set((s) => ({
          pomodoros: s.pomodoros.map((p, i) =>
            i === sessionIdx ? { ...p, tasks: p.tasks.map((t, ti) => (ti === taskIdx ? { ...t, done: !t.done } : t)) } : p,
          ),
        })),
      setPomodoroTaskText: (sessionIdx, taskIdx, text) =>
        set((s) => ({
          pomodoros: s.pomodoros.map((p, i) =>
            i === sessionIdx ? { ...p, tasks: p.tasks.map((t, ti) => (ti === taskIdx ? { ...t, text } : t)) } : p,
          ),
        })),
      togglePomodoroBox: (sessionIdx, kind, boxIdx) =>
        set((s) => ({
          pomodoros: s.pomodoros.map((p, i) => {
            if (i !== sessionIdx) return p;
            if (kind === "focus") {
              return { ...p, focusChecks: p.focusChecks.map((v, bi) => (bi === boxIdx ? !v : v)) };
            }
            return { ...p, breakChecks: p.breakChecks.map((v, bi) => (bi === boxIdx ? !v : v)) };
          }),
        })),

      setMonthTitle: (monthTitle) => set({ monthTitle }),
      setMonthCell: (index, text) =>
        set((s) => ({
          monthCells: s.monthCells.map((c, i) => (i === index ? text : c)),
        })),
      setMonthNotes: (monthNotes) => set({ monthNotes }),

      claimDailyCheckIn: (todayKey = todayDateKey()) => {
        if (get().lastCheckInDay === todayKey) return false;
        set({ lastCheckInDay: todayKey });
        useEconomy.getState().earn(5, 20, "Planned the day in Banana Planna");
        return true;
      },

      openMonthlyStats: (monthKey) =>
        set({ monthlyStatsOpen: true, monthlyStatsTargetMonth: monthKey ?? null }),
      closeMonthlyStats: () => set({ monthlyStatsOpen: false }),
      markMonthlyStatsSeen: (monthKey) => set({ lastMonthlyStatsMonth: monthKey }),
      syncActiveMonth: (monthKey) => set({ lastActiveMonth: monthKey }),

      addKanbanCard: (text, column = "todo", due = null) => {
        const clean = text.trim();
        if (!clean) return null;
        const now = Date.now();
        const card: KanbanCard = { id: newId("kanban"), text: clean.slice(0, 500), column, due, createdAt: now, doneAt: column === "done" ? now : null };
        set({ kanban: moveCard([...get().kanban, card], card.id, column) });
        return card;
      },
      updateKanbanCard: (id, patch) =>
        set({ kanban: get().kanban.map((c) => (c.id === id ? { ...c, ...patch, text: patch.text !== undefined ? patch.text.slice(0, 500) : c.text } : c)) }),
      moveKanbanCard: (id, column, beforeId = null) => set({ kanban: moveCard(get().kanban, id, column, beforeId) }),
      deleteKanbanCard: (id) => set({ kanban: get().kanban.filter((c) => c.id !== id), picks: get().picks.filter((p) => p !== id) }),
      clearDoneCards: () => set({ kanban: get().kanban.filter((c) => c.column !== "done") }),
      togglePick: (id) => {
        const today = localDayKey();
        set({ picks: togglePick(todaysPicks(get(), today), id), picksDay: today });
      },
      togglePlanStep: (index) => {
        const today = localDayKey();
        const done = get().planSteps.day === today ? [...get().planSteps.done] : [];
        done[index] = !done[index];
        set({ planSteps: { day: today, done } });
      },
      startPlanTimer: (now = Date.now()) => {
        if (get().planTimerEndsAt !== null && get().planTimerEndsAt! > now) return;
        const left = get().planTimerLeft ?? PLAN_MS;
        set({ planTimerEndsAt: now + (left > 0 ? left : PLAN_MS), planTimerLeft: null });
      },
      pausePlanTimer: (now = Date.now()) => {
        const ends = get().planTimerEndsAt;
        if (ends === null) return;
        set({ planTimerEndsAt: null, planTimerLeft: Math.max(0, ends - now) });
      },
      resetPlanTimer: () => set({ planTimerEndsAt: null, planTimerLeft: null }),
      finishDailyPlan: () => {
        const today = localDayKey();
        if (get().plannedDays.includes(today)) return false;
        set({ plannedDays: [...get().plannedDays, today].slice(-120), planTimerEndsAt: null, planTimerLeft: null });
        get().claimDailyCheckIn(today);
        return true;
      },
    }),
    {
      name: storageKey("planner"),
      storage: shipStorage,
      version: 1,
      partialize: (s) => ({
        weeklyTitle: s.weeklyTitle,
        weeklyGoal: s.weeklyGoal,
        weekStartedAt: s.weekStartedAt,
        weeklyCells: s.weeklyCells,
        weeklyStickers: s.weeklyStickers,
        sessionStickers: s.sessionStickers,
        habits: s.habits,
        pomodoros: s.pomodoros,
        monthTitle: s.monthTitle,
        monthCells: s.monthCells,
        monthNotes: s.monthNotes,
        lastCheckInDay: s.lastCheckInDay,
        lastMonthlyStatsMonth: s.lastMonthlyStatsMonth,
        lastActiveMonth: s.lastActiveMonth,
        kanban: s.kanban,
        plannedDays: s.plannedDays,
        picks: s.picks,
        picksDay: s.picksDay,
        planSteps: s.planSteps,
        planTimerEndsAt: s.planTimerEndsAt,
        planTimerLeft: s.planTimerLeft,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const currentWeek = getCurrentWeekStart();
        if (!state.weekStartedAt) {
          usePlanner.setState({ weekStartedAt: currentWeek });
        } else if (state.weekStartedAt !== currentWeek) {
          state.checkAndResetWeek();
        }
      },
    },
  ),
);
