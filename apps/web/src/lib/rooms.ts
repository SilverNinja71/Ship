// Study Rooms in Firestore: every read and write a room makes, one batch per action. Loaded only
// with `import()` (by roomStore.ts and roomSession.ts), so Firestore stays out of the first download.
//
//   rooms/{code}             the room, readable only by the sailors aboard
//   rooms/{code}/deck/cards  a skipper's own flashcards for a game (invite rooms only)
//   roomCards/{code}         its public card: made-up name, subject, how many are aboard; once the
//                            room goes, {gone: true} for good, so its code is never used again
//   users/{uid}/rooms/{code} the private note "I'm in (or was in) this room": account deletion finds
//                            rooms by it, and it lets a sailor who left still report one until it ends
//                            (`stayed`: they were aboard 5 minutes when they last left, so it's a strike)
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
  documentId,
  endBefore,
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
  startAt,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import type { DocumentData, DocumentReference, WriteBatch } from "firebase/firestore";
import { ROOM_GAME_ENGINE, ROOM_LIMITS, ROOM_RULES_VERSION } from "@ship/shared-types";
import type { BottleCard, Room, RoomCard, RoomLook, RoomMode, RoomReportReason } from "@ship/shared-types";
import { playableCards } from "@ship/active-recall-engine";
import type { PracticeCard } from "@ship/active-recall-engine";
import { bottleStillShared, deckCards } from "./bottleBay.js";
import { firestore } from "./db.js";
import {
  creditableMinutes,
  isRoomOver,
  joinProblem,
  listedAfterReport,
  memberKey,
  newMemberFields,
  newRoomCode,
  nextSkipper,
  reportIsStrike,
  reportKey,
  roomNameText,
  stayedAboard,
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
  /** A new game (seated from `seats`), or null to end the current one. A bottle game deals `cards` (the deck's playable cards). `seed`: the game's own (newSeed), else a fresh one. */
  game?: { kind: "tidy"; seed?: number } | { kind: "bottle"; goal: number; cards: number; seed?: number } | null;
  seats?: string[];
  /** Pass the skipper's hat to this sailor. In an open room this takes it off the list until they put it back. */
  host?: string;
  /**
   * Put an open room back on the list if it's off it (unlocking, or after the hat came here). The
   * rules list an open room only while its skipper runs it as their one open room, so the
   * skipper's stamp names it in the same batch (refused while they still run another).
   */
  list?: boolean;
}

/** Room minutes are worked out from this device's clock; a few seconds' slack keeps a claim inside what the rules allow. */
const CLOCK_MARGIN_MS = 5000;
/** The skipper clears their own room as over only this far past the line (the rules would let them delete it any time). */
const SKIPPER_CLEAR_MARGIN_MS = 30_000;

