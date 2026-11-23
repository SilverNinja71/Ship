// Interactive Ship · Pwedo Pomo Studio planner state: Weekly Plan, Habit Tracker,
// Pomodoro Tracker, die-cut stickers, and Monthly Calendar, persisted locally.

import { create } from "zustand";
import { persist } from "zustand/middleware";
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

export function todayDateKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
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
        useEconomy.getState().earn(5, 20, "Daily Tiny Planner check-in");
        return true;
      },

      openMonthlyStats: (monthKey) =>
        set({ monthlyStatsOpen: true, monthlyStatsTargetMonth: monthKey ?? null }),
      closeMonthlyStats: () => set({ monthlyStatsOpen: false }),
      markMonthlyStatsSeen: (monthKey) => set({ lastMonthlyStatsMonth: monthKey }),
      syncActiveMonth: (monthKey) => set({ lastActiveMonth: monthKey }),
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
