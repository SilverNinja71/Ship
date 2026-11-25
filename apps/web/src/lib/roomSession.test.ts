// The room session's own rules, with the database faked: one merged write per 15 s gap, focus
// minutes no faster than the rules allow, idle pauses never sent, no answering another device's
// writes, Tidy progress that's never lost (across a reload too), a clock that ignores slow writes
// and copes with a device whose clock is wrong, no empty writes piling up, one relisten at a time,
// the card's `alive` kept fresh by the skipper, sweeps checked against the server, both ways of
// losing a room, and the offers.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Room, RoomMember, RoomSail } from "@ship/shared-types";
import type { SelfPatch } from "./roomRules.js";

const fake = vi.hoisted(() => ({
  writes: [] as { patch: SelfPatch; opts: { cardAlive?: boolean } }[],
  listens: 0,
  tookHat: 0,
  /** Skipper writes sent (the change asked for). */
  skipper: [] as unknown[],
  /** What readGameDeck gives (playable cards), or an error to throw. */
  deckCards: [] as unknown,
  on: null as null | { room(r: unknown, meta: { fromCache: boolean }): void; error(code: string): void },
  card: null as unknown,
  /** While set, writes wait for it (a write still on its way). */
  hold: null as Promise<void> | null,
  /** The room as the server has it, for getRoomFromServer. */
  server: null as unknown,
  removed: [] as string[],
  /** How long each own write takes to come back (a slow connection), and what happens as it lands. */
  delayMs: 0,
  landed: null as null | (() => void),
  /** Rooms left (leaveRoom), and whether coming aboard is refused. */
  left: [] as string[],
  joinRefused: false,
  /** Notes forgotten, rooms cleared, and own writes refused (permission-denied) while set. */
  forgot: [] as string[],
  cleared: [] as string[],
  refuseWrites: false,
  /** What getRoom throws (offline, say) instead of answering. */
  getRoomError: null as unknown,
  /** The account's rules stamp, as readRulesStamp reads it (in order, the last one repeating), and when it last joined. */
  stamps: [] as { rules: number; over13: boolean }[],
  stampReads: 0,
  joinedAt: null as number | null,
  accepted: [] as { over13: boolean; opts: unknown }[],
  /** How far the server's clock is ahead of this device's (negative: this device is fast). */
  serverAhead: 0,
  /** Cards the open list gives, and reports sent (code and whether the room was known). */
  openCards: [] as unknown[],
  reports: [] as { code: string; reason: string; known: boolean }[],
  /** What closeRoom says happened ("left": the hat had moved on). */
  closeOutcome: "closed" as unknown,
  closeError: null as unknown,
  /** How many of the next own writes are refused. */
  refuseNext: 0,
  /** Whether clearDeadRoom really deletes the room (the listener then gets nothing). */
  clearGoes: false,
  /** How many times a game's deck was read. */
  deckReads: 0,
}));

vi.mock("./firebase.js", () => ({
  auth: {
    currentUser: {
      uid: "alice",
      // A fresh sign-in token, issued by the server's clock (`serverAhead` from this device's).
      getIdTokenResult: async () => ({ issuedAtTime: new Date(Date.now() + fake.serverAhead).toUTCString() }),
    },
  },
}));

vi.mock("./rooms.js", () => ({
  watchRoom: (_code: string, on: typeof fake.on) => {
    fake.listens++;
    fake.on = on;
    return () => {
      fake.on = null;
    };
  },
  writeSelf: async (_code: string, _key: string, patch: SelfPatch, opts: { cardAlive?: boolean } = {}) => {
    if (fake.refuseWrites || (fake.refuseNext > 0 && fake.refuseNext-- > 0)) throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    fake.writes.push({ patch, opts });
    fake.landed?.();
    if (fake.delayMs) await new Promise((r) => setTimeout(r, fake.delayMs));
    if (fake.hold) await fake.hold;
  },
  getCard: async () => fake.card,
  getRoom: async () => {
    if (fake.getRoomError) throw fake.getRoomError;
    return fake.server;
  },
  getRoomFromServer: async () => fake.server,
  forgetRoom: async (_uid: string, code: string) => {
    fake.forgot.push(code);
  },
  clearDeadRoom: async (code: string) => {
    fake.cleared.push(code);
    // The room is gone: the listener hears it.
    if (fake.clearGoes) queueMicrotask(() => fake.on?.room(null, { fromCache: false }));
  },
  removeSailor: async (_room: unknown, _me: string, gone: string) => {
    fake.removed.push(gone);
  },
  takeHat: async () => {
    fake.tookHat++;
  },
  leaveRoom: async (_uid: string, room: { code: string }) => {
    fake.left.push(room.code);
  },
  joinRoom: async (uid: string, code: string) => {
    if (fake.joinRefused) throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    const { memberKey } = await import("./roomRules.js");
    return memberKey(uid, code);
  },
  readRulesStamp: async () => {
    const stamp = fake.stamps[Math.min(fake.stampReads, fake.stamps.length - 1)] ?? { rules: 1, over13: true };
    fake.stampReads++;
    return stamp;
  },
  readJoinedAt: async () => fake.joinedAt,
  acceptRoomRules: async (_uid: string, over13: boolean, opts: { keepOver13?: boolean } = {}) => {
    fake.accepted.push({ over13, opts });
    return over13 || opts.keepOver13 === true;
  },
  roomsSwitch: async () => ({ create: true, open: true }),
  skipperWrite: async (_room: unknown, _key: string, change: unknown) => {
    fake.skipper.push(change);
  },
  readGameDeck: async () => {
    fake.deckReads++;
    if (fake.deckCards instanceof Error) throw fake.deckCards;
    return fake.deckCards;
  },
  closeRoom: async () => {
    if (fake.closeError) throw fake.closeError;
    return fake.closeOutcome;
  },
  newSeed: () => 4242,
  listOpenCards: async () => fake.openCards,
  reportRoom: async (_uid: string, code: string, reason: string, known: unknown) => {
    fake.reports.push({ code, reason, known: known !== null });
  },
  roomErrorCode: (e: unknown) => String((e as { code?: unknown })?.code ?? "unknown"),
}));

import { RoomSession, roomSession, startRoomSession, stopRoomSession } from "./roomSession.js";
import { DECK_HIDDEN_TEXT, DECK_LOCKED_TEXT, JOIN_COOLDOWN_TEXT, TIDY_DECK_TOO_SMALL_TEXT, memberKey } from "./roomRules.js";
import { deckIdentity, forgetTokenClock, gameDeck, loadedRoomPrefs, pickOffer, roomsSignedIn, roomsSignedOut, savedRoomPrefs, useRooms } from "../stores/roomStore.js";
import { useUi } from "../stores/uiStore.js";
import { useVoyage } from "../stores/voyageStore.js";
import { DOCKED } from "./voyageLogic.js";

const CODE = "K7MP2QXA";
const T0 = Date.UTC(2026, 10, 24, 12);
const MIN = 60_000;

function member(key: string, over: Partial<RoomMember> = {}): RoomMember {
  return {
    key,
    nick: [0, 0, 7],
    costume: 0,
    accessory: 0,
    state: 0,
    endsAt: null,
    joinedAt: T0 - MIN,
    seenAt: T0,
    dmg: 0,
    creditedAt: T0,
    say: -1,
    sayAt: null,
    tidy: { gid: 0, patches: 0, ms: 0, mixups: 0 },
    ...over,
  };
}

function room(members: RoomMember[], over: Partial<Room> = {}): Room {
  return {
    code: CODE,
    mode: "invite",
    name: [0, 0],
    subject: 0,
    at: T0 - 10 * MIN,
    host: members[0]?.key ?? "",
    listed: false,
    locked: false,
    banned: [],
    reportKeys: [],
    why: { spam: 0, unkind: 0, personal: 0, off: 0 },
    strikes: 0,
    banked: 0,
    last: null,
    sail: null,
    deck: null,
    game: null,
    members,
    ...over,
  };
}

