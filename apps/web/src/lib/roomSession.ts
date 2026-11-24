// A sailor's live link to the Study Room they're aboard, from joining until they leave, even while
// the panel is closed. Shaped like SyncSession in cloudSync.ts, and like it loaded only when needed.
//
// - One listener on rooms/{code}; each snapshot goes into roomStore.
// - The server's clock, worked out from the `seen` time of each own write.
// - Own writes: merged into one, spaced 15 s apart (the rules refuse closer ones), and carrying
//   the focus minutes earned since the last write (the Kraken's damage, at no extra writes).
// - A keep-alive 10 minutes after the last own write; the skipper's also refreshes the card.
// - Sweeping stale sailors, rewards, offers, and noticing when this sailor is no longer aboard
//   (removal arrives as permission-denied on the listener, or as a snapshot without them).

import { ROOM_LIMITS } from "@ship/shared-types";
import type { Room, RoomMember } from "@ship/shared-types";
import { tidyPatches } from "@ship/active-recall-engine";
import { FIGUREHEADS } from "@ship/ship-theme-kit";
import { useEconomy } from "../stores/economyStore.js";
import { pickOffer, rememberRoom, useRooms } from "../stores/roomStore.js";
import type { RoomNotice, RoomOffer } from "../stores/roomStore.js";
import { useUi } from "../stores/uiStore.js";
import { onFocusMinutes, useVoyage } from "../stores/voyageStore.js";
import {
  closeRoom,
  clearDeadRoom,
  forgetRoom,
  getCard,
  leaveRoom,
  removeSailor,
  roomErrorCode,
  takeHat,
  watchRoom,
  writeSelf,
} from "./rooms.js";
import { creditableMinutes, estimateOffset, isSkipperGone, memberKey, mergeSelf, roomProblem, roomRewards, roomStateFor, sweepAction } from "./roomRules.js";
import type { SelfPatch } from "./roomRules.js";
import { blockEndsAt } from "./voyageLogic.js";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
/** The rules' 15 s between own writes, plus slack for the trip to the server. */
const GAP_MS = ROOM_LIMITS.writeGapSeconds * SECOND + 1500;
/** Phase changes wait this long, so a quick pause-and-resume becomes one write. */
const PHASE_DEBOUNCE_MS = 3000;
const KEEP_ALIVE_MS = ROOM_LIMITS.keepAliveMinutes * MINUTE;
/** The skipper refreshes the card's `alive` on any own write once it's this old (joiners read it). */
const CARD_ALIVE_MS = KEEP_ALIVE_MS - MINUTE;
/** Minutes claimed are worked out a few seconds behind the server's clock, so the rules never find them early. */
const CLOCK_MARGIN_MS = 5 * SECOND;
/** A clock end that moved less than this isn't worth a write. */
const END_DRIFT_MS = MINUTE;
const MAX_REFUSALS = 3;
const SWEEP_JITTER_MS = 30 * SECOND;
const OFFER_EVERY_MS = 5 * SECOND;
const RELISTEN_MS = 30 * SECOND;
const LIFETIME_MS = ROOM_LIMITS.lifetimeHours * 60 * MINUTE;

