// Study Rooms in Firestore: every read and write a room makes, one batch per action. Loaded only
// with `import()` (by roomStore.ts and roomSession.ts), so Firestore stays out of the first download.
//
//   rooms/{code}             the room, readable only by the sailors aboard
//   rooms/{code}/deck/cards  a skipper's own flashcards for a game (invite rooms only)
//   roomCards/{code}         its public card: made-up name, subject, how many are aboard
//   users/{uid}/rooms/{code} the private note "I'm in this room", so account deletion can find it
//   users/{uid}/meta/rooms   the cooldown stamp, the room rules version accepted and the 13+ tick
//   config/rooms             the operator's off switch (console only)
//
// firestore.rules decides what each write may hold, and picks one check per write from its
// shape, so each function below writes exactly one shape. The pure rules that build the values
// (keys, nicknames, the turn patch) live in roomRules.ts.

import {
  FieldPath,
  Timestamp,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import type { DocumentData, DocumentReference, WriteBatch } from "firebase/firestore";
import { ROOM_LIMITS, ROOM_RULES_VERSION } from "@ship/shared-types";
import type { BottleCard, Room, RoomCard, RoomLook, RoomMode, RoomReportReason } from "@ship/shared-types";
import { playableCards } from "@ship/active-recall-engine";
import type { PracticeCard } from "@ship/active-recall-engine";
import { bottleStillShared, deckCards } from "./bottleBay.js";
import { firestore } from "./db.js";
import {
  creditableMinutes,
  joinProblem,
  listedAfterReport,
  memberKey,
  newMemberFields,
  newRoomCode,
  nextSkipper,
  reportKey,
  roomNameText,
  toCard,
  toPracticeCards,
  toRoom,
} from "./roomRules.js";
import type { BottleTurnPatch, SelfPatch } from "./roomRules.js";
import { DECK_HIDDEN_TEXT } from "./roomRules.js";

/** A skipper's change to the room. Every skipper write also stamps their own entry (the rules ask for it). */
export interface SkipperChange {
  locked?: boolean;
  sail?: { focus: number; brk: number; cycles: number } | null;
  /** A Bottle Bay deck, or the skipper's own cards (invite rooms only), or none. */
  deck?: { bottleId: string; cards: number } | { own: BottleCard[] } | null;
  /** A new game (seated from `seats`), or null to end the current one. A bottle game deals `cards` (the deck's playable cards). */
  game?: { kind: "tidy" } | { kind: "bottle"; goal: number; cards: number } | null;
  seats?: string[];
  /** Pass the skipper's hat to this sailor. */
  host?: string;
}

/** Room minutes are worked out from this device's clock; a few seconds' slack keeps a claim inside what the rules allow. */
const CLOCK_MARGIN_MS = 5000;

const roomRef = (code: string) => doc(firestore(), "rooms", code);
const cardRef = (code: string) => doc(firestore(), "roomCards", code);
const deckRef = (code: string) => doc(firestore(), "rooms", code, "deck", "cards");
const stampRef = (uid: string) => doc(firestore(), "users", uid, "meta", "rooms");
const noteRef = (uid: string, code: string) => doc(firestore(), "users", uid, "rooms", code);

type Pair = [FieldPath, unknown];

/** Field-path updates, because sailor keys can start with a digit and a dotted string would misread them. */
function updatePairs(batch: WriteBatch, ref: DocumentReference<DocumentData>, pairs: readonly Pair[]): void {
  const [first, ...rest] = pairs;
  if (!first) return;
  batch.update(ref, first[0], first[1], ...rest.flat());
}

const whole = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number.isFinite(n) ? n : lo)));

