// Study Rooms' own rules, with no database in sight: codes and invite links, sailor keys,
// made-up names, the only builders of what a sailor writes, reading a room back, who's here and
// who skippers, sailing together, the Kraken's damage, rewards, and the two break games.
// Every number the database also checks comes from ROOM_LIMITS (firestore.rules mirrors them),
// and bottleStep follows the rules' turn check exactly, so a turn the app sends is one the
// database accepts.

import {
  NICK_ADJECTIVES,
  NICK_NOUNS,
  NICK_NUMBER_SKIP,
  QUEST_BEASTS,
  ROOM_ACCESSORIES,
  ROOM_GAME_ENGINE,
  ROOM_CHEERS,
  ROOM_CODE_ALPHABET,
  ROOM_COSTUMES,
  ROOM_LIMITS,
  ROOM_NAME_FIRST,
  ROOM_NAME_PLACE,
  ROOM_REPORT_REASONS,
  ROOM_SUBJECTS,
  STICKER_IDS,
  beastsDefeatedBetween,
  questFromDamage,
} from "@ship/shared-types";
import type {
  BottleCard,
  BottleGame,
  QuestState,
  Room,
  RoomCard,
  RoomCostume,
  RoomDeckRef,
  RoomGame,
  RoomLook,
  RoomMember,
  RoomMode,
  RoomReportReason,
  RoomSail,
  RoomState,
  TidyGame,
  VoyagePhase,
  VoyagePresetId,
} from "@ship/shared-types";
import { MATCH_PENALTY_MS } from "@ship/active-recall-engine";
import type { PracticeCard } from "@ship/active-recall-engine";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;
const KEY_PATTERN = /^[0-9a-f]{64}$/;

// ---- Codes and links ------------------------------------------------------------------------

