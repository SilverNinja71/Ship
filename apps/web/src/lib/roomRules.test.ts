import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { NICK_NUMBER_SKIP, ROOM_CODE_ALPHABET, ROOM_LIMITS } from "@ship/shared-types";
import type { BottleGame, Room, RoomCard, RoomMember, RoomSail, TidyGame } from "@ship/shared-types";
import { seededRng } from "@ship/active-recall-engine";
import {
  bottleGoal,
  bottleOver,
  bottleStep,
  canTakeHelm,
  cardTextId,
  creditableMinutes,
  creditedDamage,
  deadCards,
  estimateOffset,
  formatCode,
  gameSeats,
  inviteLink,
  hasTwin,
  isRoomOver,
  isSkipperGone,
  isSkipperQuiet,
  memberName,
  joinProblem,
  listView,
  listedAfterReport,
  liveDamage,
  memberKey,
  legStartedAt,
  mergeSelf,
  mergeTidy,
  rememberTidy,
  SAIL_ON_WINDOW,
  newMemberFields,
  newRoomCode,
  nextPresentSeat,
  nextSkipper,
  nickText,
  normalizeCode,
  parseInviteHash,
  inviteHashProblem,
  readInviteLink,
  steadySailWords,
  reportIsStrike,
  stayedAboard,
  presence,
  presetFor,
  randomLook,
  randomNick,
  reportKey,
  roomNameText,
  roomProblem,
  roomRecordId,
  roomRewards,
  roomSessionStop,
  roomStateFor,
  sailOffer,
  sailStatus,
  sceneMates,
  shownQuest,
  statusLine,
  subjectText,
  sweepAction,
  tidyStatus,
  toCard,
  toPracticeCards,
  toRoom,
  withoutInviteHash,
} from "./roomRules.js";
import type { BottleOutcome } from "./roomRules.js";

const SEC = 1000;
const MIN = 60 * SEC;
const T0 = Date.UTC(2026, 10, 24, 12, 0, 0);
const CODE = "K7MP2QXA";
// Sailor keys are 64 hex characters (sha256); A sorts before B before C…
const [A, B, C, D, E, F, G] = ["a", "b", "c", "d", "e", "f", "0"].map((ch) => ch.repeat(64)) as [string, string, string, string, string, string, string];

function member(key: string, extra: Partial<RoomMember> = {}): RoomMember {
  return {
    key,
    nick: [0, 0, 7],
    costume: 0,
    accessory: 0,
    state: 0,
    endsAt: null,
    joinedAt: T0,
    seenAt: T0,
    dmg: 0,
    creditedAt: T0,
    say: -1,
    sayAt: null,
    tidy: { gid: 0, patches: 0, ms: 0, mixups: 0 },
    ...extra,
  };
}

function room(members: RoomMember[], extra: Partial<Room> = {}): Room {
  return {
    code: CODE,
    mode: "invite",
    name: [0, 0],
    subject: 0,
    at: T0,
    host: members[0]?.key ?? A,
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
    ...extra,
  };
}

function card(code: string, extra: Partial<RoomCard> = {}): RoomCard {
  return { code, mode: "open", name: [0, 0], subject: 0, at: T0, listed: true, locked: false, aboard: 1, aliveAt: T0, ...extra };
}

function bottle(extra: Partial<BottleGame> = {}): BottleGame {
  return { kind: "bottle", v: 2, seed: 99, at: T0, seats: [A, B, C], cards: 12, turn: 0, holder: A, turnAt: T0, card: 0, delivered: 0, buoys: 5, rescue: false, goal: 6, end: 0, ...extra };
}

describe("privacy", () => {
  it("builds a new sailor's entry from the look alone, with exactly the 12 core keys", () => {
    const sneaky = { nick: [1, 2, 42], costume: 2, accessory: 3, name: "Jane Doe", email: "jane@school.edu", objective: "Mrs Smith's essay" } as unknown as Parameters<typeof newMemberFields>[0];
    const fields = newMemberFields(sneaky);
    expect(Object.keys(fields).sort()).toEqual(["a", "c", "dmg", "end", "g", "gid", "gp", "gt", "n", "say", "sayAt", "st"]);
    const text = JSON.stringify(fields);
    for (const secret of ["Jane Doe", "jane@school.edu", "Mrs Smith's essay"]) expect(text).not.toContain(secret);
    expect(fields).toEqual({ n: [1, 2, 42], c: 2, a: 3, st: 0, end: null, dmg: 0, say: -1, sayAt: null, gid: 0, g: 0, gt: 0, gp: 0 });
  });

  it("keeps a look inside what the rules accept", () => {
    const fields = newMemberFields({ nick: [999, -1, 69], costume: 9, accessory: 2.5 });
    expect(fields.n[0]).toBeLessThan(64);
    expect(fields.n[1]).toBe(0);
    expect(NICK_NUMBER_SKIP).not.toContain(fields.n[2]);
    expect([fields.c, fields.a]).toEqual([0, 0]);
  });
});

