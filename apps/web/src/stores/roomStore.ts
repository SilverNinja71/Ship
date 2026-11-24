// Study Rooms on this device: the room the sailor is aboard (pushed in by lib/roomSession.ts) and
// their room preferences. It never imports Firestore: each action loads lib/rooms.ts and
// lib/roomSession.ts with import(), so visitors who never open a room never download them.
//
// Saved as ship:rooms on this device only. It isn't synced or backed up, because recent room
// codes work as invite keys.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ROOM_LIMITS, ROOM_RULES_VERSION, BOTTLE_LIMITS } from "@ship/shared-types";
import type { BottleCard, Room, RoomCard, RoomLook, RoomMode, RoomReportReason, VoyagePhase } from "@ship/shared-types";
import type { PracticeCard } from "@ship/active-recall-engine";
import { ROOM_DECK_CONTACT_PROBLEM, hasContactDetails } from "../lib/bottleRules.js";
import { bottleGoal, bottleOver, bottleStep, deadCards, gameSeats, joinProblem, memberKey, presetFor, roomProblem, sailOffer } from "../lib/roomRules.js";
import type { BottleOutcome, JoinProblem, RoomAction, SailOffer } from "../lib/roomRules.js";
import type { SkipperChange } from "../lib/rooms.js";
import { shipStorage, storageKey } from "../lib/storage.js";
import { useRecall } from "./recallStore.js";
import { useUi } from "./uiStore.js";
import { useVoyage } from "./voyageStore.js";

export type RoomStatus = "idle" | "joining" | "aboard" | "error";
export type RoomNotice = "removed" | "drifted" | "gone" | "closed" | "ended";
export type RoomOffer = SailOffer | { kind: "game"; game: "tidy" | "bottle"; seed: number } | { kind: "your-turn"; seed: number; turn: number };

export interface RecentRoom {
  code: string;
  name: [number, number];
  at: number;
  skipper: boolean;
}

export interface RoomPrefs {
  current: string | null;
  /** Up to 10, kept 12 hours (a room never lasts longer). */
  recent: RecentRoom[];
  /** Sailor keys whose cheers this sailor hid. */
  hidden: string[];
  /** Room codes hidden from this device's open list. */
  hiddenRooms: string[];
  muted: boolean;
  /** The room rules version accepted on this device (0 = not yet). */
  rulesOk: number;
  over13: boolean;
  myLook: RoomLook | null;
  reported: string[];
  /** The newest sail plan whose "sail with us" offer was answered, so it doesn't pop up again. */
  lastSailSeen: number;
}

export interface RoomStoreState extends RoomPrefs {
  status: RoomStatus;
  room: Room | null;
  myKey: string | null;
  /** Server clock minus this device's, in ms. */
  serverOffset: number;
  /** The current game's cards, dealt the same way on every device (playable cards in deck order). */
  deck: PracticeCard[] | null;
  offer: RoomOffer | null;
  notice: RoomNotice | null;
  /** Which room a notice is about (its name for the words, its code for Hop back in and Report). */
  noticeRoom: { code: string; name: [number, number] } | null;
  error: string | null;
  busy: boolean;
  /** The open list from the last load (null before the first). */
  openList: { cards: RoomCard[]; at: number } | null;
  /** The public card behind an invite link or a typed code (uiStore.roomInvite), for the Join card. card null = no such room. */
  preview: { code: string; card: RoomCard | null; problem: JoinProblem | null } | null;

