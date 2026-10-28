// Sails for every SailStyle. Each mast gets its canvas from rigFor(), so the
// sails always clear the crow's nest, the flag and the sailors below.

import type { SailStyle, ShipDefinition } from "@ship/shared-types";
import { INK, alpha, circlePath, ellipsePath, hashString, linearGradient, mix, outlineFor, paint, rng, roundRectPath, shade, sway } from "../../ship-engine/draw.js";
import type { Ctx, FrameInfo, Point } from "../../ship-engine/types.js";
import { glow, isNight, paintIn, rigColors, rigFor, stay } from "../kit.js";
import type { Rig } from "../kit.js";
import type { HullLayout } from "../types.js";

/** How many square sails stack on one mast, per hull family. */
const TIERS: Partial<Record<ShipDefinition["hull"], number>> = {
  caravel: 1,
  brig: 2,
  galleon: 2,
  "sky-galleon": 2,
  trireme: 1,
  "kitchen-barge": 1,
  "carrier-barge": 1,
};

interface Box {
  cx: number;
  top: number;
  bottom: number;
  hwTop: number;
  hwBot: number;
}

type Edge = "smooth" | "jagged" | "scallop" | "feather" | "flame";

interface SailMotion {
  bulge: number;
  belly: number;
}

/** Canvas for one mast. `i` is the mast's index in layout.masts (stern to bow). */
export function drawSails(ctx: Ctx, style: SailStyle, ship: ShipDefinition, layout: HullLayout, i: number, frame: FrameInfo): void {
  const rig = rigFor(ship, layout, i);
  const m = layout.masts[i];
  const colors = rigColors(ship);
  const phase = i * 1.3 + (hashString(ship.id) % 10);
  const sailing = ship.defaultSails !== "none";
  if (style === "none") {
    if (sailing) for (const b of tiers(ship, rig, m.x, 1)) yard(ctx, b, colors.wood, colors.iron);
    return;
  }
  if (style === "lateen") return lateen(ctx, ship, rig, m.x, frame, phase, colors.wood);
  if (style === "solar") return solarStack(ctx, ship, rig, m.x, frame, phase, colors.wood, colors.iron);

  const boxes = tiers(ship, rig, m.x, style === "papel-picado" ? 2 : undefined);
  const own = ship.defaultSails === style;
  boxes.forEach((b, k) => {
    const motion = billow(frame, phase + k * 0.7, b);
    const seed = hashString(ship.id) + i * 31 + k * 7;
    switch (style) {
      case "square":
        clothSail(ctx, b, motion, "smooth", ship.palette.sail, ship.palette.sailShade, frame, seed, phase);
        break;
      case "canvas-patched":
        clothSail(ctx, b, motion, "smooth", own ? ship.palette.sail : "#EFE5CF", own ? ship.palette.sailShade : "#D4C5A3", frame, seed, phase);
        patches(ctx, b, seed, own ? ship.palette.accent : "#C9774A");
        break;
      case "tattered": {
        const fill = own ? ship.palette.sail : mix(ship.palette.sail, "#8E897C", 0.5);
        const sh = own ? ship.palette.sailShade : mix(ship.palette.sailShade, "#5F5B52", 0.5);
        clothSail(ctx, b, motion, "jagged", fill, sh, frame, seed, phase, true);
        break;
      }
      case "feathered":
        featherSail(ctx, b, motion, ship, frame, seed, phase);
        break;
      case "papel-picado":
        papelPicado(ctx, b, frame, phase, i * 2 + k);
        break;
    }
    yard(ctx, b, colors.wood, colors.iron);
  });
  if (style === "papel-picado" && i < layout.masts.length - 1) {
    const next = layout.masts[i + 1];
    const nextRig = rigFor(ship, layout, i + 1);
    bunting(ctx, { x: m.x + 8, y: rig.sailFoot + 12 }, { x: next.x - 8, y: nextRig.sailFoot + 12 }, frame, i);
  }
}

/** Splits the mast's canvas span into stacked sail boxes, widest at the bottom. */
function tiers(ship: ShipDefinition, rig: Rig, cx: number, force?: number): Box[] {
  const span = rig.sailFoot - rig.sailTop;
  const n = force ?? (span < 150 ? 1 : TIERS[ship.hull] ?? 1);
  const gap = 10;
  const h = (span - gap * (n - 1)) / n;
  const out: Box[] = [];
  for (let k = 0; k < n; k++) {
    const top = rig.sailTop + k * (h + gap);
    const scale = n === 1 ? 1 : 0.8 + (0.2 * k) / (n - 1);
    const hw = rig.halfWidth * scale;
    out.push({ cx, top, bottom: top + h, hwTop: hw * 0.9, hwBot: hw });
  }
  return out;
}