/** A session that has just joined (its join write was acknowledged at T0) and seen its first snapshot. */
async function aboard(me: Partial<RoomMember> = {}) {
  vi.useFakeTimers({ now: T0 });
  const key = await memberKey("alice", CODE);
  useRooms.setState({ current: CODE, room: null, notice: null, noticeRoom: null });
  const session = new RoomSession("alice", CODE, { sentAt: T0 - 100, ackAt: T0 });
  await session.begin();
  fake.on!.room(room([member(key, { seenAt: T0 - 50, ...me }), member("b".repeat(64))]), { fromCache: false });
  return { session, key };
}

const B = "b".repeat(64);

/** A tab's sessionStorage, which Node doesn't have. */
function fakeSessionStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    key: (i: number) => [...items.keys()][i] ?? null,
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, String(v)),
    removeItem: (k: string) => void items.delete(k),
    clear: () => items.clear(),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fake.writes = [];
  fake.listens = 0;
  fake.tookHat = 0;
  fake.skipper = [];
  fake.deckCards = [];
  stopRoomSession();
  fake.card = null;
  fake.hold = null;
  fake.server = null;
  fake.removed = [];
  fake.delayMs = 0;
  fake.landed = null;
  fake.left = [];
  fake.joinRefused = false;
  fake.forgot = [];
  fake.cleared = [];
  fake.refuseWrites = false;
  fake.getRoomError = null;
  fake.stamps = [];
  fake.stampReads = 0;
  fake.joinedAt = null;
  fake.accepted = [];
  fake.serverAhead = 0;
  fake.openCards = [];
  fake.reports = [];
  fake.closeOutcome = "closed";
  fake.closeError = null;
  fake.refuseNext = 0;
  fake.clearGoes = false;
  fake.deckReads = 0;
  forgetTokenClock();
  useVoyage.setState({ ...DOCKED, prepEndsAt: null });
  useRooms.setState({ current: null, room: null, myKey: null, status: "idle", notice: null, noticeRoom: null, offer: null, error: null, alert: null, deck: null, deckId: null, tidyMemo: null });
});

describe("room session writes", () => {
  it("merges queued changes into one write, sent once the 15 s gap after joining is over", async () => {
    const { session } = await aboard();
    session.queueSelf({ say: 3 });
    session.queueSelf({ st: 1, endsAt: T0 + 25 * MIN });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fake.writes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(7_000);
    expect(fake.writes).toHaveLength(1);
    expect(fake.writes[0]!.patch).toEqual({ say: 3, st: 1, endsAt: T0 + 25 * MIN });
    session.stop();
  });

  it("credits focus minutes on the next write, never more than the time since the last credit allows", async () => {
    const { session } = await aboard({ creditedAt: T0 - 3 * MIN });
    session.queueSelf({ addDmg: 10 });
    await vi.advanceTimersByTimeAsync(17_000);
    // About 3¼ minutes since the credit, a minute of slack, and 5 s held back for the clock: 4.
    expect(fake.writes[0]!.patch.addDmg).toBe(4);
    session.stop();
  });

  it("never sends an idle pause, but does send a pause the sailor chose", async () => {
    const { session } = await aboard();
    useVoyage.setState({ phase: "drifting", pausedReason: "idle" });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fake.writes).toHaveLength(0);
    useVoyage.setState({ phase: "drifting", pausedReason: "manual" });
    await vi.advanceTimersByTimeAsync(4_000);
    expect(fake.writes).toHaveLength(1);
    expect(fake.writes[0]!.patch).toEqual({ st: 3, endsAt: null });
    session.stop();
  });

  it("never sends an empty write when another write took the queue first", async () => {
    const { session } = await aboard();
    // A cheer waits for the gap after joining; a crewmate's snapshot meanwhile asks for the flush again.
    session.queueSelf({ say: 3 });
    fake.on!.room(room([member(session.key, { seenAt: T0 - 50 }), member(B, { seenAt: T0 })]), { fromCache: false });
    // Then a skipper action: it waits for the same gap, so the cheer's flush lines up behind it.
    const skipperSent: SelfPatch[] = [];
    const skipperWrite = session.ownWrite(async (self) => {
      skipperSent.push(self);
    });
    await vi.advanceTimersByTimeAsync(60_000);
    await skipperWrite;
    // The skipper's write carried the cheer, and nothing else went out (no seen-only update).
    expect(skipperSent).toEqual([{ say: 3 }]);
    expect(fake.writes).toHaveLength(0);
    session.stop();
  });

  it("sends a keep-alive 10 minutes after the last write", async () => {
    const { session } = await aboard();
    await vi.advanceTimersByTimeAsync(9 * MIN);
    expect(fake.writes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(MIN + 1000);
    expect(fake.writes).toHaveLength(1);
    expect(fake.writes[0]!.patch).toEqual({});
    session.stop();
  });
});

describe("two devices, one sailor", () => {
  it("never answers a snapshot, so another device's writes can't start a back and forth", async () => {
    const { session, key } = await aboard();
    // The same sailor's phone starts focusing: the room now says st 1, this laptop is docked.
    fake.on!.room(room([member(key, { state: 1, endsAt: T0 + 25 * MIN, seenAt: T0 + 20_000 }), member(B)]), { fromCache: false });
    await vi.advanceTimersByTimeAsync(2 * MIN);
    expect(fake.writes).toHaveLength(0);
    // This device's own timer changing still goes out.
    useVoyage.setState({ phase: "drifting", pausedReason: "manual" });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fake.writes.map((w) => w.patch)).toEqual([{ st: 3, endsAt: null }]);
    session.stop();
  });

  it("after a reload (no fresh write to time), sends one keep-alive at once to set the clock", async () => {
    vi.useFakeTimers({ now: T0 });
    const key = await memberKey("alice", CODE);
    useRooms.setState({ current: CODE, room: null });
    const session = new RoomSession("alice", CODE);
    await session.begin();
    fake.on!.room(room([member(key, { seenAt: T0 - MIN }), member(B)]), { fromCache: false });
    await vi.advanceTimersByTimeAsync(1000);
    expect(fake.writes.map((w) => w.patch)).toEqual([{}]);
    session.stop();
  });
});

describe("a device whose clock is wrong, after a reload", () => {
  const SKEW = 8 * MIN;

  it("writes at once to set the clock, and sends its timer only in server time", async () => {
    vi.useFakeTimers({ now: T0 });
    // This laptop's clock is 8 minutes slow: the server says T0 + 8 min. It's focusing, ending at T0 + 10 min (its time).
    useVoyage.setState({ ...DOCKED, phase: "sailing", focusMinutes: 25, voyageStartedAt: T0 - 15 * MIN, segmentStartedAt: T0 - 15 * MIN, prepEndsAt: null });
    const key = await memberKey("alice", CODE);
    useRooms.setState({ current: CODE, room: null });
    const session = new RoomSession("alice", CODE);
    await session.begin();
    // The room has its block end right, in server time, from before the reload (its last write was 30 s ago).
    const mine = { state: 1 as const, endsAt: T0 + 10 * MIN + SKEW, seenAt: T0 + SKEW - 30_000 };
    fake.on!.room(room([member(key, mine), member(B)]), { fromCache: false });
    await vi.advanceTimersByTimeAsync(1000);
    // The keep-alive goes at once (not 8 minutes late), and no timer goes before the clock is known.
    expect(fake.writes.map((w) => w.patch)).toEqual([{}]);
    // Its snapshot shows the write's server time, which sets the clock.
    fake.on!.room(room([member(key, { ...mine, seenAt: Date.now() + SKEW })]), { fromCache: false });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(session.serverNow() - Date.now()).toBeGreaterThan(SKEW - 2000);
    // The room's end was right all along, so it isn't overwritten with a time 8 minutes early.
    expect(fake.writes).toHaveLength(1);
    session.stop();
  });

  it("corrects a wrong end once the clock is set, in server time", async () => {
    vi.useFakeTimers({ now: T0 });
    useVoyage.setState({ ...DOCKED, phase: "sailing", focusMinutes: 25, voyageStartedAt: T0 - 15 * MIN, segmentStartedAt: T0 - 15 * MIN, prepEndsAt: null });
    const key = await memberKey("alice", CODE);
    useRooms.setState({ current: CODE, room: null });
    const session = new RoomSession("alice", CODE);
    await session.begin();
    // The room still says docked (another device's last word, say).
    fake.on!.room(room([member(key, { seenAt: T0 + SKEW - 30_000 }), member(B)]), { fromCache: false });
    await vi.advanceTimersByTimeAsync(1000);
    fake.on!.room(room([member(key, { seenAt: Date.now() + SKEW })]), { fromCache: false });
    await vi.advanceTimersByTimeAsync(20_000);
    const sent = fake.writes[1]!.patch;
    expect(sent.st).toBe(1);
    expect(Math.abs(sent.endsAt! - (T0 + 10 * MIN + SKEW))).toBeLessThan(2000);
    session.stop();
  });
});

