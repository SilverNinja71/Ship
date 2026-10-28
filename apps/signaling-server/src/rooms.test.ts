import { describe, expect, it } from "vitest";
import type { ServerMessage } from "@ship/shared-types";
import { CrewHub } from "./rooms.js";
import type { CrewHubOptions } from "./rooms.js";

const avatar = {
  name: "Ada",
  skin: "honey",
  hair: "bob",
  hairColor: "#5A3A22",
  hat: "straw-hat",
  coat: "striped-shirt",
  coatColor: "#C2524A",
  accessory: "none",
  tool: "quill-logbook",
} as const;

function member(name: string) {
  return { name, avatar, shipId: "woolly-wanderer", state: "SAILING_FOCUS", focusMinutesToday: 0, audio: false, video: false } as const;
}

function setup(options: CrewHubOptions = {}) {
  let now = 1_700_000_000_000;
  let ids = 0;
  const hub = new CrewHub({ now: () => now, newPeerId: () => `p${++ids}`, ...options });

  function client() {
    const inbox: ServerMessage[] = [];
    const conn = hub.connect((message) => inbox.push(message));
    return {
      conn,
      inbox,
      send: (message: unknown) => conn.handle(JSON.stringify(message)),
      /** Returns and clears everything received so far. */
      take: () => inbox.splice(0),
    };
  }

  /** A client that has joined `room` with its inbox cleared. */
  function sailor(name: string, room = "deck") {
    const c = client();
    c.send({ t: "join", room, member: member(name) });
    c.take();
    return c;
  }

  return { hub, client, sailor, advance: (ms: number) => (now += ms), now: () => now };
}

describe("joining and leaving", () => {
  it("welcomes the joiner and tells the others", () => {
    const { client, now } = setup();
    const ada = client();
    ada.send({ t: "join", room: " Deck ", member: member("Ada") });
    const [welcome] = ada.take();
    expect(welcome).toEqual({
      t: "welcome",
      peerId: "p1",
      room: "deck",
      members: [{ peerId: "p1", ...member("Ada"), seat: 0, joinedAt: now() }],
      quest: { beastId: "procrastination-kraken", hp: 120, maxHp: 120, defeated: 0, rewards: [] },
    });

    const bo = client();
    bo.send({ t: "join", room: "deck", member: member("Bo") });
    const [boWelcome] = bo.take();
    expect(boWelcome?.t === "welcome" && boWelcome.members.map((m) => [m.peerId, m.seat])).toEqual([
      ["p1", 0],
      ["p2", 1],
    ]);
    expect(ada.take()).toEqual([{ t: "member-joined", member: expect.objectContaining({ peerId: "p2", name: "Bo", seat: 1 }) }]);
  });

  it("hands out the lowest free seat", () => {
    const { sailor, client } = setup();
    const sailors = ["A", "B", "C"].map((name) => sailor(name));
    sailors[1]!.send({ t: "leave" });
    const d = client();
    d.send({ t: "join", room: "deck", member: member("D") });
    const [welcome] = d.take();
    expect(welcome?.t === "welcome" && welcome.members.find((m) => m.peerId === d.conn.peerId)?.seat).toBe(1);
  });

  it("turns the 9th sailor away", () => {
    const { sailor, client } = setup();
    for (let i = 0; i < 8; i++) sailor(`S${i}`);
    const ninth = client();
    ninth.send({ t: "join", room: "deck", member: member("Nine") });
    expect(ninth.take()).toEqual([{ t: "error", code: "room-full", message: expect.any(String) }]);
    expect(ninth.conn.room).toBeNull();
  });

  it("tells the room when someone leaves or disconnects", () => {
    const { sailor, hub } = setup();
    const ada = sailor("Ada");
    const bo = sailor("Bo");
    const cy = sailor("Cy");
    ada.take();
    bo.take();
    bo.send({ t: "leave" });
    expect(ada.take()).toEqual([{ t: "member-left", peerId: bo.conn.peerId }]);
    expect(bo.conn.room).toBeNull();
    bo.send({ t: "shout", text: "hello?" });
    expect(bo.take()).toEqual([{ t: "error", code: "not-joined", message: expect.any(String) }]);

    cy.conn.disconnect();
    cy.conn.disconnect();
    expect(ada.take()).toEqual([{ t: "member-left", peerId: cy.conn.peerId }]);
    expect(hub.stats()).toEqual({ rooms: 1, members: 1, connections: 2 });
  });

  it("moves to another room on a second join, and refuses joining the same room twice", () => {
    const { sailor } = setup();
    const ada = sailor("Ada");
    const bo = sailor("Bo");
    ada.take();
    bo.send({ t: "join", room: "DECK", member: member("Bo") });
    expect(bo.take()).toEqual([{ t: "error", code: "bad-message", message: expect.any(String) }]);
    bo.send({ t: "join", room: "galley", member: member("Bo") });
    expect(bo.take()).toEqual([expect.objectContaining({ t: "welcome", room: "galley" })]);
    expect(ada.take()).toEqual([{ t: "member-left", peerId: bo.conn.peerId }]);
  });
});

