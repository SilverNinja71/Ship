// Study Rooms on this device: the room the sailor is aboard (pushed in by lib/roomSession.ts) and
// their room preferences. It never imports Firestore: each action loads lib/rooms.ts and
// lib/roomSession.ts with import(), so visitors who never open a room never download them.
//
// Saved as ship:rooms on this device only. It isn't synced or backed up, because recent room
// codes work as invite keys. The saved preferences belong to one account (`uid`): when someone
// else signs in on the same browser they start fresh, and the 13+ answer is always the account's
// own (users/{uid}/meta/rooms), never this browser's.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ROOM_LIMITS, ROOM_RULES_VERSION, BOTTLE_LIMITS } from "@ship/shared-types";
import type { BottleCard, Room, RoomCard, RoomLook, RoomMode, RoomReportReason, VoyagePhase } from "@ship/shared-types";
import type { PracticeCard } from "@ship/active-recall-engine";
import { tidyPatches } from "@ship/active-recall-engine";
import { DECK_HIDDEN_TEXT, DECK_LOCKED_TEXT, JOIN_COOLDOWN_TEXT, NEXT_LEG_CALL_MS, TIDY_DECK_TOO_SMALL_TEXT, bottleGoal, bottleOver, bottleStep, deadCards, estimatedTidyPatches, gameSeats, joinProblem, legStartedAt, memberKey, presetFor, randomNick, roomProblem, sailOffer, tidyStatus } from "../lib/roomRules.js";
import type { BottleOutcome, JoinProblem, RoomAction, SailOffer, TidyMemo } from "../lib/roomRules.js";
import type { SkipperChange } from "../lib/rooms.js";
import { shipStorage, storageKey } from "../lib/storage.js";
import { useRecall } from "./recallStore.js";
import { useUi } from "./uiStore.js";
import { useVoyage } from "./voyageStore.js";

/** `elsewhere`: another Ship tab in this browser runs the room; this one waits and takes over when it closes. */
export type RoomStatus = "idle" | "joining" | "aboard" | "error" | "elsewhere";
/** `left`: this sailor tapped Leave (shown only in the panel, with Report, since a sailor who left can still report the room). */
export type RoomNotice = "removed" | "drifted" | "gone" | "closed" | "ended" | "left";
export type RoomOffer = SailOffer | { kind: "game"; game: "tidy" | "bottle"; seed: number } | { kind: "your-turn"; seed: number; turn: number };

export interface RecentRoom {
  code: string;
  name: [number, number];
  at: number;
  skipper: boolean;
  /** The nickname used in this room, so Hop back in keeps it (every other room gets a new one). */
  nick?: [number, number, number];
}

export interface RoomPrefs {
  /** The account these preferences belong to (null before the first sign-in). */
  uid: string | null;
  current: string | null;
  /** Up to 10, kept 12 hours (a room never lasts longer). */
  recent: RecentRoom[];
  /** Sailor keys whose cheers this sailor hid. */
  hidden: string[];
  /** Room codes hidden from this device's open list. */
  hiddenRooms: string[];
  muted: boolean;
  /** The room rules version this account accepted (0 = not yet), as last read from the account. */
  rulesOk: number;
  /** This account's own 13+ answer, as last read from it (never set for it by the app). */
  over13: boolean;
  /** The character and accessory last chosen. Its nickname isn't reused: each room gets a new one. */
  myLook: RoomLook | null;
  reported: string[];
  /** The newest sail plan whose "sail with us" offer was answered, so it doesn't pop up again. */
  lastSailSeen: number;
  /**
   * Lumi's note about losing (or leaving) a room, and which room. Saved, so every Ship tab shows
   * it: the tab that ran the room may be in the background while the sailor looks at another.
   */
  notice: RoomNotice | null;
  noticeRoom: { code: string; name: [number, number] } | null;
  /** When the notice came (local ms): a saved one older than a room can last is dropped. */
  noticeAt: number;
}

export interface RoomStoreState extends RoomPrefs {
  status: RoomStatus;
  room: Room | null;
  myKey: string | null;
  /** Server clock minus this device's, in ms. */
  serverOffset: number;
  /** The cards last read for a game, dealt the same way on every device (playable cards in deck order). Use gameDeck(): it checks they're this room's deck. */
  deck: PracticeCard[] | null;
  /** Which deck `deck` holds (deckIdentity), so a deck the skipper has since changed is never dealt from. */
  deckId: string | null;
  /** Why the game's cards couldn't be read, for a Try again. */
  deckProblem: string | null;
  /** Everything this device has seen of the current Tidy the Deck game, so a sailor leaving never undoes a patch. */
  tidyMemo: TidyMemo | null;
  offer: RoomOffer | null;
  /** Whose room rules answer this page has read from the account (`read` false: the read failed), so the rules card never acts on a guess. */
  rulesState: { uid: string; read: boolean } | null;
  /** What the last action couldn't do, in plain words (the action's own card or toast shows it). */
  error: string | null;
  /** A problem from the room's background work (listener, keep-alive, cheers): the panel shows it while aboard. */
  alert: string | null;
  busy: boolean;
  /** The open list from the last load (null before the first). */
  openList: { cards: RoomCard[]; at: number } | null;
  /** The public card behind an invite link or a typed code (uiStore.roomInvite), for the Join card. card null = no such room. */
  preview: { code: string; card: RoomCard | null; problem: JoinProblem | null } | null;

