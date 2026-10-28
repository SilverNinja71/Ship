// Crew rooms without sockets: the server feeds raw text frames in and gets
// ServerMessages out, so everything here runs in tests with a fake clock.
//
// Who hears what: the joiner gets `welcome` (with itself in `members`) and the
// others get member-joined / member-left. member-updated, quest and shout go
// to the whole room, sender included, so every client shows the server's copy.
//
// Quest progress lives only in memory. It survives a room emptying (a crew
// that comes back keeps its beast's hp) but not a server restart.

import { randomUUID } from "node:crypto";
import type { ClientMessage, CrewMember, QuestState, ServerMessage } from "@ship/shared-types";
import { DAMAGE_PER_FOCUS_MINUTE, MAX_CREW_SIZE } from "@ship/shared-types";
import { parseClientMessage } from "./protocol.js";
import type { JoinFields } from "./protocol.js";
import { damageQuest, newQuest } from "./quest.js";
import { SlidingWindowLimiter, TokenBucket } from "./rateLimit.js";

export interface CrewHubOptions {
  /** Clock in epoch ms. Tests pass a fake one. */
  now?: () => number;
  newPeerId?: () => string;
  /** Shouts per member per window. Default 5 per 10 s. */
  shoutLimit?: { max: number; windowMs: number };
  /** Coarse flood guard per connection. ICE trickle in a full mesh is bursty, so it's generous. */
  messageLimit?: { burst: number; perSecond: number };
  /** Focus time allowed beyond the wall clock, for timer and network jitter. Default 15 s. */
  tickSlackMs?: number;
  /** Rooms kept in memory (with their quests); the longest-empty go first. Default 1000. */
  maxRooms?: number;
}

export type SendFn = (message: ServerMessage) => void;

export interface CrewConnection {
  readonly peerId: string;
  /** The room this connection is in, or null. */
  readonly room: string | null;
  /** Feeds one text frame from the client. */
  handle(raw: string): void;
  /** The socket closed: leave the room. Safe to call twice. */
  disconnect(): void;
}

export interface CrewStats {
  /** Rooms with at least one member. */
  rooms: number;
  members: number;
  connections: number;
}

type ErrorCode = Extract<ServerMessage, { t: "error" }>["code"];
/** Everything a member can send once aboard. */
type InRoomMessage = Exclude<ClientMessage, { t: "ping" | "join" }>;

interface Conn {
  peerId: string;
  send: SendFn;
  room: Room | null;
  open: boolean;
  messages: TokenBucket;
  shouts: SlidingWindowLimiter;
  /** Already told this flood to slow down, so the errors don't become a flood too. */
  throttled: boolean;
}

interface Member {
  conn: Conn;
  info: CrewMember;
  /** Focus minutes have been credited up to this instant (the anti-cheat clock). */
  creditedUntil: number;
}

interface Room {
  name: string;
  members: Map<string, Member>;
  quest: QuestState;
  emptiedAt: number | null;
}

/** Ticks that round to nothing after clamping are refused rather than broadcast. */
const MIN_TICK_MINUTES = 0.001;

export class CrewHub {
  private readonly rooms = new Map<string, Room>();
  private connections = 0;
  private readonly now: () => number;
  private readonly newPeerId: () => string;
  private readonly shoutLimit: { max: number; windowMs: number };
  private readonly messageLimit: { burst: number; perSecond: number };
  private readonly tickSlackMs: number;
  private readonly maxRooms: number;

  constructor(options: CrewHubOptions = {}) {
    this.now = options.now ?? Date.now;
    this.newPeerId = options.newPeerId ?? randomUUID;
    this.shoutLimit = options.shoutLimit ?? { max: 5, windowMs: 10_000 };
    this.messageLimit = options.messageLimit ?? { burst: 200, perSecond: 20 };
    this.tickSlackMs = options.tickSlackMs ?? 15_000;
    this.maxRooms = options.maxRooms ?? 1000;
  }

  /** Registers a new socket. `send` must not throw. */
  connect(send: SendFn): CrewConnection {
    const conn: Conn = {
      peerId: this.newPeerId(),
      send,
      room: null,
      open: true,
      messages: new TokenBucket(this.messageLimit.burst, this.messageLimit.perSecond, this.now()),
      shouts: new SlidingWindowLimiter(this.shoutLimit.max, this.shoutLimit.windowMs),
      throttled: false,
    };
    this.connections++;
    return {
      peerId: conn.peerId,
      get room() {
        return conn.room?.name ?? null;
      },
      handle: (raw) => this.handle(conn, raw),
      disconnect: () => {
        if (!conn.open) return;
        conn.open = false;
        this.connections--;
        this.leave(conn);
      },
    };
  }

  stats(): CrewStats {
    let rooms = 0;
    let members = 0;
    for (const room of this.rooms.values()) {
      if (room.members.size === 0) continue;
      rooms++;
      members += room.members.size;
    }
    return { rooms, members, connections: this.connections };
  }

  /** The room's quest, including rooms that are empty right now. */
  questOf(room: string): QuestState | null {
    return this.rooms.get(room)?.quest ?? null;
  }

