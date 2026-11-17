// Interactive Mr. Tiny Studio-style planner state: Weekly Plan, Habit Tracker,
// Pomodoro Tracker, and Monthly Calendar, persisted locally with a daily
// check-in reward to encourage regular use.

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
  /** 10 rows x 7 columns (mon..sun). */
  weeklyCells: string[][];
  habits: HabitRow[];
  pomodoros: PomodoroSession[];
  monthTitle: string;
  /** 35 cells (5 weeks x 7 days). */
  monthCells: string[];
  monthNotes: string;
  /** YYYY-MM-DD of last daily check-in reward. */
  lastCheckInDay: string | null;

  setWeeklyTitle(title: string): void;
  setWeeklyGoal(goal: string): void;
  setWeeklyCell(row: number, col: number, text: string): void;
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

export const usePlanner = create<PlannerState>()(
  persist(
    (set, get) => ({
      weeklyTitle: "",
      weeklyGoal: "",
      weeklyCells: makeEmptyWeeklyCells(),
      habits: makeDefaultHabits(),
      pomodoros: [makeSession(1), makeSession(2)],
      monthTitle: new Date().toLocaleString("en-US", { month: "long", year: "numeric" }),
      monthCells: Array.from({ length: 35 }, () => ""),
      monthNotes: "",
      lastCheckInDay: null,

      setWeeklyTitle: (weeklyTitle) => set({ weeklyTitle }),
      setWeeklyGoal: (weeklyGoal) => set({ weeklyGoal }),
      setWeeklyCell: (row, col, text) =>
        set((s) => ({
          weeklyCells: s.weeklyCells.map((r, ri) => (ri === row ? r.map((c, ci) => (ci === col ? text : c)) : r)),
        })),

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
    }),
    { name: storageKey("planner"), storage: shipStorage, version: 1 },
  ),
);
