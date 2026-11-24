// The room session's own rules, with the database faked: one merged write per 15 s gap, focus
// minutes no faster than the rules allow, idle pauses never sent, and both ways of losing a room.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Room, RoomMember, RoomSail } from "@ship/shared-types";
import type { SelfPatch } from "./roomRules.js";

const fake = vi.hoisted(() => ({
  writes: [] as { patch: SelfPatch; opts: { cardAlive?: boolean } }[],
  on: null as null | { room(r: unknown, meta: { fromCache: boolean }): void; error(code: string): void },
  card: null as unknown,
}));

vi.mock("./rooms.js", () => ({
  watchRoom: (_code: string, on: typeof fake.on) => {
    fake.on = on;
    return () => {
      fake.on = null;
    };
  },
  writeSelf: async (_code: string, _key: string, patch: SelfPatch, opts: { cardAlive?: boolean } = {}) => {
    fake.writes.push({ patch, opts });
  },
  getCard: async () => fake.card,
  forgetRoom: async () => undefined,
  clearDeadRoom: async () => undefined,
  removeSailor: async () => undefined,
  takeHat: async () => undefined,
  leaveRoom: async () => undefined,
  closeRoom: async () => undefined,
  roomErrorCode: (e: unknown) => String((e as { code?: unknown })?.code ?? "unknown"),
}));

import { RoomSession } from "./roomSession.js";
import { memberKey } from "./roomRules.js";
import { pickOffer, useRooms } from "../stores/roomStore.js";
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

afterEach(() => {
  vi.useRealTimers();
  fake.writes = [];
  fake.card = null;
  useVoyage.setState({ ...DOCKED, prepEndsAt: null });
  useRooms.setState({ current: null, room: null, myKey: null, status: "idle", notice: null, noticeRoom: null, offer: null });
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

describe("losing the room", () => {
  it("a snapshot without me, with my key banned, means the skipper removed me", async () => {
    const { key } = await aboard();
    fake.on!.room(room([member("b".repeat(64))], { banned: [key] }), { fromCache: false });
    expect(useRooms.getState()).toMatchObject({ current: null, room: null, status: "idle", notice: "removed", noticeRoom: { code: CODE } });
  });

  it("a snapshot without me and no ban means I drifted out", async () => {
    await aboard();
    fake.on!.room(room([member("b".repeat(64))]), { fromCache: false });
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

  it("puts the bottle first when it's my turn", () => {
    const game = { kind: "bottle" as const, v: 1 as const, seed: 77, at: T0, seats: [me], turn: 2, holder: me, turnAt: T0, card: 1, delivered: 1, buoys: 5, rescue: false, goal: 6, end: 0 as const };
    expect(pickOffer(room([member(me, { state: 2 })], { sail, game }), me, docked, T0 + 10_000, 0)).toEqual({ kind: "your-turn", seed: 77, turn: 2 });
  });
});
