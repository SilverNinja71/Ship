// lib/rooms.ts with Firestore faked: what each action sends, for the cases a stale copy or a
// changed room would get wrong. The last one out reads the room from the server before deleting
// it (and deletes nothing offline), the skipper never clears their live room as "over" on a guess,
// a refused Close room leaves instead, a gone room's card stays as {gone: true}, coming aboard
// writes the private note only once, reports count as strikes only with a stake, a Bottle Bay
// deck hidden after reports is never dealt, and a room this app can't read stops its listener
// before saying so.

import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  /** Every committed batch, as "set|update|delete <path>" lines. */
  batches: [] as string[][],
  deletes: [] as string[],
  /** What the server holds, by path; an Error is thrown instead (offline, refused). */
  server: {} as Record<string, unknown>,
  listener: null as null | { next: (snap: unknown) => void; error: (e: unknown) => void },
  unsubscribed: 0,
  /** Every write in every committed batch, with what it wrote (field paths joined with dots). */
  writes: [] as { op: string; path: string; data: Record<string, unknown> }[][],
  /** Refuses a batch (permission-denied) while this says so. */
  refuse: null as null | ((ops: { op: string; path: string; data: Record<string, unknown> }[]) => boolean),
  /** Queries asked for, and the documents each gives back. */
  queries: [] as string[],
  results: [] as { id: string; data: () => unknown; ref?: { path: string } }[][],
  /** Plain updateDoc calls (a Pass the Bottle turn), as path and field-path/value pairs. */
  updates: [] as { path: string; fields: Record<string, unknown> }[],
}));

vi.mock("./db.js", () => ({ firestore: () => ({}) }));
vi.mock("./roomSession.js", () => ({ stopRoomSession: () => undefined }));

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
    getDocs: async (q: { parts?: string[] }) => {
      db.queries.push((q.parts ?? []).join(" "));
      return { docs: db.results.shift() ?? [] };
    },
    documentId: () => "__name__",
    startAt: (v: string) => `startAt ${v}`,
    endBefore: (v: string) => `endBefore ${v}`,
    increment: (n: number) => ({ increment: n }),
    limit: (n: number) => `limit ${n}`,
    onSnapshot: (_r: unknown, _opts: unknown, next: (snap: unknown) => void, error: (e: unknown) => void) => {
      db.listener = { next, error };
      return () => {
        db.unsubscribed++;
      };
    },
    orderBy: (f: string) => `orderBy ${f}`,
    query: (_c: unknown, ...parts: unknown[]) => ({ parts: parts.map(String) }),
    serverTimestamp: () => "<now>",
    setDoc: async () => undefined,
    startAfter: () => ({}),
    updateDoc: async (r: { path: string }, ...args: unknown[]) => {
      const fields: Record<string, unknown> = {};
      for (let i = 0; i + 1 < args.length; i += 2) fields[((args[i] as { parts: string[] }).parts ?? []).join(".")] = args[i + 1];
      db.updates.push({ path: r.path, fields });
    },
    where: (f: string, op: string, v: unknown) => `where ${f} ${op} ${String(v)}`,
    writeBatch: () => {
      const ops: string[] = [];
      const full: { op: string; path: string; data: Record<string, unknown> }[] = [];
      const fields = (args: unknown[]): Record<string, unknown> => {
        if (args.length === 1 && args[0] && typeof args[0] === "object" && !("parts" in (args[0] as object))) return { ...(args[0] as Record<string, unknown>) };
        const out: Record<string, unknown> = {};
        for (let i = 0; i + 1 < args.length; i += 2) {
          const k = args[i] as { parts?: string[] } | string;
          out[typeof k === "string" ? k : (k.parts ?? []).join(".")] = args[i + 1];
        }
        return out;
      };
      return {
        set: (r: { path: string }, data: unknown) => {
          ops.push(`set ${r.path}`);
          full.push({ op: "set", path: r.path, data: fields([data]) });
        },
        update: (r: { path: string }, ...args: unknown[]) => {
          ops.push(`update ${r.path}`);
          full.push({ op: "update", path: r.path, data: fields(args) });
        },
        delete: (r: { path: string }) => {
          ops.push(`delete ${r.path}`);
          full.push({ op: "delete", path: r.path, data: {} });
        },
        commit: async () => {
          if (db.refuse?.(full)) throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
          db.batches.push(ops);
          db.writes.push(full);
        },
      };
    },
  };
});