/** A fresh room code. 256 is a multiple of 32, so `byte % 32` favours no letter. */
export function newRoomCode(randomBytes: (n: number) => Uint8Array): string {
  const bytes = randomBytes(ROOM_LIMITS.codeLength);
  if (bytes.length < ROOM_LIMITS.codeLength) throw new RangeError("A room code needs 8 random bytes.");
  let code = "";
  for (let i = 0; i < ROOM_LIMITS.codeLength; i++) code += ROOM_CODE_ALPHABET[bytes[i]! % ROOM_CODE_ALPHABET.length];
  return code;
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** A typed or pasted code, made tidy: spaces and dashes dropped, capitals, or what's wrong with it. A pasted invite link works too. */
export function normalizeCode(input: string): { ok: true; code: string } | { ok: false; reason: string } {
  const linked = /[#&?]room=([^&#\s]*)/i.exec(input);
  const raw = (linked ? decode(linked[1]!) : input).replace(/[\s\-‐‑–—_]+/g, "").toUpperCase();
  if (!raw) return { ok: false, reason: "Type the room's code: 8 letters and numbers." };
  if (/[IO01]/.test(raw)) return { ok: false, reason: "Room codes never use the letters I or O, or the numbers 0 or 1. Check those characters again." };
  if (/[^A-Z2-9]/.test(raw)) return { ok: false, reason: "A room code only has letters and numbers." };
  if (raw.length < ROOM_LIMITS.codeLength) return { ok: false, reason: `That code is too short: room codes have ${ROOM_LIMITS.codeLength} letters and numbers.` };
  if (raw.length > ROOM_LIMITS.codeLength) return { ok: false, reason: `That code is too long: room codes have ${ROOM_LIMITS.codeLength} letters and numbers.` };
  return CODE_PATTERN.test(raw) ? { ok: true, code: raw } : { ok: false, reason: "That doesn't look like a room code." };
}

/** "K7MP2QXA" as "K7MP 2QXA", easier to read out loud. */
export function formatCode(code: string): string {
  return code.length === ROOM_LIMITS.codeLength ? `${code.slice(0, 4)} ${code.slice(4)}` : code;
}

/**
 * What's wrong with an invite link's code, when its #fragment has `room=` but no code that works
 * (cut short by a chat app, or an O typed for a 0), in plain words; null for a good link or none.
 */
export function inviteHashProblem(hash: string): string | null {
  const m = /(?:^#?|[#&])room=([^&#]*)/i.exec(hash);
  if (!m) return null;
  const r = normalizeCode(decode(m[1]!));
  return r.ok ? null : `That invite link doesn't work: ${r.reason.charAt(0).toLowerCase()}${r.reason.slice(1)} Ask your friend to send it again, or type the code from their ticket.`;
}

/**
 * An invite link's #fragment, read for the page: its code, or what's wrong with it (a link that
 * doesn't work is still taken out of the address bar, and its problem shown); null with no `room=`.
 */
export function readInviteLink(hash: string): { code: string; problem: null } | { code: null; problem: string } | null {
  const code = parseInviteHash(hash);
  if (code) return { code, problem: null };
  const problem = inviteHashProblem(hash);
  return problem ? { code: null, problem } : null;
}

/** The room code in an invite link's #fragment ("#room=k7mp-2qxa" gives "K7MP2QXA"), or null. */
export function parseInviteHash(hash: string): string | null {
  const m = /(?:^#?|[#&])room=([^&#]*)/i.exec(hash);
  if (!m) return null;
  const r = normalizeCode(decode(m[1]!));
  return r.ok ? r.code : null;
}

/** The invite link. The code rides in the #fragment, which browsers never send to a server. */
export function inviteLink(code: string, origin: string, pathname: string): string {
  return `${origin}${pathname}#room=${code}`;
}

/** What's left of location.hash once the invite is taken out ("" when nothing is). */
export function withoutInviteHash(hash: string): string {
  const body = hash.replace(/^#/, "");
  if (!/(?:^|&)room=/i.test(body)) return hash;
  const rest = body.split("&").filter((part) => part && !/^room=/i.test(part));
  return rest.length ? `#${rest.join("&")}` : "";
}

// ---- Keys -----------------------------------------------------------------------------------

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A sailor's key in one room: the same as the rules' sha256(uid + '/' + code), never the account id. */
export function memberKey(uid: string, code: string): Promise<string> {
  return sha256Hex(`${uid}/${code}`);
}

/** A report's key: can't be matched to the reporter's sailor key. */
export function reportKey(uid: string, code: string): Promise<string> {
  return sha256Hex(`report/${uid}/${code}`);
}

// ---- Words ----------------------------------------------------------------------------------

/** "Cozy Dango 42". The lists only grow, so an index from a newer app shows a plain stand-in. */
export function nickText(n: readonly [number, number, number]): string {
  const adjective = NICK_ADJECTIVES[n[0]];
  const noun = NICK_NOUNS[n[1]];
  return adjective && noun ? `${adjective} ${noun} ${n[2]}` : `Sailor ${n[2]}`;
}

/** "Mellow Lighthouse". */
/**
 * A crewmate's nickname as shown in the room. Nicknames can repeat (a copy, or a rare chance), so
 * sailors with the same one are told apart by when they came aboard: the first keeps it as it is,
 * the next reads "(2)", then "(3)". Everywhere a name shows (the crew list, cheers, games, the
 * scenes, "Remove … from this room?") uses this, so a copycat never reads as the sailor they copied.
 */
export function memberName(room: Pick<Room, "members">, key: string): string {
  const m = room.members.find((x) => x.key === key);
  if (!m) return "";
  const text = nickText(m.nick);
  const twins = room.members
    .filter((x) => x.nick[0] === m.nick[0] && x.nick[1] === m.nick[1] && x.nick[2] === m.nick[2])
    .sort((x, y) => x.joinedAt - y.joinedAt || (x.key < y.key ? -1 : 1));
  const place = twins.findIndex((x) => x.key === key);
  return place > 0 ? `${text} (${place + 1})` : text;
}

/** Whether another sailor aboard has the same nickname (the crew list then says when each came aboard). */
export function hasTwin(room: Pick<Room, "members">, key: string): boolean {
  const m = room.members.find((x) => x.key === key);
  return !!m && room.members.some((x) => x.key !== key && x.nick[0] === m.nick[0] && x.nick[1] === m.nick[1] && x.nick[2] === m.nick[2]);
}

export function roomNameText(name: readonly [number, number]): string {
  const first = ROOM_NAME_FIRST[name[0]];
  const place = ROOM_NAME_PLACE[name[1]];
  return first && place ? `${first} ${place}` : "Study Room";
}

export function subjectText(i: number): string {
  return ROOM_SUBJECTS[i] ?? "Another subject";
}

const pick = (rand: () => number, count: number) => Math.min(count - 1, Math.max(0, Math.floor(rand() * count)));

/** Nickname numbers 1–99, without the ones nobody gets. */
const NICK_NUMBERS = Array.from({ length: ROOM_LIMITS.nickNumberMax }, (_, i) => i + 1).filter((n) => !NICK_NUMBER_SKIP.includes(n));

export function randomNick(rand: () => number): [number, number, number] {
  return [pick(rand, NICK_ADJECTIVES.length), pick(rand, NICK_NOUNS.length), NICK_NUMBERS[pick(rand, NICK_NUMBERS.length)]!];
}

export function randomRoomName(rand: () => number): [number, number] {
  return [pick(rand, ROOM_NAME_FIRST.length), pick(rand, ROOM_NAME_PLACE.length)];
}

/** A first look: one of the first four costumes (the banana is never picked for you), and no accessory. */
export function randomLook(rand: () => number): RoomLook {
  return { nick: randomNick(rand), costume: pick(rand, 4), accessory: 0 };
}

// ---- Building writes ------------------------------------------------------------------------

/** A new sailor's entry, apart from the three server times rooms.ts adds (in, seen, cr). */
export type MemberCore = { n: [number, number, number]; c: number; a: number; st: 0; end: null; dmg: 0; say: -1; sayAt: null; gid: 0; g: 0; gt: 0; gp: 0 };

const wholeIn = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : fallback);

/**
 * The only builder of a new sailor's entry. It copies the three look numbers and nothing else,
 * so no name, email or goal can ride along, and keeps each inside what the rules accept.
 */
export function newMemberFields(look: RoomLook): MemberCore {
  const nick = Array.isArray(look?.nick) ? look.nick : [];
  let number = wholeIn(nick[2], 1, ROOM_LIMITS.nickNumberMax, 7);
  if (NICK_NUMBER_SKIP.includes(number)) number += 1;
  return {
    n: [wholeIn(nick[0], 0, NICK_ADJECTIVES.length - 1, 0), wholeIn(nick[1], 0, NICK_NOUNS.length - 1, 0), number],
    c: wholeIn(look?.costume, 0, ROOM_COSTUMES.length - 1, 0),
    a: wholeIn(look?.accessory, 0, ROOM_ACCESSORIES.length - 1, 0),
    st: 0,
    end: null,
    dmg: 0,
    say: -1,
    sayAt: null,
    gid: 0,
    g: 0,
    gt: 0,
    gp: 0,
  };
}

/** What a sailor's next own write changes. `endsAt` is server time; null means no clock. */
export interface SelfPatch {
  st?: RoomState;
  endsAt?: number | null;
  addDmg?: number;
  say?: number;
  tidy?: { gid: number; g: number; gt: number; gp: number };
}

/**
 * Tidy the Deck progress from two writes for the same game, as one: every cleared patch (the
 * bits are OR-ed), the latest clear and the most mix-ups. The database stores these as plain
 * values, so a later write that forgot an earlier patch would erase it. A different game wins whole.
 */
export function mergeTidy(a: SelfPatch["tidy"], b: SelfPatch["tidy"]): SelfPatch["tidy"] {
  if (!a) return b && { ...b };
  if (!b) return { ...a };
  if (a.gid !== b.gid) return { ...b };
  return { gid: b.gid, g: a.g | b.g, gt: Math.max(a.gt, b.gt), gp: Math.max(a.gp, b.gp) };
}

/** Two queued changes as one write: the later wins, focus minutes add up, and Tidy progress joins up (mergeTidy). */
export function mergeSelf(a: SelfPatch, b: SelfPatch): SelfPatch {
  const out: SelfPatch = {};
  for (const p of [a, b]) {
    if (p.st !== undefined) out.st = p.st;
    if (p.endsAt !== undefined) out.endsAt = p.endsAt;
    if (p.say !== undefined) out.say = p.say;
  }
  const tidy = mergeTidy(a.tidy, b.tidy);
  if (tidy) out.tidy = tidy;
  if (a.addDmg !== undefined || b.addDmg !== undefined) out.addDmg = (a.addDmg ?? 0) + (b.addDmg ?? 0);
  return out;
}

/** 0 in port (docked or preparing), 1 focusing, 2 on a break, 3 paused. */
export function roomStateFor(phase: VoyagePhase, prepEndsAt: number | null): RoomState {
  if (prepEndsAt !== null) return 0;
  switch (phase) {
    case "sailing":
      return 1;
    case "shore-leave":
      return 2;
    case "drifting":
      return 3;
    default:
      return 0;
  }
}

/** Focus minutes the rules let this sailor add now: one per minute since their last credit, plus a minute of slack. */
export function creditableMinutes(m: RoomMember, serverNow: number): number {
  return Math.max(0, Math.floor(((serverNow - m.creditedAt) / SECOND + ROOM_LIMITS.creditSlackSeconds) / 60));
}

// ---- Reading --------------------------------------------------------------------------------

type Data = Record<string, unknown>;

const isObject = (v: unknown): v is Data => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, lo = -Infinity, hi = Infinity): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const isKey = (v: unknown): v is string => typeof v === "string" && KEY_PATTERN.test(v);
const strings = (v: unknown, max: number): string[] | null => (Array.isArray(v) && v.length <= max && v.every((s) => typeof s === "string") ? [...(v as string[])] : null);

/**
 * A database time in ms: a Firestore Timestamp (anything with toMillis), a Date or a number.
 * A server time still on its way reads as null in some snapshots; "now" stands in, so a sailor
 * never looks long gone because of it. Anything else is undefined (not a time).
 */
function timeOf(v: unknown): number | undefined {
  if (v === null) return Date.now();
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (v instanceof Date) return v.getTime();
  if (isObject(v) && typeof v.toMillis === "function") {
    const t = (v.toMillis as () => unknown)();
    return typeof t === "number" && Number.isFinite(t) ? t : undefined;
  }
  return undefined;
}

/** For fields that may be null on purpose (no clock, no cheer). */
function optionalTime(v: unknown): number | null | undefined {
  return v === null || v === undefined ? null : timeOf(v);
}

function toMember(key: string, d: unknown): RoomMember | null {
  if (!isKey(key) || !isObject(d)) return null;
  const n = d.n;
  if (!Array.isArray(n) || n.length !== 3 || !isInt(n[0], 0, ROOM_LIMITS.wordList - 1) || !isInt(n[1], 0, ROOM_LIMITS.wordList - 1)) return null;
  if (!isInt(n[2], 1, ROOM_LIMITS.nickNumberMax) || NICK_NUMBER_SKIP.includes(n[2])) return null;
  if (!isInt(d.c, 0, ROOM_LIMITS.costumes - 1) || !isInt(d.a, 0, ROOM_LIMITS.accessories - 1) || !isInt(d.st, 0, 3)) return null;
  const endsAt = optionalTime(d.end);
  const joinedAt = timeOf(d.in);
  const seenAt = timeOf(d.seen);
  const creditedAt = timeOf(d.cr);
  const sayAt = optionalTime(d.sayAt);
  if (endsAt === undefined || joinedAt === undefined || seenAt === undefined || creditedAt === undefined || sayAt === undefined) return null;
  // say: −1 none, then the cheers, then the stickers (the rules' `x.say < 36`).
  if (!isInt(d.dmg, 0) || !isInt(d.say, -1, ROOM_CHEERS.length + STICKER_IDS.length - 1)) return null;
  if (!isInt(d.gid) || !isInt(d.g, 0, 2 ** ROOM_LIMITS.tidy.maxPatches - 1) || !isInt(d.gt, 0, ROOM_LIMITS.tidy.maxMs) || !isInt(d.gp, 0, 999)) return null;
  return {
    key,
    nick: [n[0], n[1], n[2]],
    costume: d.c,
    accessory: d.a,
    state: d.st as RoomState,
    endsAt,
    joinedAt,
    seenAt,
    dmg: d.dmg,
    creditedAt,
    say: d.say,
    sayAt,
    tidy: { gid: d.gid, patches: d.g, ms: d.gt, mixups: d.gp },
  };
}

function toSail(v: unknown): RoomSail | null {
  if (!isObject(v)) return null;
  const at = timeOf(v.at);
  const { sailFocus: f, sailBreak: b, sailCycles: c } = ROOM_LIMITS;
  if (at === undefined || !isInt(v.f, f.min, f.max) || !isInt(v.b, b.min, b.max) || !isInt(v.c, c.min, c.max)) return null;
  return { at, focus: v.f, brk: v.b, cycles: v.c };
}

function toDeck(v: unknown): RoomDeckRef | null {
  if (!isObject(v) || !isInt(v.n, ROOM_LIMITS.deckCards.min, ROOM_LIMITS.deckCards.max)) return null;
  if (v.b !== null && typeof v.b !== "string") return null;
  return { bottleId: v.b, cards: v.n };
}

/** A game dealt by another version of the dealing (ROOM_GAME_ENGINE) reads as none: this device sits it out rather than dealing different cards. */
function toGame(v: unknown): RoomGame | null {
  if (!isObject(v) || v.v !== ROOM_GAME_ENGINE || !isInt(v.seed)) return null;
  const at = timeOf(v.at);
  const seats = strings(v.seats, ROOM_LIMITS.size);
  if (at === undefined || !seats || !seats.length) return null;
  if (v.kind === "tidy") return { kind: "tidy", v: ROOM_GAME_ENGINE, seed: v.seed, at, seats };
  if (v.kind !== "bottle") return null;
  const b = ROOM_LIMITS.bottle;
  const turnAt = timeOf(v.tAt);
  if (turnAt === undefined || !isInt(v.n, ROOM_LIMITS.deckCards.min, ROOM_LIMITS.deckCards.max)) return null;
  if (!isInt(v.turn, 0, b.maxTurns) || typeof v.holder !== "string" || !isInt(v.card, 0) || !isInt(v.del, 0)) return null;
  if (!isInt(v.buoys, 0, b.buoys) || typeof v.res !== "boolean" || !isInt(v.goal, b.goal.min, b.goal.max) || !isInt(v.end, 0, 2)) return null;
  return {
    kind: "bottle",
    v: ROOM_GAME_ENGINE,
    seed: v.seed,
    at,
    seats,
    cards: v.n,
    turn: v.turn,
    holder: v.holder,
    turnAt,
    card: v.card,
    delivered: v.del,
    buoys: v.buoys,
    rescue: v.res,
    goal: v.goal,
    end: v.end as 0 | 1 | 2,
  };
}

const isMode = (v: unknown): v is RoomMode => v === "invite" || v === "open";
const isName = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && isInt(v[0], 0, ROOM_LIMITS.wordList - 1) && isInt(v[1], 0, ROOM_LIMITS.wordList - 1);

/** A room as the database holds it, every field checked again (like toBottle), or null if it isn't one. Sailors with a broken entry are left out. */
export function toRoom(code: string, data: unknown): Room | null {
  if (!isObject(data) || data.v !== 1 || !isMode(data.mode) || !isName(data.name) || !isInt(data.subj, 0, ROOM_LIMITS.subjects - 1)) return null;
  const at = timeOf(data.at);
  const banned = strings(data.ban, ROOM_LIMITS.maxBans);
  const reportKeys = strings(data.rep, ROOM_LIMITS.maxReports);
  if (at === undefined || typeof data.host !== "string" || typeof data.listed !== "boolean" || typeof data.locked !== "boolean" || !banned || !reportKeys) return null;
  // The rules keep `banked` whole; a fraction from before that (or a forged one) is rounded down rather than losing the room.
  const banked = typeof data.banked === "number" && Number.isFinite(data.banked) && data.banked >= 0 ? Math.floor(data.banked) : null;
  if (banked === null || (data.last !== null && typeof data.last !== "string") || !isObject(data.m)) return null;
  const whyData = isObject(data.why) ? data.why : {};
  // Strikes (reports that count towards unlisting) are a whole number; a room from before them has none.
  const strikes = data.strikes === undefined ? 0 : isInt(data.strikes, 0) ? data.strikes : null;
  if (strikes === null) return null;
  const why = Object.fromEntries(ROOM_REPORT_REASONS.map((r) => [r, isInt(whyData[r], 0) ? whyData[r] : 0])) as Record<RoomReportReason, number>;
  const members = Object.entries(data.m)
    .map(([key, value]) => toMember(key, value))
    .filter((m): m is RoomMember => m !== null)
    .sort((x, y) => x.joinedAt - y.joinedAt || (x.key < y.key ? -1 : 1));
  return {
    code,
    mode: data.mode,
    name: [data.name[0], data.name[1]],
    subject: data.subj,
    at,
    host: data.host,
    listed: data.listed,
    locked: data.locked,
    banned,
    reportKeys,
    why,
    strikes,
    banked,
    last: data.last,
    sail: toSail(data.sail),
    deck: toDeck(data.deck),
    game: toGame(data.game),
    members,
  };
}

/** A room's public card, checked, or null. */
export function toCard(code: string, data: unknown): RoomCard | null {
  if (!isObject(data) || data.v !== 1 || !isMode(data.mode) || !isName(data.name) || !isInt(data.subj, 0, ROOM_LIMITS.subjects - 1)) return null;
  const at = timeOf(data.at);
  const aliveAt = timeOf(data.alive);
  if (at === undefined || aliveAt === undefined || typeof data.listed !== "boolean" || typeof data.locked !== "boolean" || !isInt(data.n, 0, ROOM_LIMITS.size)) return null;
  return { code, mode: data.mode, name: [data.name[0], data.name[1]], subject: data.subj, at, listed: data.listed, locked: data.locked, aboard: data.n, aliveAt };
}

/**
 * What a room is called in this sailor's own saved records (rewards paid, kept cards): from their
 * key in the room (a one-way hash of account and code, the same on each of their devices) and
 * when it opened, never the code itself. Those records sync and go into backups, and a room code
 * works as an invite key, so a backup must not carry one.
 */
export function roomRecordId(myKey: string, at: number): string {
  return `room:${myKey.slice(0, 16)}:${at}`;
}

/** A shared deck's cards for the practice engine. Ids are the card's place in the deck, so every device agrees. */
export function toPracticeCards(cards: readonly BottleCard[]): PracticeCard[] {
  return cards.map((c, i) => ({ id: String(i), front: c.f, back: c.b }));
}

/** A short id from a card's two sides (53-bit cyrb53 hash), so different cards never share an id, whatever order they came in. */
export function cardTextId(front: string, back: string): string {
  const text = `${front.trim()}\u0000${back.trim()}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// ---- Time and presence ----------------------------------------------------------------------

/** How far the server's clock is ahead of this device's: server time minus the local midpoint of the round trip. */
export function estimateOffset(sentAtLocal: number, ackAtLocal: number, serverMs: number): number {
  return serverMs - (sentAtLocal + ackAtLocal) / 2;
}

/** Here, away (12 min without a write) or stale (25 min: anyone's tidy-up may sweep them). */
export function presence(m: RoomMember, serverNow: number): "here" | "away" | "stale" {
  const quiet = serverNow - m.seenAt;
  if (quiet >= ROOM_LIMITS.staleMinutes * MINUTE) return "stale";
  if (quiet >= ROOM_LIMITS.awayMinutes * MINUTE) return "away";
  return "here";
}

function minutesLeft(endsAt: number | null, serverNow: number): string {
  if (endsAt === null || endsAt <= serverNow) return "";
  return ` · ${Math.ceil((endsAt - serverNow) / MINUTE)} min left`;
}

/** "Focusing · 12 min left", "On a break · 3 min left", "Paused", "In port" or "Away". */
export function statusLine(m: RoomMember, serverNow: number): string {
  if (presence(m, serverNow) !== "here") return "Away";
  switch (m.state) {
    case 1:
      return `Focusing${minutesLeft(m.endsAt, serverNow)}`;
    case 2:
      return `On a break${minutesLeft(m.endsAt, serverNow)}`;
    case 3:
      return "Paused";
    default:
      return "In port";
  }
}

// ---- The crew -------------------------------------------------------------------------------

const memberOf = (room: Room, key: string) => room.members.find((m) => m.key === key);
const isStale = (m: RoomMember, serverNow: number) => presence(m, serverNow) === "stale";

/** The skipper has left or hasn't been seen for 25 minutes (the rules' roomOver test: anyone may then clear the room). */
export function isSkipperGone(room: Room, serverNow: number): boolean {
  const skipper = memberOf(room, room.host);
  return !skipper || isStale(skipper, serverNow);
}

/**
 * The rules' roomOver: the skipper has left or hasn't been seen for 25 minutes, or the room is 12
 * hours old. Over is final: nobody can write to it again (only report it), and anyone may delete it.
 */
export function isRoomOver(room: Room, serverNow: number): boolean {
  return serverNow >= room.at + ROOM_LIMITS.lifetimeHours * HOUR || isSkipperGone(room, serverNow);
}

/** The skipper has left or been quiet `minutes` (the rules let the crew take the hat from 15, well before the room is over at 25). */
export function isSkipperQuiet(room: Room, serverNow: number, minutes: number = ROOM_LIMITS.hatMinutes): boolean {
  const skipper = memberOf(room, room.host);
  return !skipper || serverNow - skipper.seenAt >= minutes * MINUTE;
}

/** After this long without the skipper, anyone here tries for the hat, not only the sailor with the smallest key (who may be asleep). */
const ANYONE_TAKES_HAT_MINUTES = ROOM_LIMITS.hatMinutes + 5;

const PRESENCE_RANK = { here: 0, away: 1, stale: 2 } as const;

/** Who gets the hat when `leavingKey` goes: the longest-aboard sailor who's here (else away, else anyone), or null when nobody's left. */
export function nextSkipper(room: Room, leavingKey: string, serverNow: number): string | null {
  const rest = room.members.filter((m) => m.key !== leavingKey);
  const best = [...rest].sort((x, y) => PRESENCE_RANK[presence(x, serverNow)] - PRESENCE_RANK[presence(y, serverNow)] || x.joinedAt - y.joinedAt || (x.key < y.key ? -1 : 1))[0];
  return best ? best.key : null;
}

export type SweepAction = { kind: "take-hat" } | { kind: "sweep"; key: string };

/**
 * What this device should tidy up, if anything. Mostly only one sailor acts, so devices don't
 * race: the skipper sweeps out the longest-quiet stale sailor. Once the skipper has been quiet 15
 * minutes (10 before the room counts as over and anyone could clear it), the sailor here with the
 * smallest key takes the hat; 5 minutes later anyone here tries, in case that sailor's device is
 * asleep. A lost race is refused harmlessly. The new skipper sweeps on a later check.
 */
export function sweepAction(room: Room, myKey: string, serverNow: number): SweepAction | null {
  const me = memberOf(room, myKey);
  if (!me) return null;
  if (room.host === myKey) {
    const stale = room.members.filter((m) => m.key !== myKey && isStale(m, serverNow)).sort((x, y) => x.seenAt - y.seenAt || (x.key < y.key ? -1 : 1));
    return stale[0] ? { kind: "sweep", key: stale[0].key } : null;
  }
  if (!isSkipperQuiet(room, serverNow) || presence(me, serverNow) !== "here") return null;
  const here = room.members.filter((m) => presence(m, serverNow) === "here").map((m) => m.key).sort();
  return here[0] === myKey || isSkipperQuiet(room, serverNow, ANYONE_TAKES_HAT_MINUTES) ? { kind: "take-hat" } : null;
}

export type JoinProblem = "gone" | "ended" | "skipper-away" | "full" | "locked" | "refused";

const roomEnded = (at: number, serverNow: number) => serverNow >= at + ROOM_LIMITS.lifetimeHours * HOUR;
const skipperStaleAt = (aliveAt: number, serverNow: number) => serverNow - aliveAt >= ROOM_LIMITS.staleMinutes * MINUTE;

/** Why a card's room can't be joined, as far as the card shows; null when nothing shows. A join refused anyway is "refused" (a ban). */
export function joinProblem(card: RoomCard | null, serverNow: number): JoinProblem | null {
  if (!card) return "gone";
  if (roomEnded(card.at, serverNow)) return "ended";
  if (skipperStaleAt(card.aliveAt, serverNow)) return "skipper-away";
  if (card.aboard >= ROOM_LIMITS.size) return "full";
  if (card.locked) return "locked";
  return null;
}

const cardOver = (c: RoomCard, serverNow: number) => roomEnded(c.at, serverNow) || skipperStaleAt(c.aliveAt, serverNow);

/** The open list as shown: no full, locked, finished or hidden rooms; one subject if picked; busiest first, then the liveliest. */
export function listView(cards: readonly RoomCard[], serverNow: number, hiddenCodes: readonly string[], subject: number | null): RoomCard[] {
  return cards
    .filter((c) => c.listed && !c.locked && c.aboard < ROOM_LIMITS.size && !cardOver(c, serverNow) && !hiddenCodes.includes(c.code))
    .filter((c) => subject === null || c.subject === subject)
    .sort((x, y) => y.aboard - x.aboard || y.aliveAt - x.aliveAt || (x.code < y.code ? -1 : 1));
}

/** Clearing finished rooms is shared work: each visit to the list clears at most this many. */
const DEAD_ROOMS_PER_VISIT = 3;

/** Cards whose rooms are over (skipper unseen 25 min, or 12 h old), at most 3. */
export function deadCards(cards: readonly RoomCard[], serverNow: number): string[] {
  return cards.filter((c) => cardOver(c, serverNow)).slice(0, DEAD_ROOMS_PER_VISIT).map((c) => c.code);
}

/** Whether the room stays on the open list after one more report: only the third strike takes it off. */
export function listedAfterReport(room: Pick<Room, "listed" | "strikes">, strike: boolean): boolean {
  return room.listed && room.strikes + (strike ? 1 : 0) < ROOM_LIMITS.hideAtReports;
}

/** A little past the rules' 5 minutes, so a leave never claims a stay the server's clock doesn't see yet. */
const STAKE_MARGIN_MS = 30 * SECOND;

/**
 * What a screen reader hears for a sail call: steady words, never the countdown or the minutes
 * left (which the banner shows), so its live line doesn't change, and get read out again, as time
 * passes.
 */
export function steadySailWords(offer: { kind: "sail-with" } | { kind: "hop-aboard"; leg: number }): string {
  if (offer.kind === "sail-with") return "Your crew sets sail in a minute!";
  return offer.leg > 1 ? "Next leg is starting: hop aboard?" : "Your crew is sailing: hop aboard?";
}

/** Whether a sailor leaving now has been aboard long enough for a later report to be a strike (their note's `stayed`). Never claimed on a guess. */
export function stayedAboard(m: Pick<RoomMember, "joinedAt">, serverNow: number): boolean {
  return serverNow - m.joinedAt >= ROOM_LIMITS.reportStakeMinutes * MINUTE + STAKE_MARGIN_MS;
}

/**
 * Whether this sailor's report counts towards taking an open room off the list (the rules' `stake`):
 * the room is the one they came aboard last (their stamp's `joinedIn`), and they've been aboard 5
 * minutes now (`aboardSince`), or were the last time they left by themselves (their note's
 * `stayed`). Sailors who come aboard only to report and leave can't unlist a room, and one account
 * weighs in one room at a time.
 */
export function reportIsStrike(r: { code: string; joinedIn: string | null; aboardSince: number | null; stayed: boolean; serverNow: number }): boolean {
  if (r.joinedIn !== r.code) return false;
  return r.aboardSince !== null ? r.serverNow - r.aboardSince >= ROOM_LIMITS.reportStakeMinutes * MINUTE : r.stayed;
}

// ---- Sailing together -----------------------------------------------------------------------

export function presetFor(focus: number, brk: number): VoyagePresetId {
  if (focus === 25 && brk === 5) return "coastal";
  if (focus === 50 && brk === 10) return "ocean";
  return "custom";
}

export interface SailStatus {
  phase: "prep" | "focus" | "break" | "done";
  /** 1-based. */
  leg: number;
  legs: number;
  endsAt: number;
}

/** Where the crew's sail plan is: a minute to get ready, then a focus block and a break per leg (the last leg too, as Pwedo Pomo does). */
export function sailStatus(sail: RoomSail, serverNow: number): SailStatus {
  const start = sail.at + ROOM_LIMITS.prepSeconds * SECOND;
  const legs = sail.cycles;
  if (serverNow < start) return { phase: "prep", leg: 1, legs, endsAt: start };
  const legMs = (sail.focus + sail.brk) * MINUTE;
  const index = Math.floor((serverNow - start) / legMs);
  if (index >= legs) return { phase: "done", leg: legs, legs, endsAt: start + legs * legMs };
  const legStart = start + index * legMs;
  const focusEnd = legStart + sail.focus * MINUTE;
  return serverNow < focusEnd ? { phase: "focus", leg: index + 1, legs, endsAt: focusEnd } : { phase: "break", leg: index + 1, legs, endsAt: legStart + legMs };
}

export type SailOffer =
  | { kind: "sail-with"; prepUntilServer: number }
  | { kind: "hop-aboard"; focusMinutes: number; breakMinutes: number; leg: number }
  | { kind: "sail-on"; focusMinutes: number; breakMinutes: number; cycles: number; fromLeg: number };

/** Hop aboard needs at least this much of the crew's focus block left. */
const HOP_MIN_LEFT = 2 * MINUTE;
/**
 * Sail on (a whole leg, and the legs after it) is offered only in a leg's first half minute, so a
 * sailor's breaks stay within half a minute of the crew's, as hop aboard's rounding does. Later
 * in the leg, hop aboard fits the minutes that are left. (The build spec said 2 minutes; half a
 * minute was chosen so sailing on never puts a sailor's breaks more out of step than hopping aboard.)
 */
export const SAIL_ON_WINDOW = 30 * SECOND;
/**
 * A later leg calls "Next leg is starting" for this long: sail on in its first half minute, then
 * hop aboard. A sailor who hopped aboard can come off their break up to half a minute after the
 * crew's next leg began (rounding), plus a moment, so they still get the call.
 */
export const NEXT_LEG_CALL_MS = 2 * MINUTE;

/** When the crew's current leg began (server ms), or null outside a focus block. */
export function legStartedAt(sail: RoomSail, serverNow: number): number | null {
  const status = sailStatus(sail, serverNow);
  return status.phase === "focus" ? status.endsAt - sail.focus * MINUTE : null;
}

/**
 * How to join the crew's sail plan right now. Sail with them while they get ready; sail on at
 * the start of a leg (only when this sailor's own timer is docked, so a sailor already sailing
 * with the crew isn't asked again); otherwise hop aboard their focus block. The panel disables
 * sail-with and hop-aboard while a timer runs ("You're already sailing").
 */
export function sailOffer(sail: RoomSail | null, voyage: { phase: VoyagePhase; prepEndsAt: number | null }, serverNow: number): SailOffer | null {
  if (!sail) return null;
  const status = sailStatus(sail, serverNow);
  if (status.phase === "prep") return { kind: "sail-with", prepUntilServer: status.endsAt };
  if (status.phase !== "focus") return null;
  const docked = voyage.phase === "docked" && voyage.prepEndsAt === null;
  const legStart = status.endsAt - sail.focus * MINUTE;
  if (docked && serverNow - legStart < SAIL_ON_WINDOW) {
    return { kind: "sail-on", focusMinutes: sail.focus, breakMinutes: sail.brk, cycles: status.legs - status.leg + 1, fromLeg: status.leg };
  }
  const left = status.endsAt - serverNow;
  if (left < HOP_MIN_LEFT) return null;
  // Whole minutes (the timer rounds them), the nearest, so the break starts within half a minute of the crew's.
  return { kind: "hop-aboard", focusMinutes: Math.round(left / MINUTE), breakMinutes: sail.brk, leg: status.leg };
}

// ---- Kraken Watch ---------------------------------------------------------------------------

/** The damage everyone agrees on: banked minutes of sailors who left, plus every credited minute aboard. */
export function creditedDamage(room: Room): number {
  return room.banked + room.members.reduce((sum, m) => sum + m.dmg, 0);
}

/**
 * For the hp bar only: credited damage plus the minutes each focusing sailor has sailed since
 * their last write. A focusing sailor's device writes at least every 10 minutes (its keep-alive),
 * so no more than that is counted for anyone: past it the guess is stale (an idle pause never
 * reaches the room, say), and it would only run ahead and then step back.
 */
export function liveDamage(room: Room, serverNow: number): number {
  let live = creditedDamage(room);
  for (const m of room.members) {
    if (m.state !== 1) continue;
    const until = m.endsAt === null ? serverNow : Math.min(serverNow, m.endsAt);
    live += Math.min(ROOM_LIMITS.keepAliveMinutes, Math.max(0, Math.floor((until - m.seenAt) / MINUTE)));
  }
  return live;
}

/**
 * Kraken Watch as shown: which beast, and how many are beaten, from the credited damage everyone
 * agrees on (so neither runs ahead of the captain's cheer, or steps back); the live minutes only
 * fill the current beast's bar, down to its last hp point at most.
 */
export function shownQuest(room: Room, serverNow: number): QuestState & { beastIndex: number } {
  const credited = creditedDamage(room);
  const quest = questFromDamage(credited);
  const extra = Math.max(0, liveDamage(room, serverNow) - credited);
  return { ...quest, hp: Math.max(Math.min(quest.hp, 1), quest.hp - extra) };
}

export interface RoomReward {
  /** Paid once ever (earnOnce), on every device. */
  id: string;
  doubloons: number;
  xp: number;
  reason: string;
  figurehead?: string;
}

const BEAST_REWARD = { doubloons: 20, xp: 50 } as const;
const TIDY_REWARD = { doubloons: 5, xp: 10 } as const;
const BOTTLE_PER_DELIVERY = { doubloons: 1, xp: 2 } as const;
const BOTTLE_ISLAND = { doubloons: 10, xp: 20 } as const;

const popcount = (bits: number) => {
  let count = 0;
  for (let b = bits; b; b &= b - 1) count++;
  return count;
};

/**
 * How many Tidy the Deck patches a game has, worked out from the room alone, for before its cards
 * load: never fewer than the real count, and more when the deck has repeated answers or reversed
 * cards (tidyPatches deals only cards whose tiles all differ). The real count wins once known.
 */
export function estimatedTidyPatches(room: Room, game: TidyGame): number {
  const usable = room.deck?.cards ?? 0;
  return Math.min(game.seats.length, Math.floor(usable / 4), ROOM_LIMITS.tidy.maxPatches);
}

function tidyEarned(room: Room, myKey: string, patches: number, memo: TidyMemo | null): TidyGame | null {
  const game = room.game;
  if (game?.kind !== "tidy") return null;
  const me = memberOf(room, myKey);
  if (!me || me.tidy.gid !== game.seed || popcount(me.tidy.patches & ((1 << patches) - 1)) === 0) return null;
  return tidyStatus(room, game, patches, game.at, memo).done ? game : null;
}

function bottleEarned(room: Room, myKey: string): BottleGame | null {
  const game = room.game;
  return game?.kind === "bottle" && bottleOver(game) !== 0 && game.seats.includes(myKey) ? game : null;
}

const beastReason = (name: string) => `The crew beat ${name.replace(/^The /, "the ")}!`;

/**
 * What this snapshot newly pays me. For beasts, the first snapshot (prev null) is only a baseline,
 * so joining never pays for beasts beaten before. A beast pays only with 10 of my own minutes in
 * the room; Tidy the Deck once the crew finishes, if I cleared a patch; Pass the Bottle once
 * the game ends, if I had a seat. Games need no baseline: their reward ids are one per game (its
 * seed), and earnOnce pays each id once on every device, so a game that ended while this tab was
 * reloading (or asleep) still pays when the first snapshot already shows it over. `tidyPatches` is the game's real patch count when the deck
 * is loaded (tidyPatches(...).length); without it, it's worked out from the deck's size.
 * `tidyBefore` and `tidyAfter` are the device's Tidy memory before and after this snapshot, so
 * a patch cleared by a sailor who then left still counts.
 */
export function roomRewards(
  prev: Room | null,
  next: Room,
  myKey: string,
  opts: { tidyPatches?: number; tidyBefore?: TidyMemo | null; tidyAfter?: TidyMemo | null } = {},
): RoomReward[] {
  const me = memberOf(next, myKey);
  if (!me) return [];
  // A snapshot of another room (or none before it) is a baseline for beasts only.
  const same = prev !== null && prev.code === next.code && prev.at === next.at ? prev : null;
  const base = roomRecordId(myKey, next.at);
  const rewards: RoomReward[] = [];

  if (same && me.dmg >= ROOM_LIMITS.rewardMinDmg) {
    for (const beast of beastsDefeatedBetween(creditedDamage(same), creditedDamage(next))) {
      const name = QUEST_BEASTS.find((b) => b.id === beast.beastId)?.name ?? "a beast";
      rewards.push({ id: `${base}:beast:${beast.index}`, ...BEAST_REWARD, reason: beastReason(name), figurehead: beast.reward });
    }
  }

  if (next.game?.kind === "tidy") {
    const game = next.game;
    const patches = opts.tidyPatches ?? estimatedTidyPatches(next, game);
    const before = same?.game?.kind === "tidy" && same.game.seed === game.seed ? tidyEarned(same, myKey, patches, opts.tidyBefore ?? null) : null;
    if (!before && tidyEarned(next, myKey, patches, opts.tidyAfter ?? null)) rewards.push({ id: `${base}:tidy:${game.seed}`, ...TIDY_REWARD, reason: "Tidy the Deck: ship shape!" });
  }

  const bottle = bottleEarned(next, myKey);
  const bottleBefore = bottle && same?.game?.kind === "bottle" && same.game.seed === bottle.seed ? bottleEarned(same, myKey) : null;
  if (bottle && !bottleBefore) {
    const island = bottle.end === 1;
    const doubloons = bottle.delivered * BOTTLE_PER_DELIVERY.doubloons + (island ? BOTTLE_ISLAND.doubloons : 0);
    const xp = bottle.delivered * BOTTLE_PER_DELIVERY.xp + (island ? BOTTLE_ISLAND.xp : 0);
    if (doubloons > 0 || xp > 0) {
      const reason = island ? "Pass the Bottle: island reached!" : `Pass the Bottle: ${bottle.delivered} ${bottle.delivered === 1 ? "bottle" : "bottles"} delivered`;
      rewards.push({ id: `${base}:bottle:${bottle.seed}`, doubloons, xp, reason });
    }
  }
  return rewards;
}

// ---- Games ----------------------------------------------------------------------------------

/** Who gets a seat: sailors who are here and not focusing, in the order they came aboard, at most 6. */
export function gameSeats(room: Room, serverNow: number): string[] {
  return room.members
    .filter((m) => m.state !== 1 && presence(m, serverNow) === "here")
    .slice(0, ROOM_LIMITS.size)
    .map((m) => m.key);
}

/** Bottles to deliver to reach the island: 6 for 1–3 sailors, 8 for 4–6, but never more than the cards dealt, so the island can always be reached. */
export function bottleGoal(seats: number, cards: number = Infinity): number {
  const { min } = ROOM_LIMITS.bottle.goal;
  return Math.max(min, Math.min(seats >= 4 ? 8 : 6, Math.floor(cards)));
}

/** The next seat after the holder who can answer (aboard, here and not focusing); the holder when nobody else can. */
export function nextPresentSeat(game: BottleGame, room: Room, serverNow: number): string {
  const seats = game.seats;
  const from = seats.indexOf(game.holder);
  for (let step = 1; step < seats.length + (from < 0 ? 1 : 0); step++) {
    const key = seats[(from + step + seats.length) % seats.length]!;
    if (key === game.holder) continue;
    const m = memberOf(room, key);
    if (m && m.state !== 1 && presence(m, serverNow) === "here") return key;
  }
  return game.holder;
}

export type BottleOutcome = "right" | "close" | "miss" | "timeout";
export type BottleTurnPatch = Pick<BottleGame, "turn" | "holder" | "card" | "delivered" | "buoys" | "rescue" | "end">;

/**
 * One Pass the Bottle turn, exactly as the rules check it. Right (or close) delivers the bottle
 * and moves to the next card; a first miss sends the same card to the next sailor as a rescue;
 * a missed rescue loses a lifebuoy and moves on. Taking the helm counts as a miss. The game ends
 * at the goal (island) or with no buoys or cards left (tide); "out of cards" is the game's own
 * count of the cards it deals (game.cards), as the rules check it.
 */
export function bottleStep(game: BottleGame, outcome: BottleOutcome, room: Room, serverNow: number): BottleTurnPatch {
  const holder = nextPresentSeat(game, room, serverNow);
  const right = outcome === "right" || outcome === "close";
  let { card, delivered, buoys } = game;
  let rescue = false;
  if (right) {
    delivered += 1;
    card += 1;
  } else if (!game.rescue) {
    rescue = true;
  } else {
    buoys = Math.max(0, buoys - 1);
    card += 1;
  }
  const end: 0 | 1 | 2 = delivered >= game.goal ? 1 : buoys === 0 || card >= game.cards ? 2 : 0;
  return { turn: game.turn + 1, holder, card, delivered, buoys, rescue, end };
}

/** Whether this sailor may answer for the holder: after 35 s, or at once when the holder has left or is focusing. */
export function canTakeHelm(game: BottleGame, room: Room, myKey: string, serverNow: number): boolean {
  const me = memberOf(room, myKey);
  if (!me || me.state === 1 || game.holder === myKey || bottleOver(game) !== 0) return false;
  const b = ROOM_LIMITS.bottle;
  if (serverNow <= game.turnAt + b.minTurnSeconds * SECOND) return false;
  const holder = memberOf(room, game.holder);
  return !holder || holder.state === 1 || serverNow > game.turnAt + b.takeoverSeconds * SECOND;
}

/** 0 playing, 1 island reached, 2 the tide turned (including the 60th turn). */
export function bottleOver(game: BottleGame): 0 | 1 | 2 {
  if (game.end !== 0) return game.end;
  return game.turn >= ROOM_LIMITS.bottle.maxTurns ? 2 : 0;
}

/**
 * Patches cleared on a write can arrive up to 15 s after the bell (the write gap), so the time-out
 * is called only this long after the 5 minutes, and a patch cleared just in time still counts.
 */
const TIDY_LATE_WRITE_MS = (ROOM_LIMITS.writeGapSeconds + 5) * SECOND;

/** One sailor's Tidy the Deck progress, as this device last saw it. */
export interface TidySeen {
  patches: number;
  ms: number;
  mixups: number;
}

/**
 * Everything this device has seen of one Tidy the Deck game, sailor by sailor, including sailors
 * who have since left: leaving deletes a sailor's entry from the room, and with it the patches
 * they cleared, so without this a finished game would turn back into an unfinished one.
 */
export interface TidyMemo {
  seed: number;
  seen: Record<string, TidySeen>;
}

/** What a sailor's entry adds to what was seen of their progress for game `seed` (progress only grows). */
function seenWith(old: TidySeen | undefined, m: RoomMember): TidySeen {
  return old ? { patches: old.patches | m.tidy.patches, ms: Math.max(old.ms, m.tidy.ms), mixups: Math.max(old.mixups, m.tidy.mixups) } : { patches: m.tidy.patches, ms: m.tidy.ms, mixups: m.tidy.mixups };
}

/** Every sailor's progress for this game: the memo's (sailors who left included), joined with the room's. */
function seenFor(room: Room, seed: number, memo: TidyMemo | null): Record<string, TidySeen> {
  const seen: Record<string, TidySeen> = memo?.seed === seed ? { ...memo.seen } : {};
  for (const m of room.members) if (m.tidy.gid === seed && m.tidy.patches) seen[m.key] = seenWith(seen[m.key], m);
  return seen;
}

/** Folds a snapshot's Tidy progress into the memo (a new game starts a new one); the same memo back when nothing changed. */
export function rememberTidy(memo: TidyMemo | null, room: Room): TidyMemo | null {
  const game = room.game;
  if (game?.kind !== "tidy") return memo;
  const seen = seenFor(room, game.seed, memo);
  const same = memo?.seed === game.seed && Object.keys(seen).length === Object.keys(memo.seen).length && Object.entries(seen).every(([k, v]) => {
    const old = memo.seen[k];
    return old && old.patches === v.patches && old.ms === v.ms && old.mixups === v.mixups;
  });
  return same && memo ? memo : { seed: game.seed, seen };
}

/**
 * Tidy the Deck for the whole crew, from each sailor's progress for this game (gid == seed), plus
 * what `memo` remembers of sailors who left: `covered` is every cleared patch as bits, crew time
 * is the latest clear plus 1 s per mix-up, and `open` lists patches nobody has cleared yet (for
 * "Help a crewmate").
 */
export function tidyStatus(
  room: Room,
  game: TidyGame,
  patches: number,
  serverNow: number,
  memo: TidyMemo | null = null,
): { cleared: number; covered: number; done: boolean; crewMs: number | null; timedOut: boolean; open: number[] } {
  const count = Math.max(0, Math.min(Math.floor(patches), ROOM_LIMITS.tidy.maxPatches));
  const mask = (1 << count) - 1;
  const seen = seenFor(room, game.seed, memo);
  let covered = 0;
  let latest = 0;
  let mixups = 0;
  for (const t of Object.values(seen)) {
    covered |= t.patches & mask;
    latest = Math.max(latest, t.ms);
    mixups += t.mixups;
  }
  const cleared = popcount(covered);
  const done = count > 0 && cleared === count;
  const open = Array.from({ length: count }, (_, i) => i).filter((i) => !(covered & (1 << i)));
  const timedOut = !done && serverNow >= game.at + ROOM_LIMITS.tidy.timeLimitMs + TIDY_LATE_WRITE_MS;
  return { cleared, covered, done, crewMs: done ? latest + MATCH_PENALTY_MS * mixups : null, timedOut, open };
}

// ---- The scene ------------------------------------------------------------------------------

export interface SceneMate {
  key: string;
  label: string;
  costume: RoomCostume;
  accessory: string;
  skipper: boolean;
  state: RoomState;
  away: boolean;
  /** say index (0–23 a cheer, 24–35 a sticker) while it shows, else null. */
  cheer: number | null;
}

const SCENE_MATES = ROOM_LIMITS.size - 1;

/** Crewmates to draw (not me), in the order they came aboard, at most 5. Hidden sailors and muted cheers show no bubble. */
export function sceneMates(room: Room, myKey: string, serverNow: number, hidden: readonly string[], muted: boolean): SceneMate[] {
  return room.members
    .filter((m) => m.key !== myKey)
    .slice(0, SCENE_MATES)
    .map((m) => {
      const fresh = m.say >= 0 && m.sayAt !== null && serverNow - m.sayAt >= 0 && serverNow - m.sayAt < ROOM_LIMITS.cheerShowSeconds * SECOND;
      return {
        key: m.key,
        label: memberName(room, m.key),
        costume: ROOM_COSTUMES[m.costume] ?? "pwedo",
        accessory: ROOM_ACCESSORIES[m.accessory] ?? "none",
        skipper: m.key === room.host,
        state: m.state,
        away: presence(m, serverNow) !== "here",
        cheer: fresh && !muted && !hidden.includes(m.key) ? m.say : null,
      };
    });
}

// ---- The session ----------------------------------------------------------------------------

/**
 * How a tab stops its room session when the sailor isn't aboard there any more. Signed out, the
 * room stays remembered for logging back in, with this tab's saved minutes and Tidy memory
 * ("keep"). Signed in with no room (they left, or ran Start over or Delete everything, maybe from
 * another tab), those go too ("forget"), as the Cookies & Storage text promises.
 */
export function roomSessionStop(uid: string | null, current: string | null): "keep" | "forget" | null {
  if (uid && current) return null;
  return uid ? "forget" : "keep";
}

// ---- Messages -------------------------------------------------------------------------------

/** When Bottle Bay has hidden the room's deck after reports (or its sharer took it back). */
export const DECK_HIDDEN_TEXT = "Bottle Bay hid this deck after reports, or its sharer took it back, so it can't be played any more. The skipper can pick another one.";
/** Asking for a deck change while a game is on. */
export const DECK_LOCKED_TEXT = "End this game to change the deck.";
/** Tidy the Deck with a deck that leaves fewer than 4 cards to deal (startGame refuses it; the board says it too). */
export const TIDY_DECK_TOO_SMALL_TEXT =
  "Tidy the Deck needs at least 4 cards whose sides all read differently (a card and its reversed copy count as one). Try Pass the Bottle, or pick a bigger deck.";
/** A join refused by the 10 s between joins (a join or a new room a moment ago, in another tab or on another device). */
export const JOIN_COOLDOWN_TEXT = "Wait a few seconds, then try again: you came aboard or opened a room a moment ago.";

/** What was being tried, for the words: `game` is a Pass the Bottle turn, `skipper` any skipper tool (door, sail plan, deck, games, the hat). */
export type RoomAction = "load" | "open" | "join" | "write" | "leave" | "report" | "game" | "skipper";

const JOIN_TEXT: Record<JoinProblem, string> = {
  gone: "Couldn't find a room with that code. It may have closed.",
  ended: "This room has ended.",
  "skipper-away": "This room's skipper has gone ashore, so it's closing.",
  full: `That room is full (${ROOM_LIMITS.size} sailors).`,
  locked: "The door is locked.",
  refused: "You can't rejoin this room.",
};

const REFUSED_TEXT: Record<RoomAction, string> = {
  load: "Study Rooms isn't open on this database yet: its new rules need publishing.",
  open: "Wait a few seconds, then try again. New rooms need a minute between them.",
  join: JOIN_TEXT.refused,
  write: "Wait a few seconds between messages.",
  leave: "Couldn't leave the room just now. Try again in a few seconds.",
  report: "Couldn't send the report just now. Try again in a moment.",
  game: "Someone else took that turn.",
  skipper: "The room changed just now. Try again.",
};

/**
 * Plain words for a room problem. `errorCode` is a Firestore error code (roomErrorCode in
 * rooms.ts: "permission-denied", "resource-exhausted", "unavailable"…) or "paused" when
 * config/rooms has open rooms switched off. For a join, a reason the card shows wins.
 */
export function roomProblem(errorCode: string, action: RoomAction, join?: JoinProblem | null): string {
  if (action === "join" && join) return JOIN_TEXT[join];
  const code = errorCode.toLowerCase();
  if (code.includes("resource-exhausted")) return "Rooms are out of free database use for today. Your own timer keeps going; the crew catches up tomorrow.";
  if (code.includes("paused")) return "Open rooms are resting for now. Invite rooms still work.";
  // The room holds something this app doesn't know yet (a newer Ship changed it).
  if (code.includes("data-loss")) return "This room was changed by a newer version of Ship. Reload the page to keep studying with your crew.";
  if (/unavailable|deadline-exceeded|network|offline/.test(code)) return "Couldn't reach the room. Check your connection.";
  if (code.includes("not-found")) return action === "join" || action === "load" ? JOIN_TEXT.gone : "This room has ended.";
  if (code.includes("permission-denied")) return REFUSED_TEXT[action];
  return "Something went wrong in the room. Try again in a moment.";
}