  /** Starts fresh when a different account signs in on this browser (their rules answer, nicknames and hidden lists aren't this one's). */
  forAccount(uid: string): void;
  /** Reads this account's room rules answer (version and 13+ tick) into rulesOk and over13. */
  syncRules(): Promise<void>;
  /** `sawAccount`: the card's tick started from the account's own answer (so an unticked box means "no"). */
  acceptRules(over13: boolean, opts?: { sawAccount?: boolean }): Promise<void>;
  openRoom(draft: { mode: RoomMode; name: [number, number]; subject: number; look: RoomLook }): Promise<void>;
  joinRoom(code: string, look: RoomLook): Promise<void>;
  /** Also used by Start over and sign-out. Clears this device's room at once, then tells the room. `tell`: the Leave button's own leave, which leaves a note in the panel with Report. */
  leaveRoom(opts?: { tell?: boolean }): Promise<void>;
  closeRoom(): Promise<void>;
  lock(locked: boolean): Promise<void>;
  /** Removal with a ban for the room's life. */
  removeSailor(key: string): Promise<void>;
  passHat(key: string): Promise<void>;
  takeHat(): Promise<void>;
  setSail(plan: { focus: number; brk: number; cycles: number } | null): Promise<void>;
  pickBottleDeck(bottleId: string, cards: number): Promise<void>;
  /** Throws (with words to show) when the deck can't go up: contact details, size, or an open room. Database problems land in `error`. */
  pickOwnDeck(deckId: string): Promise<void>;
  startGame(kind: "tidy" | "bottle"): Promise<void>;
  endGame(): Promise<void>;
  playTurn(outcome: BottleOutcome): Promise<void>;
  /** A Tidy the Deck patch cleared: `ms` since game.at (server), `mixups` made on this patch (they add up). */
  tidyCleared(patch: number, ms: number, mixups: number): void;
  /** say: 0–23 a cheer, 24–35 a sticker. Sent as soon as the 15 s gap allows. */
  cheer(say: number): void;
  /** Reports the room aboard, the one a notice is about, or `code` (a room this sailor was removed from). */
  report(reason: RoomReportReason, code?: string): Promise<void>;
  loadDeck(): Promise<void>;
  /** One-off load of the open list (13+ only); quietly clears up to 3 rooms that are over. */
  loadOpenRooms(): Promise<void>;
  /** Reads the card for an invite or typed code into `preview`. */
  loadPreview(code: string): Promise<void>;
  hideSailor(key: string, hide: boolean): void;
  hideRoom(code: string): void;
  setMuted(muted: boolean): void;
  dismissNotice(): void;
  dismissOffer(): void;
  /** This sailor has the game in front of them in the panel: its "is starting" call won't pop up. */
  seenGame(seed: number): void;
  /** Takes an offer (the waiting one, or the one the Sail together card shows): sail-with, hop-aboard and sail-on start Pwedo Pomo; a game opens the panel at the game. */
  acceptOffer(offer?: RoomOffer): void;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const RECENT_MAX = 10;
const RECENT_KEEP_MS = ROOM_LIMITS.lifetimeHours * 60 * MINUTE;
/** The rules want 2 s between turns; everyone sees the answer a moment longer. */
const TURN_PACE_MS = 2200;
const TURN_RETRY_MS = 1500;
/** The Pass the Bottle turn this device is sending ("seed:turn"). */
let turnSending: string | null = null;
/** A fresh game is announced for this long. */
const GAME_OFFER_MS = 2 * MINUTE;
const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;

const LOG_IN = "Log in to study with a crew.";
const NOT_ABOARD = "You're not in a room right now.";
const ONLY_SKIPPER = "Only the skipper can do that.";
const NEW_ROOMS_RESTING = "New rooms are resting for now. You can still join one with its code.";
const OVER13_ONLY = "Open rooms are for sailors 13 and older.";
/** Close room was refused because the hat had moved on (a crewmate took it while this device slept), so the sailor left instead. */
export const CLOSED_AS_LEFT = "You weren't the skipper any more (a crewmate took the hat while you were away), so you left the room instead of closing it.";

/** A problem to show as it is, not a database error. */
class RoomActionError extends Error {}

/** A session that ended while an action waited (the sailor left or was removed): nothing to tell them. */
const stoppedSession = (e: unknown) => e instanceof Error && e.name === "SessionStopped";

type RoomsModule = typeof import("../lib/rooms.js");
type SessionModule = typeof import("../lib/roomSession.js");
let roomsLoaded: Promise<RoomsModule> | null = null;
let sessionLoaded: Promise<SessionModule> | null = null;
const roomsModule = () => (roomsLoaded ??= import("../lib/rooms.js"));
const sessionModule = () => (sessionLoaded ??= import("../lib/roomSession.js"));

async function signedInUid(): Promise<string | null> {
  const { auth } = await import("../lib/firebase.js");
  return auth.currentUser?.uid ?? null;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)));

/** When this page last opened or joined a room: the rules want 10 s between joins. */
let lastJoinAt = 0;

/** This account's rules answer as last read on this page (read again when another tab changes it, or when the store disagrees). */
let rulesRead: { uid: string; rules: number; over13: boolean } | null = null;
/** When the stamp says this account last joined, from a read moments ago (the same read as the rules answer), so a join doesn't read it twice. */
let stampRead: { uid: string; joinedAt: number | null; at: number } | null = null;
const STAMP_FRESH_MS = 5 * SECOND;
const JOIN_GAP_MS = (ROOM_LIMITS.joinCooldownSeconds + 0.5) * SECOND;

/**
 * Another Ship tab changed the saved room preferences (it left, joined, or answered the rules
 * card): read them again, and read the account's rules answer afresh next time, so this tab never
 * writes an older answer back over the newer one.
 */
export async function roomsChangedElsewhere(): Promise<void> {
  rulesRead = null;
  await rereadRooms();
}

/**
 * The server's clock minus this device's, before a room session has measured it: from the issue
 * time of a fresh sign-in token (Google's clock, to the second). Measured at most every 15 minutes
 * (a laptop's clock can be reset, or sleep); null if it can't be. A device whose clock is half an
 * hour out would otherwise see every room as finished.
 */
const TOKEN_CLOCK_KEEP_MS = 15 * MINUTE;
let tokenClock: { at: number; offset: Promise<number | null> } | null = null;
/** For tests: forget the measured token clock. */
export function forgetTokenClock(): void {
  tokenClock = null;
}
export async function tokenClockOffset(): Promise<number | null> {
  if (!tokenClock || Math.abs(Date.now() - tokenClock.at) > TOKEN_CLOCK_KEEP_MS) {
    tokenClock = {
      at: Date.now(),
      offset: (async () => {
        const { auth } = await import("../lib/firebase.js");
        const user = auth.currentUser;
        if (!user) return null;
        const sent = Date.now();
        const token = await user.getIdTokenResult(true);
        const ack = Date.now();
        const issued = Date.parse(token.issuedAtTime);
        // A slow answer can't place the clock well enough; the issue time is whole seconds (+0.5 s).
        if (!Number.isFinite(issued) || ack - sent > 10 * SECOND) return null;
        return issued + 500 - (sent + ack) / 2;
      })().catch(() => null),
    };
  }
  const offset = await tokenClock.offset;
  if (offset === null) tokenClock = null;
  return offset;
}

// ---- Offers ---------------------------------------------------------------------------------

/** Offers turned down on this page, by offerKey. */
const dismissedOffers = new Set<string>();

/** Answering "your turn" also answers that game's "starting" call, so it doesn't pop up next. */
function setAnswered(offer: RoomOffer, room: Room | null): void {
  dismissedOffers.add(offerKey(offer, room));
  if (offer.kind === "your-turn") dismissedOffers.add(`game:${offer.seed}`);
}

/** Which offer this is, so "Not this time" sticks to it and nothing else. */
export function offerKey(offer: RoomOffer, room: Room | null): string {
  const sailAt = room?.sail?.at ?? 0;
  switch (offer.kind) {
    case "sail-with":
      return `sail:${sailAt}:with`;
    case "hop-aboard":
      return `sail:${sailAt}:hop:${offer.leg}`;
    case "sail-on":
      return `sail:${sailAt}:on:${offer.fromLeg}`;
    case "game":
      return `game:${offer.seed}`;
    case "your-turn":
      return `turn:${offer.seed}:${offer.turn}`;
  }
}

/**
 * The one offer to show now, if any: your turn with the bottle, then a game starting, then the
 * crew's sail plan. A sail call pops up for 5 minutes after the skipper makes it (sail-with, then
 * hop-aboard), and "sail on" at the start of each later leg; none while this sailor's own timer runs.
 * A game is announced only while it's still on (a Tidy the Deck the crew has finished isn't), and
 * never once this sailor has seen it in the panel (seenGame). `tidy` gives the game's real patch
 * count and this device's Tidy memory, when known.
 */