describe("codes and links", () => {
  it("makes codes from the alphabet only, one byte per character", () => {
    expect(newRoomCode(() => new Uint8Array([0, 31, 32, 255, 8, 40, 100, 200]))).toBe("A9A9JJEJ");
    const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));
    for (let i = 0; i < 200; i++) expect(newRoomCode(random)).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(ROOM_CODE_ALPHABET).toHaveLength(32);
  });

  it("tidies typed codes, and says what's wrong", () => {
    expect(normalizeCode(" k7mp-2qxa ")).toEqual({ ok: true, code: CODE });
    expect(normalizeCode("K7MP 2QXA")).toEqual({ ok: true, code: CODE });
    expect(normalizeCode("https://silverninja71.github.io/Ship/#room=k7mp-2qxa")).toEqual({ ok: true, code: CODE });
    const reason = (input: string) => {
      const r = normalizeCode(input);
      return r.ok ? "" : r.reason;
    };
    expect(reason("")).toMatch(/8 letters/);
    expect(reason("K7MP2QXO")).toMatch(/I or O.*0 or 1/);
    expect(reason("K1MP2QXA")).toMatch(/I or O.*0 or 1/);
    expect(reason("K7MP!2QX")).toMatch(/letters and numbers/);
    expect(reason("K7MP2Q")).toMatch(/too short/);
    expect(reason("K7MP2QXAB")).toMatch(/too long/);
  });

  it("formats a code in two halves", () => {
    expect(formatCode(CODE)).toBe("K7MP 2QXA");
  });

  it("gives screen readers steady words for a sail call, never minutes that change each minute", () => {
    const sail: RoomSail = { at: T0, focus: 25, brk: 5, cycles: 2 };
    const docked = { phase: "docked" as const, prepEndsAt: null };
    const four = sailOffer(sail, docked, T0 + 3 * MIN + 30 * SEC);
    const three = sailOffer(sail, docked, T0 + 4 * MIN + 30 * SEC);
    expect(four).toMatchObject({ kind: "hop-aboard", leg: 1 });
    expect(three).toMatchObject({ kind: "hop-aboard", leg: 1 });
    expect((four as { focusMinutes: number }).focusMinutes).not.toBe((three as { focusMinutes: number }).focusMinutes);
    expect(steadySailWords(four as { kind: "hop-aboard"; leg: number })).toBe(steadySailWords(three as { kind: "hop-aboard"; leg: number }));
    expect(steadySailWords({ kind: "hop-aboard", leg: 2 })).toBe("Next leg is starting: hop aboard?");
    expect(steadySailWords({ kind: "sail-with" })).not.toMatch(/\d/);
  });

  it("reads invite links and leaves other #fragments alone", () => {
    expect(parseInviteHash("#room=k7mp-2qxa")).toBe(CODE);
    expect(parseInviteHash("#room=K7MP%202QXA")).toBe(CODE);
    expect(parseInviteHash("#tab=1&room=K7MP2QXA")).toBe(CODE);
    expect(parseInviteHash("#top")).toBeNull();
    expect(parseInviteHash("#room=nope")).toBeNull();
    expect(parseInviteHash("")).toBeNull();

    const link = inviteLink(CODE, "https://silverninja71.github.io", "/Ship/");
    expect(link).toBe("https://silverninja71.github.io/Ship/#room=K7MP2QXA");
    expect(parseInviteHash(new URL(link).hash)).toBe(CODE);

    expect(withoutInviteHash("#room=K7MP2QXA")).toBe("");
    expect(withoutInviteHash("#tab=1&room=K7MP2QXA")).toBe("#tab=1");
    expect(withoutInviteHash("#top")).toBe("#top");
  });

  it("says what's wrong with a broken invite link (cut short, or an O for a 0), and nothing for a good one or none", () => {
    expect(inviteHashProblem("#room=K7MP2QX")).toMatch(/^That invite link doesn't work: that code is too short/);
    expect(inviteHashProblem("#room=K7MP-2QXO")).toMatch(/never use the letters I or O/);
    expect(inviteHashProblem("#room=")).toMatch(/type the room's code/);
    expect(inviteHashProblem("#room=K7MP2QXA")).toBeNull();
    expect(inviteHashProblem("#top")).toBeNull();
    expect(inviteHashProblem("")).toBeNull();
    // What the page does with a link: a good one opens its room; a broken one is still taken out, with its problem.
    expect(readInviteLink("#room=K7MP2QXA")).toEqual({ code: CODE, problem: null });
    expect(readInviteLink("#room=K7MP2QX")).toMatchObject({ code: null, problem: expect.stringMatching(/too short/) });
    expect(readInviteLink("#top")).toBeNull();
  });
});

describe("keys", () => {
  it("match the rules' sha256(uid + '/' + code) in lowercase hex", async () => {
    expect(await memberKey("alice", CODE)).toBe(createHash("sha256").update(`alice/${CODE}`).digest("hex"));
    expect(await reportKey("alice", CODE)).toBe(createHash("sha256").update(`report/alice/${CODE}`).digest("hex"));
    expect(await memberKey("alice", CODE)).not.toBe(await memberKey("alice", "K7MP2QXB"));
  });
});

describe("made-up names", () => {
  it("never gives a skipped nickname number, over 10,000 seeds", () => {
    for (let seed = 0; seed < 10_000; seed++) {
      const [adjective, noun, number] = randomNick(seededRng(seed));
      expect(NICK_NUMBER_SKIP.includes(number) || number < 1 || number > 99).toBe(false);
      expect(nickText([adjective, noun, number])).toMatch(/^\S+ \S+ \d+$/);
    }
    expect(randomNick(() => 0.9999999)[2]).toBe(99);
  });

  it("never dresses you as the banana, and starts with no accessory", () => {
    for (let seed = 0; seed < 2_000; seed++) {
      const look = randomLook(seededRng(seed));
      expect(look.costume).toBeLessThan(4);
      expect(look.accessory).toBe(0);
    }
  });

  it("turns indices into words, with stand-ins for words a newer app added", () => {
    expect(nickText([0, 0, 42])).toBe("Cozy Dango 42");
    expect(nickText([63, 0, 42])).toBe("Sailor 42");
    expect(roomNameText([0, 0])).toBe("Mellow Lighthouse");
    expect(roomNameText([0, 63])).toBe("Study Room");
    expect(subjectText(3)).toBe("Physics");
    expect(subjectText(39)).toBe("Another subject");
  });
});

describe("own writes", () => {
  it("merges queued changes: the later wins and focus minutes add up", () => {
    expect(mergeSelf({ st: 1, endsAt: 5, addDmg: 2, say: 3 }, { st: 2, endsAt: null, addDmg: 1 })).toEqual({ st: 2, endsAt: null, addDmg: 3, say: 3 });
    expect(mergeSelf({}, { say: 4 })).toEqual({ say: 4 });
  });

  it("maps the timer's phase to a room state, with preparing counted as in port", () => {
    expect(roomStateFor("docked", null)).toBe(0);
    expect(roomStateFor("docked", T0)).toBe(0);
    expect(roomStateFor("sailing", null)).toBe(1);
    expect(roomStateFor("shore-leave", null)).toBe(2);
    expect(roomStateFor("drifting", null)).toBe(3);
  });

  it("lets a sailor claim one focus minute per minute since their last credit, plus one", () => {
    const m = member(A, { creditedAt: T0 });
    expect(creditableMinutes(m, T0)).toBe(1);
    expect(creditableMinutes(m, T0 + 59 * SEC)).toBe(1);
    expect(creditableMinutes(m, T0 + MIN)).toBe(2);
    // The rules refuse 5 minutes claimed 2 minutes after a credit.
    expect(creditableMinutes(m, T0 + 2 * MIN)).toBe(3);
    expect(creditableMinutes(m, T0 - 5 * MIN)).toBe(0);
  });
});

describe("kept cards", () => {
  it("names a kept card by its two sides: the same card the same, any other card differently", () => {
    expect(cardTextId("ATP?", "Energy")).toBe(cardTextId(" ATP? ", "Energy "));
    const ids = new Set(Array.from({ length: 2000 }, (_, i) => cardTextId(`Question ${i}`, `Answer ${i % 7}`)));
    expect(ids.size).toBe(2000);
    // A second deck in the same room, with cards in the same places, never reuses the first deck's ids.
    expect(cardTextId("Mitosis?", "Cell division")).not.toBe(cardTextId("Covalent bond?", "Shared electrons"));
    expect(cardTextId("a", "bc")).not.toBe(cardTextId("ab", "c"));
  });
});

