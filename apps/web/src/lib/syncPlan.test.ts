import { describe, expect, it } from "vitest";
import {
  SYNCED_FIELDS,
  decideKey,
  docIdForKey,
  keyForDocId,
  localHasProgress,
  mergeIntoLocal,
  packNote,
  parseMeta,
  planNotes,
  projectForSync,
  remoteBeatsPending,
  stableStringify,
  syncFingerprint,
  unpackNote,
} from "./syncPlan.js";

const saved = (state: Record<string, unknown>, version = 1) => JSON.stringify({ state, version });

describe("what syncs", () => {
  it("never sends secrets, device settings or the live timer", () => {
    const settings = projectForSync("ship:settings", {
      state: { geminiApiKey: "AIza-secret", geminiModel: "x", soundOn: true, crewServer: "http://localhost:8787", view: "quarters", scheduler: "fsrs", visualStyle: "storybook" },
      version: 1,
    });
    expect(settings.state).toEqual({ scheduler: "fsrs", visualStyle: "storybook" });

    const fleet = projectForSync("ship:fleet", {
      state: { settings: { todoist: { token: "t0ken" } }, calendarFeedUrl: "https://feed?key=secret", statuses: {}, assignments: [1], library: [], done: {} },
      version: 1,
    });
    expect(JSON.stringify(fleet)).not.toMatch(/t0ken|secret/);
    expect(Object.keys(fleet.state)).toEqual(["assignments", "library", "done"]);

    const voyage = projectForSync("ship:voyage", { state: { phase: "sailing", segmentStartedAt: 5, paidMinutes: 3, records: [], tree: {} }, version: 1 });
    expect(Object.keys(voyage.state)).toEqual(["records", "tree"]);
  });

  it("carries the daily room cap, but never the Study Rooms store", () => {
    const economy = projectForSync("ship:economy", {
      state: { doubloons: 5, paidRewardIds: ["room:K7MP2QXA:1:beast:0"], roomEarnings: { day: "2026-11-24", doubloons: 20, xp: 50 } },
      version: 1,
    });
    expect(economy.state.roomEarnings).toEqual({ day: "2026-11-24", doubloons: 20, xp: 50 });
    expect(economy.state.paidRewardIds).toEqual(["room:K7MP2QXA:1:beast:0"]);
    // Recent room codes work as invite keys, so ship:rooms stays on this device.
    expect(Object.keys(SYNCED_FIELDS)).not.toContain("ship:rooms");
    expect(projectForSync("ship:rooms", { state: { current: "K7MP2QXA", recent: [] }, version: 1 }).state).toEqual({});
  });

  it("only knows the stores it lists", () => {
    expect(projectForSync("ship:crew", { state: { ghosts: [] }, version: 1 }).state).toEqual({});
    expect(Object.keys(SYNCED_FIELDS)).not.toContain("ship:crew");
    expect(docIdForKey("ship:planner")).toBe("planner");
    expect(keyForDocId("planner")).toBe("ship:planner");
  });

  it("lays a cloud copy over this browser's own, keeping its device fields", () => {
    const local = { state: { soundOn: true, geminiApiKey: "mine", scheduler: "sm2" }, version: 1 };
    const remote = { state: { scheduler: "fsrs", geminiApiKey: "theirs", soundOn: false }, version: 1 };
    expect(mergeIntoLocal("ship:settings", local, remote)).toEqual({ state: { soundOn: true, geminiApiKey: "mine", scheduler: "fsrs" }, version: 1 });
    expect(mergeIntoLocal("ship:settings", null, remote).state).toEqual({ scheduler: "fsrs" });
  });

  it("fingerprints the synced part only, whatever the key order", () => {
    const a = saved({ records: [{ id: "r1", a: 1, b: 2 }], phase: "sailing" });
    const b = saved({ phase: "docked", records: [{ b: 2, a: 1, id: "r1" }] });
    expect(syncFingerprint("ship:voyage", a)).toBe(syncFingerprint("ship:voyage", b));
    expect(syncFingerprint("ship:voyage", saved({ records: [] }))).not.toBe(syncFingerprint("ship:voyage", a));
    expect(syncFingerprint("ship:voyage", null)).toBe("");
    expect(stableStringify({ b: [1, { d: 1, c: undefined }], a: null })).toBe('{"a":null,"b":[1,{"d":1}]}');
  });
});

