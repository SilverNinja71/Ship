// Crew rooms: the wire protocol between the web app and the signaling server.
// Every message is one JSON object with a `t` (type) field.

import type { AvatarLoadout, AvatarState, FigureheadId } from "./ship.js";

export const SIGNALING_DEFAULT_PORT = 8787;
export const MAX_CREW_SIZE = 8;

export interface CrewMember {
  peerId: string;
  name: string;
  avatar: AvatarLoadout;
  shipId: string;
  state: AvatarState;
  /** Focus minutes logged today, shown on the crew list. */
  focusMinutesToday: number;
  /** Seat at the galley tables, 0..MAX_CREW_SIZE-1, assigned by the server. */
  seat: number;
  joinedAt: number;
  /** Mic/camera flags so others know whether to expect a stream. */
  audio: boolean;
  video: boolean;
}

export type CrewMemberPatch = Partial<Pick<CrewMember, "name" | "avatar" | "shipId" | "state" | "focusMinutesToday" | "audio" | "video">>;

export type QuestBeastId = "procrastination-kraken" | "doomscroll-leviathan" | "notification-siren" | "snooze-serpent";

export interface QuestBeast {
  id: QuestBeastId;
  name: string;
  maxHp: number;
  /** Figurehead the whole crew unlocks for defeating it. */
  reward: FigureheadId;
}

/** Beasts are fought in this order; after the last one the cycle repeats. */
export const QUEST_BEASTS: QuestBeast[] = [
  { id: "procrastination-kraken", name: "The Procrastination Kraken", maxHp: 120, reward: "kraken" },
  { id: "doomscroll-leviathan", name: "The Doomscroll Leviathan", maxHp: 200, reward: "dragon" },
  { id: "notification-siren", name: "The Notification Siren", maxHp: 300, reward: "mermaid" },
  { id: "snooze-serpent", name: "The Snooze Serpent", maxHp: 420, reward: "swordfish" },
];

export interface QuestState {
  beastId: QuestBeastId;
  hp: number;
  maxHp: number;
  /** How many beasts this room has defeated. */
  defeated: number;
  /** Figureheads this room has earned (members claim them on their own ship). */
  rewards: FigureheadId[];
}

/** 1 focus minute = 1 damage. */
export const DAMAGE_PER_FOCUS_MINUTE = 1;

export interface IceCandidate {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}

export type RtcSignal =
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | { kind: "ice"; candidate: IceCandidate };

export type ClientMessage =
  | {
      t: "join";
      room: string;
      member: Pick<CrewMember, "name" | "avatar" | "shipId" | "state" | "focusMinutesToday" | "audio" | "video">;
    }
  | { t: "presence"; patch: CrewMemberPatch }
  /** Focus minutes since the last tick; deals damage to the room's beast. */
  | { t: "focus-tick"; minutes: number }
  | { t: "signal"; to: string; data: RtcSignal }
  | { t: "shout"; text: string }
  | { t: "ping" }
  | { t: "leave" };

export type ServerMessage =
  | { t: "welcome"; peerId: string; room: string; members: CrewMember[]; quest: QuestState }
  | { t: "member-joined"; member: CrewMember }
  | { t: "member-updated"; member: CrewMember }
  | { t: "member-left"; peerId: string }
  | { t: "quest"; quest: QuestState; hit: { by: string; damage: number } | null; defeatedBeast: QuestBeastId | null }
  | { t: "signal"; from: string; data: RtcSignal }
  | { t: "shout"; from: string; name: string; text: string; at: number }
  | { t: "error"; code: "room-full" | "bad-message" | "not-joined" | "rate-limited"; message: string }
  | { t: "pong" };

/** A friend's study session replayed as a translucent "ghost ship" when they're offline. */
export interface GhostRecording {
  id: string;
  name: string;
  avatar: AvatarLoadout;
  shipId: string;
  recordedAt: number;
  /** The state timeline of one session, in order. */
  segments: { state: AvatarState; seconds: number }[];
}