export function pickOffer(
  room: Room,
  myKey: string,
  voyage: { phase: VoyagePhase; prepEndsAt: number | null },
  serverNow: number,
  lastSailSeen: number,
  tidy: { patches?: number; memo?: TidyMemo | null } = {},
): RoomOffer | null {
  const fresh = (o: RoomOffer) => (dismissedOffers.has(offerKey(o, room)) ? null : o);
  const me = room.members.find((m) => m.key === myKey);
  const focusing = me?.state === 1;
  const g = room.game;
  if (g && !focusing && g.seats.includes(myKey)) {
    if (g.kind === "bottle" && bottleOver(g) === 0 && g.holder === myKey) {
      const o = fresh({ kind: "your-turn", seed: g.seed, turn: g.turn });
      if (o) return o;
    }
    const tidyOn = () => {
      if (g.kind !== "tidy" || serverNow >= g.at + ROOM_LIMITS.tidy.timeLimitMs) return false;
      const t = tidyStatus(room, g, tidy.patches ?? estimatedTidyPatches(room, g), serverNow, tidy.memo ?? null);
      return !t.done && !t.timedOut;
    };
    const live = g.kind === "bottle" ? bottleOver(g) === 0 : tidyOn();
    if (live && serverNow - g.at < GAME_OFFER_MS) {
      const o = fresh({ kind: "game", game: g.kind, seed: g.seed });
      if (o) return o;
    }
  }
  const sail = room.sail;
  if (!sail) return null;
  const docked = voyage.phase === "docked" && voyage.prepEndsAt === null;
  const o = sailOffer(sail, voyage, serverNow);
  if (!o || !docked) return null;
  // A later leg's start calls everyone who's docked (sail on, then hop aboard), even after "Not this time" to the plan.
  // The first leg isn't a "next" leg: a sailor who turned the plan down isn't asked again as it starts.
  const legStart = legStartedAt(sail, serverNow);
  const nextLeg = o.kind === "sail-on" ? o.fromLeg > 1 : o.kind === "hop-aboard" && o.leg > 1 && legStart !== null && serverNow - legStart < NEXT_LEG_CALL_MS;
  if (!nextLeg && (sail.at <= lastSailSeen || serverNow - sail.at >= ROOM_LIMITS.sailOfferMinutes * MINUTE)) return null;
  return fresh(o);
}

// ---- Small helpers ----------------------------------------------------------------------------

const uniq = <T,>(list: readonly T[], max: number) => [...new Set(list)].slice(-max);

function withRecent(recent: readonly RecentRoom[], entry: RecentRoom, now: number): RecentRoom[] {
  const others = recent.filter((r) => r.code !== entry.code && now - r.at < RECENT_KEEP_MS);
  return [entry, ...others].slice(0, RECENT_MAX);
}

/** Notes a room in `recent` with my nickname there (the session calls this on each snapshot, so the name and skipper flag stay right). */
export function rememberRoom(room: Room, myKey: string): void {
  const s = useRooms.getState();
  const me = room.members.find((m) => m.key === myKey);
  const skipper = room.host === myKey;
  const old = s.recent.find((r) => r.code === room.code);
  const nick = me ? me.nick : old?.nick;
  const sameNick = (old?.nick ?? null)?.join() === (nick ?? null)?.join();
  if (old && old.skipper === skipper && old.name[0] === room.name[0] && old.name[1] === room.name[1] && sameNick) return;
  const entry: RecentRoom = { code: room.code, name: [room.name[0], room.name[1]], at: room.at, skipper, ...(nick ? { nick: [nick[0], nick[1], nick[2]] } : {}) };
  useRooms.setState({ recent: withRecent(s.recent, entry, Date.now()) });
}

/**
 * The made-up look for coming aboard `code`: the nickname this sailor had there before (Hop back
 * in), else a brand-new one, so nobody can follow a sailor from room to room by their name. The
 * character and accessory last chosen come along.
 */
export function lookFor(code: string | null): RoomLook {
  const s = useRooms.getState();
  const kept = code ? s.recent.find((r) => r.code === code)?.nick : undefined;
  const base = s.myLook;
  return {
    nick: kept ? [kept[0], kept[1], kept[2]] : randomNick(Math.random),
    costume: base?.costume ?? Math.min(3, Math.floor(Math.random() * 4)),
    accessory: base?.accessory ?? 0,
  };
}

/**
 * Which deck a room's games deal from. A Bottle Bay deck never changes once afloat; a skipper's
 * own deck can be swapped for another of the same size, so each game reads it afresh. `seed`: the
 * game about to start (the room's own game otherwise).
 */
export function deckIdentity(room: Room | null, seed: number | null = room?.game?.seed ?? null): string | null {
  const d = room?.deck;
  if (!room || !d) return null;
  return d.bottleId !== null ? `${room.code}:bottle:${d.bottleId}:${d.cards}` : `${room.code}:own:${d.cards}:${seed ?? "-"}`;
}

/** The cards the skipper's own device read to start a game, kept so loading that game's deck doesn't read them again. */
let dealtDeck: { id: string; cards: PracticeCard[] } | null = null;

/** The game's cards, only when they're the room's current deck (null while the right ones load). */
export function gameDeck(s: Pick<RoomStoreState, "room" | "deck" | "deckId">): PracticeCard[] | null {
  return s.deck && s.deckId !== null && s.deckId === deckIdentity(s.room) ? s.deck : null;
}

let deckLoading: string | null = null;

/** Clears everything about the live room on this device (not the preferences). */
const LEFT = { current: null, room: null, myKey: null, status: "idle", offer: null, deck: null, deckId: null, deckProblem: null, tidyMemo: null, alert: null } as const;

/**
 * Signing out: Lumi's note about the last account's room, and any invite or refusal it was
 * answering, go, so the next person on this browser never sees them (or comes aboard that room).
 */
export function roomsSignedOut(): void {
  if (useRooms.getState().notice !== null) useRooms.setState({ notice: null, noticeRoom: null, noticeAt: 0 });
  useUi.setState({ roomInvite: null, roomInviteRefusal: null, roomLinkProblem: null });
}

/** Signing in: a refusal recorded while signed out ("Log in to study with a crew") never shows on the Join card. The invite itself stays, for the sailor who logged in to answer it. */
export function roomsSignedIn(): void {
  if (useUi.getState().roomInviteRefusal !== null) useUi.setState({ roomInviteRefusal: null });
}

/** Reads the saved room preferences again (another Ship tab may have just left or joined). Does nothing where storage is missing. */
export async function rereadRooms(): Promise<void> {
  try {
    await useRooms.persist?.rehydrate();
  } catch {
    // Unreadable storage: this tab's copy stands.
  }
}

/** Preferences as they are for an account seen on this browser for the first time. */
const FRESH_PREFS: Omit<RoomPrefs, "uid"> = { current: null, recent: [], hidden: [], hiddenRooms: [], muted: false, rulesOk: 0, over13: false, myLook: null, reported: [], lastSailSeen: 0, notice: null, noticeRoom: null, noticeAt: 0 };

/** Plain words for a failed action. A refusal on opening, joining or loading checks whether the rules are published or rooms are switched off. */
async function explain(e: unknown, action: RoomAction, extra: { mode?: RoomMode; join?: JoinProblem | null } = {}): Promise<string> {
  if (e instanceof RoomActionError) return e.message;
  const rooms = await roomsModule();
  const code = rooms.roomErrorCode(e);
  if (code === "permission-denied" && (action === "open" || action === "join" || action === "load")) {
    try {
      const on = await rooms.roomsSwitch();
      if (action === "open" && !on.create) return NEW_ROOMS_RESTING;
      if (extra.mode === "open" && !on.open) return roomProblem("paused", action);
    } catch (probe) {
      // The old rules refuse config/rooms: Study Rooms' rules aren't published yet.
      if (rooms.roomErrorCode(probe) === "permission-denied") return roomProblem("permission-denied", "load");
    }
  }
  return roomProblem(code, action, extra.join);
}

