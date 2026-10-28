// The small stateful pieces: verdict cache, reward queue, daily stats,
// leisure passes and the staleness rule.

import { describe, expect, it } from "vitest";
import { STEER_BACK_BONUS, type LookoutRewardEvent, type LookoutVerdict, type LookoutVoyageState } from "@ship/shared-types";
import { ENDS_AT_GRACE_MS, HEARTBEAT_STALE_MS, STEER_BACK_COOLDOWN_MS } from "./constants.js";
import { activePass, grantPass, prunePasses } from "./passes.js";
import { ackRewards, claimRewards, enqueueReward, makeReward, newRewardId, pendingDoubloons, steerBackPayout } from "./rewards.js";
import { bumpStat, currentStats, emptyStats, localDayKey, normalizeStats, statsView } from "./stats.js";
import { getCachedVerdict, normalizeVerdictCache, putCachedVerdict, verdictCacheKey } from "./verdictCache.js";
import { guardKey, guardStatus, isGuarding, studyContext, studyContextKey, type StoredVoyage } from "./voyage.js";

const T0 = new Date(2026, 9, 28, 14, 0, 0).getTime();
const MIN = 60_000;

describe("verdict cache", () => {
  const blocked: LookoutVerdict = { decision: "BLOCKED", reason: "Gaming.", confidence: 0.9, source: "gemini" };

  it("returns a remembered verdict labeled as from the cache", () => {
    const key = verdictCacheKey("vid", "ctx");
    const cache = putCachedVerdict({}, key, blocked, T0);
    expect(getCachedVerdict(cache, key, T0 + MIN)).toEqual({ ...blocked, source: "cache" });
  });

  it("keys on the study context, so a new assignment asks again", () => {
    const cache = putCachedVerdict({}, verdictCacheKey("vid", "biology"), blocked, T0);
    expect(getCachedVerdict(cache, verdictCacheKey("vid", "history"), T0)).toBeNull();
  });

  it("expires entries", () => {
    const cache = putCachedVerdict({}, "k", blocked, T0);
    expect(getCachedVerdict(cache, "k", T0 + 13 * 60 * MIN)).toBeNull();
  });

  it("evicts the oldest entries past the cap", () => {
    let cache = {};
    for (let i = 0; i < 5; i++) cache = putCachedVerdict(cache, `k${i}`, blocked, T0 + i, 3);
    expect(Object.keys(cache)).toEqual(["k2", "k3", "k4"]);
  });

  it("drops malformed stored entries", () => {
    const cache = normalizeVerdictCache({ good: { verdict: blocked, at: T0 }, bad: { verdict: { decision: "MAYBE" }, at: T0 }, worse: 3 });
    expect(Object.keys(cache)).toEqual(["good"]);
  });
});

describe("reward queue", () => {
  const ev = (id: string, doubloons = 0, at = T0): LookoutRewardEvent => makeReward(doubloons ? "steer-back" : "blocked", "youtube.com", doubloons, at, id);

  it("queues events and ignores a repeated id", () => {
    let q = enqueueReward([], ev("a", 50));
    q = enqueueReward(q, ev("a", 50));
    q = enqueueReward(q, ev("b"));
    expect(q.map((e) => e.id)).toEqual(["a", "b"]);
    expect(pendingDoubloons(q)).toBe(50);
  });

  it("claims everything, oldest first, without removing it", () => {
    const q = [ev("late", 0, T0 + 5), ev("early", 0, T0)];
    expect(claimRewards(q).map((e) => e.id)).toEqual(["early", "late"]);
    expect(q).toHaveLength(2);
  });

  it("drops only acked ids", () => {
    const q = [ev("a", 50), ev("b"), ev("c")];
    expect(ackRewards(q, ["a", "c", "unknown"]).map((e) => e.id)).toEqual(["b"]);
  });

  it("when full, drops stats-only events before paying ones", () => {
    let q: LookoutRewardEvent[] = [];
    q = enqueueReward(q, ev("pay1", 50), 3);
    q = enqueueReward(q, ev("free1"), 3);
    q = enqueueReward(q, ev("pay2", 50), 3);
    q = enqueueReward(q, ev("pay3", 50), 3);
    expect(q.map((e) => e.id)).toEqual(["pay1", "pay2", "pay3"]);
    q = enqueueReward(q, ev("pay4", 50), 3);
    expect(q.map((e) => e.id)).toEqual(["pay2", "pay3", "pay4"]);
  });

  it("makes unique, time-ordered ids", () => {
    let n = 0;
    const ids = new Set(Array.from({ length: 50 }, () => newRewardId(T0, () => String(n++))));
    expect(ids.size).toBe(50);
    expect(newRewardId(T0, () => "x")).toMatch(/^lookout-[a-z0-9]+-x$/);
  });

  it("pays the steer-back bonus once per cooldown", () => {
    expect(steerBackPayout(null, T0)).toBe(STEER_BACK_BONUS);
    expect(steerBackPayout(T0, T0 + STEER_BACK_COOLDOWN_MS - 1)).toBe(0);
    expect(steerBackPayout(T0, T0 + STEER_BACK_COOLDOWN_MS)).toBe(STEER_BACK_BONUS);
  });
});