describe("before joining", () => {
  it("answers ping but nothing else", () => {
    const { client } = setup();
    const c = client();
    c.send({ t: "ping" });
    for (const message of [
      { t: "presence", patch: { state: "DRIFTING_IDLE" } },
      { t: "focus-tick", minutes: 1 },
      { t: "signal", to: "p2", data: { kind: "offer", sdp: "v=0" } },
      { t: "shout", text: "ahoy" },
      { t: "leave" },
    ]) {
      c.send(message);
    }
    const codes = c.take().map((m) => (m.t === "error" ? m.code : m.t));
    expect(codes).toEqual(["pong", "not-joined", "not-joined", "not-joined", "not-joined", "not-joined"]);
  });

  it("calls bad JSON and unknown shapes bad-message", () => {
    const { client } = setup();
    const c = client();
    c.conn.handle("not json");
    c.send({ t: "hoist-sails" });
    c.send({ t: "join", room: "deck" });
    expect(c.take().map((m) => m.t === "error" && m.code)).toEqual(["bad-message", "bad-message", "bad-message"]);
  });
});

describe("presence", () => {
  it("broadcasts validated patches to the whole room, ignoring server-owned fields", () => {
    const { sailor } = setup();
    const ada = sailor("Ada");
    const bo = sailor("Bo");
    ada.take();
    bo.send({ t: "presence", patch: { state: "SHORE_LEAVE_BREAK", focusMinutesToday: 30, seat: 7, peerId: "p1" } });
    const update = { t: "member-updated", member: expect.objectContaining({ peerId: "p2", seat: 1, state: "SHORE_LEAVE_BREAK", focusMinutesToday: 30 }) };
    expect(ada.take()).toEqual([update]);
    expect(bo.take()).toEqual([update]);

    bo.send({ t: "presence", patch: { state: "ASLEEP" } });
    expect(bo.take()).toEqual([{ t: "error", code: "bad-message", message: expect.stringContaining("state") }]);
    expect(ada.take()).toEqual([]);
  });
});

describe("quest", () => {
  it("turns focus ticks into damage for everyone to see", () => {
    const { sailor, advance } = setup();
    const ada = sailor("Ada");
    const bo = sailor("Bo");
    ada.take();
    advance(60_000);
    bo.send({ t: "focus-tick", minutes: 1 });
    const quest = {
      t: "quest",
      quest: { beastId: "procrastination-kraken", hp: 119, maxHp: 120, defeated: 0, rewards: [] },
      hit: { by: bo.conn.peerId, damage: 1 },
      defeatedBeast: null,
    };
    expect(ada.take()).toEqual([quest]);
    expect(bo.take()).toEqual([quest]);
  });

  it("credits honest once-a-minute ticks in full, even with jitter", () => {
    const { sailor, advance, hub } = setup();
    const ada = sailor("Ada");
    for (const ms of [59_000, 61_000, 58_500, 61_500, 60_000]) {
      advance(ms);
      ada.send({ t: "focus-tick", minutes: 1 });
    }
    expect(ada.take().map((m) => m.t === "quest" && m.hit?.damage)).toEqual([1, 1, 1, 1, 1]);
    expect(hub.questOf("deck")?.hp).toBe(115);
  });

  it("clamps ticks to the time that actually passed", () => {
    const { sailor, advance } = setup();
    const ada = sailor("Ada");
    advance(60_000);
    ada.send({ t: "focus-tick", minutes: 100 });
    // 60 s since joining plus 15 s of slack.
    expect(ada.take()).toEqual([expect.objectContaining({ t: "quest", hit: { by: "p1", damage: 1.25 } })]);

    ada.send({ t: "focus-tick", minutes: 1 });
    expect(ada.take()).toEqual([{ t: "error", code: "rate-limited", message: expect.any(String) }]);

    advance(60_000);
    ada.send({ t: "focus-tick", minutes: 5 });
    // The slack was already spent, so only the minute that passed counts.
    expect(ada.take()).toEqual([expect.objectContaining({ t: "quest", hit: { by: "p1", damage: 1 } })]);
  });

  it("refuses non-positive and non-finite ticks", () => {
    const { sailor, advance } = setup();
    const ada = sailor("Ada");
    advance(60_000);
    ada.send({ t: "focus-tick", minutes: 0 });
    ada.send({ t: "focus-tick", minutes: -5 });
    ada.conn.handle('{"t":"focus-tick","minutes":1e999}');
    expect(ada.take().map((m) => m.t === "error" && m.code)).toEqual(["bad-message", "bad-message", "bad-message"]);
  });

  it("defeats the beast, shares the reward and moves on", () => {
    const { sailor, advance } = setup();
    const ada = sailor("Ada");
    advance(3 * 60 * 60_000);
    ada.send({ t: "focus-tick", minutes: 150 });
    expect(ada.take()).toEqual([
      {
        t: "quest",
        quest: { beastId: "doomscroll-leviathan", hp: 200, maxHp: 200, defeated: 1, rewards: ["kraken"] },
        hit: { by: "p1", damage: 120 },
        defeatedBeast: "procrastination-kraken",
      },
    ]);
  });

  it("keeps a room's progress after everyone leaves", () => {
    const { sailor, client, advance } = setup();
    const ada = sailor("Ada");
    advance(10 * 60_000);
    ada.send({ t: "focus-tick", minutes: 10 });
    ada.conn.disconnect();
    const bo = client();
    bo.send({ t: "join", room: "deck", member: member("Bo") });
    expect(bo.take()).toEqual([expect.objectContaining({ t: "welcome", quest: expect.objectContaining({ hp: 110 }) })]);
  });

  it("forgets the longest-empty room when too many are kept", () => {
    const { sailor, advance, hub } = setup({ maxRooms: 2 });
    sailor("A", "one").conn.disconnect();
    advance(1000);
    sailor("B", "two").conn.disconnect();
    sailor("C", "three");
    expect(hub.questOf("one")).toBeNull();
    expect(hub.questOf("two")).not.toBeNull();
  });
});