const NOTICES: readonly RoomNotice[] = ["removed", "drifted", "gone", "closed", "ended", "left"];

/** A saved notice, if it's one this app knows and no older than a room can last. */
function savedNotice(p: Partial<RoomPrefs>, now: number): Pick<RoomPrefs, "notice" | "noticeRoom" | "noticeAt"> {
  const room = p.noticeRoom;
  const fresh = typeof p.noticeAt === "number" && now - p.noticeAt < RECENT_KEEP_MS && now - p.noticeAt >= -MINUTE;
  const roomOk = !!room && typeof room.code === "string" && CODE_PATTERN.test(room.code) && Array.isArray(room.name) && room.name.length === 2 && room.name.every(Number.isInteger);
  if (!fresh || !p.notice || !NOTICES.includes(p.notice)) return { notice: null, noticeRoom: null, noticeAt: 0 };
  return { notice: p.notice, noticeRoom: roomOk ? { code: room.code, name: [room.name[0], room.name[1]] } : null, noticeAt: p.noticeAt! };
}

const sanitizeLook = (v: unknown): RoomLook | null => {
  const l = v as RoomLook | null;
  return l && Array.isArray(l.nick) && l.nick.length === 3 && l.nick.every(Number.isInteger) && Number.isInteger(l.costume) && Number.isInteger(l.accessory) ? l : null;
};
const strings = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(-max) : []);

/** What ship:rooms keeps on this device: the preferences, and Lumi's note (so every Ship tab shows it). */
export function savedRoomPrefs({ uid, current, recent, hidden, hiddenRooms, muted, rulesOk, over13, myLook, reported, lastSailSeen, notice, noticeRoom, noticeAt }: RoomPrefs): RoomPrefs {
  return { uid, current, recent, hidden, hiddenRooms, muted, rulesOk, over13, myLook, reported, lastSailSeen, notice, noticeRoom, noticeAt };
}

/** Saved room preferences, checked field by field, so a hand-edited or older copy can't break the panel. */
export function loadedRoomPrefs(persisted: unknown): RoomPrefs {
  const p = (persisted ?? {}) as Partial<RoomPrefs>;
  const now = Date.now();
  const recent = Array.isArray(p.recent)
    ? p.recent.filter(
        (r): r is RecentRoom =>
          !!r && typeof r.code === "string" && CODE_PATTERN.test(r.code) && Array.isArray(r.name) && r.name.length === 2 && typeof r.at === "number" && now - r.at < RECENT_KEEP_MS,
      )
    : [];
  const nick = (v: unknown): [number, number, number] | undefined => (Array.isArray(v) && v.length === 3 && v.every(Number.isInteger) ? [v[0], v[1], v[2]] : undefined);
  return {
    uid: typeof p.uid === "string" && p.uid ? p.uid : null,
    current: typeof p.current === "string" && CODE_PATTERN.test(p.current) ? p.current : null,
    recent: recent.slice(0, RECENT_MAX).map((r) => {
      const n = nick(r.nick);
      return { code: r.code, name: [r.name[0], r.name[1]], at: r.at, skipper: Boolean(r.skipper), ...(n ? { nick: n } : {}) };
    }),
    hidden: strings(p.hidden, 100),
    hiddenRooms: strings(p.hiddenRooms, 100),
    muted: p.muted === true,
    rulesOk: typeof p.rulesOk === "number" ? p.rulesOk : 0,
    over13: p.over13 === true,
    myLook: sanitizeLook(p.myLook),
    reported: strings(p.reported, 50),
    lastSailSeen: typeof p.lastSailSeen === "number" ? p.lastSailSeen : 0,
    ...savedNotice(p, now),
  };
}

// ---- The store --------------------------------------------------------------------------------