describe("reading a room back", () => {
  const ts = (ms: number) => ({ toMillis: () => ms });
  const entry = (joined: number, extra: Record<string, unknown> = {}) => ({
    n: [1, 2, 3], c: 1, a: 2, st: 1, end: ts(T0 + 20 * MIN), in: ts(joined), seen: ts(joined), dmg: 4, cr: ts(joined), say: 25, sayAt: ts(joined), gid: 7, g: 3, gt: 1000, gp: 2, ...extra,
  });
  const data = () => ({
    v: 1, mode: "open", name: [3, 4], subj: 5, at: ts(T0), host: B, listed: true, locked: false, ban: [C], rep: [], why: { spam: 1 }, banked: 10, last: null,
    sail: { at: ts(T0), f: 25, b: 5, c: 2 }, deck: { b: "BOTTLE1", n: 12 },
    game: { kind: "bottle", v: 2, seed: 9, at: ts(T0), seats: [B, A], n: 11, turn: 2, holder: A, tAt: ts(T0 + MIN), card: 1, del: 1, buoys: 5, res: true, goal: 6, end: 0 },
    m: { [A]: entry(T0 + MIN), [B]: entry(T0), [D]: { ...entry(T0), n: [1, 2, 69] } },
  });

  it("reads every field, with Firestore times, members in the order they came aboard", () => {
    const r = toRoom(CODE, data())!;
    expect(r).toMatchObject({ code: CODE, mode: "open", name: [3, 4], subject: 5, at: T0, host: B, banned: [C], banked: 10, why: { spam: 1, unkind: 0, personal: 0, off: 0 } });
    expect(r.sail).toEqual({ at: T0, focus: 25, brk: 5, cycles: 2 });
    expect(r.deck).toEqual({ bottleId: "BOTTLE1", cards: 12 });
    expect(r.game).toMatchObject({ kind: "bottle", cards: 11, turnAt: T0 + MIN, delivered: 1, rescue: true, holder: A });
    // D's nickname number is one nobody gets, so that entry is left out.
    expect(r.members.map((m) => m.key)).toEqual([B, A]);
    expect(r.members[1]).toMatchObject({ nick: [1, 2, 3], costume: 1, accessory: 2, state: 1, endsAt: T0 + 20 * MIN, dmg: 4, say: 25, tidy: { gid: 7, patches: 3, ms: 1000, mixups: 2 } });
  });

  it("rounds a fractional banked total down instead of losing the room, and drops a game with half a turn", () => {
    expect(toRoom(CODE, { ...data(), banked: 10.5 })?.banked).toBe(10);
    expect(toRoom(CODE, { ...data(), banked: -1 })).toBeNull();
    const half = toRoom(CODE, { ...data(), game: { ...data().game, del: 0.5 } })!;
    expect(half.game).toBeNull();
  });

  it("sits out a game dealt by another version of the dealing", () => {
    expect(toRoom(CODE, { ...data(), game: { ...data().game, v: 1 } })!.game).toBeNull();
  });

  it("refuses things that aren't rooms, and drops a broken game or sail", () => {
    expect(toRoom(CODE, null)).toBeNull();
    expect(toRoom(CODE, { ...data(), mode: "secret" })).toBeNull();
    expect(toRoom(CODE, { ...data(), v: 2 })).toBeNull();
    expect(toRoom(CODE, { ...data(), m: [] })).toBeNull();
    const r = toRoom(CODE, { ...data(), sail: { at: ts(T0), f: 25, b: 0, c: 2 }, game: { kind: "chess", v: 1, seed: 1, at: ts(T0), seats: [A] } })!;
    expect([r.sail, r.game]).toEqual([null, null]);
  });

  it("reads a public card", () => {
    const c = toCard(CODE, { v: 1, mode: "open", name: [1, 1], subj: 2, at: ts(T0), listed: true, locked: false, n: 3, alive: ts(T0 + MIN) });
    expect(c).toEqual({ code: CODE, mode: "open", name: [1, 1], subject: 2, at: T0, listed: true, locked: false, aboard: 3, aliveAt: T0 + MIN });
    expect(toCard(CODE, { v: 1, mode: "open", name: [1, 1], subj: 2, at: ts(T0), listed: true, locked: false, n: 9, alive: ts(T0) })).toBeNull();
  });

  it("gives deck cards ids from their place in the deck", () => {
    expect(toPracticeCards([{ f: "ATP?", b: "Energy" }, { f: "DNA?", b: "Genes" }])).toEqual([
      { id: "0", front: "ATP?", back: "Energy" },
      { id: "1", front: "DNA?", back: "Genes" },
    ]);
  });
});

describe("presence", () => {
  it("is here until 12 minutes, away until 25, then stale", () => {
    const m = member(A, { seenAt: T0 });
    expect(presence(m, T0 + 11 * MIN + 59 * SEC)).toBe("here");
    expect(presence(m, T0 + 12 * MIN)).toBe("away");
    expect(presence(m, T0 + 24 * MIN + 59 * SEC)).toBe("away");
    expect(presence(m, T0 + 25 * MIN)).toBe("stale");
  });

  it("says what each sailor is doing", () => {
    const now = T0 + MIN;
    expect(statusLine(member(A, { state: 1, endsAt: now + 12 * MIN }), now)).toBe("Focusing · 12 min left");
    expect(statusLine(member(A, { state: 2, endsAt: now + 2 * MIN + 30 * SEC }), now)).toBe("On a break · 3 min left");
    expect(statusLine(member(A, { state: 3 }), now)).toBe("Paused");
    expect(statusLine(member(A, { state: 0 }), now)).toBe("In port");
    expect(statusLine(member(A, { state: 1 }), T0 + 13 * MIN)).toBe("Away");
  });

  it("estimates the server clock from a write's round trip", () => {
    expect(estimateOffset(1_000, 1_400, 5_200)).toBe(4_000);
  });
});