function billow(frame: FrameInfo, phase: number, b: Box): SailMotion {
  const w = frame.wind;
  const s = 1 + 0.12 * sway(frame.t, 1.7, phase, frame.reducedMotion);
  const size = Math.min(1, (b.bottom - b.top) / 120);
  return { bulge: (8 + 22 * w) * s * size, belly: (8 + 18 * w) * s * size };
}

/** Samples the bottom edge's base curve from bottom-right to bottom-left. */
function footPoints(b: Box, m: SailMotion, n: number): Point[] {
  const p0 = { x: b.cx + b.hwBot + m.bulge * 0.3, y: b.bottom };
  const p2 = { x: b.cx - b.hwBot + m.bulge * 0.15, y: b.bottom };
  const c = { x: b.cx + m.bulge * 0.35, y: b.bottom + m.belly };
  const pts: Point[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const u = 1 - t;
    pts.push({ x: u * u * p0.x + 2 * u * t * c.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p2.y });
  }
  return pts;
}

function sailPath(c: Ctx, b: Box, m: SailMotion, edge: Edge, frame: FrameInfo, seed: number): void {
  const mid = (b.top + b.bottom) / 2;
  c.moveTo(b.cx - b.hwTop, b.top);
  c.quadraticCurveTo(b.cx, b.top + 5, b.cx + b.hwTop, b.top);
  c.quadraticCurveTo(b.cx + b.hwBot + m.bulge, mid, b.cx + b.hwBot + m.bulge * 0.3, b.bottom);
  if (edge === "smooth") {
    c.quadraticCurveTo(b.cx + m.bulge * 0.35, b.bottom + m.belly, b.cx - b.hwBot + m.bulge * 0.15, b.bottom);
  } else {
    const r = rng(seed);
    const n = edge === "jagged" ? 11 : edge === "flame" ? 5 : edge === "feather" ? 7 : 6;
    const pts = footPoints(b, m, n);
    const rm = frame.reducedMotion;
    for (let k = 0; k < n; k++) {
      const a = pts[k];
      const z = pts[k + 1];
      const mx = (a.x + z.x) / 2;
      const my = (a.y + z.y) / 2;
      const w = Math.abs(z.x - a.x);
      if (edge === "jagged") {
        const deep = r() < 0.3 ? 22 + r() * 14 : 4 + r() * 10;
        const flap = 3 * sway(frame.t, 4.2, k + seed, rm);
        c.lineTo(mx + (r() - 0.5) * 8, my + (k % 2 === 0 ? deep : -deep * 0.5) + flap);
        c.lineTo(z.x, z.y);
      } else if (edge === "scallop") {
        c.quadraticCurveTo(mx, my - w * 0.55, z.x, z.y);
      } else if (edge === "feather") {
        const drop = w * (0.9 + 0.25 * r()) + 2 * sway(frame.t, 2.5, k, rm);
        c.bezierCurveTo(a.x - w * 0.05, a.y + drop, z.x + w * 0.25, z.y + drop * 0.9, z.x, z.y);
      } else {
        const lick = w * (0.65 + 0.2 * sway(frame.t, 6.5, k * 2.1 + seed, rm));
        c.quadraticCurveTo(mx + w * 0.25, my + lick * 1.5, z.x, z.y);
      }
    }
  }
  c.quadraticCurveTo(b.cx - b.hwBot - m.bulge * 0.45, mid, b.cx - b.hwTop, b.top);
  c.closePath();
}

/** The shaded part shows on the trailing (stern) side and along the foot: the inner, lit shape sits up and forward. */
function litBox(b: Box): Box {
  const h = b.bottom - b.top;
  return { cx: b.cx + b.hwBot * 0.16, top: b.top - 2, bottom: b.bottom - h * 0.16, hwTop: b.hwTop * 0.84, hwBot: b.hwBot * 0.8 };
}