/** A sailor's own fields for one write. `seen` is always stamped, which is what the 15 s gap counts from. */
function selfPairs(key: string, patch: SelfPatch): Pair[] {
  const f = (name: string) => new FieldPath("m", key, name);
  const pairs: Pair[] = [[f("seen"), serverTimestamp()]];
  if (patch.st !== undefined) pairs.push([f("st"), whole(patch.st, 0, 3)]);
  if (patch.endsAt !== undefined) pairs.push([f("end"), patch.endsAt === null || !Number.isFinite(patch.endsAt) ? null : Timestamp.fromMillis(Math.round(patch.endsAt))]);
  const add = Math.floor(patch.addDmg ?? 0);
  // Credited minutes move `cr` with them: the rules measure the next claim from it.
  if (add > 0) pairs.push([f("dmg"), increment(add)], [f("cr"), serverTimestamp()]);
  if (patch.say !== undefined) pairs.push([f("say"), whole(patch.say, -1, 35)], [f("sayAt"), serverTimestamp()]);
  if (patch.tidy) {
    const t = patch.tidy;
    pairs.push(
      [f("gid"), Math.round(t.gid)],
      [f("g"), whole(t.g, 0, 2 ** ROOM_LIMITS.tidy.maxPatches - 1)],
      [f("gt"), whole(t.gt, 0, ROOM_LIMITS.tidy.maxMs)],
      [f("gp"), whole(t.gp, 0, 999)],
    );
  }
  return pairs;
}

/** A random whole number for a game's seed, small enough that seed * 31 + turn stays exact. */
function newSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! & 0x7fffffff;
}

// ---- Errors -----------------------------------------------------------------------------------