describe("signals", () => {
  it("relays only to a member of the same room, with `from` set by the server", () => {
    const { sailor } = setup();
    const ada = sailor("Ada");
    const bo = sailor("Bo");
    const cy = sailor("Cy", "galley");
    ada.take();
    ada.send({ t: "signal", to: bo.conn.peerId, from: cy.conn.peerId, data: { kind: "offer", sdp: "v=0" } });
    expect(bo.take()).toEqual([{ t: "signal", from: ada.conn.peerId, data: { kind: "offer", sdp: "v=0" } }]);

    for (const to of [cy.conn.peerId, ada.conn.peerId, "nobody"]) {
      ada.send({ t: "signal", to, data: { kind: "answer", sdp: "v=0" } });
    }
    expect(ada.take().map((m) => m.t === "error" && m.code)).toEqual(["bad-message", "bad-message", "bad-message"]);
    expect(cy.take()).toEqual([]);
  });
});

describe("shouts and floods", () => {
  it("broadcasts cleaned shouts with the sender's name and the server's time", () => {
    const { sailor, now } = setup();
    const ada = sailor("Ada");
    const bo = sailor("Bo");
    ada.take();
    bo.send({ t: "shout", text: "  Land\nho!  " });
    const shout = { t: "shout", from: bo.conn.peerId, name: "Bo", text: "Land ho!", at: now() };
    expect(ada.take()).toEqual([shout]);
    expect(bo.take()).toEqual([shout]);
  });

  it("allows 5 shouts per 10 seconds", () => {
    const { sailor, advance } = setup();
    const ada = sailor("Ada");
    for (let i = 0; i < 6; i++) ada.send({ t: "shout", text: `shout ${i}` });
    expect(ada.take().map((m) => (m.t === "error" ? m.code : m.t))).toEqual(["shout", "shout", "shout", "shout", "shout", "rate-limited"]);
    advance(10_000);
    ada.send({ t: "shout", text: "again" });
    expect(ada.take().map((m) => m.t)).toEqual(["shout"]);
  });

  it("drops a message flood, saying so only once", () => {
    const { client, advance } = setup({ messageLimit: { burst: 3, perSecond: 1 } });
    const c = client();
    for (let i = 0; i < 6; i++) c.send({ t: "ping" });
    expect(c.take().map((m) => (m.t === "error" ? m.code : m.t))).toEqual(["pong", "pong", "pong", "rate-limited"]);
    advance(1000);
    c.send({ t: "ping" });
    expect(c.take().map((m) => m.t)).toEqual(["pong"]);
  });
});
