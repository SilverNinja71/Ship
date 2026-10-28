// The sailor's pose as a pure function of (state, tool, time, seed): where the
// head and hands are, which face to make, and what the hands hold. Nothing
// here draws; the layers read a Pose and paint it.

import type { AvatarState, StudyToolId } from "@ship/shared-types";
import { clamp, easeInOut, lerp, smoothstep } from "../draw.js";
import type { Point } from "../types.js";
import { fract, hash01, lerpPt, rotPt } from "./kit.js";
import { ARM_LOWER, ARM_UPPER, DESK_MID, HEAD_Y, NECK_Y, SHOULDER } from "./look.js";

/**
 * Where an arm is drawn in the stack: `under` before the desk (so the desk
 * hides it), `back` after the desk but behind the head, `desk` with the hands
 * on the desk tool, `front` over the face (a cup at the lips, a spyglass).
 */
export type ArmLayer = "under" | "back" | "desk" | "front";
export type Hold = "none" | "quill" | "stylus" | "boba" | "tea" | "spyglass";
export type EyeKind = "open" | "focus" | "blink" | "happy" | "sleep" | "squeeze" | "wink";
export type MouthKind = "smile" | "cat" | "flat" | "tongue" | "o" | "yawn" | "sleep" | "sip" | "grin";
export type BreakActivity = "sip" | "stretch" | "spyglass";

export interface ArmPose {
  shoulder: Point;
  elbow: Point;
  hand: Point;
  layer: ArmLayer;
  hold: Hold;
  /** Rotation of whatever the hand holds (radians). */
  angle: number;
}

export interface Pose {
  state: AvatarState;
  activity: BreakActivity | null;
  /** 0..1: how far into the current break activity (0 = hands in the lap). */
  amount: number;
  drink: "boba" | "tea";
  /** Offset of the neck base from its rest spot (breathing, slumping). */
  torso: Point;
  head: Point;
  headRot: number;
  /** How far the face features shift towards +x for the 3/4 view. */
  turn: number;
  eyes: EyeKind;
  /** Gaze, -1..1 on each axis. */
  look: Point;
  mouth: MouthKind;
  /** [left (-x), right (+x)]. */
  arms: [ArmPose, ArmPose];
  /** Writing progress for scribbles on the page: the current line and 0..1 along it. */
  write: { line: number; along: number };
  /** Keycap index under each hand while it is pressed, or -1. */
  keys: [number, number];
  /** Laptop lid, 0 closed .. 1 open. */
  lid: number;
  /** Seconds of sleep, for the Zzz bubbles; null when awake. */
  zzz: number | null;
  /** 0..1 how deep into a sip (boba pearls ride the straw, the teacup tilts). */
  sip: number;
  /** Spyglass sweep angle and how far it is extended (0..1). */
  pan: number;
  extend: number;
  stretch: number;
  /** Screen light on the face, 0..1. */
  glow: number;
  parrot: { bob: number; flap: number; tilt: number; asleep: boolean };
  /** Animation time for small loops (steam, glints), already slowed for reduced motion. */
  t: number;
}

const BREAK_ORDERS: readonly BreakActivity[][] = [
  ["sip", "stretch", "spyglass"],
  ["sip", "spyglass", "stretch"],
  ["stretch", "sip", "spyglass"],
  ["stretch", "spyglass", "sip"],
  ["spyglass", "sip", "stretch"],
  ["spyglass", "stretch", "sip"],
];
/** Where the quill or stylus tip sits relative to the writing hand. */
export const NIB = { x: 3.6, y: -6.8 };

/** Seconds per break activity, including reaching in and out. */
export const BREAK_SEGMENT = 6.5;
/** Phase offset so a frozen frame (t = 0) shows the first activity in full swing. */
const BREAK_PHASE = 2.4;

