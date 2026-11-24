// A sailor's live link to the Study Room they're aboard, from joining until they leave, even while
// the panel is closed. Shaped like SyncSession in cloudSync.ts, and like it loaded only when needed.
//
// - One session per browser (Web Locks): a second Ship tab waits, and takes over when the first closes.
// - One listener on rooms/{code}; each snapshot goes into roomStore.
// - The server's clock, worked out from the `seen` time of each own write (quick round trips only).
//   Until it's known, the timer's end isn't sent (it would be in this device's time), and waits
//   are counted from this device's own writes only.
// - Own writes: merged into one, spaced 15 s apart (the rules refuse closer ones), and carrying
//   the focus minutes earned since the last write (the Kraken's damage, at no extra writes).
//   The timer's state goes out when this device's own timer changes (and once on starting), never
//   in reply to a snapshot, so two devices with the same sailor can't argue back and forth.
// - A keep-alive 10 minutes after the last own write; the skipper's also refreshes the card.
// - Sweeping stale sailors (checked against the server first), rewards, offers, and noticing when
//   this sailor is no longer aboard (removal arrives as permission-denied on the listener, or as a
//   snapshot without them).

import { ROOM_LIMITS } from "@ship/shared-types";
import type { Room, RoomCard, RoomMember } from "@ship/shared-types";
import { tidyPatches } from "@ship/active-recall-engine";
import { FIGUREHEADS } from "@ship/ship-theme-kit";
import { useEconomy } from "../stores/economyStore.js";
import { gameDeck, pickOffer, rememberRoom, rereadRooms, tokenClockOffset, useRooms } from "../stores/roomStore.js";
import type { RoomNotice, RoomOffer } from "../stores/roomStore.js";
import { useUi } from "../stores/uiStore.js";
import { onFocusMinutes, useVoyage } from "../stores/voyageStore.js";
import {
  closeRoom,
  clearDeadRoom,
  forgetRoom,
  getCard,
  getRoom,
  getRoomFromServer,
  leaveRoom,
  removeSailor,
  roomErrorCode,
  skipperWrite,
  takeHat,
  watchRoom,
  writeSelf,
} from "./rooms.js";
import { creditableMinutes, estimateOffset, isRoomOver, memberKey, mergeSelf, mergeTidy, rememberTidy, roomProblem, roomRewards, roomStateFor, sweepAction } from "./roomRules.js";
import type { SelfPatch, TidyMemo } from "./roomRules.js";
import type { LeaveClock } from "./rooms.js";
import { clearSessionKeys } from "./storage.js";
import { blockEndsAt } from "./voyageLogic.js";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
/** The rules' 15 s between own writes, plus slack for the trip to the server. */
const GAP_MS = ROOM_LIMITS.writeGapSeconds * SECOND + 1500;
/** Phase changes wait this long, so a quick pause-and-resume becomes one write. */
const PHASE_DEBOUNCE_MS = 3000;
const KEEP_ALIVE_MS = ROOM_LIMITS.keepAliveMinutes * MINUTE;
/** The skipper refreshes the card's `alive` on any own write once it's this old (joiners read it; the rules want it under 10 minutes). */
const CARD_ALIVE_MS = (ROOM_LIMITS.cardFreshMinutes - 1) * MINUTE;
/** Minutes claimed are worked out a few seconds behind the server's clock, so the rules never find them early. */
const CLOCK_MARGIN_MS = 5 * SECOND;
/** A clock end that moved less than this isn't worth a write. */
const END_DRIFT_MS = MINUTE;
const MAX_REFUSALS = 3;
const SWEEP_JITTER_MS = 30 * SECOND;
const OFFER_EVERY_MS = 5 * SECOND;
const RELISTEN_MS = 30 * SECOND;
/** A room this app can't read (a newer app changed it) is tried again less and less often: each try is a read. */
const UNREADABLE_RETRY_MS = [30 * SECOND, 2 * MINUTE, 10 * MINUTE];
const LIFETIME_MS = ROOM_LIMITS.lifetimeHours * 60 * MINUTE;
/**
 * A clock reading is kept only from a write that came back this fast. A write that waited in
 * the queue while offline lands late, and would put the clock out by half the wait.
 */
const MAX_CALIBRATION_RTT_MS = 4 * SECOND;
/**
 * With no quick reading yet, the clock is tried again after these waits (each try is a keep-alive),
 * then at the keep-alive's own pace. After the first ones, on a connection that's always slow, the
 * fastest reading seen is used anyway if it came back within half a minute: it's out by at most
 * half its round trip, and minutes are then claimed that much further behind the server's clock.
 */
const REPROBE_WAITS_MS = [MINUTE, 3 * MINUTE];
const MAX_SLOW_CALIBRATION_RTT_MS = 30 * SECOND;
/** The skipper's own device clears their room as over only this far past the line: the rules let a skipper delete it any time. */
const SKIPPER_CLEAR_MARGIN_MS = 30 * SECOND;
/** The Web Lock that keeps one room session per browser. */
const LOCK_NAME = "ship:room-session";

/** Thrown into a waiting write when the session ends first (named, so the store can stay quiet about it). */
export class SessionStopped extends Error {
  constructor() {
    super("The room session ended.");
    this.name = "SessionStopped";
  }
}

/** Thrown inside a write that turned out not to be needed, so its queued changes go back in the queue. */
class NothingToWrite extends Error {}

// Two things survive a reload of this tab (sessionStorage), under the sailor's key in the room
// (sha256 of account and code), so another account signing in on this tab never picks them up:
// focus minutes earned and not yet credited, and what this device has seen of the current Tidy
// the Deck game (sailors who left take their progress out of the room with them). Leaving or
// losing the room, Start over and deleting the account clear them.
const ROOM_TAB_PREFIX = "ship:room-";
const pendingKey = (key: string) => `${ROOM_TAB_PREFIX}pending:${key}`;
const tidyKey = (key: string) => `${ROOM_TAB_PREFIX}tidy:${key}`;