  acceptRules(over13: boolean): Promise<void>;
  openRoom(draft: { mode: RoomMode; name: [number, number]; subject: number; look: RoomLook }): Promise<void>;
  joinRoom(code: string, look: RoomLook): Promise<void>;
  /** Also used by Start over and sign-out. Clears this device's room at once, then tells the room. */
  leaveRoom(): Promise<void>;
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
  /** Takes an offer (the waiting one, or the one the Sail together card shows): sail-with, hop-aboard and sail-on start Pwedo Pomo; a game opens the panel. */
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

/** A problem to show as it is, not a database error. */
class RoomActionError extends Error {}

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
const waitJoinCooldown = () => sleep(lastJoinAt + (ROOM_LIMITS.joinCooldownSeconds + 0.5) * SECOND - Date.now());

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
      return `sail:${sailAt}:hop`;
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
 */
export function pickOffer(room: Room, myKey: string, voyage: { phase: VoyagePhase; prepEndsAt: number | null }, serverNow: number, lastSailSeen: number): RoomOffer | null {
  const fresh = (o: RoomOffer) => (dismissedOffers.has(offerKey(o, room)) ? null : o);
  const me = room.members.find((m) => m.key === myKey);
  const focusing = me?.state === 1;
  const g = room.game;
  if (g && !focusing && g.seats.includes(myKey)) {
    if (g.kind === "bottle" && bottleOver(g) === 0 && g.holder === myKey) {
      const o = fresh({ kind: "your-turn", seed: g.seed, turn: g.turn });
      if (o) return o;
    }
    const live = g.kind === "bottle" ? bottleOver(g) === 0 : serverNow < g.at + ROOM_LIMITS.tidy.timeLimitMs;
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
  if (o.kind !== "sail-on" && (sail.at <= lastSailSeen || serverNow - sail.at >= ROOM_LIMITS.sailOfferMinutes * MINUTE)) return null;
  return fresh(o);
}

// ---- Small helpers ----------------------------------------------------------------------------

const uniq = <T,>(list: readonly T[], max: number) => [...new Set(list)].slice(-max);

function withRecent(recent: readonly RecentRoom[], entry: RecentRoom, now: number): RecentRoom[] {
  const others = recent.filter((r) => r.code !== entry.code && now - r.at < RECENT_KEEP_MS);
  return [entry, ...others].slice(0, RECENT_MAX);
}

/** Notes a room in `recent` (the session calls this on each snapshot, so the name and skipper flag stay right). */
export function rememberRoom(room: Room, skipper: boolean): void {
  const s = useRooms.getState();
  const old = s.recent.find((r) => r.code === room.code);
  if (old && old.skipper === skipper && old.name[0] === room.name[0] && old.name[1] === room.name[1]) return;
  useRooms.setState({ recent: withRecent(s.recent, { code: room.code, name: [room.name[0], room.name[1]], at: room.at, skipper }, Date.now()) });
}

const deckKey = (room: Room) => (room.deck ? `${room.code}:${room.deck.bottleId ?? "own"}:${room.deck.cards}:${room.game?.seed ?? "-"}` : null);
let deckLoading: string | null = null;
let deckLoaded: string | null = null;

/** Clears everything about the live room on this device (not the preferences). */
const LEFT = { current: null, room: null, myKey: null, status: "idle", offer: null, deck: null } as const;

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

const sanitizeLook = (v: unknown): RoomLook | null => {
  const l = v as RoomLook | null;
  return l && Array.isArray(l.nick) && l.nick.length === 3 && l.nick.every(Number.isInteger) && Number.isInteger(l.costume) && Number.isInteger(l.accessory) ? l : null;
};
const strings = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(-max) : []);

// ---- The store --------------------------------------------------------------------------------

export const useRooms = create<RoomStoreState>()(
  persist(
    (set, get) => {
      /** Runs a skipper write once the 15 s gap allows, with the queued own changes riding along. */
      const skipper = async (action: RoomAction, change: SkipperChange | ((room: Room, serverNow: number) => SkipperChange | Promise<SkipperChange>)): Promise<boolean> => {
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
            await rooms.skipperWrite(room, s.key, typeof change === "function" ? await change(room, s.serverNow()) : change, self);
          });
          return true;
        } catch (e) {
          set({ error: await explain(e, action) });
          return false;
        } finally {
          set({ busy: false });
        }
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
        current: null,
        recent: [],
        hidden: [],
        hiddenRooms: [],
        muted: false,
        rulesOk: 0,
        over13: false,
        myLook: null,
        reported: [],
        lastSailSeen: 0,

        status: "idle",
        room: null,
        myKey: null,
        serverOffset: 0,
        deck: null,
        offer: null,
        notice: null,
        noticeRoom: null,
        error: null,
        busy: false,
        openList: null,
        preview: null,

        acceptRules: async (over13) => {
          const uid = await signedInUid();
          if (!uid) return void set({ error: LOG_IN });
          set({ busy: true, error: null });
          try {
            await (await roomsModule()).ensureRulesStamp(uid, over13);
            set({ rulesOk: ROOM_RULES_VERSION, over13 });
          } catch (e) {
            set({ error: await explain(e, "load") });
          } finally {
            set({ busy: false });
          }
        },

        openRoom: async (draft) => {
          const uid = await signedInUid();
          if (!uid) return void set({ error: LOG_IN });
          if (draft.mode === "open" && !get().over13) return void set({ error: OVER13_ONLY });
          if (get().current) await get().leaveRoom();
          set({ busy: true, error: null, notice: null, noticeRoom: null });
          try {
            const [rooms, sessions] = await Promise.all([roomsModule(), sessionModule()]);
            await rooms.ensureRulesStamp(uid, get().over13);
            await waitJoinCooldown();
            const sentAt = Date.now();
            const { code, key } = await rooms.openRoom(uid, draft);
            const ackAt = Date.now();
            lastJoinAt = ackAt;
            sessions.startRoomSession(uid, code, { sentAt, ackAt, skipper: true });
            set({ ...LEFT, current: code, myKey: key, status: "joining", myLook: draft.look, preview: null });
            useUi.getState().setRoomInvite(null);
          } catch (e) {
            set({ error: await explain(e, "open", { mode: draft.mode }) });
          } finally {
            set({ busy: false });
          }
        },

        joinRoom: async (code, look) => {
          const uid = await signedInUid();
          if (!uid) return void set({ error: LOG_IN });
          if (get().current === code && get().room) return;
          if (get().current) await get().leaveRoom();
          set({ busy: true, error: null, notice: null, noticeRoom: null, status: "joining" });
          const [rooms, sessions] = await Promise.all([roomsModule(), sessionModule()]);
          try {
            await rooms.ensureRulesStamp(uid, get().over13);
            await waitJoinCooldown();
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
                const problem = joinProblem(card, Date.now());
                const words = !problem && card?.mode === "open" && !get().over13 ? OVER13_ONLY : await explain(e, "join", { mode: card?.mode, join: problem });
                set({ ...LEFT, error: words, preview: { code, card, problem } });
                return;
              }
            }
            sessions.startRoomSession(uid, code, hint);
            set({ ...LEFT, current: code, myKey: key, status: "joining", myLook: look, preview: null });
            useUi.getState().setRoomInvite(null);
          } catch (e) {
            set({ ...LEFT, error: await explain(e, "join") });
          } finally {
            set({ busy: false });
          }
        },

        leaveRoom: async () => {
          const code = get().current;
          if (!code) return;
          const [rooms, sessions] = await Promise.all([roomsModule(), sessionModule()]);
          const s = sessions.roomSession();
          // This device lets go at once; telling the room follows (and may wait for the connection).
          set({ ...LEFT, busy: true, error: null, notice: null, noticeRoom: null });
          try {
            if (s && s.code === code) await s.leave();
            else {
              sessions.stopRoomSession();
              const uid = await signedInUid();
              if (uid) {
                const key = await memberKey(uid, code);
                const room = await rooms.getRoom(code).catch(() => null);
                if (room?.members.some((m) => m.key === key)) await rooms.leaveRoom(uid, room, key, 0, Date.now());
                else await rooms.forgetRoom(uid, code).catch(() => undefined);
              }
            }
          } catch (e) {
            set({ error: roomProblem(rooms.roomErrorCode(e), "leave") });
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
          set({ ...LEFT, busy: true, error: null, notice: null, noticeRoom: null });
          try {
            await s.close();
          } catch (e) {
            set({ error: roomProblem(rooms.roomErrorCode(e), "leave") });
          } finally {
            set({ busy: false });
          }
        },

        lock: async (locked) => {
          await skipper("write", { locked });
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
            set({ error: roomProblem(rooms.roomErrorCode(e), "write") });
          } finally {
            set({ busy: false });
          }
        },

        passHat: async (key) => {
          await skipper("write", (room) => {
            if (!room.members.some((m) => m.key === key)) throw new RoomActionError("That sailor isn't aboard any more.");
            return { host: key };
          });
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
              await rooms.takeHat(room, s.key, self);
            });
          } catch (e) {
            set({ error: e instanceof RoomActionError ? e.message : roomProblem(rooms.roomErrorCode(e), "write") });
          } finally {
            set({ busy: false });
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
          await skipper("write", { sail: plan });
        },

        pickBottleDeck: async (bottleId, cards) => {
          const { min, max } = ROOM_LIMITS.deckCards;
          if (!Number.isInteger(cards) || cards < min || cards > max) return void set({ error: `Room decks need ${min} to ${max} cards.` });
          await skipper("write", { deck: { bottleId, cards } });
        },

        pickOwnDeck: async (deckId) => {
          const room = get().room;
          if (!room) throw new Error(NOT_ABOARD);
          if (room.mode !== "invite") throw new Error("Open rooms use Bottle Bay decks only.");
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
          if (hasContactDetails(cards.flatMap((c) => [c.f, c.b])).length) throw new Error(ROOM_DECK_CONTACT_PROBLEM);
          await skipper("write", { deck: { own: cards } });
        },

        startGame: async (kind) => {
          const room = get().room;
          if (!room?.deck) return void set({ error: "Pick a deck first." });
          await get().loadDeck();
          if ((get().deck?.length ?? 0) < 4) return void set({ error: "This deck needs at least 4 cards with different answers." });
          await skipper("game", (r, serverNow) => {
            if (!r.deck) throw new RoomActionError("Pick a deck first.");
            const seats = gameSeats(r, serverNow);
            if (!seats.length) throw new RoomActionError("Everyone's focusing. Games are for breaks.");
            return { game: kind === "tidy" ? { kind } : { kind, goal: bottleGoal(seats.length) }, seats };
          });
        },

        endGame: async () => {
          await skipper("game", { game: null });
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
          const send = async (): Promise<boolean> => {
            const room = s.currentRoom();
            const game = room?.game;
            if (!room || game?.kind !== "bottle" || game.seed !== start.seed || game.turn !== start.turn) return false;
            await rooms.playTurn(room.code, bottleStep(game, outcome, room, room.deck?.cards ?? get().deck?.length ?? 0, s.serverNow()));
            return true;
          };
          try {
            await sleep(start.turnAt + TURN_PACE_MS - s.serverNow());
            let sent: boolean;
            try {
              sent = await send();
            } catch (e) {
              if (rooms.roomErrorCode(e) !== "permission-denied") throw e;
              // Refused: someone else answered (the turn moves on), or this device's clock ran a little early. Try once more.
              await sleep(TURN_RETRY_MS);
              sent = await send();
            }
            if (!sent) set({ error: roomProblem("permission-denied", "game") });
          } catch (e) {
            set({ error: roomProblem(rooms.roomErrorCode(e), "game") });
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
            await rooms.reportRoom(uid, code, reason, room?.code === code ? room : null);
            set({ reported: uniq([...get().reported, code], 50) });
          } catch (e) {
            set({ error: roomProblem(rooms.roomErrorCode(e), "report") });
          } finally {
            set({ busy: false });
          }
        },

        loadDeck: async () => {
          const room = get().room;
          const key = room && deckKey(room);
          if (!room || !key) {
            if (get().deck) set({ deck: null });
            deckLoaded = null;
            return;
          }
          if ((key === deckLoaded && get().deck) || key === deckLoading) return;
          deckLoading = key;
          const rooms = await roomsModule();
          try {
            const cards = await rooms.readGameDeck(room);
            const now = get().room;
            if (now && deckKey(now) === key) {
              deckLoaded = key;
              set({ deck: cards });
            }
          } catch (e) {
            set({ error: roomProblem(rooms.roomErrorCode(e), "load") });
          } finally {
            if (deckLoading === key) deckLoading = null;
          }
        },

        loadOpenRooms: async () => {
          if (!get().over13) return void set({ error: OVER13_ONLY });
          const uid = await signedInUid();
          if (!uid) return void set({ error: LOG_IN });
          const rooms = await roomsModule();
          set({ busy: true, error: null });
          try {
            // The list's rule reads the 13+ tick from the account, so it has to be there first.
            await rooms.ensureRulesStamp(uid, true);
            const cards = await rooms.listOpenCards();
            const now = Date.now() + get().serverOffset;
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
            const card = await rooms.getCard(code);
            set({ preview: { code, card, problem: joinProblem(card, Date.now() + get().serverOffset) } });
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
        dismissNotice: () => set({ notice: null, noticeRoom: null }),

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
              useUi.getState().openPanel("rooms");
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
      partialize: ({ current, recent, hidden, hiddenRooms, muted, rulesOk, over13, myLook, reported, lastSailSeen }) => ({
        current,
        recent,
        hidden,
        hiddenRooms,
        muted,
        rulesOk,
        over13,
        myLook,
        reported,
        lastSailSeen,
      }),
      // Saved data is checked field by field, so a hand-edited or older copy can't break the panel.
      merge: (persisted, state) => {
        const p = (persisted ?? {}) as Partial<RoomPrefs>;
        const now = Date.now();
        const recent = Array.isArray(p.recent)
          ? p.recent.filter(
              (r): r is RecentRoom =>
                !!r && typeof r.code === "string" && CODE_PATTERN.test(r.code) && Array.isArray(r.name) && r.name.length === 2 && typeof r.at === "number" && now - r.at < RECENT_KEEP_MS,
            )
          : [];
        return {
          ...state,
          current: typeof p.current === "string" && CODE_PATTERN.test(p.current) ? p.current : null,
          recent: recent.slice(0, RECENT_MAX).map((r) => ({ ...r, skipper: Boolean(r.skipper) })),
          hidden: strings(p.hidden, 100),
          hiddenRooms: strings(p.hiddenRooms, 100),
          muted: p.muted === true,
          rulesOk: typeof p.rulesOk === "number" ? p.rulesOk : 0,
          over13: p.over13 === true,
          myLook: sanitizeLook(p.myLook),
          reported: strings(p.reported, 50),
          lastSailSeen: typeof p.lastSailSeen === "number" ? p.lastSailSeen : 0,
        };
      },
    },
  ),
);
