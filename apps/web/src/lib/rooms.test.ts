// lib/rooms.ts with Firestore faked: what each action sends, for the cases a stale copy or a
// changed room would get wrong. The last one out reads the room from the server before deleting
// it (and deletes nothing offline), a Bottle Bay deck hidden after reports is never dealt, and a
// room this app can't read stops its listener before saying so.

import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  /** Every committed batch, as "set|update|delete <path>" lines. */
  batches: [] as string[][],
  deletes: [] as string[],
  /** What the server holds, by path; an Error is thrown instead (offline, refused). */
  server: {} as Record<string, unknown>,
  listener: null as null | { next: (snap: unknown) => void; error: (e: unknown) => void },
  unsubscribed: 0,
}));

vi.mock("./db.js", () => ({ firestore: () => ({}) }));

vi.mock("firebase/firestore", () => {
  class FieldPath {
    readonly parts: string[];
    constructor(...parts: string[]) {
      this.parts = parts;
    }
  }
  const ref = (path: string) => ({ path });
  const snapOf = (path: string) => {
    const v = db.server[path];
    if (v instanceof Error) throw v;
    return { exists: () => v !== undefined, data: () => (v === undefined ? undefined : v), metadata: { hasPendingWrites: false, fromCache: false } };
  };
  return {
    FieldPath,
    Timestamp: { fromMillis: (ms: number) => ms },
    arrayUnion: (...a: unknown[]) => ({ arrayUnion: a }),
    collection: (_db: unknown, ...parts: string[]) => ref(parts.join("/")),
    deleteDoc: async (r: { path: string }) => void db.deletes.push(r.path),
    deleteField: () => "<delete>",
    doc: (_db: unknown, ...parts: string[]) => ref(parts.join("/")),
    getDoc: async (r: { path: string }) => snapOf(r.path),
    getDocFromServer: async (r: { path: string }) => snapOf(r.path),
    getDocs: async () => ({ docs: [] }),
    increment: (n: number) => ({ increment: n }),
    limit: () => ({}),
    onSnapshot: (_r: unknown, _opts: unknown, next: (snap: unknown) => void, error: (e: unknown) => void) => {
      db.listener = { next, error };
      return () => {
        db.unsubscribed++;
      };
    },
    orderBy: () => ({}),
    query: () => ({}),
    serverTimestamp: () => "<now>",
    setDoc: async () => undefined,
    startAfter: () => ({}),
    updateDoc: async () => undefined,
    where: () => ({}),
    writeBatch: () => {
      const ops: string[] = [];
      return {
        set: (r: { path: string }) => void ops.push(`set ${r.path}`),
        update: (r: { path: string }) => void ops.push(`update ${r.path}`),
        delete: (r: { path: string }) => void ops.push(`delete ${r.path}`),
        commit: async () => void db.batches.push(ops),
      };
    },
  };
});

import { readGameDeck, leaveRoom, watchRoom } from "./rooms.js";
import { memberKey, toRoom } from "./roomRules.js";
import type { Room } from "@ship/shared-types";

const CODE = "K7MP2QXA";
const T0 = Date.UTC(2026, 10, 24, 12);
const OTHER = "b".repeat(64);

const entry = (over: Record<string, unknown> = {}) => ({ n: [1, 2, 7], c: 0, a: 0, st: 0, end: null, in: T0, seen: T0, dmg: 0, cr: T0, say: -1, sayAt: null, gid: 0, g: 0, gt: 0, gp: 0, ...over });
function roomData(members: Record<string, unknown>, host: string, over: Record<string, unknown> = {}) {
  return { v: 1, mode: "invite", name: [1, 2], subj: 0, at: T0, host, listed: false, locked: false, ban: [], rep: [], why: {}, banked: 0, last: null, sail: null, deck: null, game: null, m: members, ...over };
}
const offline = () => Object.assign(new Error("Failed to get document because the client is offline."), { code: "unavailable" });

afterEach(() => {
  db.batches = [];
  db.deletes = [];
  db.server = {};
  db.listener = null;
  db.unsubscribed = 0;
});

describe("the last one out", () => {
  it("leaves normally (handing on the hat) when the server shows a crewmate this copy hadn't seen yet", async () => {
    const me = await memberKey("alice", CODE);
    const mine = toRoom(CODE, roomData({ [me]: entry() }, me)) as Room;
    db.server[`rooms/${CODE}`] = roomData({ [me]: entry(), [OTHER]: entry({ in: T0 + 1000 }) }, me);
    await leaveRoom("alice", mine, me, 0, T0 + 60_000);
    expect(db.batches).toEqual([[`update rooms/${CODE}`, `update roomCards/${CODE}`, `delete users/alice/rooms/${CODE}`]]);
  });

  it("closes the room, its card and deck when the server agrees nobody else is aboard", async () => {
    const me = await memberKey("alice", CODE);
    const mine = toRoom(CODE, roomData({ [me]: entry() }, me)) as Room;
    db.server[`rooms/${CODE}`] = roomData({ [me]: entry() }, me);
    await leaveRoom("alice", mine, me, 0, T0 + 60_000);
    expect(db.batches).toEqual([[`delete rooms/${CODE}/deck/cards`, `delete rooms/${CODE}`, `delete roomCards/${CODE}`, `delete users/alice/rooms/${CODE}`]]);
  });

  it("deletes nothing while offline, and keeps the private note so a later visit can clear the room", async () => {
    const me = await memberKey("alice", CODE);
    const mine = toRoom(CODE, roomData({ [me]: entry() }, me)) as Room;
    db.server[`rooms/${CODE}`] = offline();
    await leaveRoom("alice", mine, me, 0, T0 + 60_000);
    expect(db.batches).toEqual([]);
    expect(db.deletes).toEqual([]);
  });
});

describe("the game's deck", () => {
  const cards = [
    { f: "a", b: "1" },
    { f: "b", b: "2" },
    { f: "c", b: "3" },
    { f: "d", b: "4" },
  ];
  const withBottle = (id: string) => toRoom(CODE, roomData({ [OTHER]: entry() }, OTHER, { deck: { b: id, n: 4 } })) as Room;

  it("deals a Bottle Bay deck that's still in the bay", async () => {
    db.server["bottles/fine"] = { kind: "deck", reports: 2, cardCount: 4 };
    db.server["bottles/fine/deck/cards"] = { cards };
    expect((await readGameDeck(withBottle("fine"))).map((c) => c.back)).toEqual(["1", "2", "3", "4"]);
  });

  it("never deals one that reports have hidden, or that its sharer took back", async () => {
    db.server["bottles/hidden"] = { kind: "deck", reports: 3, cardCount: 4 };
    db.server["bottles/hidden/deck/cards"] = { cards };
    await expect(readGameDeck(withBottle("hidden"))).rejects.toMatchObject({ code: "deck-hidden" });
    await expect(readGameDeck(withBottle("gone"))).rejects.toMatchObject({ code: "deck-hidden" });
  });
});

describe("listening", () => {
  it("stops listening to a room it can't read before saying so, and says it once", () => {
    const errors: string[] = [];
    watchRoom(CODE, { room: () => undefined, error: (c) => errors.push(c) });
    const bad = { exists: () => true, data: () => ({ v: 2 }), metadata: { hasPendingWrites: false, fromCache: false } };
    db.listener!.next(bad);
    db.listener!.next(bad);
    expect(errors).toEqual(["data-loss"]);
    expect(db.unsubscribed).toBe(1);
  });
});