import { AlreadyReported, closeRoom, joinRoom, leaveAllRooms, listOpenCards, openRoom, playTurn, readGameDeck, leaveRoom, removeSailor, reportRoom, skipperWrite, skipperingOpenRoom, takeHat, tidyMyRooms, watchRoom } from "./rooms.js";
import { memberKey, reportKey, toRoom } from "./roomRules.js";
import type { Room } from "@ship/shared-types";

const CODE = "K7MP2QXA";
const T0 = Date.UTC(2026, 10, 24, 12);
const OTHER = "b".repeat(64);

const entry = (over: Record<string, unknown> = {}) => ({ n: [1, 2, 7], c: 0, a: 0, st: 0, end: null, in: T0, seen: T0, dmg: 0, cr: T0, say: -1, sayAt: null, gid: 0, g: 0, gt: 0, gp: 0, ...over });
function roomData(members: Record<string, unknown>, host: string, over: Record<string, unknown> = {}) {
  return { v: 1, mode: "invite", name: [1, 2], subj: 0, at: T0, host, listed: false, locked: false, ban: [], rep: [], why: {}, banked: 0, last: null, sail: null, deck: null, game: null, m: members, ...over };
}
const offline = () => Object.assign(new Error("Failed to get document because the client is offline."), { code: "unavailable" });
/** The server's clock, measured (an own write's round trip, or a sign-in token's time). */
const clock = (serverNow: number, measured = true) => ({ serverNow, measured });
/** What deleting a room sends: its deck and the room go, its card empties for good, and (for a sailor) their note goes. */
const goneBatch = (code: string, note: string | null = "alice") => [`delete rooms/${code}/deck/cards`, `delete rooms/${code}`, `set roomCards/${code}`, ...(note ? [`delete users/${note}/rooms/${code}`] : [])];