/** Thrown into a waiting write when the session ends first. */
class SessionStopped extends Error {
  constructor() {
    super("The room session ended.");
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
  private lastAckLocal = 0;
  /** Focus minutes earned aboard and not yet credited. */
  private pendingDmg = 0;
  /** After a refused write, the next one leaves the minutes out, in case they were the problem. */
  private holdDmg = false;
  private refusals = 0;
  private probe: { sent: number; ack: number | null; before: number | null; seen: number | null } | null = null;
  /** When this device last refreshed the card's `alive` (local ms); 0 = unknown. */
  private cardAliveLocal = 0;
  /** Waits in progress, woken at once when the session stops. */
  private naps = new Set<() => void>();

  constructor(
    readonly uid: string,
    readonly code: string,
    hint?: SessionHint,
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

  currentRoom(): Room | null {
    return this.room;
  }

  private me(): RoomMember | undefined {
    return this.room?.members.find((m) => m.key === this.key);
  }

  async begin(): Promise<void> {
    this.key = await memberKey(this.uid, this.code);
    if (this.stopped) return;
    useRooms.setState({ myKey: this.key, status: this.room ? "aboard" : "joining" });
    this.listen();
    this.unsubs.push(
      onFocusMinutes((minutes) => {
        if (minutes > 0) this.pendingDmg += minutes;
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

  private listen(): void {
    this.unlisten?.();
    this.unlisten = watchRoom(this.code, {
      room: (r, meta) => this.onRoom(r, meta.fromCache),
      error: (code) => void this.onError(code),
    });
  }

  // ---- Snapshots --------------------------------------------------------------------------------

  private onRoom(next: Room | null, fromCache: boolean): void {
    if (this.stopped || fromCache) return;
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
    this.calibrate(me);
    if (this.sending && me.seenAt !== this.sending.before) this.sending = null;
    useRooms.setState({ room: next, myKey: this.key, serverOffset: this.offset, status: "aboard", ...(useRooms.getState().status === "error" ? { error: null } : {}) });
    rememberRoom(next, next.host === this.key);

    if (prev) this.pay(prev, next);
    else this.scheduleKeepAlive();
    // The hat just came to me: the card's `alive` is someone else's, so refresh it soon.
    if (prev && next.host === this.key && prev.host !== this.key) {
      this.cardAliveLocal = 0;
      this.queueSelf({});
    }
    this.checkDeck(prev, next);
    this.voyageChanged();
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
    this.setOffset(estimateOffset(p.sent, p.ack, me.seenAt));
  }

  private setOffset(offset: number): void {
    this.offset = offset;
    this.calibrated = true;
    this.probe = null;
    useRooms.setState({ serverOffset: offset });
  }

  private pay(prev: Room, next: Room): void {
    const deck = useRooms.getState().deck;
    const g = next.game;
    const opts = g?.kind === "tidy" && deck ? { tidyPatches: tidyPatches(deck, g.seed, g.seats.length).length } : {};
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
      if (store.deck) useRooms.setState({ deck: null });
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
    const offer = pickOffer(room, this.key, { phase: v.phase, prepEndsAt: v.prepEndsAt }, this.serverNow(), store.lastSailSeen);
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
    useRooms.setState({ status: "error", error: roomProblem(code, "load") });
    this.later(RELISTEN_MS, () => this.listen());
  }

  /** No longer aboard. `kind` from a snapshot without me; null when the room went unreadable or missing (the card tells which). */
  private async lose(kind: "removed" | "drifted" | null, last?: Room): Promise<void> {
    if (this.stopped) return;
    const room = last ?? this.room;
    const serverNow = this.serverNow();
    this.stop();
    let notice: RoomNotice = kind ?? "gone";
    if (!kind) {
      const card = await getCard(this.code).catch(() => undefined);
      if (card === null) notice = room && (serverNow >= room.at + LIFETIME_MS || isSkipperGone(room, serverNow)) ? "ended" : "closed";
    }
    void forgetRoom(this.uid, this.code).catch(() => undefined);
    if (current === this) current = null;
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
      notice,
      noticeRoom: name ? { code: this.code, name: [name[0], name[1]] } : null,
    });
  }

  // ---- The timer --------------------------------------------------------------------------------

  /** Sends my state and when my block ends, from the voyage's phase only (idle pauses and a hidden tab are never sent). */
  private voyageChanged(): void {
    const me = this.me();
    if (!me || this.stopped) return;
    const v = useVoyage.getState();
    if (v.phase === "drifting" && v.pausedReason === "idle") return;
    const st = roomStateFor(v.phase, v.prepEndsAt);
    const localEnd = st === 1 || st === 2 ? blockEndsAt(v, Date.now()) : null;
    const endsAt = localEnd === null ? null : Math.round(localEnd + this.offset);
    const sent = this.sending?.patch;
    const knownSt = this.queued?.st ?? sent?.st ?? me.state;
    const knownEnd = this.queued?.endsAt !== undefined ? this.queued.endsAt : sent?.endsAt !== undefined ? sent.endsAt : me.endsAt;
    const sameEnd = endsAt === null ? knownEnd === null : knownEnd !== null && Math.abs(endsAt - knownEnd) < END_DRIFT_MS;
    if (knownSt !== st || !sameEnd) this.queueSelf({ st, endsAt }, PHASE_DEBOUNCE_MS);
  }

  // ---- Own writes -------------------------------------------------------------------------------

  /** Merged into the next own write, sent as soon as the 15 s gap allows (phase changes debounce 3 s). */
  queueSelf(patch: SelfPatch, debounceMs = 0): void {
    if (this.stopped) return;
    const { addDmg, ...rest } = patch;
    if (addDmg && addDmg > 0) this.pendingDmg += addDmg;
    this.queued = this.queued ? mergeSelf(this.queued, rest) : rest;
    this.sendNotBefore = Math.max(this.sendNotBefore, Date.now() + debounceMs);
    this.schedule();
  }

  /** A cleared Tidy the Deck patch, added to what this game's progress already says. */
  queueTidy(seed: number, patch: number, ms: number, mixups: number): void {
    const me = this.me();
    const q = this.queued?.tidy;
    const base = q?.gid === seed ? q : me?.tidy.gid === seed ? { gid: seed, g: me.tidy.patches, gt: me.tidy.ms, gp: me.tidy.mixups } : { gid: seed, g: 0, gt: 0, gp: 0 };
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

  /** When (local ms) the rules will next accept an own write. */
  private gapAt(): number {
    const me = this.me();
    return Math.max(this.lastAckLocal ? this.lastAckLocal + GAP_MS : 0, me ? me.seenAt - this.offset + GAP_MS : 0);
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
      this.probe = { sent, ack: null, before, seen: null };
      this.sending = { patch: self, before };
      try {
        const out = await fn(self);
        this.acked();
        return out;
      } catch (e) {
        this.probe = null;
        this.sending = null;
        this.putBack(self);
        throw e;
      }
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  /** Takes the queued changes for a write, adding the minutes the rules will accept now. */
  private take(): SelfPatch {
    const self: SelfPatch = { ...(this.queued ?? {}) };
    this.queued = null;
    this.sendNotBefore = 0;
    if (this.sendTimer) clearTimeout(this.sendTimer);
    this.sendTimer = null;
    const me = this.me();
    if (me && this.calibrated && !this.holdDmg) {
      const add = Math.min(Math.floor(this.pendingDmg), creditableMinutes(me, this.serverNow() - CLOCK_MARGIN_MS));
      if (add > 0) {
        self.addDmg = add;
        this.pendingDmg -= add;
      }
    }
    return self;
  }

  private putBack(self: SelfPatch): void {
    const { addDmg, ...rest } = self;
    this.pendingDmg += addDmg ?? 0;
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
      if (p.seen !== null) this.setOffset(estimateOffset(p.sent, p.ack, p.seen));
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
    if (!this.queued || this.stopped) return;
    this.ownWrite(async (self) => {
      const alive = this.room?.host === this.key && Date.now() - this.cardAliveLocal >= CARD_ALIVE_MS;
      await writeSelf(this.code, this.key, self, { cardAlive: alive });
      if (alive) this.cardAliveLocal = Date.now();
    }).catch((e: unknown) => this.writeFailed(e));
  }

  private writeFailed(e: unknown): void {
    if (this.stopped || e instanceof SessionStopped) return;
    const code = roomErrorCode(e);
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
    useRooms.setState({ error: roomProblem(code, "write") });
  }

  private scheduleKeepAlive(): void {
    if (this.stopped) return;
    if (this.keepAliveTimer) clearTimeout(this.keepAliveTimer);
    const me = this.me();
    const last = Math.max(this.lastAckLocal, me ? me.seenAt - this.offset : 0);
    this.keepAliveTimer = setTimeout(
      () => {
        this.keepAliveTimer = null;
        this.queueSelf({});
      },
      Math.max(0, last + KEEP_ALIVE_MS - Date.now()),
    );
  }

  // ---- Tidying up -------------------------------------------------------------------------------

  /** Each minute: a room past 12 hours is cleared; the skipper sweeps a sailor gone 25 minutes; with no skipper, one sailor takes the hat. A lost race fails harmlessly. */
  private async tidyUp(): Promise<void> {
    const room = this.room;
    if (!room || this.stopped) return;
    const now = this.serverNow();
    try {
      if (now >= room.at + LIFETIME_MS) {
        await clearDeadRoom(this.code);
        return;
      }
      const action = sweepAction(room, this.key, now);
      if (action?.kind === "take-hat") {
        await this.ownWrite(async (self) => {
          const fresh = this.room;
          if (fresh && fresh.host !== this.key) await takeHat(fresh, this.key, self);
        });
        this.cardAliveLocal = Date.now();
      } else if (action?.kind === "sweep") await removeSailor(room, this.key, action.key, { ban: false });
    } catch {
      // Another sailor got there first, or the rules say not yet.
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
    const room = await this.settle();
    if (room) await leaveRoom(this.uid, room, this.key, this.pendingDmg, this.serverNow());
    else await forgetRoom(this.uid, this.code);
  }

  /** The skipper closes the room for everyone. */
  async close(): Promise<void> {
    const room = await this.settle();
    if (room) await closeRoom(this.uid, room);
  }

  stop(): void {
    this.stopped = true;
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
    useRooms.setState({ status: "error", error: roomProblem(roomErrorCode(e), "load") });
  });
}

/** Stops the session. `forget` also lets go of the room on this device (account deletion). */
export function stopRoomSession(opts: { forget?: boolean } = {}): void {
  current?.stop();
  current = null;
  if (opts.forget) useRooms.setState({ current: null, room: null, myKey: null, status: "idle", offer: null, deck: null });
}

export function roomSession(): RoomSession | null {
  return current && !current.isStopped ? current : null;
}