describe("who wins", () => {
  const meta = { hash: "h1", rev: "r1" };
  const remote = (rev: string, updatedAt = 1000) => ({ persisted: { state: {}, version: 1 }, rev, updatedAt });

  it("does nothing when neither side moved", () => {
    expect(decideKey("h1", meta, remote("r1"))).toBe("none");
  });

  it("sends a change only this browser made, and takes one only the cloud has", () => {
    expect(decideKey("h2", meta, remote("r1"))).toBe("push");
    expect(decideKey("h1", meta, remote("r2"))).toBe("pull");
  });

  it("gives a clash to the later change", () => {
    expect(decideKey("h2", { ...meta, dirtyAt: 500 }, remote("r2", 1000))).toBe("pull");
    expect(decideKey("h2", { ...meta, dirtyAt: 2000 }, remote("r2", 1000))).toBe("push");
  });

  it("treats a local change with no time (a restored backup) as the later one", () => {
    expect(decideKey("h2", meta, remote("r2", 9e12))).toBe("push");
  });

  it("fills an empty side from the other", () => {
    expect(decideKey("h1", meta, null)).toBe("push");
    expect(decideKey("", meta, null)).toBe("none");
    expect(decideKey("", meta, remote("r1"))).toBe("pull");
    expect(decideKey("h9", undefined, remote("r5"))).toBe("pull");
  });

  it("lets an incoming change replace an unsent older one", () => {
    expect(remoteBeatsPending(2000, 1000)).toBe(true);
    expect(remoteBeatsPending(1000, 2000)).toBe(false);
    expect(remoteBeatsPending(1000, undefined)).toBe(true);
  });
});

describe("notes", () => {
  it("tells new notes from deleted ones by what the last sync saw", () => {
    expect(planNotes(["a", "b", "c"], ["a", "d", "e"], ["a", "c", "e"])).toEqual({ upload: ["b"], download: ["d"], deleteLocal: ["c"], deleteRemote: ["e"] });
  });

  it("deletes nothing on a first sync", () => {
    expect(planNotes(["a", "b"], ["b", "c"], null)).toEqual({ upload: ["a"], download: ["c"], deleteLocal: [], deleteRemote: [] });
  });

  it("travel compressed and come back whole", async () => {
    const note = { id: "file:1", source: "file" as const, title: "Lecture 1", subject: null, created: null, modified: null, pages: [{ id: "1", text: "Cells ".repeat(5000) }] };
    const bytes = await packNote(note);
    expect(bytes.length).toBeLessThan(2000);
    expect(await unpackNote(bytes)).toEqual(note);
    expect(await unpackNote(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe("a browser's first sync", () => {
  const store = (entries: Record<string, string>) => (key: string) => entries[key] ?? null;

  it("calls a fresh visitor's defaults empty", () => {
    const fresh = store({
      "ship:planner": saved({ weeklyCells: [["", ""]], habits: [{ label: "Drink water", checks: [false, false] }], pomodoros: [{ tasks: [{ text: "", done: false }], improveNote: "" }] }),
      "ship:economy": saved({ doubloons: 0, xp: 0 }),
      "ship:settings": saved({ soundOn: true }),
    });
    expect(localHasProgress(fresh, 0)).toBe(false);
  });

  it("sees real progress anywhere it can be", () => {
    expect(localHasProgress(store({ "ship:economy": saved({ doubloons: 4 }) }), 0)).toBe(true);
    expect(localHasProgress(store({ "ship:voyage": saved({ records: [{}] }) }), 0)).toBe(true);
    expect(localHasProgress(store({ "ship:planner": saved({ habits: [{ label: "x", checks: [true] }] }) }), 0)).toBe(true);
    expect(localHasProgress(store({ "ship:planner": saved({ weeklyCells: [["", "Essay"]] }) }), 0)).toBe(true);
    expect(localHasProgress(store({}), 2)).toBe(true);
  });

  it("reads its own bookkeeping back, and ignores anything else", () => {
    expect(parseMeta(JSON.stringify({ uid: "u", keys: {}, notes: ["a", 3] }))).toEqual({ uid: "u", keys: {}, notes: ["a"] });
    expect(parseMeta("nope")).toBeNull();
    expect(parseMeta(JSON.stringify({ uid: 1 }))).toBeNull();
  });
});
