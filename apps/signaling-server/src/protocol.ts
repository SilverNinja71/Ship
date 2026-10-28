// Checks untrusted frames from crew clients and rebuilds them as clean
// ClientMessages. Only known fields survive, so a client can't slip in a
// peerId, a seat or a `from`; names and shouts lose control characters.

import type { AvatarLoadout, AvatarState, ClientMessage, CrewMemberPatch, IceCandidate, RtcSignal } from "@ship/shared-types";

/** Biggest frame the server reads. An SDP offer with audio and video is ~5-10 KB. */
export const MAX_MESSAGE_BYTES = 64 * 1024;
export const MAX_NAME_LENGTH = 32;
export const MAX_SHOUT_LENGTH = 280;
const MAX_ID_LENGTH = 64;
const MAX_SDP_LENGTH = 48 * 1024;
const MAX_CANDIDATE_LENGTH = 2048;
const MINUTES_PER_DAY = 24 * 60;

/** The member fields a client sends with `join` (presence patches are a subset). */
export type JoinFields = Extract<ClientMessage, { t: "join" }>["member"];

export type ParseResult = { ok: true; message: ClientMessage } | { ok: false; reason: string };

type Fields = Record<string, unknown>;

class Invalid extends Error {}

function fail(reason: string): never {
  throw new Invalid(reason);
}

function fields(value: unknown, what: string): Fields {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${what} must be an object`);
  return value as Fields;
}

const ROOM_NAME = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

/** "  Study-Crew " becomes "study-crew"; null unless it's 1-32 letters, digits or inner dashes. */
export function normalizeRoomName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const room = value.trim().toLowerCase();
  return ROOM_NAME.test(room) ? room : null;
}

// Control characters, invisible separators and bidi overrides (used to spoof names).
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u200b\u200e\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;

/** Removes control and bidi characters, collapses whitespace and trims. */
export function cleanText(value: string): string {
  return value.replace(UNSAFE_TEXT, " ").replace(/\s+/g, " ").trim();
}

/** Cuts to `max` code points, so an emoji is never split in half. */
function truncate(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length <= max ? value : chars.slice(0, max).join("").trimEnd();
}

function text(value: unknown, what: string, min: number, max: number): string {
  if (typeof value !== "string") fail(`${what} must be a string`);
  const cleaned = cleanText(value);
  const length = Array.from(cleaned).length;
  if (length < min) fail(`${what} is empty`);
  if (length > max) fail(`${what} is longer than ${max} characters`);
  return cleaned;
}

const ID = /^[a-z0-9][a-z0-9-]*$/;

function id(value: unknown, what: string): string {
  if (typeof value !== "string" || value.length > MAX_ID_LENGTH || !ID.test(value)) fail(`${what} must be a lowercase id`);
  return value;
}

const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function color(value: unknown, what: string): string {
  if (typeof value !== "string" || !HEX_COLOR.test(value)) fail(`${what} must be a hex color like #5A3A22`);
  return value;
}

function bool(value: unknown, what: string): boolean {
  if (typeof value !== "boolean") fail(`${what} must be true or false`);
  return value;
}

// A Record so the compiler flags this list if AvatarState gains a value.
const AVATAR_STATES: Record<AvatarState, true> = { SAILING_FOCUS: true, SHORE_LEAVE_BREAK: true, DRIFTING_IDLE: true };

function avatarState(value: unknown): AvatarState {
  if (typeof value !== "string" || !Object.hasOwn(AVATAR_STATES, value)) {
    fail(`state must be one of ${Object.keys(AVATAR_STATES).join(", ")}`);
  }
  return value as AvatarState;
}

// Catalog ids (skin, hat, ...) are only format-checked: the server doesn't
// carry the catalog, and renderers fall back for ids they don't know.
const AVATAR_FIELDS: Record<keyof AvatarLoadout, (value: unknown, what: string) => string> = {
  name: (value, what) => text(value, what, 0, MAX_NAME_LENGTH),
  skin: id,
  hair: id,
  hairColor: color,
  hat: id,
  coat: id,
  coatColor: color,
  accessory: id,
  tool: id,
};

function avatar(value: unknown): AvatarLoadout {
  const input = fields(value, "avatar");
  const out: Fields = {};
  for (const [key, check] of Object.entries(AVATAR_FIELDS)) {
    if (!Object.hasOwn(input, key)) fail(`avatar.${key} is missing`);
    out[key] = check(input[key], `avatar.${key}`);
  }
  return out as unknown as AvatarLoadout;
}