/** Firestore's error code ("permission-denied", "resource-exhausted"…) or a plain stand-in, for roomProblem. */
export function roomErrorCode(e: unknown): string {
  const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
  if (code) return code.replace(/^firestore\//, "");
  const message = e instanceof Error ? e.message : String(e);
  if (/offline|network|failed to fetch/i.test(message)) return "unavailable";
  return "unknown";
}

// ---- Reading ----------------------------------------------------------------------------------

/** A room's public card, or null when there's no such room. */
export async function getCard(code: string): Promise<RoomCard | null> {
  const snap = await getDoc(cardRef(code));
  return snap.exists() ? toCard(code, snap.data({ serverTimestamps: "estimate" })) : null;
}

/** The room itself. Only sailors aboard may read it; anyone else is refused (permission-denied). */
export async function getRoom(code: string): Promise<Room | null> {
  const snap = await getDoc(roomRef(code));
  return snap.exists() ? toRoom(code, snap.data({ serverTimestamps: "estimate" })) : null;
}

/** The room as the server has it now, never this device's cache (it throws when offline). For decisions a stale copy would get wrong, like sweeping a sailor. */
export async function getRoomFromServer(code: string): Promise<Room | null> {
  const snap = await getDocFromServer(roomRef(code));
  return snap.exists() ? toRoom(code, snap.data({ serverTimestamps: "estimate" })) : null;
}

/** The open list: listed cards, 20 at most. No orderBy, so no composite index is needed; the panel sorts. */
export async function listOpenCards(): Promise<RoomCard[]> {
  const snap = await getDocs(query(collection(firestore(), "roomCards"), where("listed", "==", true), limit(ROOM_LIMITS.listPage)));
  return snap.docs.map((d) => toCard(d.id, d.data({ serverTimestamps: "estimate" }))).filter((c): c is RoomCard => c !== null);
}

/**
 * The operator's off switch. Reading it also tells whether the Study Rooms rules are published:
 * the old rules refuse config/rooms, so this throws permission-denied until they are.
 */
export async function roomsSwitch(): Promise<{ create: boolean; open: boolean }> {
  const data = (await getDoc(doc(firestore(), "config", "rooms"))).data();
  return { create: data?.create !== false, open: data?.open !== false };
}

/** Thrown by readGameDeck when Bottle Bay hid the room's deck after reports (or its sharer took it back): it's never dealt again. */
export class DeckHidden extends Error {
  readonly code = "deck-hidden";
  constructor() {
    super(DECK_HIDDEN_TEXT);
  }
}

/**
 * Each device reads the game's deck once per game. Cards come back the way every device deals
 * them: playable only, in deck order. A Bottle Bay deck is checked first: one that reports have
 * hidden, or that its sharer took back, throws DeckHidden.
 */
export async function readGameDeck(room: Room): Promise<PracticeCard[]> {
  if (!room.deck) return [];
  let cards: BottleCard[];
  if (room.deck.bottleId !== null) {
    if (!(await bottleStillShared(room.deck.bottleId))) throw new DeckHidden();
    cards = await deckCards(room.deck.bottleId);
  } else {
    const raw: unknown = (await getDoc(deckRef(room.code))).data()?.cards;
    cards = Array.isArray(raw) ? raw.filter((c): c is BottleCard => !!c && typeof c.f === "string" && typeof c.b === "string") : [];
  }
  return playableCards(toPracticeCards(cards));
}

/**
 * Listens to the room from joining until leaving. Snapshots with this device's writes still on
 * their way are skipped (the confirmed one follows, as a metadata change), and server times read
 * as estimates. `room(null)` means the room is gone; a removed sailor gets error "permission-denied".
 */
export function watchRoom(code: string, on: { room(r: Room | null, meta: { fromCache: boolean }): void; error(code: string): void }): () => void {
  let stopped = false;
  let unsubscribe: (() => void) | null = null;
  const stop = () => {
    stopped = true;
    unsubscribe?.();
  };
  unsubscribe = onSnapshot(
    roomRef(code),
    { includeMetadataChanges: true },
    (snap) => {
      if (stopped || snap.metadata.hasPendingWrites) return;
      if (!snap.exists()) {
        on.room(null, { fromCache: snap.metadata.fromCache });
        return;
      }
      const room = toRoom(code, snap.data({ serverTimestamps: "estimate" }));
      if (room) {
        on.room(room, { fromCache: snap.metadata.fromCache });
        return;
      }
      // A room this app can't read (from a newer app, say): stop listening before saying so, so
      // every later change to it doesn't report the problem again (and start another listener).
      stop();
      on.error("data-loss");
    },
    (e) => {
      if (!stopped) on.error(roomErrorCode(e));
    },
  );
  if (stopped) unsubscribe();
  return stop;
}

// ---- The sailor's own folder ------------------------------------------------------------------

/** What this account said on the room rules card (users/{uid}/meta/rooms): the version accepted (0 = never) and the 13+ tick. */
export interface RulesStamp {
  rules: number;
  over13: boolean;
}

/** This account's answer on the room rules card, as the database has it. Signing in on a shared computer never inherits someone else's. */
export async function readRulesStamp(uid: string): Promise<RulesStamp> {
  const data = (await getDoc(stampRef(uid))).data();
  return { rules: typeof data?.rules === "number" ? data.rules : 0, over13: data?.over13 === true };
}

/**
 * Records that this account accepted the room rules, with exactly the 13+ answer the sailor gave
 * on the card (nothing else ever writes it). A stamp from an older app gets the newer fields.
 */
export async function acceptRoomRules(uid: string, over13: boolean): Promise<void> {
  const snap = await getDoc(stampRef(uid));
  if (!snap.exists()) {
    await setDoc(stampRef(uid), { madeAt: null, joinedAt: null, madeIn: null, joinedIn: null, openIn: null, rules: ROOM_RULES_VERSION, over13 });
    return;
  }
  const data = snap.data();
  const missing = Object.fromEntries((["madeIn", "joinedIn", "openIn"] as const).filter((f) => !(f in data)).map((f) => [f, null]));
  await updateDoc(stampRef(uid), { ...missing, rules: ROOM_RULES_VERSION, over13 });
}

/** Deletes the private note that this sailor is in `code` (after leaving, removal or the room's end). */
export async function forgetRoom(uid: string, code: string): Promise<void> {
  await deleteDoc(noteRef(uid, code));
}

/**
 * The open room this account opened last and still skippers, by name, or null. The rules allow
 * one such room per account, so a second open room is refused until this one closes, ends or is
 * handed on (pass the hat).
 */
export async function skipperingOpenRoom(uid: string): Promise<string | null> {
  const code: unknown = (await getDoc(stampRef(uid))).data()?.openIn;
  if (typeof code !== "string") return null;
  const card = await getCard(code);
  const problem = card && joinProblem(card, Date.now());
  if (!card || problem === "ended" || problem === "skipper-away") return null;
  // Only sailors aboard can read a room: one this account has left reads as not theirs.
  const [room, key] = await Promise.all([getRoom(code).catch(() => null), memberKey(uid, code)]);
  return room?.host === key ? roomNameText(room.name) : null;
}

// ---- Opening and joining ----------------------------------------------------------------------

/** Opens a room: the room, its card, the private note and the cooldown stamp, in one batch. */
export async function openRoom(uid: string, draft: { mode: RoomMode; name: [number, number]; subject: number; look: RoomLook }): Promise<{ code: string; key: string }> {
  const code = newRoomCode((n) => crypto.getRandomValues(new Uint8Array(n)));
  const key = await memberKey(uid, code);
  const mode: RoomMode = draft.mode === "open" ? "open" : "invite";
  const name: [number, number] = [whole(draft.name[0], 0, ROOM_LIMITS.wordList - 1), whole(draft.name[1], 0, ROOM_LIMITS.wordList - 1)];
  const subj = whole(draft.subject, 0, ROOM_LIMITS.subjects - 1);
  const batch = writeBatch(firestore());
  // The stamp names this room, so one batch can only ever open one; an open room is also the one open room this account runs.
  batch.update(stampRef(uid), { madeAt: serverTimestamp(), joinedAt: serverTimestamp(), madeIn: code, joinedIn: code, ...(mode === "open" ? { openIn: code } : {}) });
  batch.set(noteRef(uid, code), { at: serverTimestamp() });
  batch.set(roomRef(code), {
    v: 1,
    mode,
    name,
    subj,
    at: serverTimestamp(),
    host: key,
    listed: mode === "open",
    locked: false,
    ban: [],
    rep: [],
    why: { spam: 0, unkind: 0, personal: 0, off: 0 },
    banked: 0,
    last: null,
    sail: null,
    deck: null,
    game: null,
    m: { [key]: { ...newMemberFields(draft.look), in: serverTimestamp(), seen: serverTimestamp(), cr: serverTimestamp() } },
  });
  batch.set(cardRef(code), { v: 1, mode, name, subj, at: serverTimestamp(), listed: mode === "open", locked: false, n: 1, alive: serverTimestamp() });
  await batch.commit();
  return { code, key };
}

/** Comes aboard: my entry, the card's count, the join stamp and the private note, in one batch. Returns my key. */
export async function joinRoom(uid: string, code: string, look: RoomLook): Promise<string> {
  const [key, note] = await Promise.all([memberKey(uid, code), getDoc(noteRef(uid, code)).catch(() => null)]);
  const batch = writeBatch(firestore());
  updatePairs(batch, roomRef(code), [[new FieldPath("m", key), { ...newMemberFields(look), in: serverTimestamp(), seen: serverTimestamp(), cr: serverTimestamp() }]]);
  // increment, so two sailors joining at once both count.
  batch.update(cardRef(code), { n: increment(1) });
  batch.update(stampRef(uid), { joinedAt: serverTimestamp(), joinedIn: code });
  // The note can only be created, never rewritten, so a note left from an earlier visit stays as it is.
  if (!note?.exists()) batch.set(noteRef(uid, code), { at: serverTimestamp() });
  await batch.commit();
  return key;
}

// ---- Writes while aboard ----------------------------------------------------------------------

/** My own entry: state, clock, credited minutes, a cheer or Tidy progress. The skipper's keep-alive also refreshes the card's `alive`. */
export async function writeSelf(code: string, key: string, patch: SelfPatch, opts: { cardAlive?: boolean } = {}): Promise<void> {
  const batch = writeBatch(firestore());
  updatePairs(batch, roomRef(code), selfPairs(key, patch));
  if (opts.cardAlive) batch.update(cardRef(code), { alive: serverTimestamp() });
  await batch.commit();
}

/**
 * The skipper's tools, with their own entry stamped. Keeps `listed` and the card in step with the
 * door. `cardAlive` also refreshes the card's `alive` (only while the hat stays: it must equal the
 * skipper's own new `seen`), so a skipper busy with games still shows joiners the room is alive.
 */
export async function skipperWrite(room: Room, key: string, change: SkipperChange, self: SelfPatch, opts: { cardAlive?: boolean } = {}): Promise<void> {
  const code = room.code;
  const batch = writeBatch(firestore());
  const pairs = selfPairs(key, self);
  const top = (name: string) => new FieldPath(name);

  const locked = change.locked ?? room.locked;
  const listed = room.mode === "open" && !locked && room.reportKeys.length < ROOM_LIMITS.hideAtReports;
  if (locked !== room.locked) pairs.push([top("locked"), locked]);
  if (listed !== room.listed) pairs.push([top("listed"), listed]);

  if (change.sail !== undefined) {
    const s = change.sail;
    const { sailFocus, sailBreak, sailCycles } = ROOM_LIMITS;
    pairs.push([
      top("sail"),
      s === null ? null : { at: serverTimestamp(), f: whole(s.focus, sailFocus.min, sailFocus.max), b: whole(s.brk, sailBreak.min, sailBreak.max), c: whole(s.cycles, sailCycles.min, sailCycles.max) },
    ]);
  }

  if (change.deck !== undefined) {
    const d = change.deck;
    if (d === null) pairs.push([top("deck"), null]);
    else if ("own" in d) {
      const cards = d.own.map((c) => ({ f: c.f, b: c.b }));
      pairs.push([top("deck"), { b: null, n: cards.length }]);
      batch.set(deckRef(code), { cards });
    } else pairs.push([top("deck"), { b: d.bottleId, n: d.cards }]);
    // Switching away from the skipper's own cards takes them down too.
    if (room.deck?.bottleId === null && !(d && "own" in d)) batch.delete(deckRef(code));
  }

  if (change.game !== undefined) {
    const g = change.game;
    if (g === null) pairs.push([top("game"), null]);
    else {
      const seats = (change.seats ?? []).slice(0, ROOM_LIMITS.size);
      if (!seats.length) throw new Error("A game needs at least one seat.");
      const base = { kind: g.kind, v: 1, seed: newSeed(), at: serverTimestamp(), seats };
      const { bottle } = ROOM_LIMITS;
      pairs.push([
        top("game"),
        g.kind === "tidy"
          ? base
          : (() => {
              const n = whole(g.cards, ROOM_LIMITS.deckCards.min, room.deck?.cards ?? ROOM_LIMITS.deckCards.min);
              return { ...base, n, turn: 0, holder: seats[0], tAt: serverTimestamp(), card: 0, del: 0, buoys: bottle.buoys, res: false, goal: whole(g.goal, bottle.goal.min, Math.min(bottle.goal.max, n)), end: 0 };
            })(),
      ]);
    }
  }

  const passing = change.host !== undefined && change.host !== room.host;
  if (passing) pairs.push([top("host"), change.host]);

  updatePairs(batch, roomRef(code), pairs);
  const card: Record<string, unknown> = {};
  if (locked !== room.locked || listed !== room.listed) Object.assign(card, { locked, listed });
  if (opts.cardAlive && !passing) card.alive = serverTimestamp();
  if (Object.keys(card).length) batch.update(cardRef(code), card);
  await batch.commit();
}

/** Takes the hat when the skipper has been gone 25 minutes. The card's `alive` follows the new skipper in the same batch. */
export async function takeHat(room: Room, key: string, self: SelfPatch): Promise<void> {
  const batch = writeBatch(firestore());
  updatePairs(batch, roomRef(room.code), [...selfPairs(key, self), [new FieldPath("host"), key]]);
  batch.update(cardRef(room.code), { alive: serverTimestamp() });
  await batch.commit();
}

/** One Pass the Bottle turn: field paths under `game`, with no read. The rules refuse a second sailor writing the same turn. */
export async function playTurn(code: string, patch: BottleTurnPatch): Promise<void> {
  const g = (name: string) => new FieldPath("game", name);
  await updateDoc(
    roomRef(code),
    g("turn"),
    patch.turn,
    g("holder"),
    patch.holder,
    g("tAt"),
    serverTimestamp(),
    g("card"),
    patch.card,
    g("del"),
    patch.delivered,
    g("buoys"),
    patch.buoys,
    g("res"),
    patch.rescue,
    g("end"),
    patch.end,
  );
}

/** Asks a sailor to leave (the skipper, with a ban for the room's life) or sweeps out one who's been gone 25 minutes. Their minutes stay with the crew. */
export async function removeSailor(room: Room, key: string, gone: string, opts: { ban: boolean }): Promise<void> {
  const member = room.members.find((m) => m.key === gone);
  if (!member || gone === key) return;
  const top = (name: string) => new FieldPath(name);
  const pairs: Pair[] = [
    [new FieldPath("m", gone), deleteField()],
    [top("banked"), increment(member.dmg)],
    [top("last"), gone],
  ];
  if (gone === room.host) {
    const next = nextSkipper(room, gone, Date.now());
    if (next) pairs.push([top("host"), next]);
  }
  if (opts.ban) pairs.push([top("ban"), arrayUnion(gone)]);
  const batch = writeBatch(firestore());
  updatePairs(batch, roomRef(room.code), pairs);
  batch.update(cardRef(room.code), { n: increment(-1) });
  await batch.commit();
}

function leaveBatch(uid: string, room: Room, key: string, extraMinutes: number, serverNow: number): WriteBatch | null {
  const me = room.members.find((m) => m.key === key);
  if (!me) return null;
  const batch = writeBatch(firestore());
  if (room.members.length <= 1) {
    // Only ever from a copy read from the server just now (leaveRoom checks), so nobody who has just come aboard loses the room.
    // The last one out closes the room for good.
    batch.delete(deckRef(room.code));
    batch.delete(roomRef(room.code));
    batch.delete(cardRef(room.code));
  } else {
    const extra = Math.max(0, Math.min(Math.floor(extraMinutes), creditableMinutes(me, serverNow - CLOCK_MARGIN_MS)));
    const top = (name: string) => new FieldPath(name);
    const pairs: Pair[] = [
      [new FieldPath("m", key), deleteField()],
      [top("banked"), increment(me.dmg + extra)],
      [top("last"), key],
    ];
    if (room.host === key) {
      const next = nextSkipper(room, key, serverNow);
      if (next) pairs.push([top("host"), next]);
    }
    updatePairs(batch, roomRef(room.code), pairs);
    batch.update(cardRef(room.code), { n: increment(-1) });
  }
  batch.delete(noteRef(uid, room.code));
  return batch;
}

/**
 * Leaves by myself, keeping my minutes with the crew and adding the ones since my last credit
 * (the rules cap them). A departing skipper hands on the hat. The last one out deletes the room,
 * its card and deck instead, but only after reading the room from the server: a copy that says
 * I'm alone may be old (someone may have just come aboard). If that read can't be made (offline),
 * nothing is deleted and the private note stays: the room ends by itself 25 minutes after I was
 * last seen, and the note lets a later visit clear it. If my copy of the room was out of date,
 * it reads it again and tries once more, without the extra minutes.
 */
export async function leaveRoom(uid: string, room: Room, key: string, extraMinutes: number, serverNow: number): Promise<void> {
  if (room.members.length <= 1) {
    let fresh: Room | null;
    try {
      fresh = await getRoomFromServer(room.code);
    } catch (e) {
      // Refused: I'm not aboard any more (removed, swept or the room closed), so only my note is left.
      if (roomErrorCode(e) === "permission-denied") await forgetRoom(uid, room.code);
      return;
    }
    if (!fresh) {
      await forgetRoom(uid, room.code);
      return;
    }
    room = fresh;
  }
  const first = leaveBatch(uid, room, key, extraMinutes, serverNow);
  if (!first) {
    await forgetRoom(uid, room.code);
    return;
  }
  try {
    await first.commit();
  } catch (e) {
    if (roomErrorCode(e) !== "permission-denied") throw e;
    const fresh = await getRoomFromServer(room.code).catch(() => null);
    const again = fresh && leaveBatch(uid, fresh, key, 0, serverNow);
    if (again) await again.commit();
    // Unreadable: I'm not aboard any more (removed, swept or the room closed), so only my note is left.
    else await forgetRoom(uid, room.code);
  }
}

/** The skipper closes the room for everyone: room, card, deck and their own note. Crewmates' notes are tidied by their own devices. */
export async function closeRoom(uid: string, room: Room): Promise<void> {
  const batch = writeBatch(firestore());
  batch.delete(deckRef(room.code));
  batch.delete(roomRef(room.code));
  batch.delete(cardRef(room.code));
  batch.delete(noteRef(uid, room.code));
  await batch.commit();
}

/** Thrown by reportRoom when this account's report is already counted. */
export class AlreadyReported extends Error {
  readonly code = "already-reported";
  constructor() {
    super("You've already reported this room.");
  }
}

/**
 * Reports a room, once per account, with one reason. The report key is a hash nobody can match to
 * a sailor. A sailor aboard knows the room (and reads it again once if another report or the door
 * changed `listed` meanwhile); a removed one only sees the card, so it guesses whether this report
 * is the third (which unlists the room and its card) and tries the other way if refused.
 */
export async function reportRoom(uid: string, code: string, reason: RoomReportReason, known: Room | null): Promise<void> {
  const rk = await reportKey(uid, code);
  const write = async (listed: boolean, card: boolean) => {
    const batch = writeBatch(firestore());
    updatePairs(batch, roomRef(code), [
      [new FieldPath("rep"), arrayUnion(rk)],
      [new FieldPath("why", reason), increment(1)],
      [new FieldPath("listed"), listed],
    ]);
    if (card) batch.update(cardRef(code), { listed });
    await batch.commit();
  };
  if (known) {
    if (known.reportKeys.includes(rk)) throw new AlreadyReported();
    const listed = listedAfterReport(known);
    try {
      await write(listed, listed !== known.listed);
    } catch (e) {
      if (roomErrorCode(e) !== "permission-denied") throw e;
      const fresh = await getRoomFromServer(code).catch(() => null);
      if (!fresh) throw e;
      if (fresh.reportKeys.includes(rk)) throw new AlreadyReported();
      const again = listedAfterReport(fresh);
      await write(again, again !== fresh.listed);
    }
    return;
  }
  const card = await getCard(code);
  if (!card) throw Object.assign(new Error("That room has closed."), { code: "not-found" });
  if (!card.listed) {
    await write(false, false);
    return;
  }
  try {
    await write(true, false);
  } catch (e) {
    if (roomErrorCode(e) !== "permission-denied") throw e;
    await write(false, true);
  }
}

// ---- Tidying up -------------------------------------------------------------------------------

/** Deletes a room that's over (skipper gone 25 minutes, or 12 hours old), with its card and deck. Refused, harmlessly, while it's alive. */
export async function clearDeadRoom(code: string): Promise<void> {
  const batch = writeBatch(firestore());
  batch.delete(deckRef(code));
  batch.delete(roomRef(code));
  batch.delete(cardRef(code));
  await batch.commit();
}

const TIDY_PER_CALL = 5;

/** Clears my notes for rooms that are gone or over, oldest first, at most 5 per call. Notes for live rooms stay. */
export async function tidyMyRooms(uid: string, current: string | null): Promise<void> {
  const snap = await getDocs(query(collection(firestore(), "users", uid, "rooms"), orderBy("at"), limit(TIDY_PER_CALL + 1)));
  const now = Date.now();
  for (const d of snap.docs.filter((n) => n.id !== current).slice(0, TIDY_PER_CALL)) {
    try {
      const card = await getCard(d.id);
      if (!card) {
        await deleteDoc(d.ref);
        continue;
      }
      const problem = joinProblem(card, now);
      if (problem === "ended" || problem === "skipper-away") {
        // Only once the room is really gone: if the rules say it's still alive, the note stays.
        await clearDeadRoom(d.id);
        await deleteDoc(d.ref);
      }
    } catch {
      // Next visit tries again.
    }
  }
}

/**
 * For account deletion: out of every room this account is in, one batch per room, best effort.
 * A room I skipper closes; any other I leave; one I can't read any more just loses its note.
 */
export async function leaveAllRooms(uid: string): Promise<void> {
  (await import("./roomSession.js")).stopRoomSession({ forget: true });
  const notes = await getDocs(collection(firestore(), "users", uid, "rooms"));
  for (const d of notes.docs) {
    try {
      const key = await memberKey(uid, d.id);
      const room = await getRoom(d.id).catch(() => null);
      if (room && room.members.some((m) => m.key === key)) {
        if (room.host === key) await closeRoom(uid, room);
        else await leaveRoom(uid, room, key, 0, Date.now());
      } else await deleteDoc(d.ref);
    } catch (e) {
      console.warn("Ship couldn't leave a study room while deleting the account.", e);
    }
  }
}