function clothSail(ctx: Ctx, b: Box, m: SailMotion, edge: Edge, fill: string, shadeColor: string, frame: FrameInfo, seed: number, phase: number, holes = false): void {
  paintIn(
    ctx,
    (c) => sailPath(c, b, m, edge, frame, seed),
    shadeColor,
    () => {
      ctx.beginPath();
      sailPath(ctx, litBox(b), { bulge: m.bulge * 0.9, belly: m.belly * 0.7 }, "smooth", frame, seed);
      ctx.fillStyle = fill;
      ctx.fill();
      seams(ctx, b, m, shade(shadeColor, -0.3));
    },
    { stroke: outlineFor(shadeColor) },
  );
  if (holes) tears(ctx, b, seed, frame, phase);
}

function seams(ctx: Ctx, b: Box, m: SailMotion, color: string): void {
  ctx.strokeStyle = alpha(color, 0.35);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (const f of [-0.5, 0, 0.5]) {
    const x0 = b.cx + f * b.hwTop;
    const x1 = b.cx + f * b.hwBot + m.bulge * 0.3 * (1 - Math.abs(f));
    ctx.moveTo(x0, b.top + 4);
    ctx.quadraticCurveTo(x0 + m.bulge * 0.5 * (1 - Math.abs(f)), (b.top + b.bottom) / 2, x1, b.bottom + m.belly * (1 - f * f) * 0.75 - 2);
  }
  ctx.stroke();
}

function tears(ctx: Ctx, b: Box, seed: number, frame: FrameInfo, phase: number): void {
  const r = rng(seed + 99);
  const h = b.bottom - b.top;
  const count = 2 + Math.floor(r() * 2);
  for (let k = 0; k < count; k++) {
    const x = b.cx + (r() - 0.5) * b.hwBot * 1.2;
    const y = b.top + h * (0.25 + r() * 0.45);
    const s = 6 + r() * 7;
    const wob = 1 + 0.08 * sway(frame.t, 3, phase + k, frame.reducedMotion);
    paint(
      ctx,
      (c) => {
        const n = 7;
        for (let j = 0; j < n; j++) {
          const a = (j / n) * Math.PI * 2;
          const rr = s * (0.6 + r() * 0.6) * wob;
          const px = x + Math.cos(a) * rr * 1.3;
          const py = y + Math.sin(a) * rr;
          if (j === 0) c.moveTo(px, py);
          else c.lineTo(px, py);
        }
        c.closePath();
      },
      alpha(INK, 0.55),
      { stroke: alpha(INK, 0.6), width: 2 },
    );
  }
}