describe("daily stats", () => {
  it("uses the local calendar day", () => {
    expect(localDayKey(new Date(2026, 0, 5, 23, 59).getTime())).toBe("2026-01-05");
    expect(localDayKey(new Date(2026, 0, 6, 0, 0).getTime())).toBe("2026-01-06");
  });

  it("counts and resets at local midnight", () => {
    const evening = new Date(2026, 9, 28, 23, 58).getTime();
    const morning = new Date(2026, 9, 29, 0, 1).getTime();
    let s = bumpStat(emptyStats(evening), "blocked", evening);
    s = bumpStat(s, "blocked", evening);
    s = bumpStat(s, "steeredBack", evening);
    expect(statsView(s, evening, true)).toEqual({ blockedToday: 2, steeredBackToday: 1, leisurePassesToday: 0, geminiReady: true });
    expect(statsView(s, morning, false)).toEqual({ blockedToday: 0, steeredBackToday: 0, leisurePassesToday: 0, geminiReady: false });
    expect(bumpStat(s, "leisurePasses", morning)).toEqual({ day: "2026-10-29", blocked: 0, steeredBack: 0, leisurePasses: 1 });
  });

  it("keeps the same object when the day hasn't changed", () => {
    const s = emptyStats(T0);
    expect(currentStats(s, T0 + MIN)).toBe(s);
  });

  it("cleans stored values", () => {
    expect(normalizeStats({ day: "2026-10-28", blocked: -2, steeredBack: 3.7, leisurePasses: "x" }, T0)).toEqual({ day: "2026-10-28", blocked: 0, steeredBack: 3, leisurePasses: 0 });
    expect(normalizeStats(null, T0)).toEqual(emptyStats(T0));
  });
});

describe("leisure passes", () => {
  it("open a site for a few minutes", () => {
    const { passes, until } = grantPass({}, "youtube.com", T0, 5);
    expect(until).toBe(T0 + 5 * MIN);
    expect(activePass(passes, "youtube.com", T0 + 4 * MIN)).toBe(until);
    expect(activePass(passes, "youtube.com", T0 + 5 * MIN)).toBeNull();
    expect(activePass(passes, "reddit.com", T0)).toBeNull();
    expect(prunePasses(passes, T0 + 6 * MIN)).toEqual({});
  });
});

describe("staleness", () => {
  const state = (over: Partial<LookoutVoyageState> = {}): LookoutVoyageState => ({
    phase: "sailing",
    guarding: true,
    endsAt: T0 + 25 * MIN,
    objective: "Finish the discussion",
    assignment: { title: "Enzyme lab", course: "BIO 201" },
    updatedAt: T0,
    ...over,
  });
  const stored = (over: Partial<LookoutVoyageState> = {}, receivedAt = T0): StoredVoyage => ({ state: state(over), receivedAt });

  it("guards a running focus block with a fresh heartbeat", () => {
    expect(guardStatus(stored(), T0 + MIN)).toBe("guarding");
    expect(isGuarding(stored(), T0 + HEARTBEAT_STALE_MS)).toBe(true);
  });

  it("stops when Ship isn't guarding", () => {
    expect(guardStatus(null, T0)).toBe("no-voyage");
    expect(guardStatus(stored({ phase: "shore-leave", guarding: false }), T0)).toBe("not-focus");
  });

  it("stops when the heartbeat goes quiet", () => {
    expect(guardStatus(stored(), T0 + HEARTBEAT_STALE_MS + 1)).toBe("stale");
  });

  it("stops a couple of minutes after endsAt, even with heartbeats", () => {
    const end = T0 + 25 * MIN;
    expect(guardStatus(stored({}, end), end + ENDS_AT_GRACE_MS)).toBe("guarding");
    expect(guardStatus(stored({}, end + ENDS_AT_GRACE_MS), end + ENDS_AT_GRACE_MS + 1)).toBe("ended");
  });

  it("guards an open-ended block (no endsAt) while heartbeats arrive", () => {
    expect(isGuarding(stored({ endsAt: null }, T0 + 60 * MIN), T0 + 61 * MIN)).toBe(true);
  });

  it("changes the guard key when guarding or the study context changes", () => {
    const a = guardKey(stored(), T0);
    expect(a.startsWith("on|")).toBe(true);
    expect(guardKey(stored({ objective: "Other" }), T0)).not.toBe(a);
    expect(guardKey(stored({ endsAt: T0 + 30 * MIN }), T0)).toBe(a);
    expect(guardKey(stored({ guarding: false }), T0)).toBe("off");
    expect(guardKey(null, T0)).toBe("off");
  });

  it("normalizes the study context key", () => {
    expect(studyContextKey(studyContext(state({ objective: "  FINISH, the discussion! " })))).toBe(studyContextKey(studyContext(state({ objective: "finish the discussion" }))));
  });
});