/** What a room's card becomes when the room goes: empty, for good, so its code can't be opened again (firestore.rules' cardGone). */
export const CARD_GONE = { gone: true } as const;

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
export function newSeed(): number {
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

/**
 * The open list: 20 listed cards at most, from a window that starts at a random code and wraps
 * round, so nobody can take the first 20 places by picking codes that sort first. Ordered by code
 * only, so no composite index is needed; the panel sorts.
 */
export async function listOpenCards(randomBytes: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): Promise<RoomCard[]> {
  const cards = collection(firestore(), "roomCards");
  const page = ROOM_LIMITS.listPage;
  const from = newRoomCode(randomBytes);
  const listed = where("listed", "==", true);
  const after = await getDocs(query(cards, listed, orderBy(documentId()), startAt(from), limit(page)));
  let docs = after.docs;
  if (docs.length < page) docs = [...docs, ...(await getDocs(query(cards, listed, orderBy(documentId()), endBefore(from), limit(page - docs.length)))).docs];
  return docs.map((d) => toCard(d.id, d.data({ serverTimestamps: "estimate" }))).filter((c): c is RoomCard => c !== null);
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

/** What this account said on the room rules card (users/{uid}/meta/rooms): the version accepted (0 = never) and the 13+ tick, and when it last joined (ms), from the same read. */
export interface RulesStamp {
  rules: number;
  over13: boolean;
  joinedAt?: number | null;
}

/** This account's answer on the room rules card, as the database has it. Signing in on a shared computer never inherits someone else's. */
export async function readRulesStamp(uid: string): Promise<RulesStamp> {
  const data = (await getDoc(stampRef(uid))).data();
  return { rules: typeof data?.rules === "number" ? data.rules : 0, over13: data?.over13 === true, joinedAt: timeMs(data?.joinedAt) };
}

/** When this account last joined or opened a room (the 10 s join cooldown counts from it), in server ms, or null. */
export async function readJoinedAt(uid: string): Promise<number | null> {
  return timeMs((await getDoc(stampRef(uid))).data()?.joinedAt);
}

/** A Firestore time (or plain ms, in tests) as ms, or null. */
function timeMs(v: unknown): number | null {
  const ms = typeof v === "number" ? v : typeof (v as { toMillis?: unknown } | null)?.toMillis === "function" ? (v as { toMillis: () => number }).toMillis() : null;
  return typeof ms === "number" && Number.isFinite(ms) ? ms : null;
}

/**
 * Records that this account accepted the room rules, with exactly the 13+ answer the sailor gave
 * on the card (nothing else ever writes it). A stamp from an older app gets the newer fields.
 * `keepOver13`: the card couldn't show the account's own answer (it couldn't be read), so an
 * unticked box isn't taken as taking a "yes" back.
 */
export async function acceptRoomRules(uid: string, over13: boolean, opts: { keepOver13?: boolean } = {}): Promise<boolean> {
  const snap = await getDoc(stampRef(uid));
  if (!snap.exists()) {
    await setDoc(stampRef(uid), { madeAt: null, joinedAt: null, madeIn: null, joinedIn: null, openIn: null, rules: ROOM_RULES_VERSION, over13 });
    return over13;
  }
  const data = snap.data();
  const answer = over13 || (opts.keepOver13 === true && data.over13 === true);
  const missing = Object.fromEntries((["madeIn", "joinedIn", "openIn"] as const).filter((f) => !(f in data)).map((f) => [f, null]));
  await updateDoc(stampRef(uid), { ...missing, rules: ROOM_RULES_VERSION, over13: answer });
  return answer;
}

/** Deletes the private note that this sailor is in `code` (after leaving, removal or the room's end). */
export async function forgetRoom(uid: string, code: string): Promise<void> {
  await deleteDoc(noteRef(uid, code));
}

/**
 * The open room this account opened last and still skippers, by name, or null. The rules allow
 * one such room per account, so a second open room is refused until this one closes, ends or is
 * handed on (pass the hat). Judged by the server's clock (`serverNow`), not this device's.
 */
export async function skipperingOpenRoom(uid: string, serverNow: number): Promise<string | null> {
  const code: unknown = (await getDoc(stampRef(uid))).data()?.openIn;
  if (typeof code !== "string") return null;
  // Only sailors aboard can read a room: one this account has left reads as not theirs.
  const [room, key] = await Promise.all([getRoom(code).catch(() => null), memberKey(uid, code)]);
  return room?.host === key && !isRoomOver(room, serverNow) ? roomNameText(room.name) : null;
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
    strikes: 0,
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
 * Whether an open room may be on the list after a write: door open, fewer than 3 reports, the hat
 * staying where it is, and either already listed or named in the skipper's stamp by this write.
 */
export function listedAfter(room: Room, change: Pick<SkipperChange, "locked" | "host" | "list">): { listed: boolean; claim: boolean } {
  const locked = change.locked ?? room.locked;
  const passing = change.host !== undefined && change.host !== room.host;
  const could = room.mode === "open" && !locked && room.strikes < ROOM_LIMITS.hideAtReports && !passing;
  const claim = could && !room.listed && change.list === true;
  return { listed: could && (room.listed || claim), claim };
}

/**
 * The skipper's tools, with their own entry stamped. Keeps `listed` and the card in step with the
 * door and the hat (listedAfter). `cardAlive` also refreshes the card's `alive` (only while the
 * hat stays: it must equal the skipper's own new `seen`), so a skipper busy with games still shows
 * joiners the room is alive; the rules want it no more than 10 minutes old on a skipper's write.
 * `uid` is needed only to put an open room back on the list (`change.list`).
 */
export async function skipperWrite(room: Room, key: string, change: SkipperChange, self: SelfPatch, opts: { cardAlive?: boolean; uid?: string } = {}): Promise<void> {
  const code = room.code;
  const batch = writeBatch(firestore());
  const pairs = selfPairs(key, self);
  const top = (name: string) => new FieldPath(name);

  const locked = change.locked ?? room.locked;
  const { listed, claim } = listedAfter(room, change);
  if (claim) {
    if (!opts.uid) throw new Error("Putting an open room back on the list needs the skipper's account.");
    batch.update(stampRef(opts.uid), { openIn: code });
  }
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
      const seed = g.seed !== undefined && Number.isInteger(g.seed) && g.seed >= 0 ? g.seed : newSeed();
      const base = { kind: g.kind, v: ROOM_GAME_ENGINE, seed, at: serverTimestamp(), seats };
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

/**
 * Takes the hat when the skipper has been quiet 15 minutes (or left). The card's `alive` follows
 * the new skipper in the same batch. An open room stays on the list only as this sailor's one open
 * room (their stamp names it); if they still run another, it comes off the list instead.
 */
export async function takeHat(uid: string, room: Room, key: string, self: SelfPatch): Promise<void> {
  const could = room.mode === "open" && !room.locked && room.strikes < ROOM_LIMITS.hideAtReports;
  const send = async (claim: boolean) => {
    const listed = could && claim;
    const batch = writeBatch(firestore());
    if (claim) batch.update(stampRef(uid), { openIn: room.code });
    const pairs: Pair[] = [...selfPairs(key, self), [new FieldPath("host"), key]];
    if (listed !== room.listed) pairs.push([new FieldPath("listed"), listed]);
    updatePairs(batch, roomRef(room.code), pairs);
    batch.update(cardRef(room.code), { alive: serverTimestamp(), ...(listed !== room.listed ? { listed } : {}) });
    await batch.commit();
  };
  if (!could) return send(false);
  try {
    await send(true);
  } catch (e) {
    // Refused: most likely this account still runs another open room, so this one leaves the list.
    if (roomErrorCode(e) !== "permission-denied") throw e;
    await send(false);
  }
}

/**
 * One Pass the Bottle turn: field paths under `game`, with no read. The rules refuse a second
 * sailor writing the same turn. It names the game's seed (unchanged, so the rules let it be), so a
 * turn that waited offline is refused if another game has started since, never played on its turn 0.
 */
export async function playTurn(code: string, seed: number, patch: BottleTurnPatch): Promise<void> {
  const g = (name: string) => new FieldPath("game", name);
  await updateDoc(
    roomRef(code),
    g("seed"),
    seed,
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
  // A departing skipper hands on the hat, and an open room leaves the list until the new one puts it back.
  const unlist = gone === room.host && room.listed;
  if (gone === room.host) {
    const next = nextSkipper(room, gone, Date.now());
    if (next) pairs.push([top("host"), next]);
  }
  if (unlist) pairs.push([top("listed"), false]);
  if (opts.ban) pairs.push([top("ban"), arrayUnion(gone)]);
  const batch = writeBatch(firestore());
  updatePairs(batch, roomRef(room.code), pairs);
  batch.update(cardRef(room.code), { n: increment(-1), ...(unlist ? { listed: false } : {}) });
  await batch.commit();
}

/** Deletes a room with its deck, empties its card for good (CARD_GONE), and (with `uid`) deletes my note for it. */
function goneBatch(code: string, uid: string | null): WriteBatch {
  const batch = writeBatch(firestore());
  batch.delete(deckRef(code));
  batch.delete(roomRef(code));
  batch.set(cardRef(code), CARD_GONE);
  if (uid) batch.delete(noteRef(uid, code));
  return batch;
}

/**
 * My leave. `note`: my private note records whether I stayed 5 minutes this time (`stayed`), so a
 * report I make after leaving counts as a strike only then; left out on a retry, in case the note
 * was the problem (an older join may not have made one).
 */
function leaveBatch(uid: string, room: Room, key: string, extraMinutes: number, serverNow: number, opts: { note?: boolean } = {}): WriteBatch | null {
  const me = room.members.find((m) => m.key === key);
  if (!me) return null;
  if (room.members.length <= 1) {
    // Only ever from a copy read from the server just now (leaveRoom checks), so nobody who has just come aboard loses the room.
    // The last one out closes the room for good, and their note goes with it.
    return goneBatch(room.code, uid);
  }
  const batch = writeBatch(firestore());
  // Whole minutes only: the rules refuse anything else, and the room would be unreadable with it.
  const extra = Math.max(0, Math.min(Math.floor(extraMinutes), creditableMinutes(me, serverNow - CLOCK_MARGIN_MS)));
  const top = (name: string) => new FieldPath(name);
  const pairs: Pair[] = [
    [new FieldPath("m", key), deleteField()],
    [top("banked"), increment(Math.floor(me.dmg) + extra)],
    [top("last"), key],
  ];
  // A departing skipper hands on the hat, and an open room leaves the list until the new one puts it back.
  const unlist = room.host === key && room.listed;
  if (room.host === key) {
    const next = nextSkipper(room, key, serverNow);
    if (next) pairs.push([top("host"), next]);
  }
  if (unlist) pairs.push([top("listed"), false]);
  updatePairs(batch, roomRef(room.code), pairs);
  batch.update(cardRef(room.code), { n: increment(-1), ...(unlist ? { listed: false } : {}) });
  // The private note stays (it's tidied away with the room), so a sailor who left can still report the room.
  // Whether I stayed 5 minutes is never claimed on a guess (stayedAboard keeps a margin); the rules check it.
  if (opts.note !== false) batch.set(noteRef(uid, room.code), { stayed: stayedAboard(me, serverNow) }, { merge: true });
  return batch;
}

/**
 * A room that's over can't be written to any more, only deleted (the rules make "over" final), so
 * leaving it means clearing it, with its card, deck and my note. False when the rules say it isn't
 * over after all (this device's clock is off): then it's left the ordinary way.
 */
async function clearOverRoom(uid: string, code: string): Promise<boolean> {
  try {
    await goneBatch(code, uid).commit();
    return true;
  } catch (e) {
    if (roomErrorCode(e) === "permission-denied") return false;
    throw e;
  }
}

/**
 * The room from the server for a leave: null when it's gone or I may not read it (I'm no longer
 * aboard). Any other problem (offline, out of free use) is thrown, so nothing is deleted on a guess.
 */
async function roomForLeaving(code: string): Promise<Room | null> {
  try {
    return await getRoomFromServer(code);
  } catch (e) {
    if (roomErrorCode(e) === "permission-denied") return null;
    throw e;
  }
}

/** How a leave (or close) may judge the room "over": the server's clock as this device knows it, and whether that was measured (an own write's round trip, or a sign-in token's time) rather than guessed. */
export interface LeaveClock {
  serverNow: number;
  measured: boolean;
}

/**
 * Whether I may clear this copy of the room as over. Clearing deletes it for everyone. The rules
 * let a crewmate delete a room only once it's over, so they decide. But they always let its
 * skipper delete it, so the skipper clears it only from a copy read from the server just now,
 * judged by a measured clock and a little past the line: never on a guess from an old copy (a
 * write still on its way, say) or a device clock that's minutes fast.
 */
function mayClearAsOver(room: Room, key: string, clock: LeaveClock, fromServer: boolean): boolean {
  if (room.host !== key) return true;
  return fromServer && clock.measured && isRoomOver(room, clock.serverNow - SKIPPER_CLEAR_MARGIN_MS);
}

/**
 * Leaves by myself, keeping my minutes with the crew and adding the ones since my last credit
 * (the rules cap them). A departing skipper hands on the hat. My private note for the room stays,
 * so I can still report it after leaving (it's tidied away once the room ends). The last one out
 * deletes the room, its deck and note, and empties its card, but only after reading the room from
 * the server: a copy that says I'm alone may be old (someone may have just come aboard). If that
 * read can't be made (offline), nothing is deleted and the private note stays: the room ends by
 * itself 25 minutes after I was last seen, and the note lets a later visit clear it.
 *
 * If the leave is refused, my copy was out of date (a write still on its way, someone else leaving,
 * the door) or the room is over by the server's clock: it reads the room again and leaves from
 * that, without the extra minutes, or clears it if it's over (mayClearAsOver: never the skipper's
 * live room on a guess).
 */
export async function leaveRoom(uid: string, room: Room, key: string, extraMinutes: number, clock: LeaveClock): Promise<void> {
  const serverNow = clock.serverNow;
  let fromServer = false;
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
    fromServer = true;
  }
  if (isRoomOver(room, serverNow) && mayClearAsOver(room, key, clock, fromServer) && (await clearOverRoom(uid, room.code))) return;
  const first = leaveBatch(uid, room, key, extraMinutes, serverNow);
  if (!first) {
    await forgetRoom(uid, room.code);
    return;
  }
  try {
    await first.commit();
    return;
  } catch (e) {
    if (roomErrorCode(e) !== "permission-denied") throw e;
  }
  const fresh = await roomForLeaving(room.code);
  // Unreadable or gone: I'm not aboard any more (removed, swept or the room closed), so only my note is left.
  if (!fresh || !fresh.members.some((m) => m.key === key)) {
    await forgetRoom(uid, room.code);
    return;
  }
  // A crewmate tries clearing whatever their clock says (the rules decide); the skipper only when it's surely over.
  const over = fresh.host !== key || isRoomOver(fresh, serverNow);
  if (over && mayClearAsOver(fresh, key, clock, true) && (await clearOverRoom(uid, fresh.code))) return;
  await leaveBatch(uid, fresh, key, 0, serverNow, { note: false })!.commit();
}

/**
 * The skipper closes the room for everyone: room, deck and their own note, with its card emptied
 * for good. Crewmates' notes are tidied by their own devices. If it's refused (the hat moved on
 * while this device wasn't looking: a crewmate took it after 15 quiet minutes, say), the room is
 * read from the server: still aboard but not the skipper, I leave it the ordinary way ("left");
 * not aboard any more, only my note goes ("gone"). Offline, it throws, and nothing changes.
 */
export async function closeRoom(uid: string, room: Room, clock: LeaveClock): Promise<"closed" | "left" | "gone"> {
  try {
    await goneBatch(room.code, uid).commit();
    return "closed";
  } catch (e) {
    if (roomErrorCode(e) !== "permission-denied") throw e;
  }
  const [fresh, key] = await Promise.all([roomForLeaving(room.code), memberKey(uid, room.code)]);
  if (!fresh || !fresh.members.some((m) => m.key === key)) {
    await forgetRoom(uid, room.code);
    return "gone";
  }
  if (fresh.host === key) {
    await goneBatch(room.code, uid).commit();
    return "closed";
  }
  await leaveRoom(uid, fresh, key, 0, clock);
  return "left";
}

/** Thrown by reportRoom when this account's report is already counted. */
export class AlreadyReported extends Error {
  readonly code = "already-reported";
  constructor() {
    super("You've already reported this room.");
  }
}

/** One shape of report write: whether it's a strike, and `listed` after it (null: left as it is). */
interface ReportShape {
  strike: boolean;
  listed: boolean | null;
  card: boolean;
}

/**
 * Reports a room, once per account, with one reason. The report key is a hash nobody can match to
 * a sailor. Whether it's a strike (counts towards taking an open room off the list: reportIsStrike)
 * comes from this account's stamp and private note, and for a sailor aboard from how long they've
 * been aboard by the server's clock. A sailor aboard knows the room; if refused (another report or
 * the door changed it, or the clock put them either side of 5 minutes), it's read again and both
 * ways are tried. A removed sailor, or one who left, only sees the card, so whether a strike is the
 * third (which unlists the room and its card) is guessed, and the other way tried if refused.
 */
export async function reportRoom(uid: string, code: string, reason: RoomReportReason, known: Room | null, serverNow: number): Promise<void> {
  const [rk, key, stamp, note] = await Promise.all([
    reportKey(uid, code),
    memberKey(uid, code),
    getDoc(stampRef(uid)).catch(() => null),
    getDoc(noteRef(uid, code)).catch(() => null),
  ]);
  const joinedIn: unknown = stamp?.data()?.joinedIn;
  const stayed = note?.data()?.stayed === true;
  const strikeFor = (room: Room | null) =>
    reportIsStrike({ code, joinedIn: typeof joinedIn === "string" ? joinedIn : null, aboardSince: room?.members.find((m) => m.key === key)?.joinedAt ?? null, stayed, serverNow });
  const write = async (shape: ReportShape) => {
    const pairs: Pair[] = [
      [new FieldPath("rep"), arrayUnion(rk)],
      [new FieldPath("why", reason), increment(1)],
    ];
    if (shape.strike) pairs.push([new FieldPath("strikes"), increment(1)]);
    if (shape.listed !== null) pairs.push([new FieldPath("listed"), shape.listed]);
    const batch = writeBatch(firestore());
    updatePairs(batch, roomRef(code), pairs);
    if (shape.card) batch.update(cardRef(code), { listed: shape.listed });
    await batch.commit();
  };
  const fromRoom = (room: Room, strike: boolean): ReportShape => {
    const listed = listedAfterReport(room, strike);
    return { strike, listed, card: listed !== room.listed };
  };
  const tryEach = async (shapes: ReportShape[]) => {
    let last: unknown = null;
    for (const shape of shapes) {
      try {
        await write(shape);
        return;
      } catch (e) {
        if (roomErrorCode(e) !== "permission-denied") throw e;
        last = e;
      }
    }
    throw last;
  };
  if (known) {
    if (known.reportKeys.includes(rk)) throw new AlreadyReported();
    try {
      await write(fromRoom(known, strikeFor(known)));
      return;
    } catch (e) {
      if (roomErrorCode(e) !== "permission-denied") throw e;
      const fresh = await getRoomFromServer(code).catch(() => null);
      if (!fresh) throw e;
      if (fresh.reportKeys.includes(rk)) throw new AlreadyReported();
      const strike = strikeFor(fresh);
      await tryEach([fromRoom(fresh, strike), fromRoom(fresh, !strike)]);
    }
    return;
  }
  const card = await getCard(code);
  if (!card) throw Object.assign(new Error("That room has closed."), { code: "not-found" });
  const strike = strikeFor(null);
  // Not a strike, or the room is off the list already: `listed` stays as it is.
  if (!strike || !card.listed) {
    await tryEach([{ strike, listed: null, card: false }, { strike: !strike, listed: null, card: false }]);
    return;
  }
  // A strike on a listed room: the third takes it (and its card) off the list.
  await tryEach([
    { strike: true, listed: null, card: false },
    { strike: true, listed: false, card: true },
  ]);
}

// ---- Tidying up -------------------------------------------------------------------------------

/**
 * Deletes a room that's over (skipper gone 25 minutes, or 12 hours old), with its deck, and empties
 * its card for good. Refused, harmlessly, while it's alive, except for its skipper, whom the rules
 * always let delete it: so the skipper's device calls this only when the room is surely over.
 */
export async function clearDeadRoom(code: string): Promise<void> {
  await goneBatch(code, null).commit();
}

/** How many of my notes a tidy looks through (oldest first), and how many room cards it reads per call. */
const TIDY_WINDOW = 50;
const TIDY_READS_PER_CALL = 5;
/** Where the next tidy carries on, so notes for rooms that are still alive never hold back newer ones. */
let tidyAfter: { uid: string; code: string } | null = null;

/**
 * Clears my notes for rooms that are gone or over, oldest first. A note older than a room can last
 * (12 hours) needs no read: its room is over or gone. Other notes cost a card read each, at most 5
 * per call; notes for rooms still alive stay, and the next call carries on after the last one
 * looked at, so they never block the notes behind them.
 */
export async function tidyMyRooms(uid: string, current: string | null, now: number = Date.now()): Promise<void> {
  const snap = await getDocs(query(collection(firestore(), "users", uid, "rooms"), orderBy("at"), limit(TIDY_WINDOW)));
  const notes = snap.docs.filter((n) => n.id !== current);
  const from = tidyAfter?.uid === uid ? notes.findIndex((n) => n.id === tidyAfter?.code) + 1 : 0;
  let reads = 0;
  for (const d of [...notes.slice(from), ...notes.slice(0, from)]) {
    const at = timeMs((d.data() as { at?: unknown } | undefined)?.at);
    // Clock slack, so a device a few minutes fast doesn't call a live room old.
    const old = at !== null && now - at > ROOM_LIMITS.lifetimeHours * 3_600_000 + 30 * 60_000;
    if (!old && reads >= TIDY_READS_PER_CALL) break;
    tidyAfter = { uid, code: d.id };
    try {
      if (!old) {
        reads++;
        const card = await getCard(d.id);
        if (!card) {
          await deleteDoc(d.ref);
          continue;
        }
        const problem = joinProblem(card, now);
        if (problem !== "ended" && problem !== "skipper-away") continue;
      }
      // Only once the room is really gone: if the rules say it's still alive, the note stays.
      await clearDeadRoom(d.id);
      await deleteDoc(d.ref);
    } catch {
      // Next visit tries again.
    }
  }
}

/** Errors that mean the database couldn't be reached at all (rather than a refusal). */
const unreachable = (e: unknown) => ["unavailable", "deadline-exceeded", "resource-exhausted", "cancelled"].includes(roomErrorCode(e));

/**
 * For account deletion: out of every room this account is in, one batch per room. A room I skipper
 * closes; any other I leave; one I can't read any more just loses its note. The open room this
 * account runs (named in its stamp) is closed too, even without a note, since the stamp can't go
 * while it's theirs. A room that can't be reached stops it all (thrown), so nothing is deleted on a
 * guess; a refusal for one room is skipped. Returns how many rooms it dealt with.
 */
export async function leaveAllRooms(uid: string): Promise<number> {
  (await import("./roomSession.js")).stopRoomSession({ forget: true });
  const notes = await getDocs(collection(firestore(), "users", uid, "rooms"));
  const codes = notes.docs.map((d) => d.id);
  const openIn: unknown = (await getDoc(stampRef(uid))).data()?.openIn;
  if (typeof openIn === "string" && /^[A-HJ-NP-Z2-9]{8}$/.test(openIn) && !codes.includes(openIn)) codes.push(openIn);
  let done = 0;
  for (const code of codes) {
    try {
      const key = await memberKey(uid, code);
      let room: Room | null;
      try {
        room = await getRoom(code);
      } catch (e) {
        if (roomErrorCode(e) !== "permission-denied") throw e;
        room = null;
      }
      if (room && room.members.some((m) => m.key === key)) {
        // No measured clock here: a room is never cleared as over on this device's guess (mayClearAsOver).
        const clock = { serverNow: Date.now(), measured: false };
        if (room.host === key) await closeRoom(uid, room, clock);
        else await leaveRoom(uid, room, key, 0, clock);
      } else if (notes.docs.some((d) => d.id === code)) await deleteDoc(noteRef(uid, code));
      done++;
    } catch (e) {
      if (unreachable(e)) throw e;
      console.warn("Ship couldn't leave a study room while deleting the account.", e);
    }
  }
  return done;
}
