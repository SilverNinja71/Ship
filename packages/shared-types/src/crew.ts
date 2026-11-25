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

// Study Rooms keep no quest state: every device works the quest out from the room's damage
// total, so these give the same answer however the total was added up. (The crew server's
// damageQuest is different: there, one hit defeats at most one beast.)

/** Total hp of one pass through QUEST_BEASTS (120 + 200 + 300 + 420); then the cycle repeats. */
const QUEST_CYCLE_HP = QUEST_BEASTS.reduce((sum, beast) => sum + beast.maxHp, 0);

// Whole focus minutes in practice, but keep float noise (119.99999999) out of hp, as damageQuest does.
function roundHp(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** A damage total as a usable number: nothing negative, and junk counts as no damage. */
function cleanTotal(total: number): number {
  return Number.isFinite(total) && total > 0 ? roundHp(total) : 0;
}

/** How many beasts `total` damage has defeated, counted from the first Kraken, and the damage dealt to the current one. */
function walkQuest(total: number): { defeated: number; onCurrent: number } {
  const t = cleanTotal(total);
  const cycles = Math.floor(t / QUEST_CYCLE_HP);
  let onCurrent = roundHp(t - cycles * QUEST_CYCLE_HP);
  let defeated = cycles * QUEST_BEASTS.length;
  for (const beast of QUEST_BEASTS) {
    if (onCurrent < beast.maxHp) break;
    onCurrent = roundHp(onCurrent - beast.maxHp);
    defeated += 1;
  }
  return { defeated, onCurrent };
}

/**
 * The beast a crew faces after `total` focus minutes; damage past a beast carries on to the next,
 * so a sum gives the same answer in any order. `beastIndex` is the beast's place in QUEST_BEASTS
 * (0–3); `defeated` counts every beast beaten so far.
 */
export function questFromDamage(total: number): QuestState & { beastIndex: number } {
  const { defeated, onCurrent } = walkQuest(total);
  const beastIndex = defeated % QUEST_BEASTS.length;
  const beast = QUEST_BEASTS[beastIndex]!;
  const rewards: FigureheadId[] = [];
  for (const won of QUEST_BEASTS.slice(0, Math.min(defeated, QUEST_BEASTS.length))) {
    if (!rewards.includes(won.reward)) rewards.push(won.reward);
  }
  return { beastId: beast.id, hp: roundHp(beast.maxHp - onCurrent), maxHp: beast.maxHp, defeated, rewards, beastIndex };
}

/** At most this many beasts are listed per call, so a forged total can't make a caller loop for ages. */
const MAX_DEFEATS_LISTED = 100;

/** Beasts newly defeated between two totals, counted from the start (index 0 = the first Kraken). */
export function beastsDefeatedBetween(before: number, after: number): { index: number; beastId: QuestBeastId; reward: FigureheadId }[] {
  const from = walkQuest(before).defeated;
  const to = Math.min(walkQuest(after).defeated, from + MAX_DEFEATS_LISTED);
  const out: { index: number; beastId: QuestBeastId; reward: FigureheadId }[] = [];
  for (let index = from; index < to; index++) {
    const beast = QUEST_BEASTS[index % QUEST_BEASTS.length]!;
    out.push({ index, beastId: beast.id, reward: beast.reward });
  }
  return out;
}

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
