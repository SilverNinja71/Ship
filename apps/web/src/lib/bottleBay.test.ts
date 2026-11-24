// lib/bottleBay.ts with Firestore faked: reports go with the reporter's own stamp (one every 30 s,
// naming the bottle), the third hides the bottle and takes a deck's cards with it, and browsing
// asks only for bottles that aren't hidden (the rules refuse any other list).

import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  server: {} as Record<string, unknown>,
  batches: [] as { op: string; path: string; data: unknown }[][],
  queries: [] as string[],
  refuse: null as null | ((ops: { op: string; path: string; data: unknown }[]) => boolean),
}));

vi.mock("./db.js", () => ({ firestore: () => ({}) }));
vi.mock("firebase/firestore", () => {
  const ref = (path: string) => ({ path });
  const snapOf = (path: string) => {
    const v = db.server[path];
    if (v instanceof Error) throw v;
    return { exists: () => v !== undefined, data: () => v as Record<string, unknown> | undefined };
  };
  return {
    collection: (_db: unknown, ...parts: string[]) => ref(parts.join("/")),
    doc: (_db: unknown, ...parts: string[]) => ref(parts.join("/")),
    getDoc: async (r: { path: string }) => snapOf(r.path),
    getDocFromServer: async (r: { path: string }) => snapOf(r.path),
    getDocs: async (q: { parts: string[] }) => {
      db.queries.push(q.parts.join(" "));
      return { docs: [] };
    },
    increment: (n: number) => ({ increment: n }),
    limit: (n: number) => `limit ${n}`,
    orderBy: (f: string, d?: string) => `orderBy ${f}${d ? ` ${d}` : ""}`,
    query: (_c: unknown, ...parts: unknown[]) => ({ parts: parts.map(String) }),
    serverTimestamp: () => "<now>",
    startAfter: () => "startAfter",
    where: (f: string, op: string, v: unknown) => `where ${f} ${op} ${String(v)}`,
    writeBatch: () => {
      const ops: { op: string; path: string; data: unknown }[] = [];
      return {
        set: (r: { path: string }, data: unknown) => void ops.push({ op: "set", path: r.path, data }),
        update: (r: { path: string }, data: unknown) => void ops.push({ op: "update", path: r.path, data }),
        delete: (r: { path: string }) => void ops.push({ op: "delete", path: r.path, data: null }),
        commit: async () => {
          if (db.refuse?.(ops)) throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
          db.batches.push(ops);
        },
      };
    },
  };
});

import { BottleGone, ReportTooSoon, bayProblem, bottleStillShared, listBottles, reportBottle, reportWait } from "./bottleBay.js";

const T0 = Date.UTC(2026, 10, 24, 12);
const deck = (reports: number) => ({ kind: "deck", title: "Cells", reports, hidden: false });

afterEach(() => {
  vi.useRealTimers();
  db.server = {};
  db.batches = [];
  db.queries = [];
  db.refuse = null;
});

describe("reporting a bottle", () => {
  it("sends +1, the report record and the reporter's stamp naming the bottle", async () => {
    db.server["bottles/b1"] = deck(0);
    await reportBottle("bob", "b1", "spam");
    expect(db.batches).toEqual([
      [
        { op: "update", path: "bottles/b1", data: { reports: { increment: 1 }, hidden: false } },
        { op: "set", path: "bottles/b1/reports/bob", data: { at: "<now>", reason: "spam" } },
        { op: "set", path: "users/bob/meta/reports", data: { at: "<now>", id: "b1" } },
      ],
    ]);
  });

  it("hides the bottle at the third report, and a deck's cards go with it", async () => {
    db.server["bottles/b1"] = deck(2);
    await reportBottle("bob", "b1", "personal");
    expect(db.batches[0]).toContainEqual({ op: "update", path: "bottles/b1", data: { reports: { increment: 1 }, hidden: true } });
    expect(db.batches[0]).toContainEqual({ op: "delete", path: "bottles/b1/deck/cards", data: null });
  });

  it("waits 30 seconds between reports from one account, and says so", async () => {
    vi.useFakeTimers({ now: T0 });
    db.server["bottles/b1"] = deck(0);
    db.server["users/bob/meta/reports"] = { at: { toMillis: () => T0 - 10_000 }, id: "b0" };
    await expect(reportBottle("bob", "b1", "spam")).rejects.toBeInstanceOf(ReportTooSoon);
    expect(db.batches).toEqual([]);
    expect(reportWait(T0 - 10_000, T0)).toBe(20);
    expect(reportWait(T0 - 31_000, T0)).toBe(0);
    expect(bayProblem(new ReportTooSoon(20), "report")).toBe("Wait 20 seconds before reporting another bottle.");
  });

  it("reads the count again when another report landed first", async () => {
    db.server["bottles/b1"] = deck(1);
    let tries = 0;
    db.refuse = () => {
      // Someone else's report made it 2 in between: this one is the third.
      if (tries++ === 0) {
        db.server["bottles/b1"] = deck(2);
        return true;
      }
      return false;
    };
    await reportBottle("bob", "b1", "spam");
    expect(db.batches[0]).toContainEqual({ op: "update", path: "bottles/b1", data: { reports: { increment: 1 }, hidden: true } });
  });

  it("says a hidden bottle (only its sharer can read it) isn't in the bay any more", async () => {
    db.server["bottles/b1"] = Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    await expect(reportBottle("bob", "b1", "spam")).rejects.toBeInstanceOf(BottleGone);
    expect(await bottleStillShared("b1")).toBe(false);
  });
});

describe("browsing", () => {
  it("asks only for bottles that aren't hidden, the newest and by subject", async () => {
    await listBottles();
    await listBottles({ subjectKey: "biology", kind: "deck" });
    expect(db.queries).toEqual(["where hidden == false orderBy at desc limit 40", "where subjectKey == biology where kind == deck where hidden == false limit 80"]);
  });

  it("explains an index still being built", () => {
    expect(bayProblem(Object.assign(new Error("The query requires an index."), { code: "failed-precondition" }), "load")).toMatch(/still being set up/);
  });
});