function tabGet(name: string): string | null {
  try {
    return sessionStorage.getItem(name);
  } catch {
    return null;
  }
}
function tabSet(name: string, value: string | null): void {
  try {
    if (value === null) sessionStorage.removeItem(name);
    else sessionStorage.setItem(name, value);
  } catch {
    // No sessionStorage (private mode, tests): a reload loses these, as before.
  }
}
function readPending(key: string): number {
  const n = Number(tabGet(pendingKey(key)));
  return Number.isFinite(n) && n > 0 ? Math.min(n, ROOM_LIMITS.lifetimeHours * 60) : 0;
}
function readTidy(key: string): TidyMemo | null {
  try {
    const v = JSON.parse(tabGet(tidyKey(key)) ?? "null") as unknown;
    if (!v || typeof v !== "object") return null;
    const { seed, seen } = v as { seed?: unknown; seen?: unknown };
    if (typeof seed !== "number" || !seen || typeof seen !== "object") return null;
    const clean: TidyMemo["seen"] = {};
    for (const [k, t] of Object.entries(seen as Record<string, unknown>)) {
      const x = t as { patches?: unknown; ms?: unknown; mixups?: unknown } | null;
      if (/^[0-9a-f]{64}$/.test(k) && x && typeof x.patches === "number" && typeof x.ms === "number" && typeof x.mixups === "number") clean[k] = { patches: x.patches, ms: x.ms, mixups: x.mixups };
    }
    return { seed, seen: clean };
  } catch {
    return null;
  }
}

/** Hints from the write that opened or joined the room, so the clock offset and the 15 s gap are known from the first snapshot. */
export interface SessionHint {
  sentAt: number;
  ackAt: number;
  skipper?: boolean;
}

export class RoomSession {
  key = "";
  private offset = 0;
  /** True once an own write's `seen` has set the clock offset; minutes aren't claimed before. */
  private calibrated = false;
  private room: Room | null = null;
  private stopped = false;
  private unlisten: (() => void) | null = null;
  private unsubs: (() => void)[] = [];
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private queued: SelfPatch | null = null;
  private sendTimer: ReturnType<typeof setTimeout> | null = null;
  private sendNotBefore = 0;
  private keepAliveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Own writes go one at a time, in order. */
  private chain: Promise<unknown> = Promise.resolve();
  /** The last own changes sent, until a snapshot shows them (by my `seen` moving on). */
  private sending: { patch: SelfPatch; before: number | null } | null = null;
  /** The timer state this session last sent (or found already there on starting); only a change from it is sent. */
  private lastTimer: { st: number; endsAt: number | null } | null = null;
  /** The first snapshot after the listener (re)starts compares the timer with the room's copy once. */
  private firstSnapshot = true;
  private lastAckLocal = 0;
  /** Focus minutes earned aboard and not yet credited (kept in sessionStorage across a reload). */
  private pendingDmg = 0;
  /** Whether the last snapshot came straight from the server (the listener skips cached ones). */
  private live = false;
  private tidyMemo: TidyMemo | null = null;
  /** Set once this tab's saved minutes and Tidy memory for the room are cleared (left or lost it): nothing saves them again. */
  private forgotten = false;
  /** A flush is already waiting in the chain: it takes whatever is queued when its turn comes. */
  private flushWaiting = false;
  /** Whether the last take() found anything queued (a keep-alive counts); minutes alone ride on other writes. */
  private tookQueue = false;
  /** A relisten is waiting; and how many times in a row the room couldn't be read by this app. */
  private relistening = false;
  private unreadable = 0;
  /** Set once the clock has been tried (a good reading or a slow one), so the timer isn't held back again. */
  private clockTried = false;
  /** A timer change waiting for the clock; `fromRoom`: compare it with the room's copy, as the first snapshot does. */
  private timerWaits: { fromRoom: boolean } | null = null;
  /** A slow write left the clock unset, and a keep-alive is waiting to measure it again. */
  private reprobing = false;
  /** Slow clock readings so far, and the fastest of them (its round trip and offset). */
  private slowReadings = 0;
  private fastestSlow: { rtt: number; offset: number } | null = null;
  /** How far behind the server's clock minutes are claimed: more when the clock came from a slow reading. */
  private clockMargin = CLOCK_MARGIN_MS;
  /** Whether this session already tried to put the open room back on the list after the hat came here. */
  private listTried = false;
  /** Released when the session stops, which hands the Web Lock to a waiting tab. */
  private release: () => void = () => undefined;
  private readonly abort = typeof AbortController !== "undefined" ? new AbortController() : null;
  /** After a refused write, the next one leaves the minutes out, in case they were the problem. */
  private holdDmg = false;
  private refusals = 0;
  private probe: { sent: number; ack: number | null; before: number | null; seen: number | null } | null = null;
  /** When this device last refreshed the card's `alive` (local ms); 0 = unknown. */
  private cardAliveLocal = 0;
  /** Waits in progress, woken at once when the session stops. */
  private naps = new Set<() => void>();
  /** A refused write is being checked for the room being over (and cleared if so). */
  private checkingOver = false;
  /**
   * Until an own write measures the clock, the offset comes from a sign-in token's issue time
   * (Google's clock, to about a second), never left at 0 (this device's own clock, which can be
   * minutes out). It's good enough to judge whether a room is over, not to claim minutes.
   */
  private tokenSeeded = false;
  private seeding: Promise<void> | null = null;