/** Which break activity (and drink) runs at time t, for galleries and tests. */
export function breakActivityAt(t: number, seed: number, reducedMotion = false): { activity: BreakActivity; drink: "boba" | "tea"; local: number } {
  const tb = t * (reducedMotion ? 0.25 : 1) + BREAK_PHASE;
  const seg = Math.floor(tb / BREAK_SEGMENT);
  const order = BREAK_ORDERS[(seed >>> 0) % BREAK_ORDERS.length];
  const activity = order[((seg % 3) + 3) % 3];
  const cycle = Math.floor(seg / 3);
  const drink = (((seed >>> 3) + cycle) & 1) === 0 ? "boba" : "tea";
  return { activity, drink, local: tb - seg * BREAK_SEGMENT };
}

/** Two-bone IK: the elbow for a shoulder and hand, bent away from the body on `side`. */
export function solveElbow(s: Point, h: Point, side: number, l1 = ARM_UPPER, l2 = ARM_LOWER): Point {
  const dx = h.x - s.x;
  const dy = h.y - s.y;
  const d = Math.hypot(dx, dy) || 0.001;
  if (d >= l1 + l2 - 0.01) return { x: s.x + (dx / d) * l1 * 0.98, y: s.y + (dy / d) * l1 * 0.98 };
  const dd = Math.max(d, Math.abs(l1 - l2) + 0.01);
  const a = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd);
  const hgt = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const bx = s.x + (dx / d) * a;
  const by = s.y + (dy / d) * a;
  const px = (-dy / d) * hgt;
  const py = (dx / d) * hgt;
  const e1 = { x: bx + px, y: by + py };
  const e2 = { x: bx - px, y: by - py };
  // Prefer the elbow that points outwards, then the lower one.
  const score = (e: Point) => e.x * side + e.y * 0.35;
  return score(e1) >= score(e2) ? e1 : e2;
}

function arm(side: -1 | 1, torso: Point, hand: Point, layer: ArmLayer, hold: Hold = "none", angle = 0, elbow?: Point): ArmPose {
  const shoulder = { x: torso.x + SHOULDER.x * side, y: NECK_Y + torso.y + SHOULDER.y };
  return { shoulder, elbow: elbow ?? solveElbow(shoulder, hand, side), hand, layer, hold, angle };
}

function blinkAt(t: number, seed: number): boolean {
  if (t < 0.3) return false;
  const period = 3.3 + 2.4 * hash01(seed, 1);
  const tt = t + hash01(seed, 2) * period;
  const cycle = Math.floor(tt / period);
  const local = tt - cycle * period;
  const at = period * (0.2 + 0.6 * hash01(seed, cycle + 11));
  const d = local - at;
  // Now and then a double blink.
  return (d >= 0 && d < 0.13) || (hash01(seed, cycle + 99) > 0.8 && d >= 0.26 && d < 0.38);
}

/** Head position in the station frame for a gentle lean around the rest spot. */
function headAt(torso: Point, dx: number, dy: number): Point {
  return { x: torso.x + dx, y: HEAD_Y + torso.y + dy };
}

/** A point in the head frame (relative to its center, before rotation) mapped into the station frame. */
export function headToStation(pose: Pose, p: Point): Point {
  const r = rotPt(p, pose.headRot);
  return { x: pose.head.x + r.x, y: pose.head.y + r.y };
}