describe("the crew", () => {
  const now = T0 + 30 * MIN;
  const fresh = (key: string, extra: Partial<RoomMember> = {}) => member(key, { seenAt: now - MIN, ...extra });
  const stale = (key: string, extra: Partial<RoomMember> = {}) => member(key, { seenAt: now - 26 * MIN, ...extra });

  it("has the skipper sweep the quietest stale sailor, and nobody else act while the skipper's here", () => {
    const r = room([fresh(A), stale(B, { seenAt: now - 27 * MIN }), stale(C), fresh(D)], { host: A });
    expect(sweepAction(r, A, now)).toEqual({ kind: "sweep", key: B });
    expect(sweepAction(r, D, now)).toBeNull();
    expect(sweepAction(room([fresh(A), fresh(B)]), A, now)).toBeNull();
  });

  it("takes the hat 15 minutes into the skipper's silence, well before the room is over at 25", () => {
    const quiet = (minutes: number) => room([member(F, { seenAt: now - minutes * MIN }), fresh(D), fresh(C), member(B, { seenAt: now - 13 * MIN })], { host: F });
    // 10 minutes: nobody acts yet.
    expect(sweepAction(quiet(10), C, now)).toBeNull();
    // 16 minutes: the present sailor with the smallest key takes it; the room isn't over, so nobody outside can clear it.
    expect(isSkipperQuiet(quiet(16), now)).toBe(true);
    expect(isSkipperGone(quiet(16), now)).toBe(false);
    expect(sweepAction(quiet(16), C, now)).toEqual({ kind: "take-hat" });
    expect(sweepAction(quiet(16), D, now)).toBeNull();
    // 21 minutes (that sailor's device may be asleep): anyone here tries; a lost race is refused harmlessly.
    expect(sweepAction(quiet(21), D, now)).toEqual({ kind: "take-hat" });
    expect(sweepAction(quiet(21), B, now)).toBeNull(); // away, so not present
    expect(sweepAction(quiet(21), E, now)).toBeNull(); // not aboard
    // Once C has the hat, C sweeps the old skipper when they go stale.
    expect(sweepAction({ ...quiet(26), host: C }, C, now)).toEqual({ kind: "sweep", key: F });
  });

  it("hands the hat to the longest-aboard sailor who's here", () => {
    const r = room([fresh(A, { joinedAt: T0 }), member(B, { joinedAt: T0 + MIN, seenAt: now - 13 * MIN }), fresh(C, { joinedAt: T0 + 2 * MIN })]);
    expect(nextSkipper(r, A, now)).toBe(C);
    expect(nextSkipper(room([fresh(A), member(B, { seenAt: now - 13 * MIN })]), A, now)).toBe(B);
    expect(nextSkipper(room([fresh(A)]), A, now)).toBeNull();
  });

  it("explains why a room can't be joined", () => {
    const now2 = T0 + MIN;
    expect(joinProblem(null, now2)).toBe("gone");
    expect(joinProblem(card(CODE), T0 + 12 * 60 * MIN)).toBe("ended");
    expect(joinProblem(card(CODE, { aliveAt: now2 - 25 * MIN }), now2)).toBe("skipper-away");
    expect(joinProblem(card(CODE, { aboard: 6 }), now2)).toBe("full");
    expect(joinProblem(card(CODE, { locked: true }), now2)).toBe("locked");
    expect(joinProblem(card(CODE), now2)).toBeNull();
  });

  it("shows the open list without full, locked, finished or hidden rooms, busiest first", () => {
    const cards = [
      card("AAAAAAA2", { aboard: 2, aliveAt: now - MIN }),
      card("AAAAAAA3", { aboard: 4, aliveAt: now - 5 * MIN }),
      card("AAAAAAA4", { aboard: 2, aliveAt: now }),
      card("AAAAAAA5", { aboard: 6, aliveAt: now }),
      card("AAAAAAA6", { locked: true, aliveAt: now }),
      card("AAAAAAA7", { aliveAt: now - 26 * MIN }),
      card("AAAAAAA8", { aliveAt: now, subject: 3 }),
      card("AAAAAAA9", { at: now - 13 * 60 * MIN, aliveAt: now }),
    ];
    expect(listView(cards, now, ["AAAAAAA8"], null).map((c) => c.code)).toEqual(["AAAAAAA3", "AAAAAAA4", "AAAAAAA2"]);
    expect(listView(cards, now, [], 3).map((c) => c.code)).toEqual(["AAAAAAA8"]);
    expect(deadCards(cards, now)).toEqual(["AAAAAAA7", "AAAAAAA9"]);
    expect(deadCards(Array.from({ length: 5 }, (_, i) => card(`DEADXXX${i + 2}`, { aliveAt: T0 })), now)).toHaveLength(3);
  });

  it("takes an open room off the list at its third strike, never at a report that isn't one", () => {
    expect(listedAfterReport(room([member(A)], { listed: true, strikes: 1 }), true)).toBe(true);
    expect(listedAfterReport(room([member(A)], { listed: true, strikes: 2 }), true)).toBe(false);
    // Reports without a stake are counted, but never take a room off the list, however many there are.
    expect(listedAfterReport(room([member(A)], { listed: true, strikes: 2, reportKeys: ["r1", "r2", "r3", "r4"] }), false)).toBe(true);
    expect(listedAfterReport(room([member(A)], { listed: false }), true)).toBe(false);
  });

  it("counts a report as a strike only with a stake: 5 minutes aboard (or a stay of 5 when leaving), in the room joined last", () => {
    const at = { code: CODE, joinedIn: CODE, stayed: false, serverNow: T0 + 5 * MIN };
    expect(reportIsStrike({ ...at, aboardSince: T0 })).toBe(true);
    expect(reportIsStrike({ ...at, aboardSince: T0 + 10 * SEC })).toBe(false);
    // Came aboard elsewhere since: a sailor weighs in one room at a time.
    expect(reportIsStrike({ ...at, joinedIn: "OTHERRMS", aboardSince: T0 - 60 * MIN })).toBe(false);
    // Not aboard any more: their note says whether they stayed 5 minutes when they left.
    expect(reportIsStrike({ ...at, aboardSince: null, stayed: true })).toBe(true);
    expect(reportIsStrike({ ...at, aboardSince: null, stayed: false })).toBe(false);
    // A stay is never claimed on a guess: half a minute past the rules' 5.
    expect(stayedAboard({ joinedAt: T0 }, T0 + 5 * MIN + 10 * SEC)).toBe(false);
    expect(stayedAboard({ joinedAt: T0 }, T0 + 5 * MIN + 30 * SEC)).toBe(true);
  });

  it("reads a room's strikes (none for a room from before them), and refuses half a strike", () => {
    const data = { v: 1, mode: "open", name: [1, 2], subj: 0, at: T0, host: A, listed: true, locked: false, ban: [], rep: [], why: {}, banked: 0, last: null, sail: null, deck: null, game: null, m: {} };
    expect(toRoom(CODE, data)?.strikes).toBe(0);
    expect(toRoom(CODE, { ...data, strikes: 2 })?.strikes).toBe(2);
    expect(toRoom(CODE, { ...data, strikes: 0.5 })).toBeNull();
  });
});