function patches(ctx: Ctx, b: Box, seed: number, accent: string): void {
  const r = rng(seed + 7);
  const h = b.bottom - b.top;
  const tints = [mix("#EFE5CF", "#B98A5A", 0.35), mix("#EFE5CF", accent, 0.35), mix("#EFE5CF", "#6E8F6A", 0.3), "#F7F1E2"];
  const count = 2 + Math.floor(r() * 3);
  for (let k = 0; k < count; k++) {
    const w = 18 + r() * 26;
    const ph = 16 + r() * 22;
    const x = b.cx + (r() - 0.5) * (b.hwBot * 1.3) - w / 2;
    const y = b.top + 10 + r() * (h - ph - 18);
    const tilt = (r() - 0.5) * 0.25;
    ctx.save();
    ctx.translate(x + w / 2, y + ph / 2);
    ctx.rotate(tilt);
    paint(ctx, (c) => roundRectPath(c, -w / 2, -ph / 2, w, ph, 3), tints[k % tints.length], { width: 2 });
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    roundRectPath(ctx, -w / 2 + 3, -ph / 2 + 3, w - 6, ph - 6, 2);
    ctx.strokeStyle = alpha(INK, 0.45);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}

function yard(ctx: Ctx, b: Box, wood: string, iron: string): void {
  const x0 = b.cx - b.hwTop - 16;
  const x1 = b.cx + b.hwTop + 16;
  paint(ctx, (c) => {
    c.moveTo(x0, b.top - 3);
    c.quadraticCurveTo(b.cx, b.top - 8, x1, b.top - 3);
    c.lineTo(x1, b.top + 3);
    c.quadraticCurveTo(b.cx, b.top + 7, x0, b.top + 3);
    c.closePath();
  }, wood, { width: 3 });
  paint(ctx, (c) => roundRectPath(c, b.cx - 9, b.top - 7, 18, 13, 4), iron, { width: 2.5 });
}

// ---------------------------------------------------------------------------

function lateen(ctx: Ctx, ship: ShipDefinition, rig: Rig, cx: number, frame: FrameInfo, phase: number, wood: string): void {
  const top = rig.sailTop - 10;
  const foot = rig.sailFoot;
  const hw = rig.halfWidth * 1.08;
  const w = frame.wind;
  const s = 1 + 0.1 * sway(frame.t, 1.5, phase, frame.reducedMotion);
  const bulge = (10 + 24 * w) * s;
  const peak = { x: cx - hw * 0.92, y: top };
  const tack = { x: cx + hw, y: foot - 6 };
  const clew = { x: cx - hw * 0.7, y: foot };
  const own = ship.defaultSails === "lateen";
  const fill = own ? ship.palette.sail : "#FBF6EA";
  const sh = own ? ship.palette.sailShade : "#DCD2BC";
  const build = (c: Ctx, k = 1) => {
    c.moveTo(peak.x, peak.y);
    c.quadraticCurveTo((peak.x + tack.x) / 2 + 6, (peak.y + tack.y) / 2 + 8, tack.x, tack.y);
    c.quadraticCurveTo((tack.x + clew.x) / 2 + bulge * 0.3, foot + bulge * 0.55 * k, clew.x, clew.y);
    c.quadraticCurveTo(clew.x - bulge * 0.9 * k, (peak.y + clew.y) / 2, peak.x, peak.y);
    c.closePath();
  };
  paintIn(
    ctx,
    (c) => build(c),
    sh,
    () => {
      ctx.save();
      ctx.translate(18, -14);
      ctx.beginPath();
      build(ctx, 0.5);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = alpha(shade(sh, -0.3), 0.35);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (const f of [0.3, 0.55, 0.8]) {
        const ax = peak.x + (tack.x - peak.x) * f;
        const ay = peak.y + (tack.y - peak.y) * f;
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(ax - bulge * 0.3, (ay + foot) / 2, clew.x + (tack.x - clew.x) * f, foot + bulge * 0.3);
      }
      ctx.stroke();
    },
    { stroke: outlineFor(sh) },
  );
  // The long yard, high end aft.
  const ya = { x: peak.x - 18, y: peak.y - 6 };
  const yb = { x: tack.x + 26, y: tack.y + 8 };
  const ang = Math.atan2(yb.y - ya.y, yb.x - ya.x);
  const len = Math.hypot(yb.x - ya.x, yb.y - ya.y);
  ctx.save();
  ctx.translate(ya.x, ya.y);
  ctx.rotate(ang);
  paint(ctx, (c) => {
    c.moveTo(0, -3);
    c.quadraticCurveTo(len / 2, -9, len, -3);
    c.lineTo(len, 3);
    c.quadraticCurveTo(len / 2, 9, 0, 3);
    c.closePath();
  }, wood, { width: 3 });
  ctx.restore();
}

// ---------------------------------------------------------------------------

function featherSail(ctx: Ctx, b: Box, m: SailMotion, ship: ShipDefinition, frame: FrameInfo, seed: number, phase: number): void {
  const own = ship.defaultSails === "feathered";
  const fill = own ? ship.palette.sail : "#FFFFFF";
  const sh = own ? ship.palette.sailShade : "#DCD3F5";
  const quill = ship.palette.trim;
  paintIn(
    ctx,
    (c) => sailPath(c, b, m, "feather", frame, seed),
    sh,
    () => {
      ctx.beginPath();
      sailPath(ctx, litBox(b), { bulge: m.bulge, belly: m.belly * 0.6 }, "smooth", frame, seed);
      ctx.fillStyle = fill;
      ctx.fill();
      // Rows of overlapping feathers.
      const h = b.bottom - b.top;
      const rows = Math.max(2, Math.round(h / 34));
      ctx.strokeStyle = alpha(shade(sh, -0.25), 0.55);
      ctx.lineWidth = 1.6;
      for (let rIdx = 1; rIdx <= rows; rIdx++) {
        const y = b.top + (h * rIdx) / (rows + 0.6);
        const step = 26;
        const off = (rIdx % 2) * (step / 2);
        ctx.beginPath();
        for (let x = b.cx - b.hwBot - step + off; x < b.cx + b.hwBot + step; x += step) {
          const bx = x + m.bulge * 0.3 * (1 - Math.abs(x - b.cx) / (b.hwBot * 1.4));
          ctx.moveTo(bx - step / 2, y - 6);
          ctx.quadraticCurveTo(bx, y + 9, bx + step / 2, y - 6);
        }
        ctx.stroke();
      }
    },
    { stroke: outlineFor(sh) },
  );
  // Quills down the long feathers of the foot.
  const pts = footPoints(b, m, 7);
  ctx.strokeStyle = alpha(quill, 0.85);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let k = 0; k < 7; k++) {
    const mx = (pts[k].x + pts[k + 1].x) / 2;
    const my = (pts[k].y + pts[k + 1].y) / 2;
    ctx.moveTo(mx, my - 14);
    ctx.lineTo(mx + 2, my + Math.abs(pts[k + 1].x - pts[k].x) * 0.7);
  }
  ctx.stroke();
  if (isNight(ship)) {
    const r = rng(seed + 3);
    for (let k = 0; k < 3; k++) {
      const x = b.cx + (r() - 0.5) * b.hwBot * 1.4;
      const y = b.top + r() * (b.bottom - b.top);
      const tw = 0.5 + 0.5 * sway(frame.t, 2.2, phase + k * 2, frame.reducedMotion);
      sparkle(ctx, x, y, 5 + 3 * tw, alpha(ship.palette.glow ?? "#FFF2B3", 0.5 + 0.5 * tw));
    }
  }
}