export const useRooms = create<RoomStoreState>()(
  persist(
    (set, get) => {
      /**
       * Runs a skipper write once the 15 s gap allows, with the queued own changes riding along
       * (and the card's `alive` when it's due). A refusal is worded by `refused` from the room as it
       * is now (a sailor left, the deck was hidden…), else "The room changed just now". A session
       * that ended meanwhile (leaving, removal) says nothing.
       */
      const skipper = async (
        change: SkipperChange | ((room: Room, serverNow: number) => SkipperChange | Promise<SkipperChange>),
        refused?: (room: Room | null) => string | null,
      ): Promise<boolean> => {
        const [rooms, sessions] = await Promise.all([roomsModule(), sessionModule()]);
        const s = sessions.roomSession();
        if (!s) {
          set({ error: NOT_ABOARD });
          return false;
        }
        set({ busy: true, error: null });
        try {
          await s.ownWrite(async (self) => {
            const room = s.currentRoom();
            if (!room) throw new RoomActionError(NOT_ABOARD);
            if (room.host !== s.key) throw new RoomActionError(ONLY_SKIPPER);
            const ch = typeof change === "function" ? await change(room, s.serverNow()) : change;
            // The room may have moved on while the change was worked out (it can read the database).
            const now = s.currentRoom() ?? room;
            const passing = ch.host !== undefined && ch.host !== now.host;
            const alive = !passing && s.cardAliveDue();
            s.sendingNow();
            await rooms.skipperWrite(now, s.key, ch, self, { cardAlive: alive, uid: s.uid });
            if (alive) s.noteCardAlive();
          });
          return true;
        } catch (e) {
          if (stoppedSession(e)) return false;
          const code = e instanceof RoomActionError ? "" : rooms.roomErrorCode(e);
          set({ error: code === "permission-denied" ? (refused?.(s.currentRoom()) ?? roomProblem(code, "skipper")) : await explain(e, "skipper") });
          return false;
        } finally {
          if (!s.isStopped) set({ busy: false });
        }
      };

      /**
       * This account's rules answer, read once per page (acceptRules keeps it current). If this
       * page's copy and the store disagree, another tab changed it: it's read from the account
       * again, never written back from the copy. A missing or older one puts the rules card back.
       */
      const accountRules = async (uid: string): Promise<{ rules: number; over13: boolean }> => {
        const copy = rulesRead?.uid === uid ? rulesRead : null;
        if (!copy || get().rulesOk !== copy.rules || get().over13 !== copy.over13) {
          const stamp = await (await roomsModule()).readRulesStamp(uid);
          rulesRead = { uid, rules: stamp.rules, over13: stamp.over13 };
          if (stamp.joinedAt !== undefined) stampRead = { uid, joinedAt: stamp.joinedAt, at: Date.now() };
        }
        const { rules, over13 } = rulesRead!;
        if (get().rulesOk !== rules || get().over13 !== over13) set({ rulesOk: rules, over13 });
        set({ rulesState: { uid, read: true } });
        return { rules, over13 };
      };

      /** The server's clock as a sign-in token measures it, for leaving a room this tab doesn't run (or this device's, unmeasured). */
      const measuredClock = async (): Promise<{ serverNow: number; measured: boolean }> => {
        const offset = await tokenClockOffset();
        return offset === null ? { serverNow: Date.now() + get().serverOffset, measured: false } : { serverNow: Date.now() + offset, measured: true };
      };

      /** The server's clock offset for judging cards before any room session has measured it. */
      const clockForCards = async (): Promise<number> => {
        if (sessionLoaded && (await sessionLoaded).roomSession()) return get().serverOffset;
        const offset = await tokenClockOffset();
        if (offset !== null && !get().current) set({ serverOffset: offset });
        return get().serverOffset;
      };

      /**
       * Waits out the 10 s between joins: from this page's last join, and from the account's own
       * stamp (another tab, a page before a reload, or another device), at most one cooldown long.
       */
      const waitJoinCooldown = async (uid: string, rooms: RoomsModule): Promise<void> => {
        // The stamp read for the rules a moment ago (requireRules) already says when this account last joined.
        const recent = stampRead?.uid === uid && Date.now() - stampRead.at < STAMP_FRESH_MS ? stampRead : null;
        const [stampAt, offset] = await Promise.all([recent ? recent.joinedAt : rooms.readJoinedAt(uid).catch(() => null), clockForCards().catch(() => get().serverOffset)]);
        const fromStamp = stampAt === null ? 0 : Math.min(stampAt - offset + JOIN_GAP_MS - Date.now(), JOIN_GAP_MS);
        await sleep(Math.max(lastJoinAt + JOIN_GAP_MS - Date.now(), fromStamp));
      };

      /** A join refused with nothing on the card to say why: the join cooldown (a join a moment ago from another tab or device), or else a ban. */
      const joinedJustNow = async (uid: string, rooms: RoomsModule): Promise<boolean> => {
        const [at, offset] = await Promise.all([rooms.readJoinedAt(uid).catch(() => null), clockForCards().catch(() => get().serverOffset)]);
        // A few seconds of slack: the clock offset is known to about a second.
    return at !== null && Date.now() + offset - at < JOIN_GAP_MS + 5 * SECOND;
      };

      /** Opening, joining and listing need the room rules accepted by this account, and open rooms its 13+ tick. */
      const requireRules = async (uid: string, needOver13: boolean): Promise<void> => {
        const stamp = await accountRules(uid);
        if (stamp.rules < ROOM_RULES_VERSION) throw new RoomActionError("Read Lumi's room rules first.");
        if (needOver13 && !stamp.over13) throw new RoomActionError(OVER13_ONLY);
      };

      /** Queues an own change through the live session (cheers, Tidy progress). */
      const withSession = (fn: (s: NonNullable<ReturnType<SessionModule["roomSession"]>>) => void) => {
        void sessionModule().then((m) => {
          const s = m.roomSession();
          if (s) fn(s);
          else set({ error: NOT_ABOARD });
        });
      };

      return {
        uid: null,
        ...FRESH_PREFS,

        status: "idle",
        room: null,
        myKey: null,
        serverOffset: 0,
        deck: null,
        deckId: null,
        deckProblem: null,
        tidyMemo: null,
        offer: null,
        rulesState: null,
        error: null,
        alert: null,
        busy: false,
        openList: null,
        preview: null,

        forAccount: (uid) => {
          if (get().uid === uid) return;
          // Someone else's room, recent codes, nicknames, hidden sailors and 13+ answer stay theirs.
          set({ ...FRESH_PREFS, ...LEFT, uid, openList: null, preview: null, error: null, rulesState: null });
          dismissedOffers.clear();
        },

        syncRules: async () => {
          const uid = await signedInUid();
          if (!uid) return;
          get().forAccount(uid);
          try {
            await accountRules(uid);
          } catch {
            // Unreadable (offline, or the rules aren't published): the card stays as it is; acting says why.
            set({ rulesState: { uid, read: false } });
          }
        },

        acceptRules: async (over13, opts = {}) => {
          const uid = await signedInUid();
          if (!uid) return void set({ error: LOG_IN });
          get().forAccount(uid);
          set({ busy: true, error: null });
          try {
            // Exactly what the sailor ticked on the card: nothing else ever writes the 13+ answer.
            // A card that couldn't show the account's answer never takes back a "yes" it didn't show.
            const answer = await (await roomsModule()).acceptRoomRules(uid, over13, { keepOver13: opts.sawAccount !== true });
            rulesRead = { uid, rules: ROOM_RULES_VERSION, over13: answer };
            set({ rulesOk: ROOM_RULES_VERSION, over13: answer, rulesState: { uid, read: true } });
          } catch (e) {
            set({ error: await explain(e, "load") });
          } finally {
            set({ busy: false });
          }
        },

        openRoom: async (draft) => {
          const uid = await signedInUid();
          if (!uid) return void set({ error: LOG_IN });
          get().forAccount(uid);
          try {
            await requireRules(uid, draft.mode === "open");
          } catch (e) {
            return void set({ error: await explain(e, "open", { mode: draft.mode }) });
          }
          if (get().current) await get().leaveRoom();
          set({ busy: true, error: null, notice: null, noticeRoom: null });
          const rooms = await roomsModule();
          try {
            const sessions = await sessionModule();
            await waitJoinCooldown(uid, rooms);
            const sentAt = Date.now();
            const { code, key } = await rooms.openRoom(uid, draft);
            const ackAt = Date.now();
            lastJoinAt = ackAt;
            sessions.startRoomSession(uid, code, { sentAt, ackAt, skipper: true });
            set({
              ...LEFT,
              current: code,
              myKey: key,
              status: "joining",
              myLook: draft.look,
              preview: null,
              recent: withRecent(get().recent, { code, name: draft.name, at: Date.now(), skipper: true, nick: draft.look.nick }, Date.now()),
            });
            useUi.getState().setRoomInvite(null);
          } catch (e) {
            // An open room is refused while this account still skippers its last one.
            // Judged by the server's clock (a sign-in token's), so a device whose clock is fast still gets these words.
            const still =
              draft.mode === "open" && rooms.roomErrorCode(e) === "permission-denied"
                ? await clockForCards()
                    .then((offset) => rooms.skipperingOpenRoom(uid, Date.now() + offset))
                    .catch(() => null)
                : null;
            set({ error: still ? `You're still the skipper of ${still}, an open room. Close it or pass the hat before you open another.` : await explain(e, "open", { mode: draft.mode }) });
          } finally {
            set({ busy: false });
          }
        },

        joinRoom: async (code, look) => {
          const uid = await signedInUid();
          if (!uid) return void set({ error: LOG_IN });
          get().forAccount(uid);
          if (get().current === code && get().room) return;
          try {
            await requireRules(uid, false);
          } catch (e) {
            return void set({ error: await explain(e, "join") });
          }
          // Coming aboard is tried first: the room this sailor is in now is left only once the new
          // one has said yes, so a refused join (full, locked, a ban, the cooldown) leaves them where they were.
          const previous = get().current;
          const elsewhere = previous !== null && previous !== code;
          // A refusal clears the live room only when there's no other room to keep.
          const refusedState = elsewhere ? {} : LEFT;
          set({ busy: true, error: null, notice: null, noticeRoom: null, ...(elsewhere ? {} : { status: "joining" as const }) });
          const [rooms, sessions] = await Promise.all([roomsModule(), sessionModule()]);
          try {
            await waitJoinCooldown(uid, rooms);
            const sentAt = Date.now();
            let key: string;
            let hint: { sentAt: number; ackAt: number } | undefined;
            try {
              key = await rooms.joinRoom(uid, code, look);
              lastJoinAt = Date.now();
              hint = { sentAt, ackAt: lastJoinAt };
            } catch (e) {
              if (rooms.roomErrorCode(e) !== "permission-denied") throw e;
              // Already aboard (from another device, or from before signing out)? Then this is just coming back in.
              key = await memberKey(uid, code);
              const room = await rooms.getRoom(code).catch(() => null);
              if (!room?.members.some((m) => m.key === key)) {
                const card = await rooms.getCard(code).catch(() => null);
                const problem = joinProblem(card, Date.now() + get().serverOffset);
                const over13 = await accountRules(uid).then((r) => r.over13).catch(() => get().over13);
                const words =
                  !problem && card?.mode === "open" && !over13
                    ? OVER13_ONLY
                    : // Nothing on the card says why: the join cooldown (a join a moment ago elsewhere) reads as "wait", never as a ban.
                      !problem && card && (await joinedJustNow(uid, rooms))
                      ? JOIN_COOLDOWN_TEXT
                      : await explain(e, "join", { mode: card?.mode, join: problem });
                set({ ...refusedState, error: words, preview: { code, card, problem } });
                return;
              }
            }
            // Aboard the new room: now the old one is left (its session ends, handing this tab's lock on).
            if (elsewhere && get().current === previous) await get().leaveRoom();
            sessions.startRoomSession(uid, code, hint);
            const kept = get().recent.find((r) => r.code === code);
            const name = kept?.name ?? get().preview?.card?.name ?? get().openList?.cards.find((c) => c.code === code)?.name ?? null;
            set({
              ...LEFT,
              current: code,
              myKey: key,
              status: "joining",
              myLook: look,
              preview: null,
              // The nickname is kept with this room only, for Hop back in.
              recent: name ? withRecent(get().recent, { code, name, at: kept?.at ?? Date.now(), skipper: false, nick: look.nick }, Date.now()) : get().recent,
            });
            useUi.getState().setRoomInvite(null);
          } catch (e) {
            set({ ...(get().current === previous ? refusedState : LEFT), error: await explain(e, "join") });
          } finally {
            set({ busy: false });
          }
        },

        leaveRoom: async (opts = {}) => {
          const code = get().current;
          if (!code) return;
          const [rooms, sessions] = await Promise.all([roomsModule(), sessionModule()]);
          const s = sessions.roomSession();
          const name = get().room?.name ?? get().recent.find((r) => r.code === code)?.name ?? null;
          // This device lets go at once; telling the room follows (and may wait for the connection).
          // The Leave button's own leave leaves a note in the panel, with Report: reporting still works after leaving.
          const told = opts.tell && name ? { notice: "left" as const, noticeRoom: { code, name: [name[0], name[1]] as [number, number] } } : { notice: null, noticeRoom: null };
          set({ ...LEFT, busy: true, error: null, ...told, noticeAt: Date.now() });
          try {
            if (s && s.code === code) await s.leave();
            else {
              sessions.stopRoomSession();
              const uid = await signedInUid();
              if (uid) {
                const key = await memberKey(uid, code);
                // Only a refusal (no longer aboard) or a missing room lets the note go: a read that
                // couldn't be made (offline) leaves nothing and keeps the note.
                const room = await rooms.getRoom(code).catch((e: unknown) => {
                  if (rooms.roomErrorCode(e) === "permission-denied") return null;
                  throw e;
                });
                // A measured clock (a sign-in token's), so the skipper's live room is never cleared on this device's guess.
                if (room?.members.some((m) => m.key === key)) await rooms.leaveRoom(uid, room, key, 0, await measuredClock());
                else await rooms.forgetRoom(uid, code).catch(() => undefined);
              }
            }
          } catch (e) {
            const why = rooms.roomErrorCode(e);
            // The Leave button's leave couldn't reach the room, so the sailor is still aboard: say so and
            // put the room back, so Leave can be tried again (another tab may have joined a room meanwhile).
            if (opts.tell && /unavailable|deadline-exceeded|resource-exhausted/.test(why) && get().current === null) {
              set({ current: code, notice: null, noticeRoom: null, error: `${roomProblem(why, "leave")} You're still aboard, so try Leave again in a moment.` });
            } else set({ error: roomProblem(why, "leave") });
          } finally {
            set({ busy: false });
          }
        },

        closeRoom: async () => {
          const [rooms, sessions] = await Promise.all([roomsModule(), sessionModule()]);
          const s = sessions.roomSession();
          const room = s?.currentRoom();
          if (!s || !room) return void set({ error: NOT_ABOARD });
          if (room.host !== s.key) return void set({ error: ONLY_SKIPPER });
          const code = room.code;
          const name: [number, number] = [room.name[0], room.name[1]];
          set({ ...LEFT, busy: true, error: null, notice: null, noticeRoom: null });
          try {
            // Refused because the hat had moved on (this device slept): the sailor leaves it instead, and is told so.
            if ((await s.close()) === "left") {
              set({ notice: "left", noticeRoom: { code, name }, noticeAt: Date.now(), error: CLOSED_AS_LEFT });
            }
          } catch (e) {
            const why = rooms.roomErrorCode(e);
            // Nothing changed (offline, say): the sailor is still aboard, so the room comes back and Close can be tried again.
            if (get().current === null) set({ current: code, error: `${roomProblem(why, "leave")} You're still aboard, so try again in a moment.` });
            else set({ error: roomProblem(why, "leave") });
          } finally {
            set({ busy: false });
          }
        },

        lock: async (locked) => {
          if (locked) return void (await skipper({ locked }));
          // Opening the door puts an open room back on the list, as this skipper's one open room. If
          // that's refused (they still run another open room), the door still opens, off the list.
          if (await skipper({ locked: false, list: true })) return;
          const room = get().room;
          if (room?.mode === "open" && room.locked && get().current === room.code) await skipper({ locked: false });
        },

        removeSailor: async (key) => {
          const [rooms, sessions] = await Promise.all([roomsModule(), sessionModule()]);
          const s = sessions.roomSession();
          const room = s?.currentRoom();
          if (!s || !room) return void set({ error: NOT_ABOARD });
          if (room.host !== s.key) return void set({ error: ONLY_SKIPPER });
          set({ busy: true, error: null });
          try {
            await rooms.removeSailor(room, s.key, key, { ban: true });
          } catch (e) {
            const code = rooms.roomErrorCode(e);
            const now = s.currentRoom();
            const why =
              code !== "permission-denied"
                ? roomProblem(code, "skipper")
                : now && !now.members.some((m) => m.key === key)
                  ? "That sailor has already left."
                  : now && now.banned.length >= ROOM_LIMITS.maxBans
                    ? `This room has asked ${ROOM_LIMITS.maxBans} sailors to leave, the most it can.`
                    : now && now.host !== s.key
                      ? ONLY_SKIPPER
                      : roomProblem(code, "skipper");
            set({ error: why });
          } finally {
            set({ busy: false });
          }
        },

        passHat: async (key) => {
          const gone = (room: Room | null) => (room && !room.members.some((m) => m.key === key) ? "That sailor isn't aboard any more." : null);
          await skipper((room) => {
            const left = gone(room);
            if (left) throw new RoomActionError(left);
            return { host: key };
          }, gone);
        },

        takeHat: async () => {
          const [rooms, sessions] = await Promise.all([roomsModule(), sessionModule()]);
          const s = sessions.roomSession();
          if (!s) return void set({ error: NOT_ABOARD });
          set({ busy: true, error: null });
          try {
            await s.ownWrite(async (self) => {
              const room = s.currentRoom();
              if (!room) throw new RoomActionError(NOT_ABOARD);
              await rooms.takeHat(s.uid, room, s.key, self);
            });
            s.noteCardAlive();
          } catch (e) {
            if (!stoppedSession(e)) set({ error: e instanceof RoomActionError ? e.message : roomProblem(rooms.roomErrorCode(e), "skipper") });
          } finally {
            if (!s.isStopped) set({ busy: false });
          }
        },

        setSail: async (plan) => {
          if (plan) {
            const { sailFocus: f, sailBreak: b, sailCycles: c } = ROOM_LIMITS;
            const ok = (n: number, r: { min: number; max: number }) => Number.isInteger(n) && n >= r.min && n <= r.max;
            if (!ok(plan.focus, f) || !ok(plan.brk, b) || !ok(plan.cycles, c)) {
              return void set({ error: `Focus can be ${f.min}–${f.max} minutes, a break ${b.min}–${b.max}, and ${c.min}–${c.max} legs.` });
            }
          }
          await skipper({ sail: plan });
        },

        pickBottleDeck: async (bottleId, cards) => {
          const { min, max } = ROOM_LIMITS.deckCards;
          if (!Number.isInteger(cards) || cards < min || cards > max) return void set({ error: `Room decks need ${min} to ${max} cards.` });
          // Checked against the room as it is when the write goes (a game may have started meanwhile); the rules refuse it too.
          const ok = await skipper(
            (r) => {
              if (r.game) throw new RoomActionError(DECK_LOCKED_TEXT);
              return { deck: { bottleId, cards } };
            },
            (r) => (r?.game ? DECK_LOCKED_TEXT : "That deck can't be used right now: Bottle Bay may have hidden it after reports, or its sharer took it back. Pick another one."),
          );
          // Cards read for the old deck are never dealt for this one.
          if (ok) set({ deck: null, deckId: null, deckProblem: null });
        },

        pickOwnDeck: async (deckId) => {
          const room = get().room;
          if (!room) throw new Error(NOT_ABOARD);
          if (room.mode !== "invite") throw new Error("Open rooms use Bottle Bay decks only.");
          if (room.game) throw new Error(DECK_LOCKED_TEXT);
          const cards: BottleCard[] = useRecall
            .getState()
            .cards.filter((c) => c.deckId === deckId)
            .map((c) => ({ f: c.front.trim(), b: c.back.trim() }))
            .filter((c) => c.f && c.b);
          const { min, max } = ROOM_LIMITS.deckCards;
          if (cards.length < min || cards.length > max) throw new Error(`Room decks need ${min} to ${max} cards with both sides filled in. This one has ${cards.length}.`);
          if (cards.some((c) => c.f.length > BOTTLE_LIMITS.cardSide || c.b.length > BOTTLE_LIMITS.cardSide)) {
            throw new Error(`Cards in a room deck can have up to ${BOTTLE_LIMITS.cardSide} characters a side.`);
          }
          // The contact checks load only here (the deck picker has them already), so they stay out of the first download.
          const { ROOM_DECK_CONTACT_PROBLEM, hasContactDetails } = await import("../lib/bottleRules.js");
          if (hasContactDetails(cards.flatMap((c) => [c.f, c.b])).length) throw new Error(ROOM_DECK_CONTACT_PROBLEM);
          const ok = await skipper(
            (r) => {
              if (r.game) throw new RoomActionError(DECK_LOCKED_TEXT);
              return { deck: { own: cards } };
            },
            (r) => (r?.game ? DECK_LOCKED_TEXT : null),
          );
          // A deck of the same size looks the same in the room, so cards read for the old one must go.
          if (ok) set({ deck: null, deckId: null, deckProblem: null });
        },

        startGame: async (kind) => {
          const room = get().room;
          if (!room?.deck) return void set({ error: "Pick a deck first." });
          const rooms = await roomsModule();
          await skipper(
            async (r, serverNow) => {
              if (!r.deck) throw new RoomActionError("Pick a deck first.");
              const seats = gameSeats(r, serverNow);
              if (!seats.length) throw new RoomActionError("Everyone's focusing. Games are for breaks.");
              // Read the deck as the room has it now, after any deck change queued before this: a
              // game is never dealt from an older deck, even one of the same size.
              let deck: PracticeCard[];
              try {
                deck = await rooms.readGameDeck(r);
              } catch (e) {
                const code = rooms.roomErrorCode(e);
                throw new RoomActionError(code === "deck-hidden" ? DECK_HIDDEN_TEXT : `Couldn't read the deck's cards. ${roomProblem(code, "load")}`);
              }
              if (deck.length < ROOM_LIMITS.deckCards.min) throw new RoomActionError("This deck needs at least 4 cards with different answers.");
              // Tidy the Deck deals only cards whose two sides read differently from every other tile
              // (a card and its reversed copy count once): a deck that leaves too few deals no patch.
              if (kind === "tidy" && tidyPatches(deck, 0, seats.length).length === 0) throw new RoomActionError(TIDY_DECK_TOO_SMALL_TEXT);
              // Pass the Bottle deals the deck's playable cards, and its island is never further than those.
              const cards = Math.min(deck.length, r.deck.cards);
              // The cards just read are this game's deck: loading it (loadDeck) won't read them again.
              const seed = rooms.newSeed();
              const id = deckIdentity(r, seed);
              if (id) dealtDeck = { id, cards: deck };
              return { game: kind === "tidy" ? { kind, seed } : { kind, goal: bottleGoal(seats.length, cards), cards, seed }, seats };
            },
            (r) => (r && gameSeats(r, Date.now() + get().serverOffset).length === 0 ? "Everyone's focusing now. Games are for breaks." : null),
          );
        },

        endGame: async () => {
          await skipper({ game: null });
        },

        playTurn: async (outcome) => {
          const [rooms, sessions] = await Promise.all([roomsModule(), sessionModule()]);
          const s = sessions.roomSession();
          const start = s?.currentRoom()?.game;
          if (!s || start?.kind !== "bottle" || bottleOver(start) !== 0) return;
          // One answer per turn from this device, however many taps.
          const turnId = `${start.seed}:${start.turn}`;
          if (turnSending === turnId) return;
          turnSending = turnId;
          // Left or removed while waiting: the turn isn't ours to send any more, and there's nothing to say.
          const gone = () => s.isStopped || sessions.roomSession() !== s;
          const send = async (): Promise<boolean> => {
            const room = s.currentRoom();
            const game = room?.game;
            if (!room || game?.kind !== "bottle" || game.seed !== start.seed || game.turn !== start.turn) return false;
            await rooms.playTurn(room.code, game.seed, bottleStep(game, outcome, room, s.serverNow()));
            return true;
          };
          try {
            await sleep(start.turnAt + TURN_PACE_MS - s.serverNow());
            if (gone()) return;
            let sent: boolean;
            try {
              sent = await send();
            } catch (e) {
              if (rooms.roomErrorCode(e) !== "permission-denied") throw e;
              // Refused: someone else answered (the turn moves on), or this device's clock ran a little early. Try once more.
              await sleep(TURN_RETRY_MS);
              if (gone()) return;
              sent = await send();
            }
            if (!sent && !gone()) set({ error: roomProblem("permission-denied", "game") });
          } catch (e) {
            if (!gone()) set({ error: roomProblem(rooms.roomErrorCode(e), "game") });
          } finally {
            if (turnSending === turnId) turnSending = null;
          }
        },

        tidyCleared: (patch, ms, mixups) => {
          const game = get().room?.game;
          if (game?.kind !== "tidy" || !Number.isInteger(patch) || patch < 0 || patch >= ROOM_LIMITS.tidy.maxPatches) return;
          withSession((s) => s.queueTidy(game.seed, patch, ms, mixups));
        },

        cheer: (say) => {
          if (!Number.isInteger(say) || say < 0 || say > 35) return;
          withSession((s) => s.queueSelf({ say }));
        },

        report: async (reason, given) => {
          const code = given ?? get().current ?? get().noticeRoom?.code ?? null;
          if (!code) return;
          const uid = await signedInUid();
          if (!uid) return void set({ error: LOG_IN });
          const rooms = await roomsModule();
          set({ busy: true, error: null });
          try {
            const room = get().room;
            // Whether it's a strike depends on how long this sailor has been aboard, by the server's clock.
            const offset = room?.code === code ? get().serverOffset : await clockForCards().catch(() => get().serverOffset);
            await rooms.reportRoom(uid, code, reason, room?.code === code ? room : null, Date.now() + offset);
            set({ reported: uniq([...get().reported, code], 50) });
          } catch (e) {
            const errorCode = rooms.roomErrorCode(e);
            if (errorCode === "already-reported") set({ error: "You've already reported this room.", reported: uniq([...get().reported, code], 50) });
            // Refused twice from outside the room (removed sailors can't read it): this device may know it already reported.
            else if (errorCode === "permission-denied" && get().reported.includes(code)) set({ error: "You've already reported this room." });
            else set({ error: roomProblem(errorCode, "report") });
          } finally {
            set({ busy: false });
          }
        },

        loadDeck: async () => {
          const room = get().room;
          const id = deckIdentity(room);
          if (!room || !id) {
            if (get().deck || get().deckId) set({ deck: null, deckId: null, deckProblem: null });
            return;
          }
          if ((id === get().deckId && get().deck) || id === deckLoading) return;
          // The skipper's own device read these cards to start the game a moment ago.
          if (dealtDeck?.id === id) return void set({ deck: dealtDeck.cards, deckId: id, deckProblem: null });
          deckLoading = id;
          // Never show the last deck's cards as this one's while the new ones load.
          if (get().deckId !== id) set({ deck: null, deckId: null, deckProblem: null });
          const rooms = await roomsModule();
          try {
            const cards = await rooms.readGameDeck(room);
            if (deckIdentity(get().room) === id) set({ deck: cards, deckId: id, deckProblem: null });
          } catch (e) {
            const code = rooms.roomErrorCode(e);
            if (deckIdentity(get().room) === id) set({ deckProblem: code === "deck-hidden" ? DECK_HIDDEN_TEXT : roomProblem(code, "load") });
          } finally {
            if (deckLoading === id) deckLoading = null;
          }
        },

        loadOpenRooms: async () => {
          const uid = await signedInUid();
          if (!uid) return void set({ error: LOG_IN });
          get().forAccount(uid);
          const rooms = await roomsModule();
          set({ busy: true, error: null });
          try {
            // The list's rule reads the 13+ tick from the account: it's the account's own answer, never assumed here.
            await requireRules(uid, true);
            const [cards, offset] = await Promise.all([rooms.listOpenCards(), clockForCards().catch(() => get().serverOffset)]);
            // Judged by the server's clock, so a device whose clock is fast doesn't see every room as finished.
            const now = Date.now() + offset;
            set({ openList: { cards, at: now } });
            // Clearing finished rooms is shared work; a refusal just means one is still alive.
            for (const code of deadCards(cards, now)) void rooms.clearDeadRoom(code).catch(() => undefined);
          } catch (e) {
            set({ error: await explain(e, "load", { mode: "open" }) });
          } finally {
            set({ busy: false });
          }
        },

        loadPreview: async (code) => {
          if (!CODE_PATTERN.test(code)) return void set({ preview: { code, card: null, problem: "gone" } });
          if (!(await signedInUid())) return void set({ error: LOG_IN });
          const rooms = await roomsModule();
          set({ busy: true, error: null });
          try {
            const [card, offset] = await Promise.all([rooms.getCard(code), clockForCards().catch(() => get().serverOffset)]);
            set({ preview: { code, card, problem: joinProblem(card, Date.now() + offset) } });
          } catch (e) {
            set({ error: await explain(e, "load") });
          } finally {
            set({ busy: false });
          }
        },

        hideSailor: (key, hide) => {
          const hidden = get().hidden.filter((k) => k !== key);
          set({ hidden: hide ? uniq([...hidden, key], 100) : hidden });
        },
        hideRoom: (code) => set({ hiddenRooms: uniq([...get().hiddenRooms, code], 100) }),
        setMuted: (muted) => set({ muted }),
        dismissNotice: () => set({ notice: null, noticeRoom: null, noticeAt: 0 }),

        seenGame: (seed) => {
          dismissedOffers.add(`game:${seed}`);
          const offer = get().offer;
          if (offer?.kind === "game" && offer.seed === seed) set({ offer: null });
        },

        dismissOffer: () => {
          const { offer, room } = get();
          if (!offer) return;
          setAnswered(offer, room);
          const sailAt = offer.kind === "sail-with" || offer.kind === "hop-aboard" || offer.kind === "sail-on" ? (room?.sail?.at ?? 0) : 0;
          set({ offer: null, lastSailSeen: Math.max(get().lastSailSeen, sailAt) });
        },

        acceptOffer: (given) => {
          const { room, serverOffset } = get();
          const offer = given ?? get().offer;
          if (!offer) return;
          const voyage = useVoyage.getState();
          const sailing = voyage.phase !== "docked" || voyage.prepEndsAt !== null;
          switch (offer.kind) {
            case "sail-with": {
              const sail = room?.sail;
              if (sail && !sailing) {
                voyage.start({
                  presetId: presetFor(sail.focus, sail.brk),
                  focusMinutes: sail.focus,
                  breakMinutes: sail.brk,
                  cycles: sail.cycles,
                  prep: true,
                  prepUntil: offer.prepUntilServer - serverOffset,
                });
              }
              break;
            }
            case "hop-aboard":
              if (!sailing) voyage.start({ presetId: "custom", focusMinutes: offer.focusMinutes, breakMinutes: offer.breakMinutes, cycles: 1 });
              break;
            case "sail-on":
              if (!sailing) voyage.start({ presetId: presetFor(offer.focusMinutes, offer.breakMinutes), focusMinutes: offer.focusMinutes, breakMinutes: offer.breakMinutes, cycles: offer.cycles });
              break;
            case "game":
            case "your-turn":
              // The panel opens at the game itself, not at the top of the room.
              useUi.getState().showRoomGame();
              break;
          }
          // Taken is answered: it doesn't pop up again, here or in the banner.
          const key = offerKey(offer, room);
          setAnswered(offer, room);
          const waiting = get().offer;
          const sail = offer.kind === "sail-with" || offer.kind === "hop-aboard" || offer.kind === "sail-on";
          set({
            offer: waiting && offerKey(waiting, room) === key ? null : waiting,
            lastSailSeen: sail ? Math.max(get().lastSailSeen, room?.sail?.at ?? 0) : get().lastSailSeen,
          });
        },
      };
    },
    {
      name: storageKey("rooms"),
      storage: shipStorage,
      version: 1,
      partialize: (state) => savedRoomPrefs(state),
      // Saved data is checked field by field, so a hand-edited or older copy can't break the panel.
      merge: (persisted, state) => ({ ...state, ...loadedRoomPrefs(persisted) }),
    },
  ),
);
