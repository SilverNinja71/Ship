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
    fake.writes.push({ patch, opts });
    if (fake.hold) await fake.hold;
  },
  getCard: async () => fake.card,
  getRoom: async () => fake.server,
  getRoomFromServer: async () => fake.server,
  forgetRoom: async () => undefined,
  clearDeadRoom: async () => undefined,
  removeSailor: async (_room: unknown, _me: string, gone: string) => {
    fake.removed.push(gone);
  },
  takeHat: async () => {
    fake.tookHat++;
  },
  leaveRoom: async () => undefined,
  skipperWrite: async (_room: unknown, _key: string, change: unknown) => {
    fake.skipper.push(change);
  },
  readGameDeck: async () => {
    if (fake.deckCards instanceof Error) throw fake.deckCards;
    return fake.deckCards;
  },
  closeRoom: async () => undefined,
  roomErrorCode: (e: unknown) => String((e as { code?: unknown })?.code ?? "unknown"),
}));

import { RoomSession, startRoomSession, stopRoomSession } from "./roomSession.js";
import { DECK_HIDDEN_TEXT, DECK_LOCKED_TEXT, memberKey } from "./roomRules.js";
import { deckIdentity, gameDeck, pickOffer, useRooms } from "../stores/roomStore.js";
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
    const tidy = { kind: "tidy" as const, v: 1 as const, seed: 5, at: T0, seats: [key, B] };
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
    await aboard();
    fake.card = null;
    fake.on!.error("permission-denied");
    await vi.advanceTimersByTimeAsync(1);
    expect(useRooms.getState()).toMatchObject({ current: null, notice: "closed" });

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
    const game = { kind: "bottle" as const, v: 1 as const, seed: 77, at: T0, seats: [me], cards: 12, turn: 2, holder: me, turnAt: T0, card: 1, delivered: 1, buoys: 5, rescue: false, goal: 6, end: 0 as const };
    expect(pickOffer(room([member(me, { state: 2 })], { sail, game }), me, docked, T0 + 10_000, 0)).toEqual({ kind: "your-turn", seed: 77, turn: 2 });
  });
});

describe("which deck a game deals from", () => {
  const me = "a".repeat(64);
  const cards = [{ id: "0", front: "a", back: "1" }];
  const tidy = (seed: number) => ({ kind: "tidy" as const, v: 1 as const, seed, at: T0, seats: [me] });

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
    fake.on!.room(room([member(key, { seenAt: T0 - 50 })], { deck: { bottleId: "deckA", cards: 10 }, game: { kind: "tidy", v: 1, seed: 3, at: T0, seats: [key] } }), { fromCache: false });
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
    expect(fake.skipper).toEqual([{ game: { kind: "bottle", goal: 6, cards: 7 }, seats: [expect.any(String)] }]);
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