export function sparkle(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

// ---------------------------------------------------------------------------

/** Four fiery sails per mast, stacked, with one soft glow behind the stack. */
function solarStack(ctx: Ctx, ship: ShipDefinition, rig: Rig, cx: number, frame: FrameInfo, phase: number, wood: string, iron: string): void {
  const own = ship.defaultSails === "solar";
  const fill = own ? ship.palette.sail : "#FF8A3D";
  const sh = own ? ship.palette.sailShade : "#E5532D";
  const hot = own ? ship.palette.glow ?? "#FFD166" : "#FFD166";
  const span = rig.sailFoot - rig.sailTop;
  const gap = 8;
  const h = (span - gap * 3) / 4;
  const pulse = 0.85 + 0.15 * sway(frame.t, 1.3, phase, frame.reducedMotion);
  glow(ctx, cx, rig.sailTop + span * 0.55, rig.halfWidth * 1.7, hot, (isNight(ship) ? 0.9 : 0.55) * pulse);
  const scales = [0.6, 0.73, 0.87, 1];
  for (let k = 0; k < 4; k++) {
    const top = rig.sailTop + k * (h + gap);
    const hw = rig.halfWidth * scales[k];
    const b: Box = { cx, top, bottom: top + h * 0.86, hwTop: hw * 0.86, hwBot: hw };
    const m = billow(frame, phase + k, b);
    const grad = linearGradient(ctx, 0, b.top, 0, b.bottom + h * 0.2, [
      [0, mix(hot, "#FFFFFF", 0.25)],
      [0.45, fill],
      [1, sh],
    ]);
    paintIn(
      ctx,
      (c) => sailPath(c, b, m, "flame", frame, hashString(ship.id) + k * 13),
      grad,
      () => {
        // Sun-ray seams fanning out from the yard's middle.
        ctx.strokeStyle = alpha(mix(sh, "#7A2A12", 0.4), 0.4);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let f = -2; f <= 2; f++) {
          ctx.moveTo(cx, b.top + 2);
          ctx.lineTo(cx + f * hw * 0.42 + m.bulge * 0.3, b.bottom + h * 0.15);
        }
        ctx.stroke();
        ctx.beginPath();
        ellipsePath(ctx, cx + m.bulge * 0.25, b.top + (b.bottom - b.top) * 0.42, hw * 0.22, (b.bottom - b.top) * 0.22);
        ctx.fillStyle = alpha(mix(hot, "#FFFFFF", 0.5), 0.55);
        ctx.fill();
      },
      { stroke: mix(outlineFor(sh), "#5A1E0E", 0.3) },
    );
    yard(ctx, b, wood, iron);
  }
}

// ---------------------------------------------------------------------------

const PICADO = ["#FF7AC6", "#FFB84D", "#3DF2C2", "#FFE25C", "#A98BFF", "#FF6B6B"];