describe("sailing together", () => {
  // 2 legs of 25/5, called at T0: prep until +1 min, leg 1 focus to +26, break to +31, leg 2 to +56, break to +61.
  const sail: RoomSail = { at: T0, focus: 25, brk: 5, cycles: 2 };
  const docked = { phase: "docked" as const, prepEndsAt: null };
  const sailing = { phase: "sailing" as const, prepEndsAt: null };

  it("names the timer preset", () => {
    expect([presetFor(25, 5), presetFor(50, 10), presetFor(25, 10)]).toEqual(["coastal", "ocean", "custom"]);
  });

  it("follows the plan through prep, each leg's focus and break, and done", () => {
    expect(sailStatus(sail, T0 + 30 * SEC)).toEqual({ phase: "prep", leg: 1, legs: 2, endsAt: T0 + MIN });
    expect(sailStatus(sail, T0 + 10 * MIN)).toEqual({ phase: "focus", leg: 1, legs: 2, endsAt: T0 + 26 * MIN });
    expect(sailStatus(sail, T0 + 27 * MIN)).toEqual({ phase: "break", leg: 1, legs: 2, endsAt: T0 + 31 * MIN });
    expect(sailStatus(sail, T0 + 31 * MIN)).toEqual({ phase: "focus", leg: 2, legs: 2, endsAt: T0 + 56 * MIN });
    expect(sailStatus(sail, T0 + 61 * MIN)).toEqual({ phase: "done", leg: 2, legs: 2, endsAt: T0 + 61 * MIN });
  });

  it("offers the right way to join at each point", () => {
    expect(sailOffer(null, docked, T0)).toBeNull();
    expect(sailOffer(sail, docked, T0 + 30 * SEC)).toEqual({ kind: "sail-with", prepUntilServer: T0 + MIN });
    expect(sailOffer(sail, docked, T0 + MIN + 20 * SEC)).toEqual({ kind: "sail-on", focusMinutes: 25, breakMinutes: 5, cycles: 2, fromLeg: 1 });
    expect(sailOffer(sail, docked, T0 + 10 * MIN + 20 * SEC)).toEqual({ kind: "hop-aboard", focusMinutes: 16, breakMinutes: 5, leg: 1 });
    expect(sailOffer(sail, docked, T0 + 27 * MIN)).toBeNull();
    expect(sailOffer(sail, docked, T0 + 31 * MIN + 20 * SEC)).toEqual({ kind: "sail-on", focusMinutes: 25, breakMinutes: 5, cycles: 1, fromLeg: 2 });
    expect(sailOffer(sail, docked, T0 + 62 * MIN)).toBeNull();
  });

  it("hops aboard only with 2 minutes or more left, and sails on only in a leg's first half minute while docked", () => {
    // Joining 40 s into a leg: hop aboard, so the break still starts with the crew's.
    expect(sailOffer(sail, docked, T0 + MIN + 40 * SEC)).toEqual({ kind: "hop-aboard", focusMinutes: 24, breakMinutes: 5, leg: 1 });
    expect(sailOffer(sail, docked, T0 + 31 * MIN + 40 * SEC)).toEqual({ kind: "hop-aboard", focusMinutes: 24, breakMinutes: 5, leg: 2 });
    expect(sailOffer(sail, docked, T0 + 24 * MIN)).toEqual({ kind: "hop-aboard", focusMinutes: 2, breakMinutes: 5, leg: 1 });
    expect(sailOffer(sail, docked, T0 + 24 * MIN + SEC)).toBeNull();
    expect(sailOffer(sail, docked, T0 + 3 * MIN)).toMatchObject({ kind: "hop-aboard" });
    expect(sailOffer(sail, sailing, T0 + 2 * MIN)).toMatchObject({ kind: "hop-aboard" });
    expect(sailOffer(sail, { phase: "docked", prepEndsAt: T0 }, T0 + 2 * MIN)).toMatchObject({ kind: "hop-aboard" });
    // Inside a leg's first half minute, only a docked sailor is asked to sail on: one whose timer runs (or is getting ready) is offered hop aboard.
    expect(sailOffer(sail, sailing, T0 + MIN + 10 * SEC)).toMatchObject({ kind: "hop-aboard" });
    expect(sailOffer(sail, { phase: "docked", prepEndsAt: T0 + 2 * MIN }, T0 + MIN + 10 * SEC)).toMatchObject({ kind: "hop-aboard" });
    expect(sailOffer(sail, { phase: "shore-leave", prepEndsAt: null }, T0 + 31 * MIN + 10 * SEC)).toMatchObject({ kind: "hop-aboard", leg: 2 });
    expect(sailOffer(sail, docked, T0 + MIN + SAIL_ON_WINDOW - 1)).toMatchObject({ kind: "sail-on" });
    expect(sailOffer(sail, docked, T0 + MIN + SAIL_ON_WINDOW)).toMatchObject({ kind: "hop-aboard" });
  });

  it("knows when the crew's current leg began", () => {
    expect(legStartedAt(sail, T0 + 30 * SEC)).toBeNull();
    expect(legStartedAt(sail, T0 + 10 * MIN)).toBe(T0 + MIN);
    expect(legStartedAt(sail, T0 + 27 * MIN)).toBeNull();
    expect(legStartedAt(sail, T0 + 32 * MIN)).toBe(T0 + 31 * MIN);
  });
});

describe("Kraken Watch", () => {
  it("adds up credited damage, and live damage up to each focusing sailor's block end", () => {
    const now = T0 + 30 * MIN;
    const r = room(
      [
        member(A, { dmg: 10, state: 1, seenAt: now - 5 * MIN - 30 * SEC, endsAt: now + 10 * MIN }),
        member(B, { dmg: 3, state: 1, seenAt: now - 20 * MIN, endsAt: now - 12 * MIN }),
        member(C, { dmg: 2, state: 2, seenAt: now - 9 * MIN }),
      ],
      { banked: 7 },
    );
    expect(creditedDamage(r)).toBe(22);
    expect(liveDamage(r, now)).toBe(22 + 5 + 8);
    expect(liveDamage(room([member(A, { state: 1, seenAt: now, endsAt: now - MIN })]), now)).toBe(0);
  });

  it("never counts more live minutes for a sailor than one keep-alive (an idle pause never reaches the room)", () => {
    const now = T0 + 30 * MIN;
    const idle = room([member(A, { state: 1, seenAt: now - 18 * MIN, endsAt: now + 7 * MIN })]);
    expect(liveDamage(idle, now)).toBe(ROOM_LIMITS.keepAliveMinutes);
  });

  it("shows the beast and the beasts beaten from credited damage, with live minutes filling only the current bar", () => {
    const now = T0 + 30 * MIN;
    // 115 credited of the Kraken's 120, and 8 live minutes on the way: the bar stops at 1, the Kraken stays.
    const r = room([member(A, { dmg: 115, state: 1, seenAt: now - 8 * MIN, endsAt: now + 10 * MIN })]);
    const shown = shownQuest(r, now);
    expect(shown).toMatchObject({ beastIndex: 0, defeated: 0, hp: 1, maxHp: 120 });
    // Those minutes are credited after all: now the Kraken is beaten, once.
    const credited = room([member(A, { dmg: 123, state: 1, seenAt: now, endsAt: now + 10 * MIN })]);
    expect(shownQuest(credited, now)).toMatchObject({ beastIndex: 1, defeated: 1, hp: 197 });
    // Live minutes below the line just fill the bar.
    expect(shownQuest(room([member(A, { dmg: 20, state: 1, seenAt: now - 3 * MIN, endsAt: now + 10 * MIN })]), now).hp).toBe(97);
  });
});