afterEach(() => {
  db.updates = [];
  db.writes = [];
  db.refuse = null;
  db.queries = [];
  db.results = [];
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
    await leaveRoom("alice", mine, me, 0, clock(T0 + 60_000));
    // The private note stays (tidied away with the room), so a sailor who left can still report it; it records whether they stayed 5 minutes.
    expect(db.batches).toEqual([[`update rooms/${CODE}`, `update roomCards/${CODE}`, `set users/alice/rooms/${CODE}`]]);
  });

  it("closes the room, its card and deck when the server agrees nobody else is aboard", async () => {
    const me = await memberKey("alice", CODE);
    const mine = toRoom(CODE, roomData({ [me]: entry() }, me)) as Room;
    db.server[`rooms/${CODE}`] = roomData({ [me]: entry() }, me);
    await leaveRoom("alice", mine, me, 0, clock(T0 + 60_000));
    expect(db.batches).toEqual([goneBatch(CODE)]);
    // The card stays as {gone: true}, so the code can never be opened again.
    expect(db.writes.flat().find((w) => w.path === `roomCards/${CODE}`)?.data).toEqual({ gone: true });
  });

  it("deletes nothing while offline, and keeps the private note so a later visit can clear the room", async () => {
    const me = await memberKey("alice", CODE);
    const mine = toRoom(CODE, roomData({ [me]: entry() }, me)) as Room;
    db.server[`rooms/${CODE}`] = offline();
    await leaveRoom("alice", mine, me, 0, clock(T0 + 60_000));
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

describe("one listed open room per account", () => {
  const open = (members: Record<string, unknown>, host: string, over: Record<string, unknown> = {}) => toRoom(CODE, roomData(members, host, { mode: "open", listed: true, ...over })) as Room;
  const write = (path: string) => db.writes.flat().find((w) => w.path === path)?.data ?? {};

  it("takes an open room off the list (room and card) when its skipper leaves and hands on the hat", async () => {
    const me = await memberKey("alice", CODE);
    await leaveRoom("alice", open({ [me]: entry(), [OTHER]: entry({ in: T0 + 1000 }) }, me), me, 0, clock(T0 + 60_000));
    expect(write(`rooms/${CODE}`)).toMatchObject({ host: OTHER, listed: false });
    expect(write(`roomCards/${CODE}`)).toMatchObject({ listed: false });
  });

  it("keeps it listed when someone else leaves", async () => {
    const me = await memberKey("alice", CODE);
    await leaveRoom("alice", open({ [me]: entry(), [OTHER]: entry({ in: T0 - 1000 }) }, OTHER), me, 0, clock(T0 + 60_000));
    expect(write(`rooms/${CODE}`)).not.toHaveProperty("listed");
    expect(write(`roomCards/${CODE}`)).not.toHaveProperty("listed");
  });

  it("takes it off the list when the skipper passes the hat, and puts it back only with the stamp naming it", async () => {
    const me = await memberKey("alice", CODE);
    const r = open({ [me]: entry(), [OTHER]: entry() }, me);
    await skipperWrite(r, me, { host: OTHER }, {});
    expect(write(`rooms/${CODE}`)).toMatchObject({ host: OTHER, listed: false });
    expect(db.writes.flat().some((w) => w.path === "users/alice/meta/rooms")).toBe(false);
    db.writes = [];
    // Back on the list (the hat came here, or the door opened): the stamp names this room in the same batch.
    await skipperWrite(open({ [me]: entry(), [OTHER]: entry() }, me, { listed: false }), me, { list: true }, {}, { uid: "alice" });
    expect(write("users/alice/meta/rooms")).toEqual({ openIn: CODE });
    expect(write(`rooms/${CODE}`)).toMatchObject({ listed: true });
    expect(write(`roomCards/${CODE}`)).toMatchObject({ listed: true });
  });

  it("takes the hat keeping the room listed as this sailor's open room, or off the list if that's refused", async () => {
    const me = await memberKey("alice", CODE);
    const r = open({ [me]: entry(), [OTHER]: entry() }, OTHER);
    await takeHat("alice", r, me, {});
    expect(write("users/alice/meta/rooms")).toEqual({ openIn: CODE });
    expect(write(`rooms/${CODE}`)).toMatchObject({ host: me });
    expect(write(`rooms/${CODE}`)).not.toHaveProperty("listed");
    db.writes = [];
    // This account still runs another open room: the rules refuse the stamp, so the room leaves the list instead.
    db.refuse = (ops) => ops.some((o) => o.path === "users/alice/meta/rooms");
    await takeHat("alice", r, me, {});
    expect(db.writes).toHaveLength(1);
    expect(write(`rooms/${CODE}`)).toMatchObject({ host: me, listed: false });
    expect(write(`roomCards/${CODE}`)).toMatchObject({ listed: false });
  });

  it("unlists a listed room when its skipper is removed (a sweep of a departed skipper hands on the hat too)", async () => {
    const me = await memberKey("alice", CODE);
    await removeSailor(open({ [me]: entry(), [OTHER]: entry() }, OTHER), me, OTHER, { ban: false });
    expect(write(`rooms/${CODE}`)).toMatchObject({ host: me, listed: false });
  });
});

describe("the open list", () => {
  const cardDoc = (code: string) => ({ id: code, data: () => ({ v: 1, mode: "open", name: [1, 1], subj: 0, at: T0, listed: true, locked: false, n: 1, alive: T0 }) });

  it("reads a window starting at a random code, wrapping round to the start for the rest of the 20", async () => {
    // The random code starts "MMMM…"; three cards come after it and two before.
    db.results = [["MMMM2222", "PPPP2222", "ZZZZ2222"].map(cardDoc), ["22222222", "AAAA2222"].map(cardDoc)];
    const cards = await listOpenCards((n) => new Uint8Array(n).fill(11));
    expect(cards.map((c) => c.code)).toEqual(["MMMM2222", "PPPP2222", "ZZZZ2222", "22222222", "AAAA2222"]);
    expect(db.queries).toEqual([
      "where listed == true orderBy __name__ startAt MMMMMMMM limit 20",
      "where listed == true orderBy __name__ endBefore MMMMMMMM limit 17",
    ]);
  });

  it("asks once when the window already holds 20", async () => {
    db.results = [Array.from({ length: 20 }, (_, i) => cardDoc(`MMMM${"23456789ABCDEFGHJKLMN"[i]}222`))];
    expect(await listOpenCards((n) => new Uint8Array(n).fill(11))).toHaveLength(20);
    expect(db.queries).toHaveLength(1);
  });
});

describe("a room that's over", () => {
  const MIN = 60_000;
  const over = async () => {
    const me = await memberKey("alice", CODE);
    // The skipper (another sailor) was last seen 30 minutes ago: the rules make the room final.
    return { me, room: toRoom(CODE, roomData({ [me]: entry({ seen: T0 + 20 * MIN }), [OTHER]: entry() }, OTHER)) as Room };
  };
  const clearBatch = goneBatch(CODE);

  it("can't be left, only cleared, with its card, deck and my note", async () => {
    const { me, room } = await over();
    await leaveRoom("alice", room, me, 0, clock(T0 + 30 * MIN));
    expect(db.batches).toEqual([clearBatch]);
  });

  it("is cleared when the rules refuse the leave because it's over by the server's clock, not this device's", async () => {
    const { me, room } = await over();
    // Not over by this device's clock (only 20 minutes on); the server refuses the leave as over.
    db.refuse = (ops) => ops.some((o) => o.op === "update" || (o.op === "set" && o.path.startsWith("users/")));
    db.server[`rooms/${CODE}`] = roomData({ [me]: entry({ seen: T0 + 20 * MIN }), [OTHER]: entry() }, OTHER);
    await leaveRoom("alice", room, me, 0, clock(T0 + 20 * MIN, false));
    expect(db.batches).toEqual([clearBatch]);
  });
});

describe("the skipper leaving never deletes the crew's room on a guess", () => {
  const MIN = 60_000;
  const crew = async (skipperSeen = T0) => {
    const me = await memberKey("alice", CODE);
    const data = roomData({ [me]: entry({ seen: skipperSeen }), [OTHER]: entry({ in: T0 + 1000 }) }, me);
    return { me, data, room: toRoom(CODE, data) as Room };
  };
  const deletes = () => db.batches.filter((b) => b.some((op) => op === `delete rooms/${CODE}`));

  it("reads the room again and leaves (handing on the hat) when a refused leave came from an old copy", async () => {
    const { me, data, room } = await crew();
    // A write still on its way (a focus minute) made this copy's dmg one short: the first leave is refused.
    db.server[`rooms/${CODE}`] = { ...data, m: { ...data.m, [me]: entry({ dmg: 1 }) } };
    let refusals = 1;
    db.refuse = () => refusals-- > 0;
    await leaveRoom("alice", room, me, 0, clock(T0 + MIN));
    expect(deletes()).toEqual([]);
    expect(db.writes.at(-1)!.find((w) => w.path === `rooms/${CODE}`)?.data).toMatchObject({ host: OTHER, banked: { increment: 1 } });
  });

  it("doesn't clear its room as over by a device clock 30 minutes fast: it leaves the ordinary way", async () => {
    const { me, room } = await crew();
    await leaveRoom("alice", room, me, 0, clock(T0 + 31 * MIN, false));
    expect(deletes()).toEqual([]);
    expect(db.batches).toEqual([[`update rooms/${CODE}`, `update roomCards/${CODE}`, `set users/alice/rooms/${CODE}`]]);
  });

  it("throws rather than clearing a refused leave it can't place without a measured clock", async () => {
    const { me, data, room } = await crew(T0 - 30 * MIN);
    db.server[`rooms/${CODE}`] = data;
    db.refuse = (ops) => !ops.some((o) => o.op === "delete");
    await expect(leaveRoom("alice", room, me, 0, clock(T0, false))).rejects.toMatchObject({ code: "permission-denied" });
    expect(deletes()).toEqual([]);
  });

  it("clears it only when the server's copy, by a measured clock, shows it surely over", async () => {
    const { me, data, room } = await crew(T0 - 30 * MIN);
    db.server[`rooms/${CODE}`] = data;
    db.refuse = (ops) => !ops.some((o) => o.op === "delete");
    await leaveRoom("alice", room, me, 0, clock(T0));
    expect(deletes()).toEqual([goneBatch(CODE)]);
  });
});

describe("closing the room", () => {
  it("closes it (the card stays as {gone: true})", async () => {
    const me = await memberKey("alice", CODE);
    expect(await closeRoom("alice", toRoom(CODE, roomData({ [me]: entry() }, me)) as Room, clock(T0))).toBe("closed");
    expect(db.batches).toEqual([goneBatch(CODE)]);
  });

  it("leaves instead when the hat moved on while this device wasn't looking", async () => {
    const me = await memberKey("alice", CODE);
    const mine = toRoom(CODE, roomData({ [me]: entry(), [OTHER]: entry() }, me)) as Room;
    // A crewmate took the hat after 15 quiet minutes: the rules refuse the skipper's delete.
    db.server[`rooms/${CODE}`] = roomData({ [me]: entry(), [OTHER]: entry() }, OTHER);
    db.refuse = (ops) => ops.some((o) => o.op === "delete" && o.path === `rooms/${CODE}`);
    expect(await closeRoom("alice", mine, clock(T0 + 60_000))).toBe("left");
    expect(db.batches).toEqual([[`update rooms/${CODE}`, `update roomCards/${CODE}`, `set users/alice/rooms/${CODE}`]]);
  });

  it("only lets my note go when I'm not aboard any more", async () => {
    const me = await memberKey("alice", CODE);
    db.refuse = () => true;
    db.server[`rooms/${CODE}`] = Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    expect(await closeRoom("alice", toRoom(CODE, roomData({ [me]: entry(), [OTHER]: entry() }, me)) as Room, clock(T0))).toBe("gone");
    expect(db.deletes).toEqual([`users/alice/rooms/${CODE}`]);
  });

  it("changes nothing offline (it throws, so the room comes back)", async () => {
    const me = await memberKey("alice", CODE);
    db.refuse = () => true;
    db.server[`rooms/${CODE}`] = offline();
    await expect(closeRoom("alice", toRoom(CODE, roomData({ [me]: entry(), [OTHER]: entry() }, me)) as Room, clock(T0))).rejects.toMatchObject({ code: "unavailable" });
    expect(db.deletes).toEqual([]);
  });
});

describe("coming aboard and opening", () => {
  const write = (path: string) => db.writes.flat().find((w) => w.path === path);

  it("joins with my entry, the card's count, the stamp naming the room and a new private note", async () => {
    const key = await joinRoom("alice", CODE, { nick: [1, 2, 7], costume: 0, accessory: 0 });
    expect(db.batches).toEqual([[`update rooms/${CODE}`, `update roomCards/${CODE}`, "update users/alice/meta/rooms", `set users/alice/rooms/${CODE}`]]);
    expect(Object.keys(write(`rooms/${CODE}`)!.data)).toEqual([`m.${key}`]);
    expect(write(`roomCards/${CODE}`)!.data).toEqual({ n: { increment: 1 } });
    expect(write("users/alice/meta/rooms")!.data).toEqual({ joinedAt: "<now>", joinedIn: CODE });
  });

  it("writes no note when one is kept from an earlier visit (the rules let a note only be made, never rewritten)", async () => {
    db.server[`users/alice/rooms/${CODE}`] = { at: T0 - 60_000, stayed: true };
    await joinRoom("alice", CODE, { nick: [1, 2, 7], costume: 0, accessory: 0 });
    expect(db.batches).toEqual([[`update rooms/${CODE}`, `update roomCards/${CODE}`, "update users/alice/meta/rooms"]]);
  });

  it("stamps an open room as this account's one open room; an invite room doesn't touch openIn", async () => {
    const look = { nick: [1, 2, 7] as [number, number, number], costume: 0, accessory: 0 };
    const opened = await openRoom("alice", { mode: "open", name: [1, 2], subject: 0, look });
    expect(write("users/alice/meta/rooms")!.data).toEqual({ madeAt: "<now>", joinedAt: "<now>", madeIn: opened.code, joinedIn: opened.code, openIn: opened.code });
    expect(write(`rooms/${opened.code}`)!.data).toMatchObject({ mode: "open", listed: true, strikes: 0, rep: [] });
    db.writes = [];
    const invite = await openRoom("alice", { mode: "invite", name: [1, 2], subject: 0, look });
    expect(write("users/alice/meta/rooms")!.data).toEqual({ madeAt: "<now>", joinedAt: "<now>", madeIn: invite.code, joinedIn: invite.code });
    expect(write(`rooms/${invite.code}`)!.data).toMatchObject({ mode: "invite", listed: false, strikes: 0 });
  });

  it("records on leaving whether I stayed 5 minutes, never claiming it on a guess", async () => {
    const me = await memberKey("alice", CODE);
    const r = toRoom(CODE, roomData({ [me]: entry({ in: T0 }), [OTHER]: entry() }, OTHER)) as Room;
    await leaveRoom("alice", r, me, 0, clock(T0 + 5 * 60_000 + 10_000));
    expect(write(`users/alice/rooms/${CODE}`)!.data).toEqual({ stayed: false });
    db.writes = [];
    await leaveRoom("alice", r, me, 0, clock(T0 + 6 * 60_000));
    expect(write(`users/alice/rooms/${CODE}`)!.data).toEqual({ stayed: true });
  });

  it("names the open room this account still skippers by the server's clock, not a fast device clock", async () => {
    const me = await memberKey("alice", CODE);
    db.server["users/alice/meta/rooms"] = { openIn: CODE };
    db.server[`rooms/${CODE}`] = roomData({ [me]: entry({ seen: T0 }) }, me, { name: [1, 2] });
    expect(await skipperingOpenRoom("alice", T0 + 60_000)).not.toBeNull();
    // 30 minutes on (a fast clock would say so): over, so not theirs to keep.
    expect(await skipperingOpenRoom("alice", T0 + 30 * 60_000)).toBeNull();
  });
});

describe("leaving when the room can't be reached", () => {
  it("keeps the private note and throws, so nothing is deleted on a guess", async () => {
    const me = await memberKey("alice", CODE);
    const mine = toRoom(CODE, roomData({ [me]: entry(), [OTHER]: entry() }, OTHER)) as Room;
    // The leave and the over-room clear are both refused, and the room can't be read again (offline).
    db.refuse = () => true;
    db.server[`rooms/${CODE}`] = offline();
    await expect(leaveRoom("alice", mine, me, 0, clock(T0 + 60_000))).rejects.toMatchObject({ code: "unavailable" });
    expect(db.deletes).toEqual([]);
    expect(db.batches).toEqual([]);
  });

  it("lets the note go when the room says I'm no longer aboard", async () => {
    const me = await memberKey("alice", CODE);
    const mine = toRoom(CODE, roomData({ [me]: entry(), [OTHER]: entry() }, OTHER)) as Room;
    db.refuse = () => true;
    db.server[`rooms/${CODE}`] = Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    await leaveRoom("alice", mine, me, 0, clock(T0 + 60_000));
    expect(db.deletes).toEqual([`users/alice/rooms/${CODE}`]);
  });
});

describe("a Pass the Bottle turn", () => {
  it("names its game's seed, so a turn that waited offline can't land on the next game", async () => {
    await playTurn(CODE, 4242, { turn: 1, holder: OTHER, card: 1, delivered: 1, buoys: 5, rescue: false, end: 0 });
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0]!.fields).toMatchObject({ "game.seed": 4242, "game.turn": 1, "game.holder": OTHER, "game.del": 1 });
  });
});