describe("Tidy the Deck progress", () => {
  it("remembers a crewmate's cleared patch across a reload of this tab, after they left", async () => {
    vi.stubGlobal("sessionStorage", fakeSessionStorage());
    const { session, key } = await aboard();
    const tidy = { kind: "tidy" as const, v: 2 as const, seed: 5, at: T0, seats: [key, B] };
    // B clears patch 0, then leaves.
    fake.on!.room(room([member(key, { seenAt: T0 - 50 }), member(B, { tidy: { gid: 5, patches: 0b01, ms: 20_000, mixups: 0 } })], { game: tidy }), { fromCache: false });
    fake.on!.room(room([member(key, { seenAt: T0 - 50 })], { game: tidy }), { fromCache: false });
    expect(useRooms.getState().tidyMemo?.seen[B]?.patches).toBe(0b01);
    // The tab reloads: a new session for the same sailor, without a fresh write.
    session.stop();
    useRooms.setState({ tidyMemo: null });
    const again = new RoomSession("alice", CODE);
    await again.begin();
    fake.on!.room(room([member(key, { seenAt: T0 - 50 })], { game: tidy }), { fromCache: false });
    expect(useRooms.getState().tidyMemo?.seen[B]?.patches).toBe(0b01);
    again.stop();
    // Another account on this tab never sees it.
    useRooms.setState({ tidyMemo: null });
    const bob = new RoomSession("bob", CODE);
    await bob.begin();
    const bobKey = await memberKey("bob", CODE);
    fake.on!.room(room([member(bobKey)], { game: { ...tidy, seats: [bobKey] } }), { fromCache: false });
    expect(useRooms.getState().tidyMemo?.seen[B]).toBeUndefined();
    bob.stop();
  });

  it("keeps an earlier patch when a second is cleared while the first write is still on its way", async () => {
    const { session, key } = await aboard();
    let land = () => undefined as void;
    fake.hold = new Promise<void>((resolve) => (land = resolve));
    session.queueTidy(7, 0, 30_000, 1);
    await vi.advanceTimersByTimeAsync(17_000);
    expect(fake.writes[0]!.patch.tidy).toEqual({ gid: 7, g: 0b001, gt: 30_000, gp: 1 });
    // Patch 2 is cleared before the room shows patch 0 (its copy still says no progress).
    session.queueTidy(7, 2, 41_000, 0);
    fake.hold = null;
    land();
    await vi.advanceTimersByTimeAsync(1);
    fake.on!.room(room([member(key, { seenAt: T0 + 17_000 }), member(B)]), { fromCache: false });
    await vi.advanceTimersByTimeAsync(17_000);
    expect(fake.writes[1]!.patch.tidy).toEqual({ gid: 7, g: 0b101, gt: 41_000, gp: 1 });
    session.stop();
  });
});

describe("the clock", () => {
  it("doesn't set the clock from a write that waited offline", async () => {
    const { session, key } = await aboard();
    expect(session.serverNow()).toBe(Date.now());
    let land = () => undefined as void;
    fake.hold = new Promise<void>((resolve) => (land = resolve));
    session.queueSelf({ say: 2 });
    await vi.advanceTimersByTimeAsync(17_000);
    // Offline for 10 minutes; the write lands at the server only then, and is acknowledged.
    await vi.advanceTimersByTimeAsync(10 * MIN);
    fake.on!.room(room([member(key, { seenAt: Date.now() }), member(B)]), { fromCache: false });
    land();
    await vi.advanceTimersByTimeAsync(1);
    // Half the wait (5 minutes) would have been the error; the earlier, quick reading stays.
    expect(session.serverNow()).toBe(Date.now());
    expect(useRooms.getState().serverOffset).toBe(0);
    session.stop();
  });
});

describe("listening", () => {
  it("relistens once however many problems are reported, and less and less often to a room this app can't read", async () => {
    const { session } = await aboard();
    expect(fake.listens).toBe(1);
    for (let i = 0; i < 5; i++) fake.on!.error("unavailable");
    await vi.advanceTimersByTimeAsync(31_000);
    expect(fake.listens).toBe(2);
    // A newer app changed the room: the listener stops (watchRoom), and it's tried again after 30 s, then 2 minutes.
    fake.on!.error("data-loss");
    await vi.advanceTimersByTimeAsync(31_000);
    expect(fake.listens).toBe(3);
    expect(useRooms.getState().alert).toContain("newer version of Ship");
    fake.on!.error("data-loss");
    await vi.advanceTimersByTimeAsync(31_000);
    expect(fake.listens).toBe(3);
    await vi.advanceTimersByTimeAsync(2 * MIN);
    expect(fake.listens).toBe(4);
    session.stop();
  });
});