export function computePose(state: AvatarState, tool: StudyToolId, time: number, seed: number, reducedMotion: boolean, screenSide: 1 | -1 = 1): Pose {
  const slow = reducedMotion ? 0.08 : 1;
  const tm = time * slow;
  const ph = hash01(seed, 3) * 10;
  const breath = Math.sin(tm * 1.6 + ph);
  const parrot = {
    bob: Math.sin(tm * 3.2 + ph),
    flap: reducedMotion ? 0 : smoothstep(0, 0.15, fract((time + ph) / 7.3) * 7.3) * (1 - smoothstep(0.55, 0.8, fract((time + ph) / 7.3) * 7.3)),
    tilt: Math.sin(tm * 0.9 + ph * 2) * 0.22,
    asleep: state === "DRIFTING_IDLE",
  };
  const base: Pose = {
    state,
    activity: null,
    amount: 0,
    drink: "boba",
    torso: { x: 0, y: breath * 0.6 },
    head: { x: 0, y: HEAD_Y },
    headRot: 0,
    turn: 4.5,
    eyes: "open",
    look: { x: 0, y: 0 },
    mouth: "smile",
    arms: [] as unknown as [ArmPose, ArmPose],
    write: { line: 0, along: 0 },
    keys: [-1, -1],
    lid: 1,
    zzz: null,
    sip: 0,
    pan: 0,
    extend: 0,
    stretch: 0,
    glow: 0,
    parrot,
    t: tm + ph,
  };

  if (state === "DRIFTING_IDLE") return idlePose(base, tool, time, tm, ph, reducedMotion);
  if (state === "SHORE_LEAVE_BREAK") return breakPose(base, time, tm, ph, seed, reducedMotion);
  return focusPose(base, tool, time, tm, ph, seed, screenSide);
}

function focusPose(p: Pose, tool: StudyToolId, time: number, tm: number, ph: number, seed: number, screenSide: 1 | -1): Pose {
  const torso = p.torso;
  const writes = tool === "quill-logbook" || tool === "tablet";
  p.eyes = blinkAt(time, seed) ? "blink" : "focus";
  p.mouth = hash01(seed, 5) < 0.34 && writes ? "tongue" : hash01(seed, 5) < 0.67 ? "flat" : "cat";
  p.lid = 1;

  if (writes) {
    // Write a line left to right with small loops, flick back, drop a line.
    const lineDur = tool === "tablet" ? 1.9 : 2.6;
    const back = 0.4;
    const cyc = tm / (lineDur + back);
    const line = Math.floor(cyc);
    const u = (cyc - line) * (lineDur + back);
    const along = u < lineDur ? u / lineDur : 1 - easeInOut((u - lineDur) / back);
    const loopX = Math.sin(u * 13) * (u < lineDur ? 1.1 : 0);
    const loopY = Math.cos(u * 13) * (u < lineDur ? 0.9 : 0) - (u < lineDur ? 0 : Math.sin(((u - lineDur) / back) * Math.PI) * 2.5);
    const row = ((line % 4) + 4) % 4;
    p.write = { line: row, along };
    const quill = tool === "quill-logbook";
    // The nib travels along a line on the page; the hand rides above it.
    const nib = quill ? { x: 8 + 16 * along, y: -71 + row * 2.4 } : { x: -2 + 18 * along, y: -70.5 + row * 1.8 };
    const hand = { x: nib.x + NIB.x + loopX, y: nib.y + NIB.y + loopY };
    p.arms = [
      arm(-1, torso, { x: quill ? -13 : -17, y: DESK_MID + 0.5 }, "desk"),
      arm(1, torso, hand, "desk", quill ? "quill" : "stylus", Math.sin(u * 13) * 0.08),
    ];
    p.head = headAt(torso, 1.5 + along * 2, 2.5 + Math.sin(tm * 0.8 + ph) * 0.6);
    p.headRot = 0.05 + along * 0.03;
    p.look = { x: 0.3 + along * 0.5, y: 0.9 };
    p.glow = tool === "tablet" ? 0.7 : 0;
    return p;
  }

  // Typing in bursts with short thinking pauses.
  const burstLen = 2.6 + hash01(seed, 6) * 1.2;
  const pause = 0.9;
  const bc = tm / (burstLen + pause);
  const bu = (bc - Math.floor(bc)) * (burstLen + pause);
  const typing = bu < burstLen ? smoothstep(0, 0.15, bu) * (1 - smoothstep(burstLen - 0.15, burstLen, bu)) : 0;
  const rate = 7.4;
  const tapL = Math.max(0, Math.sin(tm * rate + ph)) ** 3 * typing;
  const tapR = Math.max(0, Math.sin(tm * rate + ph + Math.PI * 0.9)) ** 3 * typing;
  const keyboard = tool === "mech-keyboard";
  const spread = keyboard ? 13 : 11;
  const lift = keyboard ? 3 : 2.2;
  const hl = { x: -spread + Math.sin(tm * 1.7 + ph) * 2.5 * typing, y: DESK_MID - 2 - tapL * lift };
  const hr = { x: spread + Math.sin(tm * 1.3 + ph + 1) * 2.5 * typing, y: DESK_MID - 2 - tapR * lift };
  p.arms = [arm(-1, torso, hl, "desk"), arm(1, torso, hr, "desk")];
  if (keyboard) {
    const key = (h: Point, tap: number, salt: number) => (tap > 0.55 ? Math.floor(hash01(Math.floor(tm * rate / (Math.PI * 2) + salt), salt) * 6) + (h.x > 0 ? 6 : 0) : -1);
    p.keys = [key(hl, tapL, 1), key(hr, tapR, 2)];
  }
  p.head = headAt(torso, keyboard ? 3 * screenSide : 1, 2 + (1 - typing) * -1 + Math.sin(tm * 0.7 + ph) * 0.5);
  p.headRot = keyboard ? 0.02 * screenSide : 0.04;
  p.look = keyboard ? { x: screenSide, y: 0.15 } : { x: 0.2, y: 0.85 };
  if (!keyboard) p.look.x += (1 - typing) * Math.sin(time * 0.5) * 0.3;
  p.turn = keyboard ? (screenSide > 0 ? 6 : 2.5) : 4.5;
  p.glow = 1;
  return p;
}