describe("reporting", () => {
  const MIN = 60_000;
  const card = (listed: boolean) => ({ v: 1, mode: "open", name: [1, 2], subj: 0, at: T0, listed, locked: false, n: 2, alive: T0 });
  const roomWrite = () => db.writes.flat().find((w) => w.path === `rooms/${CODE}`)?.data ?? {};
  /** The stamp says this account came aboard `code` last; the note says whether it stayed 5 minutes when it left. */
  const stake = (joinedIn: string | null, stayed?: boolean) => {
    db.server["users/alice/meta/rooms"] = { joinedIn };
    if (stayed !== undefined) db.server[`users/alice/rooms/${CODE}`] = { at: T0, stayed };
  };

  it("says a known room was already reported by this account, and sends nothing", async () => {
    const rk = await reportKey("alice", CODE);
    const known = toRoom(CODE, roomData({ [OTHER]: entry() }, OTHER, { rep: [rk] })) as Room;
    await expect(reportRoom("alice", CODE, "spam", known, T0)).rejects.toBeInstanceOf(AlreadyReported);
    expect(db.batches).toEqual([]);
  });

  it("counts a strike from a sailor aboard 5 minutes in the room they came aboard last", async () => {
    const me = await memberKey("alice", CODE);
    stake(CODE);
    const known = toRoom(CODE, roomData({ [OTHER]: entry(), [me]: entry({ in: T0 }) }, OTHER, { mode: "open", listed: true })) as Room;
    await reportRoom("alice", CODE, "spam", known, T0 + 6 * MIN);
    expect(roomWrite()).toMatchObject({ strikes: { increment: 1 }, listed: true });
  });

  it("counts no strike from a sailor who came aboard a minute ago (it's counted, but the list stays as it is)", async () => {
    const me = await memberKey("alice", CODE);
    stake(CODE);
    const known = toRoom(CODE, roomData({ [OTHER]: entry(), [me]: entry({ in: T0 }) }, OTHER, { mode: "open", listed: true, strikes: 2 })) as Room;
    await reportRoom("alice", CODE, "spam", known, T0 + MIN);
    expect(roomWrite()).not.toHaveProperty("strikes");
    expect(roomWrite()).toMatchObject({ listed: true, "why.spam": { increment: 1 } });
  });

  it("counts no strike in a room that isn't the one the sailor came aboard last", async () => {
    const me = await memberKey("alice", CODE);
    stake("ELSEWHER");
    const known = toRoom(CODE, roomData({ [OTHER]: entry(), [me]: entry({ in: T0 }) }, OTHER, { mode: "open", listed: true, strikes: 2 })) as Room;
    await reportRoom("alice", CODE, "spam", known, T0 + 30 * MIN);
    expect(roomWrite()).not.toHaveProperty("strikes");
  });

  it("reads a known room again when refused, and the third strike takes it and its card off the list", async () => {
    const me = await memberKey("alice", CODE);
    stake(CODE);
    const known = toRoom(CODE, roomData({ [OTHER]: entry(), [me]: entry({ in: T0 }) }, OTHER, { mode: "open", listed: true, rep: ["c".repeat(64)], strikes: 1 })) as Room;
    // Another strike landed first: the server now has two, so this one is the third.
    db.server[`rooms/${CODE}`] = roomData({ [OTHER]: entry(), [me]: entry({ in: T0 }) }, OTHER, { mode: "open", listed: true, rep: ["c".repeat(64), "d".repeat(64)], strikes: 2 });
    let tries = 0;
    db.refuse = () => tries++ === 0;
    await reportRoom("alice", CODE, "unkind", known, T0 + 10 * MIN);
    expect(roomWrite()).toMatchObject({ listed: false, strikes: { increment: 1 }, "why.unkind": { increment: 1 } });
    expect(db.writes.flat().find((w) => w.path === `roomCards/${CODE}`)?.data).toEqual({ listed: false });
  });

  it("tries the other way when the clock put the sailor on the wrong side of 5 minutes", async () => {
    const me = await memberKey("alice", CODE);
    stake(CODE);
    const data = roomData({ [OTHER]: entry(), [me]: entry({ in: T0 }) }, OTHER, { mode: "open", listed: true });
    db.server[`rooms/${CODE}`] = data;
    // The server's clock says 4:59 aboard: no strike yet.
    db.refuse = (ops) => ops.some((o) => "strikes" in o.data);
    await reportRoom("alice", CODE, "spam", toRoom(CODE, data) as Room, T0 + 5 * MIN + 1000);
    expect(db.batches).toHaveLength(1);
    expect(roomWrite()).not.toHaveProperty("strikes");
  });

  it("from outside the room: someone who left after 5 minutes aboard counts a strike; one who came and went doesn't", async () => {
    db.server[`roomCards/${CODE}`] = card(true);
    stake(CODE, true);
    await reportRoom("alice", CODE, "personal", null, T0);
    expect(db.batches).toEqual([[`update rooms/${CODE}`]]);
    expect(roomWrite()).toMatchObject({ strikes: { increment: 1 } });
    expect(roomWrite()).not.toHaveProperty("listed");
    db.writes = [];
    db.batches = [];
    stake(CODE, false);
    await reportRoom("alice", CODE, "personal", null, T0);
    expect(roomWrite()).not.toHaveProperty("strikes");
    expect(roomWrite()).not.toHaveProperty("listed");
  });

  it("guesses a strike leaves a listed room listed, and if refused (it was the third) unlists the room and its card", async () => {
    db.server[`roomCards/${CODE}`] = card(true);
    stake(CODE, true);
    db.refuse = (ops) => ops.some((o) => o.path === `rooms/${CODE}` && !("listed" in o.data));
    await reportRoom("alice", CODE, "off", null, T0);
    expect(db.batches).toEqual([[`update rooms/${CODE}`, `update roomCards/${CODE}`]]);
    expect(roomWrite()).toMatchObject({ listed: false, strikes: { increment: 1 } });
  });

  it("says a room with no card has closed (a gone room's card reads as none)", async () => {
    await expect(reportRoom("alice", CODE, "spam", null, T0)).rejects.toMatchObject({ code: "not-found" });
    db.server[`roomCards/${CODE}`] = { gone: true };
    await expect(reportRoom("alice", CODE, "spam", null, T0)).rejects.toMatchObject({ code: "not-found" });
  });
});