describe("rewards", () => {
  const base = (members: RoomMember[], extra: Partial<Room> = {}) => room(members, { banked: 0, ...extra });

  it("names rewards by the sailor's key, never the room code (they go into synced data and backups)", async () => {
    const key = await memberKey("alice", CODE);
    const prev = base([member(key, { dmg: 10 }), member(B, { dmg: 100 })]);
    const next = base([member(key, { dmg: 20 }), member(B, { dmg: 200 })]);
    const ids = roomRewards(prev, next, key).map((r) => r.id);
    expect(ids).toHaveLength(1);
    for (const id of ids) expect(id).not.toContain(CODE);
    expect(roomRecordId(key, T0)).toBe(`room:${key.slice(0, 16)}:${T0}`);
  });

  it("pays no beasts on the first snapshot, or across two different rooms", () => {
    const next = base([member(A, { dmg: 200 })]);
    expect(roomRewards(null, next, A)).toEqual([]);
    expect(roomRewards({ ...next, at: T0 - 1 }, next, A)).toEqual([]);
  });

  it("pays a game that ended before this device's first snapshot (a reload): once per game, by its id", () => {
    const deck = { bottleId: "B1", cards: 20 };
    const island = base([member(A), member(B)], { deck, game: bottle({ seats: [A, B], delivered: 6, turn: 8, end: 1 }) });
    const paid = roomRewards(null, island, A);
    expect(paid).toEqual([{ id: `${roomRecordId(A, T0)}:bottle:99`, doubloons: 16, xp: 32, reason: "Pass the Bottle: island reached!" }]);
    // The next snapshot of the same finished game pays nothing new (and earnOnce pays each id once anyway).
    expect(roomRewards(island, island, A)).toEqual([]);
    const game: TidyGame = { kind: "tidy", v: 2, seed: 42, at: T0, seats: [A, B] };
    const done = base([member(A, { tidy: { gid: 42, patches: 1, ms: 50 * SEC, mixups: 0 } }), member(B, { tidy: { gid: 42, patches: 2, ms: 70 * SEC, mixups: 0 } })], { game, deck: { bottleId: null, cards: 24 } });
    expect(roomRewards(null, done, A).map((r) => r.id)).toEqual([`${roomRecordId(A, T0)}:tidy:42`]);
  });

  it("pays once per beast beaten, with its figurehead", () => {
    const prev = base([member(A, { dmg: 10 }), member(B, { dmg: 90 })]);
    const next = base([member(A, { dmg: 40 }), member(B, { dmg: 290 })]);
    const rewards = roomRewards(prev, next, A);
    expect(rewards.map((r) => [r.id, r.doubloons, r.xp, r.figurehead])).toEqual([
      [`${roomRecordId(A, T0)}:beast:0`, 20, 50, "kraken"],
      [`${roomRecordId(A, T0)}:beast:1`, 20, 50, "dragon"],
    ]);
    expect(rewards[0]!.reason).toBe("The crew beat the Procrastination Kraken!");
    expect(roomRewards(next, next, A)).toEqual([]);
  });

  it("pays no beast to a sailor with under 10 minutes of their own", () => {
    const prev = base([member(A, { dmg: 0 }), member(B, { dmg: 100 })]);
    const next = base([member(A, { dmg: 9 }), member(B, { dmg: 200 })]);
    expect(roomRewards(prev, next, A)).toEqual([]);
    expect(roomRewards(prev, next, B)).toHaveLength(1);
  });

  it("pays Tidy the Deck once, when the crew finishes, to sailors who cleared a patch", () => {
    const game: TidyGame = { kind: "tidy", v: 2, seed: 42, at: T0, seats: [A, B, C] };
    const deck = { bottleId: null, cards: 24 };
    const playing = base([member(A, { tidy: { gid: 42, patches: 1, ms: 50 * SEC, mixups: 0 } }), member(B), member(C)], { game, deck });
    const done = base(
      [member(A, { tidy: { gid: 42, patches: 1, ms: 50 * SEC, mixups: 0 } }), member(B, { tidy: { gid: 42, patches: 2, ms: 70 * SEC, mixups: 1 } }), member(C, { tidy: { gid: 42, patches: 4, ms: 60 * SEC, mixups: 0 } })],
      { game, deck },
    );
    expect(roomRewards(playing, done, A)).toEqual([{ id: `${roomRecordId(A, T0)}:tidy:42`, doubloons: 5, xp: 10, reason: "Tidy the Deck: ship shape!" }]);
    expect(roomRewards(done, done, A)).toEqual([]);
    const helperless = base([...done.members, member(D)], { game, deck });
    expect(roomRewards(playing, helperless, D)).toEqual([]);
    // With the real patch count (a deck with repeated answers may have fewer), it follows that.
    expect(roomRewards(playing, done, A, { tidyPatches: 4 })).toEqual([]);
  });

  it("pays Pass the Bottle once it ends, to seated sailors", () => {
    const deck = { bottleId: "B1", cards: 20 };
    const playing = base([member(A), member(B), member(D)], { deck, game: bottle({ seats: [A, B], delivered: 5, turn: 7 }) });
    const island = base([member(A), member(B), member(D)], { deck, game: bottle({ seats: [A, B], delivered: 6, turn: 8, end: 1 }) });
    expect(roomRewards(playing, island, A)).toEqual([{ id: `${roomRecordId(A, T0)}:bottle:99`, doubloons: 16, xp: 32, reason: "Pass the Bottle: island reached!" }]);
    expect(roomRewards(playing, island, D)).toEqual([]);
    expect(roomRewards(island, island, A)).toEqual([]);
    const tide = base([member(A), member(B)], { deck, game: bottle({ seats: [A, B], delivered: 3, buoys: 0, turn: 9, end: 2 }) });
    expect(roomRewards(playing, tide, B)[0]).toMatchObject({ doubloons: 3, xp: 6, reason: "Pass the Bottle: 3 bottles delivered" });
  });
});

