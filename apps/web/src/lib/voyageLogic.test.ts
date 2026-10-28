import { describe, expect, it } from "vitest";
import type { VoyageRecord } from "@ship/shared-types";
import {
  MINUTE_MS,
  beginShoreLeave,
  blockEndsAt,
  dayKey,
  focusProgress,
  focusedMs,
  fruitForVoyage,
  isBreakOver,
  isFocusDone,
  minutesOnDay,
  pause,
  remainingFocusMs,
  resume,
  startVoyage,
  streakDays,
  unpaidMinutes,
} from "./voyageLogic.js";

const T0 = new Date(2026, 9, 28, 9, 0, 0).getTime();

describe("voyage clock", () => {
  it("counts focus time from timestamps and caps it at the planned length", () => {
    const c = startVoyage("coastal", 25, 5, T0);
    expect(focusedMs(c, T0 + 10 * MINUTE_MS)).toBe(10 * MINUTE_MS);
    expect(remainingFocusMs(c, T0 + 10 * MINUTE_MS)).toBe(15 * MINUTE_MS);
    expect(focusedMs(c, T0 + 90 * MINUTE_MS)).toBe(25 * MINUTE_MS);
    expect(isFocusDone(c, T0 + 25 * MINUTE_MS)).toBe(true);
    expect(blockEndsAt(c, T0)).toBe(T0 + 25 * MINUTE_MS);
  });

  it("stops counting while drifting and picks up again on resume", () => {
    let c = startVoyage("coastal", 25, 5, T0);
    c = pause(c, "idle", T0 + 5 * MINUTE_MS);
    expect(c.phase).toBe("drifting");
    expect(focusedMs(c, T0 + 30 * MINUTE_MS)).toBe(5 * MINUTE_MS);
    expect(focusProgress(c, T0 + 30 * MINUTE_MS)).toBeCloseTo(0.2, 10);
    c = resume(c, T0 + 30 * MINUTE_MS);
    expect(focusedMs(c, T0 + 40 * MINUTE_MS)).toBe(15 * MINUTE_MS);
  });

  it("pays only whole minutes, once each", () => {
    let c = startVoyage("coastal", 25, 5, T0);
    expect(unpaidMinutes(c, T0 + 2.5 * MINUTE_MS)).toBe(2);
    c = { ...c, paidMinutes: 2 };
    expect(unpaidMinutes(c, T0 + 2.9 * MINUTE_MS)).toBe(0);
    expect(unpaidMinutes(c, T0 + 3 * MINUTE_MS)).toBe(1);
  });

  it("goes ashore for the break, then reports when it's over", () => {
    const c = beginShoreLeave(startVoyage("ocean", 50, 10, T0), T0 + 50 * MINUTE_MS);
    expect(c.phase).toBe("shore-leave");
    expect(isBreakOver(c, T0 + 59 * MINUTE_MS)).toBe(false);
    expect(isBreakOver(c, T0 + 60 * MINUTE_MS)).toBe(true);
    expect(beginShoreLeave(startVoyage("custom", 30, 0, T0), T0 + 30 * MINUTE_MS).phase).toBe("docked");
  });

  it("clamps silly custom lengths", () => {
    const c = startVoyage("custom", 9999, -3, T0);
    expect(c.focusMinutes).toBe(240);
    expect(c.breakMinutes).toBe(0);
  });

  it("ripens one fruit per 10 minutes, at least one", () => {
    expect([5, 25, 50].map(fruitForVoyage)).toEqual([1, 2, 5]);
  });
});

describe("streaks and stats", () => {
  const rec = (daysAgo: number, completed = true, minutes = 25): VoyageRecord => {
    const endedAt = new Date(2026, 9, 28 - daysAgo, 15, 0).getTime();
    return { id: `r${daysAgo}${completed}`, startedAt: endedAt - minutes * MINUTE_MS, endedAt, plannedMinutes: 25, focusedMinutes: minutes, completed, shipId: "woolly-wanderer", objective: null };
  };
  const now = new Date(2026, 9, 28, 18, 0).getTime();

  it("counts consecutive calendar days with a completed voyage", () => {
    expect(streakDays([rec(0), rec(1), rec(2), rec(4)], now)).toBe(3);
  });

  it("keeps yesterday's streak alive until today ends", () => {
    expect(streakDays([rec(1), rec(2)], now)).toBe(2);
  });

  it("ignores abandoned voyages for streaks", () => {
    expect(streakDays([rec(0, false), rec(1)], now)).toBe(1);
    expect(streakDays([rec(0, false)], now)).toBe(0);
  });

  it("adds up today's minutes, abandoned voyages included", () => {
    expect(minutesOnDay([rec(0, true, 25), rec(0, false, 7), rec(1)], now)).toBe(32);
  });

  it("uses local calendar days", () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59).getTime())).toBe("2026-01-05");
  });
});