  private handle(conn: Conn, raw: string): void {
    if (!conn.open) return;
    if (!conn.messages.tryTake(this.now())) {
      if (!conn.throttled) this.error(conn, "rate-limited", "Too many messages; slow down.");
      conn.throttled = true;
      return;
    }
    conn.throttled = false;

    const parsed = parseClientMessage(raw);
    if (!parsed.ok) return this.error(conn, "bad-message", parsed.reason);
    const message = parsed.message;
    switch (message.t) {
      case "ping":
        return conn.send({ t: "pong" });
      case "join":
        return this.join(conn, message.room, message.member);
      default: {
        const member = conn.room?.members.get(conn.peerId);
        if (!conn.room || !member) return this.error(conn, "not-joined", "Join a room first.");
        return this.inRoom(conn.room, member, message);
      }
    }
  }

  private inRoom(room: Room, member: Member, message: InRoomMessage): void {
    const conn = member.conn;
    switch (message.t) {
      case "leave":
        return this.leave(conn);

      case "presence":
        member.info = { ...member.info, ...message.patch };
        return this.broadcast(room, { t: "member-updated", member: member.info });

      case "focus-tick": {
        // Anti-cheat: a member can't be credited with more focus time than has
        // passed on the server's clock since they joined (plus a little slack).
        const now = this.now();
        const allowed = (now + this.tickSlackMs - member.creditedUntil) / 60_000;
        const minutes = Math.min(message.minutes, allowed);
        if (minutes < MIN_TICK_MINUTES) return this.error(conn, "rate-limited", "Focus ticks are running ahead of the clock.");
        member.creditedUntil += minutes * 60_000;
        const hit = damageQuest(room.quest, minutes * DAMAGE_PER_FOCUS_MINUTE);
        room.quest = hit.quest;
        return this.broadcast(room, {
          t: "quest",
          quest: hit.quest,
          hit: { by: conn.peerId, damage: hit.damage },
          defeatedBeast: hit.defeatedBeast,
        });
      }

      case "signal": {
        const target = message.to === conn.peerId ? undefined : room.members.get(message.to);
        if (!target) return this.error(conn, "bad-message", "That peer isn't in your room.");
        return target.conn.send({ t: "signal", from: conn.peerId, data: message.data });
      }

      case "shout": {
        const now = this.now();
        if (!conn.shouts.tryTake(now)) return this.error(conn, "rate-limited", "Too many shouts; wait a few seconds.");
        return this.broadcast(room, { t: "shout", from: conn.peerId, name: member.info.name, text: message.text, at: now });
      }
    }
  }

  private join(conn: Conn, roomName: string, fields: JoinFields): void {
    if (conn.room?.name === roomName) return this.error(conn, "bad-message", `Already aboard "${roomName}".`);
    const existing = this.rooms.get(roomName);
    if (existing && existing.members.size >= MAX_CREW_SIZE) {
      return this.error(conn, "room-full", `"${roomName}" already has ${MAX_CREW_SIZE} sailors aboard.`);
    }
    // Joining another room means leaving this one first.
    this.leave(conn);
    const room = existing ?? this.createRoom(roomName);

    const now = this.now();
    const info: CrewMember = {
      peerId: conn.peerId,
      name: fields.name,
      avatar: fields.avatar,
      shipId: fields.shipId,
      state: fields.state,
      focusMinutesToday: fields.focusMinutesToday,
      seat: lowestFreeSeat(room),
      joinedAt: now,
      audio: fields.audio,
      video: fields.video,
    };
    room.members.set(conn.peerId, { conn, info, creditedUntil: now });
    room.emptiedAt = null;
    conn.room = room;

    const members = [...room.members.values()].map((m) => m.info).sort((a, b) => a.seat - b.seat);
    conn.send({ t: "welcome", peerId: conn.peerId, room: room.name, members, quest: room.quest });
    this.broadcast(room, { t: "member-joined", member: info }, conn.peerId);
  }

  private leave(conn: Conn): void {
    const room = conn.room;
    if (!room) return;
    conn.room = null;
    if (!room.members.delete(conn.peerId)) return;
    this.broadcast(room, { t: "member-left", peerId: conn.peerId });
    if (room.members.size === 0) room.emptiedAt = this.now();
  }

  private createRoom(name: string): Room {
    if (this.rooms.size >= this.maxRooms) this.forgetLongestEmptyRoom();
    const room: Room = { name, members: new Map(), quest: newQuest(), emptiedAt: null };
    this.rooms.set(name, room);
    return room;
  }

  private forgetLongestEmptyRoom(): void {
    let oldest: Room | null = null;
    for (const room of this.rooms.values()) {
      if (room.emptiedAt !== null && (oldest === null || room.emptiedAt < oldest.emptiedAt!)) oldest = room;
    }
    if (oldest) this.rooms.delete(oldest.name);
  }

  private broadcast(room: Room, message: ServerMessage, exceptPeerId?: string): void {
    for (const member of room.members.values()) {
      if (member.conn.peerId !== exceptPeerId) member.conn.send(message);
    }
  }

  private error(conn: Conn, code: ErrorCode, message: string): void {
    conn.send({ t: "error", code, message });
  }
}

function lowestFreeSeat(room: Room): number {
  const taken = new Set([...room.members.values()].map((m) => m.info.seat));
  let seat = 0;
  while (taken.has(seat)) seat++;
  return seat;
}