describe("Pass the Bottle", () => {
  const now = T0 + 5 * MIN;
  const crew = (extra: Partial<Room> = {}) => room([member(A, { seenAt: now }), member(B, { seenAt: now }), member(C, { seenAt: now })], { deck: { bottleId: "B1", cards: 12 }, ...extra });

  it("delivers on a right or close answer and passes to the next seat", () => {
    for (const outcome of ["right", "close"] as const)
      expect(bottleStep(bottle(), outcome, crew(), now)).toEqual({ turn: 1, holder: B, card: 1, delivered: 1, buoys: 5, rescue: false, end: 0 });
  });

  it("sends a first miss to the next sailor as a rescue of the same card", () => {
    for (const outcome of ["miss", "timeout"] as const)
      expect(bottleStep(bottle(), outcome, crew(), now)).toEqual({ turn: 1, holder: B, card: 0, delivered: 0, buoys: 5, rescue: true, end: 0 });
  });

  it("counts a saved rescue as delivered, and a lost one as a lifebuoy gone", () => {
    const rescue = bottle({ turn: 1, holder: B, rescue: true });
    expect(bottleStep(rescue, "right", crew(), now)).toEqual({ turn: 2, holder: C, card: 1, delivered: 1, buoys: 5, rescue: false, end: 0 });
    expect(bottleStep(rescue, "miss", crew(), now)).toEqual({ turn: 2, holder: C, card: 1, delivered: 0, buoys: 4, rescue: false, end: 0 });
  });

  it("ends at the island, or when the tide turns (no buoys, or no cards)", () => {
    expect(bottleStep(bottle({ delivered: 5, goal: 6 }), "right", crew(), now).end).toBe(1);
    expect(bottleStep(bottle({ buoys: 1, rescue: true }), "miss", crew(), now)).toMatchObject({ buoys: 0, end: 2 });
    expect(bottleStep(bottle({ card: 11 }), "right", crew(), now)).toMatchObject({ card: 12, end: 2 });
    // "Out of cards" is the game's own count of the cards it deals (a deck's playable cards), as the rules see it.
    expect(bottleStep(bottle({ card: 9, cards: 12 }), "right", crew(), now).end).toBe(0);
    expect(bottleStep(bottle({ card: 9, cards: 10 }), "right", crew(), now).end).toBe(2);
  });

  it("only ever makes a turn the rules accept", () => {
    const rng = seededRng(5);
    const outcomes: BottleOutcome[] = ["right", "close", "miss", "timeout"];
    for (let run = 0; run < 50; run++) {
      let g = bottle({ goal: 3 + Math.floor(rng() * 18) });
      const r = crew();
      while (bottleOver(g) === 0) {
        const h = bottleStep(g, outcomes[Math.floor(rng() * 4)]!, r, now);
        // The rules' turn check, field by field.
        expect(h.turn).toBe(g.turn + 1);
        expect(h.turn).toBeLessThanOrEqual(ROOM_LIMITS.bottle.maxTurns);
        expect(g.seats).toContain(h.holder);
        expect(h.delivered - g.delivered).toBeGreaterThanOrEqual(0);
        expect(h.delivered - g.delivered).toBeLessThanOrEqual(1);
        expect(g.buoys - h.buoys).toBeGreaterThanOrEqual(0);
        expect(g.buoys - h.buoys).toBeLessThanOrEqual(1);
        expect(h.card - g.card).toBeGreaterThanOrEqual(0);
        expect(h.card - g.card).toBeLessThanOrEqual(1);
        expect(h.end).toBe(h.delivered >= g.goal ? 1 : h.buoys === 0 || h.card >= g.cards ? 2 : 0);
        g = { ...g, ...h, turnAt: g.turnAt + 3 * SEC };
      }
    }
  });

  it("passes to the next seat that can answer: not gone, away or focusing", () => {
    const r = room([member(A, { seenAt: now }), member(C, { seenAt: now - 13 * MIN }), member(D, { seenAt: now, state: 1 }), member(E, { seenAt: now })]);
    expect(nextPresentSeat(bottle({ seats: [A, B, C, D, E], holder: A }), r, now)).toBe(E);
    expect(nextPresentSeat(bottle({ seats: [A, B, C, D, E], holder: E }), r, now)).toBe(A);
    expect(nextPresentSeat(bottle({ seats: [A, B], holder: A }), r, now)).toBe(A);
  });

  it("lets anyone aboard take the helm after 35 s, or at once when the holder has gone or is focusing", () => {
    const g = bottle({ holder: A, turnAt: now });
    expect(canTakeHelm(g, crew(), B, now + 30 * SEC)).toBe(false);
    expect(canTakeHelm(g, crew(), B, now + 36 * SEC)).toBe(true);
    const focusing = room([member(A, { seenAt: now, state: 1 }), member(B, { seenAt: now })]);
    expect(canTakeHelm(g, focusing, B, now + SEC)).toBe(false); // the rules' 2 s between turns
    expect(canTakeHelm(g, focusing, B, now + 3 * SEC)).toBe(true);
    expect(canTakeHelm(g, room([member(B, { seenAt: now })]), B, now + 3 * SEC)).toBe(true);
    expect(canTakeHelm(g, crew(), A, now + 60 * SEC)).toBe(false);
    expect(canTakeHelm({ ...g, end: 1 }, crew(), B, now + 60 * SEC)).toBe(false);
    expect(canTakeHelm(g, crew(), D, now + 60 * SEC)).toBe(false);
  });

  it("is over at the island, at the tide, or at the 60th turn", () => {
    expect(bottleOver(bottle())).toBe(0);
    expect(bottleOver(bottle({ end: 1 }))).toBe(1);
    expect(bottleOver(bottle({ turn: 60 }))).toBe(2);
    expect([bottleGoal(1), bottleGoal(3), bottleGoal(4), bottleGoal(6)]).toEqual([6, 6, 8, 8]);
  });

  it("never sets the island further than the cards dealt, so a small deck can still win", () => {
    expect([bottleGoal(2, 4), bottleGoal(2, 5), bottleGoal(5, 7), bottleGoal(5, 30)]).toEqual([4, 5, 7, 8]);
    // Every card right on a 5-card deck with 2 sailors reaches the island.
    let g = bottle({ seats: [A, B], cards: 5, goal: bottleGoal(2, 5) });
    const r = crew();
    while (bottleOver(g) === 0) g = { ...g, ...bottleStep(g, "right", r, now) };
    expect(g).toMatchObject({ end: 1, delivered: 5 });
  });

  it("seats sailors who are here and not focusing, in the order they came aboard", () => {
    const r = room([
      member(A, { seenAt: now, joinedAt: T0 }),
      member(B, { seenAt: now, joinedAt: T0 + 1, state: 1 }),
      member(C, { seenAt: now - 13 * MIN, joinedAt: T0 + 2 }),
      member(D, { seenAt: now, joinedAt: T0 + 3, state: 2 }),
      member(E, { seenAt: now, joinedAt: T0 + 4, state: 3 }),
    ]);
    expect(gameSeats(r, now)).toEqual([A, D, E]);
  });
});

describe("Tidy the Deck", () => {
  const game: TidyGame = { kind: "tidy", v: 2, seed: 42, at: T0, seats: [A, B, C] };
  const crew = (members: RoomMember[]) => room(members, { game });

  it("covers patches from everyone's progress in this game, and times the crew", () => {
    const r = crew([
      member(A, { tidy: { gid: 42, patches: 0b001, ms: 40 * SEC, mixups: 1 } }),
      member(B, { tidy: { gid: 42, patches: 0b100, ms: 75 * SEC, mixups: 2 } }),
      member(C, { tidy: { gid: 41, patches: 0b010, ms: 10 * SEC, mixups: 0 } }),
    ]);
    expect(tidyStatus(r, game, 3, T0 + 2 * MIN)).toEqual({ cleared: 2, covered: 0b101, done: false, crewMs: null, timedOut: false, open: [1] });
    const finished = crew([...r.members.slice(0, 2), member(C, { tidy: { gid: 42, patches: 0b011, ms: 90 * SEC, mixups: 0 } })]);
    expect(tidyStatus(finished, game, 3, T0 + 2 * MIN)).toEqual({ cleared: 3, covered: 0b111, done: true, crewMs: 90 * SEC + 3 * SEC, timedOut: false, open: [] });
  });

  it("remembers patches cleared by a sailor who then left, so a finished game stays finished", () => {
    const all = crew([
      member(A, { tidy: { gid: 42, patches: 0b001, ms: 40 * SEC, mixups: 1 } }),
      member(B, { tidy: { gid: 42, patches: 0b010, ms: 60 * SEC, mixups: 0 } }),
      member(C, { tidy: { gid: 42, patches: 0b100, ms: 80 * SEC, mixups: 2 } }),
    ]);
    const memo = rememberTidy(null, all);
    expect(tidyStatus(all, game, 3, T0 + 2 * MIN, memo)).toMatchObject({ done: true, crewMs: 80 * SEC + 3 * SEC });
    // C leaves: their entry (and patch 3) is gone from the room, but not from this device's memory.
    const left = crew(all.members.slice(0, 2));
    const after = rememberTidy(memo, left);
    expect(tidyStatus(left, game, 3, T0 + 6 * MIN)).toMatchObject({ done: false, open: [2] });
    expect(tidyStatus(left, game, 3, T0 + 6 * MIN, after)).toEqual({ cleared: 3, covered: 0b111, done: true, crewMs: 80 * SEC + 3 * SEC, timedOut: false, open: [] });
    // A new game starts a new memory; a snapshot with no change keeps the same one.
    expect(rememberTidy(after, left)).toBe(after);
    expect(rememberTidy(after, room(left.members, { game: { ...game, seed: 43 } }))?.seed).toBe(43);
  });

  it("joins two writes' progress for the same game, never losing a patch", () => {
    expect(mergeTidy({ gid: 42, g: 0b001, gt: 40_000, gp: 1 }, { gid: 42, g: 0b100, gt: 30_000, gp: 3 })).toEqual({ gid: 42, g: 0b101, gt: 40_000, gp: 3 });
    expect(mergeTidy({ gid: 41, g: 0b001, gt: 40_000, gp: 1 }, { gid: 42, g: 0b100, gt: 30_000, gp: 0 })).toEqual({ gid: 42, g: 0b100, gt: 30_000, gp: 0 });
    expect(mergeSelf({ tidy: { gid: 42, g: 0b010, gt: 5, gp: 0 } }, { st: 2, tidy: { gid: 42, g: 0b001, gt: 9, gp: 2 } })).toEqual({ st: 2, tidy: { gid: 42, g: 0b011, gt: 9, gp: 2 } });
  });

  it("times out after 5 minutes, waiting a little for patches sent just before the bell", () => {
    const r = crew([member(A, { tidy: { gid: 42, patches: 0b001, ms: 40 * SEC, mixups: 0 } })]);
    expect(tidyStatus(r, game, 3, T0 + 5 * MIN).timedOut).toBe(false);
    expect(tidyStatus(r, game, 3, T0 + 5 * MIN + 20 * SEC).timedOut).toBe(true);
    expect(tidyStatus(r, game, 0, T0).done).toBe(false);
  });
});