describe("the skipper's card", () => {
  it("refreshes the card's alive on the first write 9 minutes after the last refresh", async () => {
    vi.useFakeTimers({ now: T0 });
    const key = await memberKey("alice", CODE);
    useRooms.setState({ current: CODE, room: null });
    const session = new RoomSession("alice", CODE, { sentAt: T0 - 100, ackAt: T0, skipper: true });
    await session.begin();
    fake.on!.room(room([member(key, { seenAt: T0 - 50 }), member(B)]), { fromCache: false });
    await vi.advanceTimersByTimeAsync(2 * MIN);
    session.queueSelf({ say: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(fake.writes[0]!.opts.cardAlive).toBe(false);
    await vi.advanceTimersByTimeAsync(7 * MIN);
    session.queueSelf({ say: 2 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(fake.writes[1]!.opts.cardAlive).toBe(true);
    session.stop();
  });

  it("refreshes it soon after the hat arrives, and a take-hat that's no longer needed still sends the queued cheer", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    // B is the skipper, gone 30 minutes; I'm the one who'd take the hat.
    const { session, key } = await aboard();
    const away = member(B, { seenAt: T0 - 30 * MIN });
    fake.on!.room(room([away, member(key, { seenAt: T0 - 50 })], { host: B }), { fromCache: false });
    await vi.advanceTimersByTimeAsync(50_000);
    session.queueSelf({ say: 3 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(fake.writes.map((w) => w.patch)).toEqual([{ say: 3 }]);
    // Another cheer, waiting for the gap when the minute's tidy-up decides to take the hat.
    await vi.advanceTimersByTimeAsync(4000);
    session.queueSelf({ say: 4 });
    await vi.advanceTimersByTimeAsync(7000);
    // B handed the hat over meanwhile.
    fake.on!.room(room([away, member(key, { seenAt: T0 + 50_000 })], { host: key }), { fromCache: false });
    await vi.advanceTimersByTimeAsync(40_000);
    expect(fake.tookHat).toBe(0);
    expect(fake.writes.map((w) => w.patch)).toEqual([{ say: 3 }, { say: 4 }]);
    expect(fake.writes[1]!.opts.cardAlive).toBe(true);
    session.stop();
  });
});

describe("sweeping", () => {
  it("sweeps a quiet sailor only when the server's copy, read just then, still shows them gone", async () => {
    const { session, key } = await aboard();
    // This device's copy is old (say, after a laptop slept): B looks 30 minutes quiet.
    fake.on!.room(room([member(key, { seenAt: T0 }), member(B, { seenAt: T0 - 30 * MIN })]), { fromCache: false });
    fake.server = room([member(key, { seenAt: T0 }), member(B, { seenAt: T0 })]);
    await vi.advanceTimersByTimeAsync(2 * MIN);
    expect(fake.removed).toEqual([]);
    fake.server = room([member(key, { seenAt: T0 }), member(B, { seenAt: T0 - 30 * MIN })]);
    await vi.advanceTimersByTimeAsync(2 * MIN);
    // (The fake room never drops B, so each minute's check sweeps again.)
    expect([...new Set(fake.removed)]).toEqual([B]);
    session.stop();
  });
});

describe("problems while aboard", () => {
  it("keeps a problem from the listener (out of free database use) for the panel, with the room still showing", async () => {
    const { session } = await aboard();
    fake.on!.error("resource-exhausted");
    expect(useRooms.getState()).toMatchObject({ status: "error", alert: expect.stringContaining("out of free database use") });
    expect(useRooms.getState().room).not.toBeNull();
    session.stop();
  });
});

describe("losing the room", () => {
  it("a snapshot without me, with my key banned, means the skipper removed me", async () => {
    const { key } = await aboard();
    fake.on!.room(room([member("b".repeat(64))], { banned: [key] }), { fromCache: false });
    await vi.advanceTimersByTimeAsync(1);
    expect(useRooms.getState()).toMatchObject({ current: null, room: null, status: "idle", notice: "removed", noticeRoom: { code: CODE } });
  });

  it("a snapshot without me and no ban means I drifted out", async () => {
    await aboard();
    fake.on!.room(room([member("b".repeat(64))]), { fromCache: false });
    await vi.advanceTimersByTimeAsync(1);
    expect(useRooms.getState().notice).toBe("drifted");
  });

  it("permission-denied on the listener: no card means the room closed, a card means I'm out of it", async () => {
    // A crewmate (the skipper is someone else, and was here a moment ago): the skipper closed it.
    vi.useFakeTimers({ now: T0 });
    const key = await memberKey("alice", CODE);
    useRooms.setState({ current: CODE, room: null, notice: null, noticeRoom: null });
    const crewmate = new RoomSession("alice", CODE, { sentAt: T0 - 100, ackAt: T0 });
    await crewmate.begin();
    fake.on!.room(room([member(B), member(key, { seenAt: T0 - 50 })]), { fromCache: false });
    fake.card = null;
    fake.on!.error("permission-denied");
    await vi.advanceTimersByTimeAsync(1);
    expect(useRooms.getState()).toMatchObject({ current: null, notice: "closed" });

    // As its skipper: never "the skipper closed the room"; it docked.
    afterEachReset();
    await aboard();
    fake.card = null;
    fake.on!.error("permission-denied");
    await vi.advanceTimersByTimeAsync(1);
    expect(useRooms.getState()).toMatchObject({ current: null, notice: "ended" });

    afterEachReset();
    await aboard();
    fake.card = { code: CODE };
    fake.on!.error("permission-denied");
    await vi.advanceTimersByTimeAsync(1);
    expect(useRooms.getState().notice).toBe("gone");
  });

  it("ignores a snapshot from the cache that leaves me out", async () => {
    const { session } = await aboard();
    fake.on!.room(room([member("b".repeat(64))]), { fromCache: true });
    expect(useRooms.getState()).toMatchObject({ current: CODE, notice: null });
    session.stop();
  });
});

function afterEachReset() {
  vi.useRealTimers();
  useRooms.setState({ current: null, notice: null, noticeRoom: null });
}

describe("offers", () => {
  const me = "a".repeat(64);
  const docked = { phase: "docked" as const, prepEndsAt: null };
  const sail: RoomSail = { at: T0, focus: 25, brk: 5, cycles: 2 };

  it("asks a docked sailor to sail with the crew while it gets ready, and nobody whose timer runs", () => {
    const r = room([member(me)], { sail });
    expect(pickOffer(r, me, docked, T0 + 10_000, 0)).toEqual({ kind: "sail-with", prepUntilServer: T0 + 60_000 });
    expect(pickOffer(r, me, { phase: "sailing", prepEndsAt: null }, T0 + 10_000, 0)).toBeNull();
    expect(pickOffer(r, me, { phase: "docked", prepEndsAt: T0 + 50_000 }, T0 + 10_000, 0)).toBeNull();
  });

  it("doesn't ask again about a sail call already answered", () => {
    expect(pickOffer(room([member(me)], { sail }), me, docked, T0 + 10_000, T0)).toBeNull();
  });

  it("after 'Not this time', leg 1 starting doesn't ask again; later legs do", () => {
    const r = room([member(me)], { sail });
    const leg1 = T0 + 60_000;
    const leg2 = leg1 + 30 * MIN;
    // Declined (lastSailSeen = the plan): not asked as leg 1 starts.
    expect(pickOffer(r, me, docked, leg1 + 10_000, T0)).toBeNull();
    // Not declined (just missed the countdown): leg 1 is offered, as sailing with them.
    expect(pickOffer(r, me, docked, leg1 + 10_000, 0)).toMatchObject({ kind: "sail-on", fromLeg: 1, cycles: 2 });
    // Leg 2 calls everyone docked, even after "Not this time": sail on in its first half minute, then hop aboard for 2 minutes.
    expect(pickOffer(r, me, docked, leg2 + 10_000, T0)).toMatchObject({ kind: "sail-on", fromLeg: 2, cycles: 1 });
    expect(pickOffer(r, me, docked, leg2 + 60_000, T0)).toMatchObject({ kind: "hop-aboard", leg: 2, focusMinutes: 24 });
    expect(pickOffer(r, me, docked, leg2 + 3 * MIN, T0)).toBeNull();
  });

  it("puts the bottle first when it's my turn", () => {
    const game = { kind: "bottle" as const, v: 2 as const, seed: 77, at: T0, seats: [me], cards: 12, turn: 2, holder: me, turnAt: T0, card: 1, delivered: 1, buoys: 5, rescue: false, goal: 6, end: 0 as const };
    expect(pickOffer(room([member(me, { state: 2 })], { sail, game }), me, docked, T0 + 10_000, 0)).toEqual({ kind: "your-turn", seed: 77, turn: 2 });
  });
});

describe("which deck a game deals from", () => {
  const me = "a".repeat(64);
  const cards = [{ id: "0", front: "a", back: "1" }];
  const tidy = (seed: number) => ({ kind: "tidy" as const, v: 2 as const, seed, at: T0, seats: [me] });

  it("never deals from a skipper's own deck once a new game (with a new seed) begins, even at the same size", () => {
    const first = room([member(me)], { deck: { bottleId: null, cards: 10 }, game: tidy(1) });
    const s = { room: first, deck: cards, deckId: deckIdentity(first) };
    expect(gameDeck(s)).toBe(cards);
    expect(gameDeck({ ...s, room: room([member(me)], { deck: { bottleId: null, cards: 10 }, game: tidy(2) }) })).toBeNull();
  });

  it("never deals from another Bottle Bay deck", () => {
    const r = room([member(me)], { deck: { bottleId: "bottleA", cards: 10 }, game: tidy(1) });
    const s = { room: r, deck: cards, deckId: deckIdentity(r) };
    expect(gameDeck({ ...s, room: { ...r, deck: { bottleId: "bottleB", cards: 10 } } })).toBeNull();
  });
});

describe("the skipper's deck and games", () => {
  /** A skipper aboard through the live session the store uses, with `over` in the room. */
  async function skipperAboard(over: Partial<Room>) {
    vi.useFakeTimers({ now: T0 });
    const key = await memberKey("alice", CODE);
    useRooms.setState({ current: CODE, room: null, error: null });
    startRoomSession("alice", CODE, { sentAt: T0 - 100, ackAt: T0, skipper: true });
    // The session works out its key (a real hash, off the main thread) before it listens.
    for (let i = 0; i < 50 && !fake.on; i++) {
      await memberKey("x", CODE);
      await vi.advanceTimersByTimeAsync(0);
    }
    fake.on!.room(room([member(key, { seenAt: T0 - 50 })], over), { fromCache: false });
    return key;
  }
  const own = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i), front: `q${i}`, back: `a${i}` }));

  it("refuses a deck pick that lands while a game is on, and sends nothing", async () => {
    const key = await skipperAboard({ deck: { bottleId: "deckA", cards: 10 } });
    fake.on!.room(room([member(key, { seenAt: T0 - 50 })], { deck: { bottleId: "deckA", cards: 10 }, game: { kind: "tidy", v: 2, seed: 3, at: T0, seats: [key] } }), { fromCache: false });
    const pick = useRooms.getState().pickBottleDeck("deckB", 12);
    await vi.advanceTimersByTimeAsync(20_000);
    await pick;
    expect(useRooms.getState().error).toBe(DECK_LOCKED_TEXT);
    expect(fake.skipper).toEqual([]);
  });

  it("deals a new game from the deck as it is when the write goes, never from cards read earlier", async () => {
    await skipperAboard({ deck: { bottleId: null, cards: 10 } });
    // An earlier read of another 10-card deck is still on this device.
    useRooms.setState({ deck: own(10), deckId: `${CODE}:own:10:-` });
    // The room's deck now has 10 cards, only 7 of them playable.
    fake.deckCards = own(7);
    const start = useRooms.getState().startGame("bottle");
    await vi.advanceTimersByTimeAsync(20_000);
    await start;
    expect(fake.skipper).toEqual([{ game: { kind: "bottle", goal: 6, cards: 7, seed: 4242 }, seats: [expect.any(String)] }]);
  });

  it("keeps the cards it read to start a game, so the skipper's device doesn't read them again for the board", async () => {
    const key = await skipperAboard({ deck: { bottleId: "deckA", cards: 8 } });
    fake.deckCards = own(8);
    const start = useRooms.getState().startGame("bottle");
    await vi.advanceTimersByTimeAsync(20_000);
    await start;
    expect(fake.deckReads).toBe(1);
    // The room now shows the game the start sent: its deck loads from the cards already read.
    const game = { kind: "bottle" as const, v: 2 as const, seed: 4242, at: T0, seats: [key], cards: 8, turn: 0, holder: key, turnAt: T0, card: 0, delivered: 0, buoys: 5, rescue: false, goal: 6, end: 0 as const };
    fake.on!.room(room([member(key, { seenAt: T0 + 20_000 })], { deck: { bottleId: "deckA", cards: 8 }, game }), { fromCache: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(gameDeck(useRooms.getState())).toHaveLength(8);
    expect(fake.deckReads).toBe(1);
  });

  it("won't start Tidy the Deck from a deck that leaves too few different tiles (reversed cards), and says why", async () => {
    await skipperAboard({ deck: { bottleId: null, cards: 6 } });
    // 3 terms and their reversed copies: 6 playable cards, but only 3 whose tiles all differ.
    fake.deckCards = [
      { id: "0", front: "cat", back: "gato" },
      { id: "1", front: "gato", back: "cat" },
      { id: "2", front: "dog", back: "perro" },
      { id: "3", front: "perro", back: "dog" },
      { id: "4", front: "sun", back: "sol" },
      { id: "5", front: "sol", back: "sun" },
    ];
    const start = useRooms.getState().startGame("tidy");
    await vi.advanceTimersByTimeAsync(20_000);
    await start;
    expect(useRooms.getState().error).toBe(TIDY_DECK_TOO_SMALL_TEXT);
    expect(fake.skipper).toEqual([]);
    // Pass the Bottle still deals the same deck.
    const bottle = useRooms.getState().startGame("bottle");
    await vi.advanceTimersByTimeAsync(20_000);
    await bottle;
    expect(fake.skipper).toEqual([{ game: { kind: "bottle", goal: expect.any(Number), cards: 6, seed: 4242 }, seats: [expect.any(String)] }]);
  });

  it("won't start a game from a Bottle Bay deck that reports have hidden", async () => {
    await skipperAboard({ deck: { bottleId: "deckA", cards: 10 } });
    fake.deckCards = Object.assign(new Error("hidden"), { code: "deck-hidden" });
    const start = useRooms.getState().startGame("tidy");
    await vi.advanceTimersByTimeAsync(20_000);
    await start;
    expect(useRooms.getState().error).toBe(DECK_HIDDEN_TEXT);
    expect(fake.skipper).toEqual([]);
  });
});

describe("a slow connection", () => {
  it("tries the clock a few times, then uses the fastest slow reading, so minutes are credited and keep-alives slow down", async () => {
    vi.useFakeTimers({ now: T0 });
    const key = await memberKey("alice", CODE);
    useRooms.setState({ current: CODE, room: null });
    // A reload: no fresh write to time the clock from. Every write takes 5 s to come back.
    const session = new RoomSession("alice", CODE);
    await session.begin();
    const mine = (seenAt: number) => member(key, { seenAt, creditedAt: T0 - 30 * MIN });
    fake.on!.room(room([mine(T0 - MIN), member(B)]), { fromCache: false });
    fake.delayMs = 5000;
    // The server applies each write at once (its snapshot shows the new `seen`); the reply comes 5 s later.
    fake.landed = () => queueMicrotask(() => fake.on?.room(room([mine(Date.now()), member(B)]), { fromCache: false }));
    session.queueSelf({ addDmg: 15 });
    await vi.advanceTimersByTimeAsync(60 * MIN);
    // About 6 keep-alives an hour plus a couple of tries, never one a minute.
    expect(fake.writes.length).toBeLessThanOrEqual(9);
    // The minutes went out once the clock was set from the fastest slow reading.
    expect(fake.writes.some((w) => (w.patch.addDmg ?? 0) > 0)).toBe(true);
    session.stop();
  });
});

describe("focus minutes kept in the tab", () => {
  it("survive a reload, never reach another account on the tab, and go when leaving or forgetting", async () => {
    const tab = fakeSessionStorage();
    vi.stubGlobal("sessionStorage", tab);
    const { session, key } = await aboard();
    session.queueSelf({ addDmg: 7 });
    // Not sent yet (the 15 s gap): saved in the tab, under this sailor's key in the room.
    expect(tab.getItem(`ship:room-pending:${key}`)).toBe("7");
    session.stop();
    // The tab reloads: the same sailor's next write carries them (up to what the rules allow since the last credit).
    const again = new RoomSession("alice", CODE, { sentAt: T0 - 100, ackAt: T0 });
    await again.begin();
    fake.on!.room(room([member(key, { seenAt: T0 - 50, creditedAt: T0 - 20 * MIN }), member(B)]), { fromCache: false });
    again.queueSelf({ say: 1 });
    await vi.advanceTimersByTimeAsync(17_000);
    expect(fake.writes.at(-1)!.patch.addDmg).toBe(7);
    expect(tab.getItem(`ship:room-pending:${key}`)).toBeNull();
    again.queueSelf({ addDmg: 3 });
    again.stop();
    // Another account on this tab never picks them up.
    const bobKey = await memberKey("bob", CODE);
    const bob = new RoomSession("bob", CODE, { sentAt: Date.now() - 100, ackAt: Date.now() });
    await bob.begin();
    fake.on!.room(room([member(bobKey, { seenAt: Date.now() - 50, creditedAt: T0 - 20 * MIN }), member(B)]), { fromCache: false });
    bob.queueSelf({ say: 2 });
    await vi.advanceTimersByTimeAsync(17_000);
    expect(fake.writes.at(-1)!.patch.addDmg).toBeUndefined();
    bob.stop();
    expect(tab.getItem(`ship:room-pending:${key}`)).toBe("3");
    // Leaving clears them (they're credited with the leave).
    const leaving = new RoomSession("alice", CODE, { sentAt: Date.now() - 100, ackAt: Date.now() });
    await leaving.begin();
    fake.on!.room(room([member(key, { seenAt: Date.now() - 50 }), member(B)]), { fromCache: false });
    await leaving.leave();
    expect(tab.getItem(`ship:room-pending:${key}`)).toBeNull();
    expect(fake.left).toEqual([CODE]);
  });

  it("go when the sailor is signed in with no room any more (left, Start over or Delete everything from another tab)", async () => {
    const tab = fakeSessionStorage();
    vi.stubGlobal("sessionStorage", tab);
    vi.useFakeTimers({ now: T0 });
    const key = await memberKey("alice", CODE);
    useRooms.setState({ current: CODE, room: null });
    startRoomSession("alice", CODE, { sentAt: T0 - 100, ackAt: T0 });
    for (let i = 0; i < 50 && !fake.on; i++) {
      await memberKey("x", CODE);
      await vi.advanceTimersByTimeAsync(0);
    }
    fake.on!.room(room([member(key, { seenAt: T0 - 50 }), member(B)]), { fromCache: false });
    roomSession()!.queueSelf({ addDmg: 4 });
    expect(tab.getItem(`ship:room-pending:${key}`)).toBe("4");
    // What useRoomSync does when another tab's leave reaches this one (roomSessionStop says "forget").
    stopRoomSession({ forget: true });
    expect(tab.getItem(`ship:room-pending:${key}`)).toBeNull();
    expect(roomSession()).toBeNull();
  });
});

describe("game calls", () => {
  const me = "a".repeat(64);
  const docked = { phase: "docked" as const, prepEndsAt: null };
  const tidy = { kind: "tidy" as const, v: 2 as const, seed: 61, at: T0, seats: [me, B] };

  it("doesn't call a sailor to a Tidy the Deck game the crew has already finished", () => {
    const playing = room([member(me, { state: 2 }), member(B, { state: 2 })], { game: tidy, deck: { bottleId: "d", cards: 8 } });
    expect(pickOffer(playing, me, docked, T0 + 30_000, 0, { patches: 2, memo: null })).toEqual({ kind: "game", game: "tidy", seed: 61 });
    const done = room([member(me, { state: 2, tidy: { gid: 61, patches: 1, ms: 40_000, mixups: 0 } }), member(B, { state: 2, tidy: { gid: 61, patches: 2, ms: 50_000, mixups: 0 } })], { game: tidy, deck: { bottleId: "d", cards: 8 } });
    expect(pickOffer(done, me, docked, T0 + 80_000, 0, { patches: 2, memo: null })).toBeNull();
  });

  it("doesn't call a sailor to a game they already have in front of them in the panel", () => {
    const r = room([member(me, { state: 2 }), member(B, { state: 2 })], { game: { ...tidy, seed: 62 }, deck: { bottleId: "d", cards: 8 } });
    expect(pickOffer(r, me, docked, T0 + 30_000, 0)).toMatchObject({ kind: "game", seed: 62 });
    useRooms.setState({ offer: { kind: "game", game: "tidy", seed: 62 } });
    useRooms.getState().seenGame(62);
    expect(useRooms.getState().offer).toBeNull();
    expect(pickOffer(r, me, docked, T0 + 30_000, 0)).toBeNull();
  });
});

describe("coming aboard another room", () => {
  const OTHER_CODE = "P7MP2QXB";

  async function aboardViaStore() {
    vi.useFakeTimers({ now: T0 });
    const key = await memberKey("alice", CODE);
    useRooms.setState({ uid: "alice", current: CODE, room: null, rulesOk: 1, over13: true, error: null });
    startRoomSession("alice", CODE, { sentAt: T0 - 100, ackAt: T0 });
    for (let i = 0; i < 50 && !fake.on; i++) {
      await memberKey("x", CODE);
      await vi.advanceTimersByTimeAsync(0);
    }
    fake.on!.room(room([member(key, { seenAt: T0 - 50 }), member(B)]), { fromCache: false });
    return key;
  }

  it("stays in the room it's in when the new one refuses", async () => {
    await aboardViaStore();
    fake.joinRefused = true;
    fake.server = null;
    fake.card = { code: OTHER_CODE, mode: "invite", name: [0, 0], subject: 0, at: T0, listed: false, locked: true, aboard: 2, aliveAt: T0 };
    const join = useRooms.getState().joinRoom(OTHER_CODE, { nick: [1, 2, 7], costume: 0, accessory: 0 });
    await vi.advanceTimersByTimeAsync(20_000);
    await join;
    expect(useRooms.getState().current).toBe(CODE);
    expect(useRooms.getState().room?.code).toBe(CODE);
    expect(useRooms.getState().error).toBe("The door is locked.");
    expect(fake.left).toEqual([]);
    expect(roomSession()?.code).toBe(CODE);
  });

  it("leaves the old room only once the new one has said yes", async () => {
    await aboardViaStore();
    const join = useRooms.getState().joinRoom(OTHER_CODE, { nick: [1, 2, 7], costume: 0, accessory: 0 });
    await vi.advanceTimersByTimeAsync(20_000);
    await join;
    expect(fake.left).toEqual([CODE]);
    expect(useRooms.getState().current).toBe(OTHER_CODE);
    expect(roomSession()?.code).toBe(OTHER_CODE);
  });
});

describe("a slow connection on a device whose clock is wrong", () => {
  it("sends its block end in the server's time from the first slow reading, never in this device's", async () => {
    const SKEW = 8 * MIN;
    vi.useFakeTimers({ now: T0 });
    // This laptop's clock is 8 minutes slow, and every write takes 5 s to come back. It's focusing, ending at T0 + 10 min (its time).
    useVoyage.setState({ ...DOCKED, phase: "sailing", focusMinutes: 25, voyageStartedAt: T0 - 15 * MIN, segmentStartedAt: T0 - 15 * MIN, prepEndsAt: null });
    const key = await memberKey("alice", CODE);
    useRooms.setState({ current: CODE, room: null });
    // A reload: the room still says docked (so the timer has to go out), and the clock must be measured.
    const session = new RoomSession("alice", CODE);
    await session.begin();
    const mine = (seenAt: number) => member(key, { seenAt });
    fake.on!.room(room([mine(T0 + SKEW - 30_000), member(B)]), { fromCache: false });
    fake.delayMs = 5000;
    fake.landed = () => queueMicrotask(() => fake.on?.room(room([mine(Date.now() + SKEW), member(B)]), { fromCache: false }));
    await vi.advanceTimersByTimeAsync(40_000);
    const timer = fake.writes.find((w) => w.patch.st === 1);
    expect(timer).toBeDefined();
    // Out by at most half the 5 s round trip, never by the device's 8 minutes.
    expect(Math.abs(timer!.patch.endsAt! - (T0 + 10 * MIN + SKEW))).toBeLessThan(5000);
    session.stop();
  });
});

describe("a room that's over", () => {
  it("is cleared when the room turns down a write because it's over (the skipper gone 25 minutes)", async () => {
    vi.useFakeTimers({ now: T0 });
    const key = await memberKey("alice", CODE);
    useRooms.setState({ current: CODE, room: null });
    const session = new RoomSession("alice", CODE, { sentAt: T0 - 100, ackAt: T0 });
    await session.begin();
    // B is the skipper, last seen 30 minutes ago; nobody took the hat.
    fake.on!.room(room([member(B, { seenAt: T0 - 30 * MIN }), member(key, { seenAt: T0 - 50 })], { host: B }), { fromCache: false });
    fake.refuseWrites = true;
    session.queueSelf({ say: 2 });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fake.cleared).toEqual([CODE]);
    session.stop();
  });

  it("after a reload (no fresh write), the skipper's own room that went over while everyone was away is cleared, judged by a sign-in token's clock", async () => {
    vi.useFakeTimers({ now: T0 });
    const key = await memberKey("alice", CODE);
    useRooms.setState({ current: CODE, room: null });
    const session = new RoomSession("alice", CODE);
    await session.begin();
    // I'm the skipper, last seen 40 minutes ago (the laptop was shut): the rules refuse every write.
    const over = room([member(key, { seenAt: T0 - 40 * MIN }), member(B, { seenAt: T0 - 41 * MIN })]);
    fake.server = over;
    fake.refuseWrites = true;
    fake.clearGoes = true;
    fake.card = null;
    fake.on!.room(over, { fromCache: false });
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(fake.cleared).toEqual([CODE]);
    // Lumi says it docked for the day.
    expect(useRooms.getState()).toMatchObject({ current: null, notice: "ended" });
    session.stop();
  });

  it("a refused write in a room it can't clear never loops: the next keep-alive waits its 10 minutes", async () => {
    vi.useFakeTimers({ now: T0 });
    const key = await memberKey("alice", CODE);
    useRooms.setState({ current: CODE, room: null });
    const session = new RoomSession("alice", CODE);
    await session.begin();
    let tries = 0;
    fake.refuseWrites = true;
    fake.landed = () => undefined;
    const counting = vi.spyOn(session as unknown as { ownWrite: (fn: unknown) => Promise<unknown> }, "ownWrite");
    fake.on!.room(room([member(B), member(key, { seenAt: T0 - 50 })], { host: B }), { fromCache: false });
    await vi.advanceTimersByTimeAsync(10 * MIN - 5_000);
    tries = counting.mock.calls.length;
    // The first keep-alive and its 3 tries again; nothing more until the keep-alive's 10 minutes.
    expect(tries).toBeLessThanOrEqual(4);
    session.stop();
  });

  it("the skipper's device never clears its live room as over by a guess: not with no measured clock", async () => {
    vi.useFakeTimers({ now: T0 });
    const key = await memberKey("alice", CODE);
    useRooms.setState({ current: CODE, room: null });
    // No sign-in token to measure the clock with.
    vi.spyOn(await import("./firebase.js"), "auth", "get").mockReturnValue({ currentUser: null } as never);
    const session = new RoomSession("alice", CODE);
    await session.begin();
    const r = room([member(key, { seenAt: T0 - 40 * MIN }), member(B)]);
    fake.server = r;
    fake.refuseWrites = true;
    fake.on!.room(r, { fromCache: false });
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(fake.cleared).toEqual([]);
    session.stop();
  });

  it("a refused write never silences the session: on a device 30 minutes fast, a reload's refused keep-alive is tried again, and keep-alives go on", async () => {
    vi.useFakeTimers({ now: T0 });
    fake.serverAhead = -30 * MIN;
    const key = await memberKey("alice", CODE);
    useRooms.setState({ current: CODE, room: null });
    const session = new RoomSession("alice", CODE);
    await session.begin();
    // Server time is T0 − 30 min; the crew wrote moments ago (by the server's clock). The first keep-alive is refused (the 15 s gap).
    fake.refuseNext = 1;
    fake.on!.room(room([member(B, { seenAt: T0 - 30 * MIN - 10_000 }), member(key, { seenAt: T0 - 30 * MIN - 5_000 })], { host: B, at: T0 - 40 * MIN }), { fromCache: false });
    // Before any write lands, the room's clock already comes from a sign-in token, not this device's (so cards and offers read right).
    await vi.advanceTimersByTimeAsync(0);
    expect(Math.abs(useRooms.getState().serverOffset - -30 * MIN)).toBeLessThan(2_000);
    await vi.advanceTimersByTimeAsync(12 * MIN);
    expect(fake.writes.length).toBeGreaterThanOrEqual(2);
    expect(fake.cleared).toEqual([]);
    session.stop();
  });

  it("after a reload, a room that's gone with no copy of it says it docked, never that the skipper closed it", async () => {
    vi.useFakeTimers({ now: T0 });
    useRooms.setState({ current: CODE, room: null, notice: null, noticeRoom: null, recent: [{ code: CODE, name: [1, 2], at: T0 - 60 * MIN, skipper: true }] });
    const session = new RoomSession("alice", CODE);
    await session.begin();
    fake.card = null;
    fake.on!.room(null, { fromCache: false });
    for (let i = 0; i < 20 && useRooms.getState().current; i++) await vi.advanceTimersByTimeAsync(0);
    expect(useRooms.getState()).toMatchObject({ current: null, notice: "ended", noticeRoom: { code: CODE } });
  });

  it("pays a game that ended while this tab was reloading, on its first snapshot", async () => {
    vi.useFakeTimers({ now: T0 });
    const { useEconomy } = await import("../stores/economyStore.js");
    useEconomy.setState({ paidRewardIds: [] });
    const key = await memberKey("alice", CODE);
    useRooms.setState({ current: CODE, room: null });
    const session = new RoomSession("alice", CODE);
    await session.begin();
    const game = { kind: "bottle" as const, v: 2 as const, seed: 99, at: T0 - 5 * MIN, seats: [key, B], cards: 12, turn: 8, holder: B, turnAt: T0 - MIN, card: 8, delivered: 6, buoys: 3, rescue: false, goal: 6, end: 1 as const };
    fake.on!.room(room([member(key, { seenAt: T0 - 50 }), member(B)], { deck: { bottleId: "B1", cards: 12 }, game }), { fromCache: false });
    expect(useEconomy.getState().paidRewardIds.filter((id) => id.endsWith(":bottle:99"))).toHaveLength(1);
    // The next snapshot (and a reload after it) pays nothing more.
    fake.on!.room(room([member(key, { seenAt: T0 - 40 }), member(B)], { deck: { bottleId: "B1", cards: 12 }, game }), { fromCache: false });
    expect(useEconomy.getState().paidRewardIds.filter((id) => id.endsWith(":bottle:99"))).toHaveLength(1);
    session.stop();
  });
});

describe("closing the room", () => {
  /** A skipper aboard through the live session the store uses. */
  async function skipperAboard() {
    vi.useFakeTimers({ now: T0 });
    const key = await memberKey("alice", CODE);
    useRooms.setState({ current: CODE, room: null, error: null });
    startRoomSession("alice", CODE, { sentAt: T0 - 100, ackAt: T0, skipper: true });
    for (let i = 0; i < 50 && !fake.on; i++) {
      await memberKey("x", CODE);
      await vi.advanceTimersByTimeAsync(0);
    }
    fake.on!.room(room([member(key, { seenAt: T0 - 50 }), member(B)]), { fromCache: false });
  }

  it("says the sailor left instead when the hat had moved on, with Report kept", async () => {
    await skipperAboard();
    fake.closeOutcome = "left";
    await useRooms.getState().closeRoom();
    expect(useRooms.getState()).toMatchObject({ current: null, notice: "left", noticeRoom: { code: CODE } });
    expect(useRooms.getState().error).toMatch(/weren't the skipper any more/);
  });

  it("puts the room back when closing couldn't reach it, so the sailor isn't left out of a room they're still in", async () => {
    await skipperAboard();
    fake.closeError = Object.assign(new Error("Failed to get document because the client is offline."), { code: "unavailable" });
    await useRooms.getState().closeRoom();
    expect(useRooms.getState().current).toBe(CODE);
    expect(useRooms.getState().error).toMatch(/still aboard/);
  });
});

describe("leaving from a tab with no copy of the room", () => {
  it("keeps the private note when the room can't be read (offline), and lets it go when the room refuses", async () => {
    vi.useFakeTimers({ now: T0 });
    useRooms.setState({ current: CODE, room: null });
    const waiting = new RoomSession("alice", CODE);
    fake.getRoomError = Object.assign(new Error("Failed to get document because the client is offline."), { code: "unavailable" });
    await expect(waiting.leave()).rejects.toMatchObject({ code: "unavailable" });
    expect(fake.forgot).toEqual([]);
    expect(fake.left).toEqual([]);
    const again = new RoomSession("alice", CODE);
    fake.getRoomError = Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    await again.leave();
    expect(fake.forgot).toEqual([CODE]);
  });

  it("puts the room back when the Leave button's leave can't reach it, so Leave can be tried again", async () => {
    vi.useFakeTimers({ now: T0 });
    useRooms.setState({ uid: "alice", current: CODE, room: null, error: null });
    fake.getRoomError = Object.assign(new Error("Failed to get document because the client is offline."), { code: "unavailable" });
    await useRooms.getState().leaveRoom({ tell: true });
    expect(useRooms.getState().current).toBe(CODE);
    expect(useRooms.getState().notice).toBeNull();
    expect(useRooms.getState().error).toMatch(/still aboard/);
    expect(fake.forgot).toEqual([]);
  });
});

describe("Lumi's note in every tab", () => {
  it("is saved with the room settings (so a tab the sailor is looking at shows it too), and dropped once it's older than a room", async () => {
    vi.useFakeTimers({ now: T0 });
    const key = await memberKey("alice", CODE);
    useRooms.setState({ current: CODE, room: null, notice: null, noticeRoom: null });
    const session = new RoomSession("alice", CODE, { sentAt: T0 - 100, ackAt: T0 });
    await session.begin();
    fake.on!.room(room([member(key, { seenAt: T0 - 50 }), member(B)]), { fromCache: false });
    fake.card = { code: CODE };
    fake.on!.error("permission-denied");
    for (let i = 0; i < 20 && useRooms.getState().current; i++) await vi.advanceTimersByTimeAsync(0);
    const saved = JSON.parse(JSON.stringify(savedRoomPrefs(useRooms.getState()))) as unknown;
    expect(saved).toMatchObject({ current: null, notice: "gone", noticeRoom: { code: CODE }, noticeAt: T0 });
    // Another tab reads it in (rehydrating ship:rooms) and shows the same note.
    expect(loadedRoomPrefs(saved)).toMatchObject({ current: null, notice: "gone", noticeRoom: { code: CODE } });
    vi.setSystemTime(T0 + 13 * 60 * MIN);
    expect(loadedRoomPrefs(saved)).toMatchObject({ notice: null, noticeRoom: null });
  });
});

describe("the account's rules answer", () => {
  it("is read again, not written back from this page's copy, when another tab has changed it", async () => {
    useRooms.setState({ uid: "alice", rulesOk: 0, over13: false, rulesState: null });
    fake.stamps = [{ rules: 0, over13: false }, { rules: 1, over13: true }];
    await useRooms.getState().syncRules();
    expect(useRooms.getState()).toMatchObject({ rulesOk: 0, rulesState: { uid: "alice", read: true } });
    // Another tab accepted the rules (with the 13+ tick) and saved them; this tab read them in.
    useRooms.setState({ rulesOk: 1, over13: true });
    await useRooms.getState().syncRules();
    expect(useRooms.getState()).toMatchObject({ rulesOk: 1, over13: true });
    expect(fake.stampReads).toBe(2);
  });

  it("is never taken back by a card that couldn't show it", async () => {
    useRooms.setState({ uid: "alice", rulesOk: 0, over13: false });
    await useRooms.getState().acceptRules(false, { sawAccount: false });
    expect(fake.accepted.at(-1)).toEqual({ over13: false, opts: { keepOver13: true } });
    await useRooms.getState().acceptRules(false, { sawAccount: true });
    expect(fake.accepted.at(-1)).toEqual({ over13: false, opts: { keepOver13: false } });
  });
});

describe("a join refused by the 10 s between joins", () => {
  // Well after the other tests' joins (this page's own last join doesn't hold these up).
  const LATER = T0 + 60 * MIN;
  const refusedJoin = async (joinedAgoMs: number) => {
    // Load what the store loads on demand first (with real time), so fake time doesn't run on while modules load.
    fake.card = null;
    await useRooms.getState().loadPreview(CODE);
    vi.useFakeTimers({ now: LATER });
    useRooms.setState({ uid: "alice", current: null, room: null, rulesOk: 1, over13: true, error: null });
    fake.joinRefused = true;
    fake.server = null;
    fake.card = { code: CODE, mode: "invite", name: [0, 0], subject: 0, at: LATER - MIN, listed: false, locked: false, aboard: 2, aliveAt: LATER };
    fake.joinedAt = LATER - joinedAgoMs;
    const join = useRooms.getState().joinRoom(CODE, { nick: [1, 2, 7], costume: 0, accessory: 0 });
    // Just past the cooldown's wait (fake time stops there while the join's real hashing finishes).
    await vi.advanceTimersByTimeAsync(11_000);
    await join;
    return useRooms.getState().error;
  };

  it("says to wait a few seconds when the account joined a moment ago (another tab), not that the sailor can't rejoin", async () => {
    expect(await refusedJoin(3000)).toBe(JOIN_COOLDOWN_TEXT);
  });

  it("still reads as a ban when the account's last join was long ago", async () => {
    expect(await refusedJoin(5 * MIN)).toBe("You can't rejoin this room.");
  });
});

describe("a device whose clock runs fast, before any room", () => {
  it("judges a room's card by the server's clock, so a live room isn't shown as finished or cleared", async () => {
    // Later than any earlier measurement, so the clock is measured afresh.
    const NOW = T0 + 5 * 60 * MIN;
    vi.useFakeTimers({ now: NOW });
    // This laptop's clock is 30 minutes fast: the server says NOW - 30 min, and the skipper was seen a minute before that.
    fake.serverAhead = -30 * MIN;
    const live = { code: CODE, mode: "open" as const, name: [0, 0] as [number, number], subject: 0, at: NOW - 60 * MIN, listed: true, locked: false, aboard: 2, aliveAt: NOW - 31 * MIN };
    fake.card = live;
    useRooms.setState({ uid: "alice", current: null, room: null, rulesOk: 1, over13: true, preview: null, serverOffset: 0 });
    await useRooms.getState().loadPreview(CODE);
    expect(useRooms.getState().preview).toMatchObject({ code: CODE, problem: null });
    fake.openCards = [live];
    await useRooms.getState().loadOpenRooms();
    expect(fake.cleared).toEqual([]);
  });
});

describe("reporting after leaving", () => {
  it("Leave leaves Lumi's note with the room, and Report then reports that room, though the sailor isn't aboard", async () => {
    vi.useFakeTimers({ now: T0 });
    useRooms.setState({ uid: "alice", current: CODE, room: room([member(B)]), recent: [{ code: CODE, name: [3, 4], at: T0, skipper: false }], notice: null, noticeRoom: null });
    fake.server = null;
    await useRooms.getState().leaveRoom({ tell: true });
    expect(useRooms.getState()).toMatchObject({ current: null, notice: "left", noticeRoom: { code: CODE, name: [0, 0] } });
    await useRooms.getState().report("unkind");
    expect(fake.reports).toEqual([{ code: CODE, reason: "unkind", known: false }]);
    expect(useRooms.getState().reported).toContain(CODE);
  });
});

describe("signing out and in on a shared browser", () => {
  it("drops Lumi's note and the invite it was answering on sign-out, so the next person never sees them or comes aboard that room", () => {
    useRooms.setState({ uid: "alice", notice: "removed", noticeRoom: { code: CODE, name: [1, 2] }, noticeAt: Date.now() });
    useUi.getState().setRoomInvite(CODE, "Log in to study with a crew.");
    roomsSignedOut();
    expect(useRooms.getState()).toMatchObject({ notice: null, noticeRoom: null });
    expect(useUi.getState()).toMatchObject({ roomInvite: null, roomInviteRefusal: null });
  });

  it("keeps an invite for the sailor who logged in to answer it, but never a refusal recorded while signed out", () => {
    useUi.getState().setRoomInvite(CODE, "Log in to study with a crew.");
    roomsSignedIn();
    expect(useUi.getState()).toMatchObject({ roomInvite: CODE, roomInviteRefusal: null });
    useUi.getState().setRoomInvite(null);
  });
});

describe("a broken invite link's note", () => {
  it("stays while Study Rooms is open (from the link), and goes when the panel closes or Log in opens", () => {
    useUi.getState().setRoomLinkProblem("That invite link doesn't work.");
    useUi.getState().openPanel("rooms");
    expect(useUi.getState().roomLinkProblem).toMatch(/doesn't work/);
    useUi.getState().openPanel(null);
    expect(useUi.getState().roomLinkProblem).toBeNull();
    useUi.getState().setRoomLinkProblem("That invite link doesn't work.");
    useUi.getState().setLoginOpen(true);
    expect(useUi.getState().roomLinkProblem).toBeNull();
    useUi.getState().setLoginOpen(false);
  });
});