/** A cut-paper banner: scalloped foot, a punched flower and diamonds, fluttering. */
function papelPicado(ctx: Ctx, b: Box, frame: FrameInfo, phase: number, colorIndex: number): void {
  const color = PICADO[colorIndex % PICADO.length];
  const rm = frame.reducedMotion;
  const h = b.bottom - b.top;
  const flutter = (y: number) => (3 + 6 * frame.wind) * sway(frame.t, 3.4, phase + y * 0.05, rm);
  const hw = b.hwBot * 0.95;
  const build = (c: Ctx) => {
    // Outline: straight top, fluttering sides, scalloped foot.
    c.moveTo(b.cx - hw, b.top);
    c.lineTo(b.cx + hw, b.top);
    const steps = 6;
    for (let k = 1; k <= steps; k++) {
      const y = b.top + (h * k) / steps;
      c.lineTo(b.cx + hw + flutter(y) * (k / steps), y);
    }
    const n = 7;
    const right = b.cx + hw + flutter(b.bottom);
    const left = b.cx - hw + flutter(b.bottom);
    for (let k = 0; k < n; k++) {
      const x0 = right + ((left - right) * k) / n;
      const x1 = right + ((left - right) * (k + 1)) / n;
      c.quadraticCurveTo((x0 + x1) / 2, b.bottom - 14, x1, b.bottom);
    }
    for (let k = steps - 1; k >= 1; k--) {
      const y = b.top + (h * k) / steps;
      c.lineTo(b.cx - hw + flutter(y) * (k / steps), y);
    }
    c.closePath();
    // Punched holes (even-odd fill makes them see-through).
    const fx = b.cx + flutter(b.top + h * 0.5) * 0.5;
    const fy = b.top + h * 0.5;
    const pr = Math.min(hw, h) * 0.2;
    for (let p = 0; p < 6; p++) {
      const a = (p / 6) * Math.PI * 2;
      ellipsePath(c, fx + Math.cos(a) * pr * 1.25, fy + Math.sin(a) * pr * 1.25, pr * 0.62, pr * 0.34, a);
    }
    circlePath(c, fx, fy, pr * 0.42);
    for (const side of [-1, 1]) {
      for (let k = 0; k < 2; k++) {
        const dx = fx + side * hw * (0.48 + k * 0.28);
        const dy = b.top + h * (0.28 + k * 0.4);
        diamond(c, dx, dy, pr * 0.42, pr * 0.62);
      }
    }
    for (let x = b.cx - hw + 14; x < b.cx + hw - 8; x += 18) circlePath(c, x + flutter(b.top + 10) * 0.2, b.top + 11, 2.6);
  };
  ctx.beginPath();
  build(ctx);
  ctx.fillStyle = color;
  ctx.fill("evenodd");
  ctx.save();
  ctx.clip("evenodd");
  ctx.fillStyle = alpha(shade(color, -0.3), 0.35);
  ctx.fillRect(b.cx - hw - 20, b.top + h * 0.72, hw * 2 + 40, h);
  ctx.fillStyle = alpha("#FFFFFF", 0.22);
  ctx.fillRect(b.cx - hw - 20, b.top, hw * 0.5, h);
  ctx.restore();
  ctx.beginPath();
  build(ctx);
  ctx.lineWidth = 2.6;
  ctx.lineJoin = "round";
  ctx.strokeStyle = outlineFor(color);
  ctx.stroke();
}

function diamond(c: Ctx, x: number, y: number, w: number, h: number): void {
  c.moveTo(x, y - h);
  c.lineTo(x + w, y);
  c.lineTo(x, y + h);
  c.lineTo(x - w, y);
  c.closePath();
}

/** Strings of tiny papel picado flags between two masts. */
function bunting(ctx: Ctx, a: Point, b: Point, frame: FrameInfo, salt: number): void {
  const sag = 22;
  stay(ctx, a, b, "#2B1840", sag, 1.8);
  const n = Math.max(3, Math.floor((b.x - a.x) / 26));
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t + sag * 2 * t * (1 - t);
    const color = PICADO[(k + salt) % PICADO.length];
    const flap = 2.5 * sway(frame.t, 3.8, k + salt, frame.reducedMotion);
    paint(ctx, (c) => {
      c.moveTo(x - 8, y);
      c.lineTo(x + 8, y);
      c.lineTo(x + 8 + flap, y + 16);
      c.quadraticCurveTo(x + flap, y + 11, x - 8 + flap, y + 16);
      c.closePath();
    }, color, { width: 1.6 });
  }
}