type MemberField = keyof JoinFields;

const MEMBER_FIELDS: { [K in MemberField]-?: (value: unknown) => JoinFields[K] } = {
  name: (value) => text(value, "name", 1, MAX_NAME_LENGTH),
  avatar,
  shipId: (value) => id(value, "shipId"),
  state: avatarState,
  focusMinutesToday: (value) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MINUTES_PER_DAY) {
      fail(`focusMinutesToday must be a number from 0 to ${MINUTES_PER_DAY}`);
    }
    return value;
  },
  audio: (value) => bool(value, "audio"),
  video: (value) => bool(value, "video"),
};

/** Keeps only the fields a client may set; seat, peerId and the like are dropped. */
function memberFields(value: unknown, what: string, requireAll: boolean): CrewMemberPatch {
  const input = fields(value, what);
  const out: Fields = {};
  for (const key of Object.keys(MEMBER_FIELDS) as MemberField[]) {
    if (!Object.hasOwn(input, key)) {
      if (requireAll) fail(`${what}.${key} is missing`);
      continue;
    }
    out[key] = MEMBER_FIELDS[key](input[key]);
  }
  return out as CrewMemberPatch;
}

function iceCandidate(value: unknown): IceCandidate {
  const { candidate, sdpMid, sdpMLineIndex } = fields(value, "data.candidate");
  if (typeof candidate !== "string" || candidate.length > MAX_CANDIDATE_LENGTH) fail("data.candidate.candidate must be a string");
  const out: IceCandidate = { candidate };
  if (sdpMid !== undefined) {
    if (sdpMid !== null && (typeof sdpMid !== "string" || sdpMid.length > MAX_ID_LENGTH)) fail("data.candidate.sdpMid must be a short string or null");
    out.sdpMid = sdpMid;
  }
  if (sdpMLineIndex !== undefined) {
    if (sdpMLineIndex !== null && (typeof sdpMLineIndex !== "number" || !Number.isInteger(sdpMLineIndex) || sdpMLineIndex < 0 || sdpMLineIndex > 1023)) {
      fail("data.candidate.sdpMLineIndex must be a small integer or null");
    }
    out.sdpMLineIndex = sdpMLineIndex;
  }
  return out;
}

function rtcSignal(value: unknown): RtcSignal {
  const input = fields(value, "data");
  const kind = input.kind;
  if (kind === "offer" || kind === "answer") {
    const sdp = input.sdp;
    if (typeof sdp !== "string" || sdp.length === 0 || sdp.length > MAX_SDP_LENGTH) fail("data.sdp must be an SDP string");
    return { kind, sdp };
  }
  if (kind === "ice") return { kind, candidate: iceCandidate(input.candidate) };
  fail("data.kind must be offer, answer or ice");
}

function clientMessage(value: unknown): ClientMessage {
  const input = fields(value, "message");
  switch (input.t) {
    case "join": {
      const room = normalizeRoomName(input.room);
      if (room === null) fail("room must be 1-32 letters, digits or dashes");
      return { t: "join", room, member: memberFields(input.member, "member", true) as JoinFields };
    }
    case "presence": {
      const patch = memberFields(input.patch, "patch", false);
      if (Object.keys(patch).length === 0) fail("patch has nothing to change");
      return { t: "presence", patch };
    }
    case "focus-tick": {
      const minutes = input.minutes;
      if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) fail("minutes must be a positive number");
      return { t: "focus-tick", minutes };
    }
    case "signal": {
      const to = input.to;
      if (typeof to !== "string" || to.length === 0 || to.length > MAX_ID_LENGTH) fail("to must be a peer id");
      return { t: "signal", to, data: rtcSignal(input.data) };
    }
    case "shout": {
      if (typeof input.text !== "string") fail("text must be a string");
      const shout = truncate(cleanText(input.text), MAX_SHOUT_LENGTH);
      if (shout === "") fail("shout is empty");
      return { t: "shout", text: shout };
    }
    case "ping":
      return { t: "ping" };
    case "leave":
      return { t: "leave" };
    default:
      fail("unknown message type");
  }
}

/** Parses one text frame. Never throws on bad input; it says why instead. */
export function parseClientMessage(raw: string): ParseResult {
  if (raw.length > MAX_MESSAGE_BYTES) return { ok: false, reason: "message is too big" };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "message is not valid JSON" };
  }
  try {
    return { ok: true, message: clientMessage(data) };
  } catch (err) {
    if (err instanceof Invalid) return { ok: false, reason: err.message };
    throw err;
  }
}