  constructor(
    readonly uid: string,
    readonly code: string,
    private readonly hint?: SessionHint,
  ) {
    if (hint) {
      this.probe = { sent: hint.sentAt, ack: hint.ackAt, before: null, seen: null };
      this.lastAckLocal = hint.ackAt;
      if (hint.skipper) this.cardAliveLocal = hint.ackAt;
    }
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  serverNow(): number {
    return Date.now() + this.offset;
  }

  /** Whether serverNow() is measured (an own write's round trip, or a sign-in token's time) rather than this device's guess. */
  clockKnown(): boolean {
    return this.calibrated || this.tokenSeeded;
  }

  /** The clock for leaving or closing the room (rooms.ts never clears the skipper's live room on a guess). */
  private leaveClock(): LeaveClock {
    return { serverNow: this.serverNow(), measured: this.clockKnown() };
  }

  /** Sets the clock from a sign-in token's issue time, until an own write measures it (at most once at a time). */
  private seedClock(): Promise<void> {
    if (this.clockKnown()) return Promise.resolve();
    this.seeding ??= (async () => {
      const offset = await tokenClockOffset().catch(() => null);
      this.seeding = null;
      if (offset === null || this.clockKnown()) return;
      this.offset = offset;
      this.tokenSeeded = true;
      if (!this.stopped) useRooms.setState({ serverOffset: offset });
    })();
    return this.seeding;
  }

  /** The room as last heard from the server; null once the session has stopped (left, removed, or closed). */
  currentRoom(): Room | null {
    return this.stopped ? null : this.room;
  }

  /** Whether the card's `alive` is due a refresh from this skipper's next write (joiners read it). */
  cardAliveDue(): boolean {
    return this.room?.host === this.key && Date.now() - this.cardAliveLocal >= CARD_ALIVE_MS;
  }

  /** A write just refreshed the card's `alive`. */
  noteCardAlive(): void {
    this.cardAliveLocal = Date.now();
  }

  private addPending(minutes: number): void {
    this.pendingDmg = Math.max(0, this.pendingDmg + minutes);
    if (this.key && !this.forgotten) tabSet(pendingKey(this.key), this.pendingDmg > 0 ? String(this.pendingDmg) : null);
  }

  /** Clears this tab's saved minutes and Tidy memory for the room (left, lost, or the account went). */
  forget(): void {
    this.forgotten = true;
    if (!this.key) return;
    tabSet(pendingKey(this.key), null);
    tabSet(tidyKey(this.key), null);
  }

  private me(): RoomMember | undefined {
    return this.room?.members.find((m) => m.key === this.key);
  }

  async begin(): Promise<void> {
    this.key = await memberKey(this.uid, this.code);
    if (this.stopped || !(await this.holdLock()) || this.stopped) return;
    // What this tab saved before a reload (sessionStorage belongs to one tab).
    this.pendingDmg = readPending(this.key);
    this.tidyMemo = readTidy(this.key);
    useRooms.setState({ myKey: this.key, status: this.room ? "aboard" : "joining" });
    // Started without a fresh write (a reload, reopening Ship, a tab taking over): the clock comes
    // from a sign-in token until a write measures it, rather than from this device alone.
    if (!this.hint) void this.seedClock();
    this.listen();
    this.unsubs.push(
      onFocusMinutes((minutes) => {
        if (minutes > 0) this.addPending(minutes);
      }),
      useVoyage.subscribe((s, p) => {
        if (s.phase !== p.phase || s.pausedReason !== p.pausedReason || s.prepEndsAt !== p.prepEndsAt || s.breakEndsAt !== p.breakEndsAt || s.segmentStartedAt !== p.segmentStartedAt || s.focusMinutes !== p.focusMinutes) {
          this.voyageChanged();
          this.refreshOffer();
        }
      }),
    );
    this.every(MINUTE, () => this.later(Math.random() * SWEEP_JITTER_MS, () => void this.tidyUp()));
    this.every(OFFER_EVERY_MS, () => this.refreshOffer());
  }

  private every(ms: number, fn: () => void): void {
    const id = setInterval(fn, ms);
    this.unsubs.push(() => clearInterval(id));
  }

  private later(ms: number, fn: () => void): void {
    const id = setTimeout(() => {
      this.timers.delete(id);
      if (!this.stopped) fn();
    }, ms);
    this.timers.add(id);
  }

  /**
   * One room session per browser. Two tabs with the same sailor would each send their own timer,
   * so a second tab waits (the panel says the room is open in another tab) and takes over when the
   * first closes or leaves, after checking this browser is still aboard. False if stopped meanwhile.
   */
  private async holdLock(): Promise<boolean> {
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    if (!locks?.request) return true;
    const held = new Promise<void>((resolve) => {
      this.release = resolve;
    });
    const take = (opts: LockOptions) =>
      new Promise<boolean>((resolve) => {
        locks
          .request(LOCK_NAME, opts, (lock) => {
            resolve(lock !== null);
            return lock ? held : undefined;
          })
          .catch(() => resolve(false));
      });
    if (await take({ ifAvailable: true })) return true;
    if (this.stopped) return false;
    useRooms.setState({ status: "elsewhere", myKey: null });
    if (!(await take(this.abort ? { signal: this.abort.signal } : {}))) return false;
    if (this.stopped) return false;
    // The other tab may have left (or switched rooms) meanwhile: read this browser's saved room again.
    await useRooms.persist.rehydrate();
    if (useRooms.getState().current !== this.code) {
      this.stop();
      return false;
    }
    return true;
  }

  private listen(): void {
    this.unlisten?.();
    this.firstSnapshot = true;
    this.unlisten = watchRoom(this.code, {
      room: (r, meta) => this.onRoom(r, meta.fromCache),
      error: (code) => void this.onError(code),
    });
  }

  // ---- Snapshots --------------------------------------------------------------------------------

  private onRoom(next: Room | null, fromCache: boolean): void {
    if (this.stopped) return;
    this.live = !fromCache;
    if (fromCache) return;
    if (!next) {
      void this.lose(null);
      return;
    }
    const me = next.members.find((m) => m.key === this.key);
    if (!me) {
      void this.lose(next.banned.includes(this.key) ? "removed" : "drifted", next);
      return;
    }
    const prev = this.room;
    this.room = next;
    this.unreadable = 0;
    this.calibrate(me);
    if (this.sending && me.seenAt !== this.sending.before) this.sending = null;
    const tidyBefore = this.tidyMemo;
    this.tidyMemo = rememberTidy(tidyBefore, next);
    if (this.tidyMemo !== tidyBefore && !this.forgotten) tabSet(tidyKey(this.key), this.tidyMemo ? JSON.stringify(this.tidyMemo) : null);
    // A listener problem is over once a snapshot arrives; a dropped write's note stays until dismissed.
    useRooms.setState({ room: next, myKey: this.key, serverOffset: this.offset, status: "aboard", tidyMemo: this.tidyMemo, ...(useRooms.getState().status === "error" ? { alert: null } : {}) });
    rememberRoom(next, this.key);

    // Games pay even on the first snapshot (a game that ended during a reload); beasts don't (roomRewards).
    this.pay(prev, next, tidyBefore);
    if (!prev) {
      this.scheduleKeepAlive();
      // Started without a fresh write (a reload, or another device's join): one keep-alive now sets
      // the clock, rather than up to 10 minutes of guessing with this device's own.
      if (!this.hint) this.queueSelf({});
    }
    if (prev && prev.host === this.key && next.host !== this.key) this.listTried = false;
    // The hat just came to me: the card's `alive` is someone else's, so refresh it soon. An open
    // room handed on leaves the list, and goes back on it as this sailor's one open room.
    if (prev && next.host === this.key && prev.host !== this.key) {
      this.cardAliveLocal = 0;
      if (!this.listTried && this.canPutBackOnList(next)) void this.putBackOnList();
      else this.queueSelf({});
    }
    this.checkDeck(prev, next);
    if (this.firstSnapshot) {
      this.firstSnapshot = false;
      this.voyageChanged(me);
    }
    this.refreshOffer();
    if (this.queued) this.schedule();
  }

  /** The first snapshot after an own write shows its `seen` in server time: offset = server − local midpoint. */
  private calibrate(me: RoomMember): void {
    const p = this.probe;
    if (!p || (p.before !== null && me.seenAt === p.before)) return;
    if (p.ack === null) {
      p.seen = me.seenAt;
      return;
    }
    this.setOffset(p.sent, p.ack, me.seenAt);
  }

  /**
   * Sets the clock from one write's round trip, unless the trip was slow (it waited offline): then
   * the last good reading stays. With no good reading yet, a keep-alive tries again a minute later,
   * then 3 minutes later, then the keep-alive's own 10 minutes; after the first two tries the fastest
   * slow reading is used if it's under half a minute, so a sailor on a poor connection still has
   * their minutes credited, and the tries don't go on every minute.
   */
  private setOffset(sentAt: number, ackAt: number, serverMs: number): void {
    this.probe = null;
    this.clockTried = true;
    const rtt = ackAt - sentAt;
    if (rtt <= MAX_CALIBRATION_RTT_MS) this.useOffset(estimateOffset(sentAt, ackAt, serverMs), CLOCK_MARGIN_MS);
    else if (!this.calibrated) {
      if (!this.fastestSlow || rtt < this.fastestSlow.rtt) this.fastestSlow = { rtt, offset: estimateOffset(sentAt, ackAt, serverMs) };
      const tried = ++this.slowReadings;
      const best = this.fastestSlow;
      // Until a reading is adopted, the fastest slow one (out by at most half its round trip) is a far
      // better guess than this device's own clock, which may be minutes out: block ends go out in it.
      // Minutes aren't claimed with it yet (that waits for `calibrated`).
      this.offset = best.offset;
      useRooms.setState({ serverOffset: this.offset });
      if (tried > REPROBE_WAITS_MS.length && best.rtt <= MAX_SLOW_CALIBRATION_RTT_MS) {
        // Out by at most half the round trip: claim minutes that much further behind, plus a second.
        this.useOffset(best.offset, Math.max(CLOCK_MARGIN_MS, Math.ceil(best.rtt / 2) + SECOND));
      } else if (!this.reprobing && tried <= REPROBE_WAITS_MS.length) {
        // Later tries ride on the ordinary keep-alive, every 10 minutes.
        this.reprobing = true;
        this.later(REPROBE_WAITS_MS[tried - 1]!, () => {
          this.reprobing = false;
          if (!this.calibrated) this.queueSelf({});
        });
      }
    }
    // A timer change held back for the clock goes now (a slow reading leaves the best guess there is).
    const waiting = this.timerWaits;
    this.timerWaits = null;
    if (waiting) this.voyageChanged(waiting.fromRoom ? this.me() : undefined);
  }

  private useOffset(offset: number, margin: number): void {
    const first = !this.calibrated;
    const moved = Math.abs(offset - this.offset);
    this.offset = offset;
    this.clockMargin = margin;
    this.calibrated = true;
    useRooms.setState({ serverOffset: this.offset });
    // A block end sent on a guess (a slow reading) is compared with the room's copy again, now in
    // the server's own time, and corrected if it's a minute or more out.
    if (first && moved >= END_DRIFT_MS) this.voyageChanged(this.me());
  }

  /** An open room whose hat came here, off the list only because it was handed on (not locked or reported). */
  private canPutBackOnList(room: Room): boolean {
    return room.mode === "open" && !room.listed && !room.locked && room.strikes < ROOM_LIMITS.hideAtReports;
  }

  /**
   * Puts the open room back on the list as this sailor's one open room (their stamp names it), once
   * per hat. Refused while they still run another open room: then it stays off the list, and the
   * card's `alive` is refreshed by the next own write instead.
   */
  private async putBackOnList(): Promise<void> {
    this.listTried = true;
    try {
      await this.ownWrite(async (self) => {
        const room = this.room;
        if (!room || room.host !== this.key || !this.canPutBackOnList(room)) throw new NothingToWrite();
        const alive = this.cardAliveDue();
        this.sendingNow();
        await skipperWrite(room, this.key, { list: true }, self, { cardAlive: alive, uid: this.uid });
        if (alive) this.noteCardAlive();
      });
    } catch {
      this.queueSelf({});
    }
  }

  private pay(prev: Room | null, next: Room, tidyBefore: TidyMemo | null): void {
    const deck = gameDeck(useRooms.getState());
    const g = next.game;
    const opts = {
      tidyBefore,
      tidyAfter: this.tidyMemo,
      ...(g?.kind === "tidy" && deck ? { tidyPatches: tidyPatches(deck, g.seed, g.seats.length).length } : {}),
    };
    for (const reward of roomRewards(prev, next, this.key, opts)) {
      const paid = useEconomy.getState().earnOnce(reward.id, reward.doubloons, reward.xp, reward.reason, { roomCap: true });
      if (!paid) continue;
      let text = reward.reason;
      if (reward.figurehead && useEconomy.getState().grantPart("figurehead", reward.figurehead)) {
        const name = FIGUREHEADS.find((f) => f.id === reward.figurehead)?.name;
        if (name) text += ` The ${name.toLowerCase()} figurehead is yours.`;
      }
      if (paid.doubloons > 0) text += ` +${paid.doubloons} doubloons`;
      useUi.getState().toast(text, "reward");
    }
  }

  private checkDeck(prev: Room | null, next: Room): void {
    const store = useRooms.getState();
    if (!next.deck) {
      if (store.deck || store.deckId) useRooms.setState({ deck: null, deckId: null, deckProblem: null });
      return;
    }
    // A new game I'm seated in: read its deck now, so rewards and the board are ready.
    const g = next.game;
    if (g && g.seed !== prev?.game?.seed && g.seats.includes(this.key)) void store.loadDeck();
  }

  private refreshOffer(): void {
    const room = this.room;
    if (!room || this.stopped) return;
    const v = useVoyage.getState();
    const store = useRooms.getState();
    const g = room.game;
    const deck = g?.kind === "tidy" ? gameDeck(store) : null;
    const tidy = g?.kind === "tidy" ? { memo: this.tidyMemo, ...(deck ? { patches: tidyPatches(deck, g.seed, g.seats.length).length } : {}) } : {};
    const offer = pickOffer(room, this.key, { phase: v.phase, prepEndsAt: v.prepEndsAt }, this.serverNow(), store.lastSailSeen, tidy);
    if (!sameOffer(offer, store.offer)) useRooms.setState({ offer });
  }

  // ---- Losing the room --------------------------------------------------------------------------

  private async onError(code: string): Promise<void> {
    if (this.stopped) return;
    // Seen in the emulator: a removed sailor's listener gets permission-denied, not a last snapshot.
    if (code === "permission-denied") {
      await this.lose(null);
      return;
    }
    console.warn("Ship's study room stopped listening.", code);
    this.live = false;
    useRooms.setState({ status: "error", alert: roomProblem(code, "load") });
    // The listener has stopped (watchRoom stops it on a room it can't read). One relisten at a time;
    // a room this app can't read is tried again less and less often.
    if (this.relistening) return;
    this.relistening = true;
    const wait = code === "data-loss" ? UNREADABLE_RETRY_MS[Math.min(this.unreadable++, UNREADABLE_RETRY_MS.length - 1)]! : RELISTEN_MS;
    this.later(wait, () => {
      this.relistening = false;
      this.listen();
    });
  }

  /**
   * No longer aboard. `kind` from a snapshot without me; null when the room went unreadable or
   * missing (the card tells which). A room that's gone is "closed" only when my copy shows it alive
   * with someone else as skipper; with no copy (the session's first snapshot, after a reload) or as
   * its skipper, it's "ended", the neutral "docked for the day": nobody is told the skipper closed
   * a room nobody closed.
   */
  private async lose(kind: "removed" | "drifted" | null, last?: Room): Promise<void> {
    if (this.stopped) return;
    const room = last ?? this.room;
    const serverNow = this.serverNow();
    this.stop();
    this.forget();
    let notice: RoomNotice = kind ?? "gone";
    let card: RoomCard | null | undefined;
    if (!kind) {
      card = await getCard(this.code).catch(() => undefined);
      if (card === null) notice = goneNotice(room, this.key, serverNow);
    }
    // The private note stays while the room lives, so a sailor who drifted out or was removed can
    // still report it; it's tidied away with the room. A room that's gone takes its note now.
    if (card === null) void forgetRoom(this.uid, this.code).catch(() => undefined);
    if (current === this) current = null;
    // Another Ship tab may have left on purpose a moment ago: its choice is saved, and this tab may not have read it yet.
    await rereadRooms();
    const store = useRooms.getState();
    // Leaving or switching rooms meanwhile already settled things.
    if (store.current !== this.code) return;
    const name = room?.name ?? store.recent.find((r) => r.code === this.code)?.name ?? null;
    useRooms.setState({
      current: null,
      room: null,
      myKey: null,
      status: "idle",
      offer: null,
      deck: null,
      deckId: null,
      deckProblem: null,
      tidyMemo: null,
      busy: false,
      error: null,
      alert: null,
      notice,
      noticeRoom: name ? { code: this.code, name: [name[0], name[1]] } : null,
      noticeAt: Date.now(),
    });
  }

  // ---- The timer --------------------------------------------------------------------------------

  /**
   * Sends my state and when my block ends, from the voyage's phase only (idle pauses and a hidden
   * tab are never sent). It runs when this device's own timer changes, and once on the first
   * snapshot (`roomCopy`, to correct what the room shows after a reload). It compares with what
   * this session last sent, never with the room's copy otherwise: a second device with the same
   * sailor writes there too, and answering it would start an endless back and forth.
   */
  private voyageChanged(roomCopy?: RoomMember): void {
    if (this.stopped || !this.me()) return;
    // The block's end goes out in server time, which needs the clock. A session that started
    // without a fresh write sends a keep-alive at once to set it, and the timer follows it.
    if (!this.calibrated && !this.clockTried) {
      this.timerWaits = { fromRoom: (this.timerWaits?.fromRoom ?? false) || roomCopy !== undefined };
      return;
    }
    const v = useVoyage.getState();
    if (v.phase === "drifting" && v.pausedReason === "idle") return;
    const st = roomStateFor(v.phase, v.prepEndsAt);
    const localEnd = st === 1 || st === 2 ? blockEndsAt(v, Date.now()) : null;
    const endsAt = localEnd === null ? null : Math.round(localEnd + this.offset);
    const q = this.queued;
    const known = q?.st !== undefined ? { st: q.st, endsAt: q.endsAt ?? null } : roomCopy ? { st: roomCopy.state, endsAt: roomCopy.endsAt } : this.lastTimer;
    const sameEnd = (a: number | null, b: number | null) => (a === null ? b === null : b !== null && Math.abs(a - b) < END_DRIFT_MS);
    if (known && known.st === st && sameEnd(endsAt, known.endsAt)) {
      this.lastTimer ??= { st, endsAt };
      return;
    }
    this.lastTimer = { st, endsAt };
    this.queueSelf({ st, endsAt }, PHASE_DEBOUNCE_MS);
  }

  // ---- Own writes -------------------------------------------------------------------------------

  /** Merged into the next own write, sent as soon as the 15 s gap allows (phase changes debounce 3 s). */
  queueSelf(patch: SelfPatch, debounceMs = 0): void {
    if (this.stopped) return;
    const { addDmg, ...rest } = patch;
    if (addDmg && addDmg > 0) this.addPending(addDmg);
    this.queued = this.queued ? mergeSelf(this.queued, rest) : rest;
    this.sendNotBefore = Math.max(this.sendNotBefore, Date.now() + debounceMs);
    this.schedule();
  }

  /**
   * A cleared Tidy the Deck patch, added to everything this game's progress already holds: the
   * room's copy, a write still on its way (the room shows it only once it lands), and the queue.
   * The database stores plain values, so a write built from less would erase a patch.
   */
  queueTidy(seed: number, patch: number, ms: number, mixups: number): void {
    const me = this.me();
    const fromRoom = me?.tidy.gid === seed ? { gid: seed, g: me.tidy.patches, gt: me.tidy.ms, gp: me.tidy.mixups } : undefined;
    const same = (t: SelfPatch["tidy"]) => (t?.gid === seed ? t : undefined);
    const base = mergeTidy(mergeTidy(fromRoom, same(this.sending?.patch.tidy)), same(this.queued?.tidy)) ?? { gid: seed, g: 0, gt: 0, gp: 0 };
    const { maxMs, maxPatches } = ROOM_LIMITS.tidy;
    this.queueSelf({
      tidy: {
        gid: seed,
        g: (base.g | (1 << patch)) & (2 ** maxPatches - 1),
        gt: Math.min(maxMs, Math.max(base.gt, Math.round(Math.max(0, ms)))),
        gp: Math.min(999, base.gp + Math.max(0, Math.round(mixups))),
      },
    });
  }

  /**
   * When (local ms) the rules will next accept an own write. Until the clock is set, `seen` (a
   * server time) can't be turned into this device's time, so only this device's own writes count:
   * a write that goes too early is refused and tried again a gap later, and that sets the clock.
   */
  private gapAt(): number {
    const me = this.me();
    return Math.max(this.lastAckLocal ? this.lastAckLocal + GAP_MS : 0, me && this.calibrated ? me.seenAt - this.offset + GAP_MS : 0);
  }

  /** The write itself starts now: a skipper write whose builder read the database first keeps that read out of the clock's round trip. */
  sendingNow(): void {
    if (this.probe && this.probe.ack === null) this.probe.sent = Date.now();
  }

  /** Resolves when an own (or skipper) write may go; the panel can count down to it. */
  async writable(): Promise<void> {
    await this.chain;
    await this.waitGap();
  }

  private async waitGap(): Promise<void> {
    for (let wait = this.gapAt() - Date.now(); wait > 0 && !this.stopped; wait = this.gapAt() - Date.now()) await this.nap(wait);
  }

  private nap(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const wake = () => {
        clearTimeout(id);
        this.naps.delete(wake);
        resolve();
      };
      const id = setTimeout(wake, Math.max(0, ms));
      this.naps.add(wake);
    });
  }

  /**
   * Runs one own write (a plain update, or a skipper's) once the gap allows, with the queued
   * changes and the creditable minutes handed to it. On failure they go back in the queue.
   */
  ownWrite<T>(fn: (self: SelfPatch) => Promise<T>): Promise<T> {
    const run = this.chain.then(async () => {
      await this.waitGap();
      if (this.stopped) throw new SessionStopped();
      const self = this.take();
      const sent = Date.now();
      const before = this.me()?.seenAt ?? null;
      const earlier = { probe: this.probe, sending: this.sending };
      this.probe = { sent, ack: null, before, seen: null };
      this.sending = { patch: self, before };
      try {
        const out = await fn(self);
        this.acked();
        return out;
      } catch (e) {
        // Nothing was sent: an earlier write's clock reading (still waiting for its snapshot) stays.
        const unsent = e instanceof NothingToWrite;
        this.probe = unsent ? earlier.probe : null;
        this.sending = unsent ? earlier.sending : null;
        this.putBack(self);
        if (unsent) return undefined as T;
        throw e;
      }
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  /** Takes the queued changes for a write, adding the minutes the rules will accept now. */
  private take(): SelfPatch {
    const self: SelfPatch = { ...(this.queued ?? {}) };
    this.tookQueue = this.queued !== null;
    this.flushWaiting = false;
    this.queued = null;
    this.sendNotBefore = 0;
    if (this.sendTimer) clearTimeout(this.sendTimer);
    this.sendTimer = null;
    const me = this.me();
    if (me && this.calibrated && !this.holdDmg) {
      const add = Math.min(Math.floor(this.pendingDmg), creditableMinutes(me, this.serverNow() - this.clockMargin));
      if (add > 0) {
        self.addDmg = add;
        this.addPending(-add);
      }
    }
    return self;
  }

  private putBack(self: SelfPatch): void {
    const { addDmg, ...rest } = self;
    this.addPending(addDmg ?? 0);
    // mergeSelf joins Tidy progress up, so a refused write and a newer one never lose a patch between them.
    if (Object.keys(rest).length) this.queued = this.queued ? mergeSelf(rest, this.queued) : rest;
    if (this.queued) this.schedule();
  }

  private acked(): void {
    const now = Date.now();
    this.lastAckLocal = now;
    this.refusals = 0;
    this.holdDmg = false;
    const p = this.probe;
    if (p) {
      p.ack = now;
      if (p.seen !== null) this.setOffset(p.sent, p.ack, p.seen);
    }
    this.scheduleKeepAlive();
  }

  private schedule(): void {
    if (!this.queued || this.stopped || !this.room) return;
    if (this.sendTimer) clearTimeout(this.sendTimer);
    const at = Math.max(this.sendNotBefore, this.gapAt());
    this.sendTimer = setTimeout(() => {
      this.sendTimer = null;
      this.flush();
    }, Math.max(0, at - Date.now()));
  }

  private flush(): void {
    // One flush waits in the chain at a time; it takes everything queued when its turn comes.
    if (!this.queued || this.stopped || this.flushWaiting) return;
    this.flushWaiting = true;
    this.ownWrite(async (self) => {
      // Another write (a skipper's) took the queue first: nothing is left to send.
      if (!this.tookQueue) throw new NothingToWrite();
      const alive = this.cardAliveDue();
      await writeSelf(this.code, this.key, self, { cardAlive: alive });
      if (alive) this.cardAliveLocal = Date.now();
    }).catch((e: unknown) => this.writeFailed(e));
  }

  private writeFailed(e: unknown): void {
    if (this.stopped || e instanceof SessionStopped) return;
    const code = roomErrorCode(e);
    // A room that's over takes no more writes (the rules make it final): it's checked, and cleared
    // if so (losing it then says it docked). Meanwhile the write is tried again as for any refusal,
    // so a refusal for another reason (too soon by a clock that's off) never silences the session.
    if (code === "permission-denied") void this.clearIfOver();
    // Too soon by this device's clock, or minutes the rules wouldn't take: try again after a gap, without the minutes.
    if (code === "permission-denied" && ++this.refusals <= MAX_REFUSALS) {
      this.holdDmg = true;
      this.queued ??= {};
      this.sendNotBefore = Date.now() + GAP_MS;
      this.schedule();
      return;
    }
    this.refusals = 0;
    this.queued = null;
    // What the room shows of my timer is unknown now, so the next change of it goes out.
    this.lastTimer = null;
    // A timer change held back for the clock waits no longer: the best guess goes with the next write.
    if (!this.clockTried) {
      this.clockTried = true;
      const waiting = this.timerWaits;
      this.timerWaits = null;
      if (waiting) this.voyageChanged(waiting.fromRoom ? this.me() : undefined);
    }
    useRooms.setState({
      alert: code === "permission-denied" ? "The room turned down your last update (a cheer, game progress or your timer), so it was dropped. Your focus minutes wait for the next one." : roomProblem(code, "write"),
    });
    // Never silent: the keep-alive still comes (its 10 minutes from now, so a room that keeps
    // refusing is never written to in a loop), and the crew keeps seeing this sailor here.
    this.scheduleKeepAlive(Date.now());
  }

  /**
   * After a refused write: is the room over (the rules then refuse everything but a report)? If so
   * it's cleared, and losing it says it docked. A crewmate just tries (the rules let them clear only
   * a room that's over, so they decide), unless a measured clock says it isn't over. The skipper,
   * whom the rules always let delete their room, clears it only from a copy read from the server
   * just now, judged by a measured clock, a little past the line.
   */
  private async clearIfOver(): Promise<void> {
    if (this.checkingOver || this.stopped || !this.room) return;
    this.checkingOver = true;
    try {
      await this.seedClock();
      const room = this.room;
      if (!room || this.stopped) return;
      if (room.host !== this.key) {
        if (!this.clockKnown() || isRoomOver(room, this.serverNow())) await clearDeadRoom(this.code);
        return;
      }
      if (!this.clockKnown()) return;
      const fresh = await getRoomFromServer(this.code);
      if (fresh && !this.stopped && fresh.host === this.key && isRoomOver(fresh, this.serverNow() - SKIPPER_CLEAR_MARGIN_MS)) await clearDeadRoom(this.code);
    } catch {
      // Refused (not over after all, or someone else cleared it), or the server can't be reached: the next refusal checks again.
    } finally {
      this.checkingOver = false;
    }
  }

  /** The keep-alive, 10 minutes after the last own write (or after `from`, a write that was turned down). */
  private scheduleKeepAlive(from = 0): void {
    if (this.stopped) return;
    if (this.keepAliveTimer) clearTimeout(this.keepAliveTimer);
    const me = this.me();
    // Before the clock is set, only own writes count (a slow clock would otherwise put the keep-alive off for good).
    const last = Math.max(from, this.lastAckLocal, me && this.calibrated ? me.seenAt - this.offset : 0);
    this.keepAliveTimer = setTimeout(
      () => {
        this.keepAliveTimer = null;
        this.queueSelf({});
      },
      Math.max(0, last + KEEP_ALIVE_MS - Date.now()),
    );
  }

  // ---- Tidying up -------------------------------------------------------------------------------

  /**
   * Each minute: a room past 12 hours is cleared; the skipper sweeps a sailor gone 25 minutes;
   * with no skipper, one sailor takes the hat. A lost race fails harmlessly. Nothing is swept from
   * a copy that may be old (after a laptop sleeps, say): only with the clock set and the listener
   * live, and only if the server's copy, read just then, still shows the sailor gone.
   */
  private async tidyUp(): Promise<void> {
    const room = this.room;
    if (!room || this.stopped) return;
    const now = this.serverNow();
    try {
      // Over (12 hours old, or the skipper gone 25 minutes with nobody taking the hat): nobody can
      // write to it any more, so it's cleared. A crewmate's try is refused, harmlessly, if it isn't
      // over after all; but the rules always let the skipper delete their room, so the skipper's
      // device judges it only with a measured clock, a little past the line. A skipper who's gone is
      // judged only with the clock known and the listener live.
      const skipper = room.host === this.key;
      const over = skipper
        ? this.clockKnown() && this.live && isRoomOver(room, now - SKIPPER_CLEAR_MARGIN_MS)
        : now >= room.at + LIFETIME_MS || (this.clockKnown() && this.live && isRoomOver(room, now));
      if (over) {
        await clearDeadRoom(this.code);
        return;
      }
      const action = sweepAction(room, this.key, now);
      if (action?.kind === "take-hat") {
        let took = false;
        await this.ownWrite(async (self) => {
          const fresh = this.room;
          if (!fresh) throw new NothingToWrite();
          if (fresh.host === this.key) {
            // The hat came another way meanwhile: the queued changes still go, with the card's `alive` now this skipper's.
            const alive = this.cardAliveDue();
            await writeSelf(this.code, this.key, self, { cardAlive: alive });
            if (alive) this.noteCardAlive();
            return;
          }
          await takeHat(this.uid, fresh, this.key, self);
          took = true;
        });
        if (took) this.noteCardAlive();
      } else if (action?.kind === "sweep") {
        if (!this.calibrated || !this.live) return;
        const fresh = await getRoomFromServer(this.code);
        if (!fresh || this.stopped) return;
        const again = sweepAction(fresh, this.key, this.serverNow());
        if (again?.kind === "sweep" && again.key === action.key) await removeSailor(fresh, this.key, action.key, { ban: false });
      }
    } catch {
      // Another sailor got there first, the rules say not yet, or the server can't be reached.
    }
  }

  // ---- Ending -----------------------------------------------------------------------------------

  /**
   * Stops first, so my own leaving isn't mistaken for being removed and queued writes don't go;
   * a write already on its way finishes. leaveRoom reads the room again if my copy is out of date.
   */
  private async settle(): Promise<Room | null> {
    this.stop();
    if (current === this) current = null;
    await this.chain;
    return this.room;
  }

  /** Leaves by myself: my minutes stay with the crew, plus the ones since my last credit. */
  async leave(): Promise<void> {
    const key = this.key || (await memberKey(this.uid, this.code));
    this.key = key;
    // A tab that was waiting for another tab's session hasn't read them yet.
    const pending = this.pendingDmg || readPending(key);
    this.forget();
    // A waiting tab (or a fresh reload) has no measured clock yet: a sign-in token gives one.
    await this.seedClock();
    // A tab that was waiting for another tab's session has no copy of the room yet: read it. Only a
    // refusal (no longer aboard) or a missing room lets the note go; a read that couldn't be made
    // (offline) is thrown, so nothing is deleted on a guess and the note stays.
    const room =
      (await this.settle()) ??
      (await getRoom(this.code).catch((e: unknown) => {
        if (roomErrorCode(e) === "permission-denied") return null;
        throw e;
      }));
    if (room?.members.some((m) => m.key === key)) await leaveRoom(this.uid, room, key, pending, this.leaveClock());
    else await forgetRoom(this.uid, this.code);
  }

  /**
   * The skipper closes the room for everyone. If the hat moved on meanwhile (this device slept),
   * closing is refused and the sailor leaves it the ordinary way instead ("left"); "gone" when
   * they weren't aboard any more. Offline it throws, and the room stays as it was.
   */
  async close(): Promise<"closed" | "left" | "gone"> {
    await this.seedClock();
    const room = await this.settle();
    if (!room) return "gone";
    return closeRoom(this.uid, room, this.leaveClock());
  }

  stop(): void {
    this.stopped = true;
    this.release();
    this.abort?.abort();
    this.unlisten?.();
    this.unlisten = null;
    for (const un of this.unsubs) un();
    this.unsubs = [];
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    if (this.sendTimer) clearTimeout(this.sendTimer);
    if (this.keepAliveTimer) clearTimeout(this.keepAliveTimer);
    this.sendTimer = null;
    this.keepAliveTimer = null;
    for (const wake of [...this.naps]) wake();
  }
}

/** Lumi's words when the room I'm in is gone (lose): "closed" only when my copy shows it alive, run by someone else. */
export function goneNotice(room: Room | null, myKey: string, serverNow: number): RoomNotice {
  if (!room || room.host === myKey || isRoomOver(room, serverNow)) return "ended";
  return "closed";
}

function sameOffer(a: RoomOffer | null, b: RoomOffer | null): boolean {
  return a === b || (a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b));
}

let current: RoomSession | null = null;

/** Starts the session for this sailor and room, or keeps the one already running for them. */
export function startRoomSession(uid: string, code: string, hint?: SessionHint): void {
  if (current && !current.isStopped && current.uid === uid && current.code === code) return;
  stopRoomSession();
  const session = new RoomSession(uid, code, hint);
  current = session;
  session.begin().catch((e: unknown) => {
    if (current !== session) return;
    console.warn("Ship's study room couldn't start.", e);
    useRooms.setState({ status: "error", alert: roomProblem(roomErrorCode(e), "load") });
  });
}

/** Stops the session. `forget` also lets go of the room on this device, and this tab's saved minutes and Tidy memory (account deletion). */
export function stopRoomSession(opts: { forget?: boolean } = {}): void {
  if (opts.forget) current?.forget();
  current?.stop();
  current = null;
  if (opts.forget) {
    clearSessionKeys(ROOM_TAB_PREFIX);
    useRooms.setState({ current: null, room: null, myKey: null, status: "idle", offer: null, alert: null, deck: null, deckId: null, deckProblem: null, tidyMemo: null });
  }
}

export function roomSession(): RoomSession | null {
  return current && !current.isStopped ? current : null;
}