function breakPose(p: Pose, time: number, tm: number, ph: number, seed: number, reducedMotion: boolean): Pose {
  const { activity, drink, local } = breakActivityAt(time, seed, reducedMotion);
  const D = BREAK_SEGMENT;
  const amount = smoothstep(0.35, 1.35, local) * (1 - smoothstep(D - 1.35, D - 0.35, local));
  const a = easeInOut(amount);
  const tl = local * (reducedMotion ? 0.3 : 1);
  p.activity = activity;
  p.amount = amount;
  p.drink = drink;
  p.lid = 1;
  const torso = { ...p.torso };
  const lapL = { x: -17, y: -62 };
  const lapR = { x: 17, y: -62 };
  const blink = blinkAt(time, seed);
  p.head = headAt(torso, Math.sin(tm * 0.6 + ph) * 1.2, Math.sin(tm * 1.6 + ph) * 0.4);
  p.headRot = Math.sin(tm * 0.5 + ph) * 0.03;
  p.look = { x: Math.sin(tm * 0.37 + ph) * 0.5, y: -0.1 };
  p.eyes = blink ? "blink" : "open";
  p.mouth = "smile";

  const layerFor = (hand: Point, up: ArmLayer, threshold = -84): ArmLayer => (hand.y > threshold ? "under" : up);

  if (activity === "sip") {
    // Up to the lips, a long sip, down to the chest for a breath, another sip.
    const hold = clamp((local - 1.35) / (D - 2.7), 0, 1);
    const sipping = 1 - smoothstep(0.38, 0.48, hold) * (1 - smoothstep(0.62, 0.72, hold));
    p.sip = a * sipping;
    const tea = drink === "tea";
    const mouth = headToStation({ ...p, headRot: p.headRot }, { x: p.turn + 1, y: 17 });
    const atLips = tea ? { x: mouth.x + 10, y: mouth.y + 5 } : { x: mouth.x + 2, y: mouth.y + 27 };
    const atChest = tea ? { x: 13, y: -88 + torso.y } : { x: 9, y: -86 + torso.y };
    const held = lerpPt(atChest, atLips, sipping);
    const hand = lerpPt(lapR, held, a);
    const angle = tea ? -0.45 * p.sip : -0.06;
    p.arms = [arm(-1, torso, lapL, "under"), arm(1, torso, hand, layerFor(hand, "front", tea ? -82 : -96), drink, angle)];
    p.eyes = p.sip > 0.6 ? "happy" : blink ? "blink" : "open";
    p.mouth = p.sip > 0.6 ? "sip" : "cat";
    p.headRot += tea ? -0.04 * p.sip : 0;
    p.look = { x: 0.1, y: 0.1 };
    return p;
  }

  if (activity === "stretch") {
    const wig = Math.sin(tl * 2.4) * a;
    torso.y -= 3.5 * a;
    torso.x += wig * 1.6;
    p.torso = torso;
    p.stretch = a;
    const sh = (side: -1 | 1) => ({ x: torso.x + SHOULDER.x * side, y: NECK_Y + torso.y + SHOULDER.y - 3 * a });
    const up = (side: -1 | 1): ArmPose => {
      const s = sh(side);
      const lap = side < 0 ? lapL : lapR;
      const top = { x: torso.x + side * 15 + wig * 3, y: -184 + torso.y };
      const hand = lerpPt(lap, top, a);
      const elbowUp = { x: torso.x + side * 43 + wig * 1.5, y: -140 + torso.y };
      const elbow = a < 0.5 ? solveElbow(s, hand, side) : lerpPt(solveElbow(s, hand, side), elbowUp, smoothstep(0.5, 0.9, a));
      return { shoulder: s, elbow, hand, layer: layerFor(hand, "back"), hold: "none", angle: 0 };
    };
    p.arms = [up(-1), up(1)];
    p.head = headAt(torso, wig * 2, -1.5 * a);
    p.headRot = wig * 0.07 - 0.02 * a;
    p.eyes = a > 0.5 ? "squeeze" : blink ? "blink" : "open";
    p.mouth = a > 0.5 ? "yawn" : "smile";
    return p;
  }

  // Spyglass: raise it to the near eye, extend it, sweep the horizon.
  p.turn = lerp(4.5, 7, a);
  p.pan = Math.sin(tl * 0.8) * 0.09 * a - 0.03;
  p.extend = smoothstep(0.55, 1, amount);
  p.headRot = p.pan * 0.5;
  const eye = headToStation(p, { x: p.turn + 13, y: 6 });
  const grip = { x: eye.x + 10 * Math.cos(p.pan), y: eye.y + 10 * Math.sin(p.pan) + 2 };
  const hand = lerpPt(lapR, grip, a);
  p.arms = [arm(-1, torso, lapL, "under"), arm(1, torso, hand, layerFor(hand, "front", -96), "spyglass", lerp(-1.3, p.pan, smoothstep(0.3, 0.8, a)))];
  p.eyes = a > 0.6 ? "wink" : blink ? "blink" : "open";
  p.mouth = a > 0.6 ? "grin" : "smile";
  p.look = { x: 0.6, y: 0 };
  return p;
}