describe("tidying my notes", () => {
  const HOUR = 3_600_000;
  const note = (code: string, at: number) => ({ id: code, data: () => ({ at }), ref: { path: `users/x/rooms/${code}` } });
  const live = { v: 1, mode: "invite", name: [1, 2], subj: 0, at: T0, listed: false, locked: false, n: 2, alive: T0 };

  it("clears notes for rooms that are gone or over, keeps live ones, and reads no card for a note older than any room", async () => {
    const now = T0 + 20 * 60_000;
    db.results = [[note("OLDROOM2", now - 13 * HOUR), note("LIVEROOM", T0), note("GONEROOM", T0), note("OVERROOM", T0)]];
    db.server["roomCards/LIVEROOM"] = live;
    db.server["roomCards/OVERROOM"] = { ...live, alive: T0 - 30 * 60_000 };
    await tidyMyRooms("tidy-a", null, now);
    expect(db.deletes.sort()).toEqual(["users/x/rooms/GONEROOM", "users/x/rooms/OLDROOM2", "users/x/rooms/OVERROOM"]);
    // The old note's room and the over room are cleared with their cards and decks; the live room isn't touched.
    expect(db.batches.flat().filter((op) => op.startsWith("delete rooms/") && !op.includes("/deck/")).sort()).toEqual(["delete rooms/OLDROOM2", "delete rooms/OVERROOM"]);
  });

  it("carries on after the notes it looked at last, so live rooms never hold back the notes behind them", async () => {
    const now = T0 + 20 * 60_000;
    const codes = ["LIVE2222", "LIVE3333", "LIVE4444", "LIVE5555", "LIVE6666", "LIVE7777"];
    for (const c of codes) db.server[`roomCards/${c}`] = live;
    const notes = () => [...codes.map((c, i) => note(c, T0 + i)), note("GONE2222", T0 + 10)];
    db.results = [notes(), notes()];
    await tidyMyRooms("tidy-b", null, now);
    // Five card reads per call: the newest note wasn't reached yet.
    expect(db.deletes).toEqual([]);
    await tidyMyRooms("tidy-b", null, now);
    expect(db.deletes).toEqual(["users/x/rooms/GONE2222"]);
  });
});

describe("leaving every room (account deletion)", () => {
  it("stops before deleting anything when a room can't be reached", async () => {
    db.results = [[{ id: CODE, data: () => ({ at: T0 }), ref: { path: `users/alice/rooms/${CODE}` } }]];
    db.server[`rooms/${CODE}`] = offline();
    await expect(leaveAllRooms("alice")).rejects.toMatchObject({ code: "unavailable" });
    expect(db.deletes).toEqual([]);
    expect(db.batches).toEqual([]);
  });

  it("closes the open room this account runs even when its note is missing (its stamp can't go while it's theirs)", async () => {
    const OPEN = "P7MP2QXB";
    const me = await memberKey("alice", OPEN);
    db.results = [[]];
    db.server["users/alice/meta/rooms"] = { openIn: OPEN };
    db.server[`rooms/${OPEN}`] = roomData({ [me]: entry(), [OTHER]: entry() }, me, { mode: "open", listed: true });
    expect(await leaveAllRooms("alice")).toBe(1);
    expect(db.batches).toEqual([goneBatch(OPEN)]);
  });
});