describe("the scene", () => {
  it("draws up to 5 crewmates, with cheers that show for 6 seconds unless hidden or muted", () => {
    const now = T0 + 10 * MIN;
    const r = room(
      [
        member(A, { seenAt: now }),
        member(B, { seenAt: now, nick: [1, 1, 12], costume: 2, accessory: 7, state: 1, say: 3, sayAt: now - 2 * SEC }),
        member(C, { seenAt: now - 13 * MIN, say: 30, sayAt: now - 7 * SEC }),
        member(D, { seenAt: now }),
        member(E, { seenAt: now }),
        member(F, { seenAt: now, say: 1, sayAt: now }),
      ],
      { host: B },
    );
    const mates = sceneMates(r, A, now, [], false);
    expect(mates.map((m) => m.key)).toEqual([B, C, D, E, F]);
    expect(mates[0]).toEqual({ key: B, label: "Sleepy Boba 12", costume: "bunny", accessory: "jelly-bow", skipper: true, state: 1, away: false, cheer: 3 });
    expect(mates[1]).toMatchObject({ away: true, cheer: null });
    expect(sceneMates(r, A, now, [B], false)[0]!.cheer).toBeNull();
    expect(sceneMates(r, A, now, [], true).every((m) => m.cheer === null)).toBe(true);
    expect(sceneMates(room([member(A), member(B), member(C), member(D), member(E), member(F), member(G)]), A, now, [], false)).toHaveLength(5);
  });
});

describe("messages", () => {
  it("says what went wrong in plain words", () => {
    expect(roomProblem("", "join", "full")).toBe("That room is full (6 sailors).");
    expect(roomProblem("", "join", "locked")).toBe("The door is locked.");
    expect(roomProblem("", "join", "skipper-away")).toBe("This room's skipper has gone ashore, so it's closing.");
    expect(roomProblem("", "join", "ended")).toBe("This room has ended.");
    expect(roomProblem("permission-denied", "join", null)).toBe("You can't rejoin this room.");
    expect(roomProblem("permission-denied", "write")).toBe("Wait a few seconds between messages.");
    expect(roomProblem("permission-denied", "load")).toBe("Study Rooms isn't open on this database yet: its new rules need publishing.");
    expect(roomProblem("paused", "load")).toBe("Open rooms are resting for now. Invite rooms still work.");
    expect(roomProblem("resource-exhausted", "write")).toBe("Rooms are out of free database use for today. Your own timer keeps going; the crew catches up tomorrow.");
    expect(roomProblem("unavailable", "open")).toBe("Couldn't reach the room. Check your connection.");
    expect(roomProblem("permission-denied", "game")).toBe("Someone else took that turn.");
    // A skipper's game start or door change refused: the room moved on, not a turn or a message.
    expect(roomProblem("permission-denied", "skipper")).toBe("The room changed just now. Try again.");
    expect(roomProblem("permission-denied", "report")).toBe("Couldn't send the report just now. Try again in a moment.");
  });
});

describe("stopping a tab's room session", () => {
  it("keeps the room and this tab's saved minutes when signed out, and lets them go when signed in with no room", () => {
    expect(roomSessionStop("alice", CODE)).toBeNull();
    expect(roomSessionStop(null, CODE)).toBe("keep");
    expect(roomSessionStop("alice", null)).toBe("forget");
    expect(roomSessionStop(null, null)).toBe("keep");
  });
});

describe("twin nicknames", () => {
  it("tells sailors with the same nickname apart by when they came aboard, everywhere the name shows", () => {
    const r = room([member(A, { nick: [0, 0, 42], joinedAt: T0 }), member(B, { nick: [0, 0, 42], joinedAt: T0 + MIN }), member(C, { nick: [1, 2, 7] }), member(D, { nick: [0, 0, 42], joinedAt: T0 + 2 * MIN })]);
    expect(memberName(r, A)).toBe(nickText([0, 0, 42]));
    expect(memberName(r, B)).toBe(`${nickText([0, 0, 42])} (2)`);
    expect(memberName(r, D)).toBe(`${nickText([0, 0, 42])} (3)`);
    expect(memberName(r, C)).toBe(nickText([1, 2, 7]));
    expect([hasTwin(r, A), hasTwin(r, B), hasTwin(r, C)]).toEqual([true, true, false]);
    // The scenes and cheer bubbles use the same names.
    expect(sceneMates(r, C, T0 + 3 * MIN, [], false).map((m) => m.label)).toEqual([memberName(r, A), memberName(r, B), memberName(r, D)]);
  });
});

describe("a room that's over", () => {
  it("is over once the skipper has left or been quiet 25 minutes, or it's 12 hours old, as the rules say", () => {
    const r = room([member(A, { seenAt: T0 }), member(B, { seenAt: T0 + 20 * MIN })]);
    expect(isRoomOver(r, T0 + 24 * MIN)).toBe(false);
    expect(isRoomOver(r, T0 + 25 * MIN)).toBe(true);
    expect(isRoomOver(room([member(B)], { host: A }), T0)).toBe(true);
    expect(isRoomOver(room([member(A, { seenAt: T0 + 12 * 60 * MIN })]), T0 + 12 * 60 * MIN)).toBe(true);
  });
});