function idlePose(p: Pose, tool: StudyToolId, time: number, tm: number, ph: number, reducedMotion: boolean): Pose {
  const breath = Math.sin(tm * 1.1 + ph);
  const torso = { x: 0, y: 8 + breath * 1.1 };
  p.torso = torso;
  p.head = { x: -5, y: -107 + breath * 0.8 };
  p.headRot = -0.34;
  p.turn = 3;
  p.eyes = "sleep";
  p.mouth = "sleep";
  p.look = { x: 0, y: 0 };
  p.lid = tool === "laptop" ? 0 : 1;
  p.zzz = time * (reducedMotion ? 0.3 : 1) + ph;
  p.glow = tool === "laptop" ? 0 : 0.25;
  const sl = { x: -SHOULDER.x, y: NECK_Y + torso.y + SHOULDER.y };
  const sr = { x: SHOULDER.x, y: NECK_Y + torso.y + SHOULDER.y };
  // Forearms folded flat across the desk top, the head pillowed on them.
  p.arms = [
    { shoulder: sl, elbow: { x: -37, y: -80 + breath * 0.4 }, hand: { x: 9, y: -82 + breath * 0.4 }, layer: "back", hold: "none", angle: 0 },
    { shoulder: sr, elbow: { x: 37, y: -79 + breath * 0.4 }, hand: { x: -7, y: -81 + breath * 0.4 }, layer: "back", hold: "none", angle: 0 },
  ];
  return p;
}
