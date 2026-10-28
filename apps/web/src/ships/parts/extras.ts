// The ShipExtra pieces the hull drawers place: lanterns, cannons, portholes,
// stacks, turrets, oars, wings, fins and the rest. Each takes its position in
// ship units and animates only from `frame`.

import type { ShipDefinition } from "@ship/shared-types";
import {
  INK,
  alpha,
  circlePath,
  ellipsePath,
  line,
  linearGradient,
  mix,
  outlineFor,
  paint,
  rng,
  roundRectPath,
  shade,
  smoothPath,
  sway,
  withTransform,
} from "../../ship-engine/draw.js";
import type { Ctx, FrameInfo, Point } from "../../ship-engine/types.js";
import { band, flicker, glow, isNight, paintIn, rivetRow, roundedPoly } from "../kit.js";

// ---------------------------------------------------------------------------
// Lanterns

export interface LanternOptions {
  seed?: number;
  /** Chain length below the hook. 0 sits the lantern on `y` instead. */
  hang?: number;
  size?: number;
  /** Round paper lanterns (the Alebrijes) instead of brass ship lanterns. */
  paper?: string;
}

/** A lantern hanging from (x, y), with a soft flickering glow (bigger at night). */
export function lantern(ctx: Ctx, x: number, y: number, ship: ShipDefinition, frame: FrameInfo, opts: LanternOptions = {}): void {
  const seed = opts.seed ?? x;
  const s = opts.size ?? 1;
  const hang = opts.hang ?? 12;
  const lit = ship.palette.glow ?? "#FFD27A";
  const f = flicker(frame, seed);
  const night = isNight(ship);
  const swingA = hang > 0 ? 0.07 * sway(frame.t, 1.5, seed, frame.reducedMotion) : 0;
  withTransform(ctx, { x, y, rotate: swingA }, () => {
    if (hang > 0) line(ctx, [{ x: 0, y: 0 }, { x: 0, y: hang }], "#3A3030", 2);
    const cy = hang + 14 * s;
    if (opts.paper) {
      paintIn(
        ctx,
        (c) => ellipsePath(c, 0, cy, 13 * s, 15 * s),
        mix(opts.paper!, "#FFFFFF", 0.15 * f),
        () => {
          ctx.strokeStyle = alpha(shade(opts.paper!, -0.4), 0.6);
          ctx.lineWidth = 1.4;
          for (const k of [-0.5, 0, 0.5]) {
            ctx.beginPath();
            ellipsePath(ctx, 0, cy, 13 * s * Math.abs(k) + 0.5, 15 * s);
            ctx.stroke();
          }
          ctx.beginPath();
          ellipsePath(ctx, -4 * s, cy - 4 * s, 4 * s, 6 * s);
          ctx.fillStyle = alpha("#FFFFFF", 0.35);
          ctx.fill();
        },
        { width: 2.4 },
      );
      paint(ctx, (c) => roundRectPath(c, -6 * s, cy - 18 * s, 12 * s, 5 * s, 2), "#2B1840", { width: 1.8 });
      paint(ctx, (c) => roundRectPath(c, -6 * s, cy + 13 * s, 12 * s, 5 * s, 2), "#2B1840", { width: 1.8 });
      line(ctx, [{ x: 0, y: cy + 18 * s }, { x: 0, y: cy + 26 * s }], opts.paper, 2);
    } else {
      const metal = "#3B3434";
      paint(ctx, (c) => {
        c.moveTo(-8 * s, cy - 10 * s);
        c.lineTo(0, cy - 18 * s);
        c.lineTo(8 * s, cy - 10 * s);
        c.closePath();
      }, metal, { width: 2 });
      paint(ctx, (c) => roundRectPath(c, -8 * s, cy - 10 * s, 16 * s, 20 * s, 4 * s), mix(lit, "#FFFFFF", 0.35 * f), { stroke: outlineFor(metal), width: 2.4 });
      line(ctx, [{ x: 0, y: cy - 10 * s }, { x: 0, y: cy + 10 * s }], metal, 1.8);
      ctx.beginPath();
      ellipsePath(ctx, 0, cy + 2 * s, 3 * s, 5 * s * f);
      ctx.fillStyle = mix(lit, "#FF8A3D", 0.4);
      ctx.fill();
      paint(ctx, (c) => roundRectPath(c, -9 * s, cy + 9 * s, 18 * s, 5 * s, 2), metal, { width: 2 });
      paint(ctx, (c) => circlePath(c, 0, cy - 19 * s, 3 * s), metal, { width: 1.6 });
    }
    glow(ctx, 0, cy, (night ? 78 : 30) * s, lit, (night ? 0.95 : 0.5) * f);
  });
}

// ---------------------------------------------------------------------------
// Cannons and ports

export interface PortOptions {
  size?: number;
  cannon?: boolean;
  frameColor?: string;
  lid?: string;
}

/** An open gun port with a cannon muzzle facing the viewer. */
export function gunPort(ctx: Ctx, x: number, y: number, ship: ShipDefinition, opts: PortOptions = {}): void {
  const s = opts.size ?? 1;
  const w = 26 * s;
  const h = 22 * s;
  const frameColor = opts.frameColor ?? ship.palette.trim;
  paint(ctx, (c) => roundRectPath(c, x - w / 2 - 3, y - h / 2 - 3, w + 6, h + 6, 5), frameColor, { width: 2.4 });
  paint(ctx, (c) => roundRectPath(c, x - w / 2, y - h / 2, w, h, 4), "#241A18", { width: 2 });
  if (opts.lid) {
    paint(ctx, (c) => {
      c.moveTo(x - w / 2 - 2, y - h / 2 - 4);
      c.lineTo(x + w / 2 + 2, y - h / 2 - 4);
      c.lineTo(x + w / 2 + 6, y - h / 2 - 14 * s);
      c.lineTo(x - w / 2 - 6, y - h / 2 - 14 * s);
      c.closePath();
    }, opts.lid, { width: 2.2 });
  }
  if (opts.cannon !== false) {
    paint(ctx, (c) => circlePath(c, x, y + 1, 8.5 * s), "#3A3A44", { width: 2.4 });
    paint(ctx, (c) => circlePath(c, x, y + 1, 4 * s), "#0E0E12", { stroke: false });
    ctx.beginPath();
    ctx.arc(x, y + 1, 7 * s, -2.6, -1.4);
    ctx.strokeStyle = alpha("#FFFFFF", 0.45);
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
}

/** A cannon in profile on a little wheeled carriage (for open decks). */
export function deckCannon(ctx: Ctx, x: number, y: number, facing: 1 | -1, metal = "#3A3A44", wood = "#7A4A2B"): void {
  withTransform(ctx, { x, y, scaleX: facing }, () => {
    paint(ctx, (c) => roundRectPath(c, -22, -16, 34, 12, 3), wood, { width: 2.4 });
    for (const wx of [-14, 6]) paint(ctx, (c) => circlePath(c, wx, -4, 6), shade(wood, -0.15), { width: 2.2 });
    paint(ctx, (c) => {
      c.moveTo(-26, -30);
      c.lineTo(26, -24);
      c.lineTo(26, -14);
      c.lineTo(-26, -14);
      c.quadraticCurveTo(-34, -22, -26, -30);
      c.closePath();
    }, metal, { width: 2.6 });
    paint(ctx, (c) => roundRectPath(c, 24, -27, 6, 16, 2), shade(metal, 0.15), { width: 2 });
  });
}

// ---------------------------------------------------------------------------
// Portholes

export function porthole(ctx: Ctx, x: number, y: number, r: number, ship: ShipDefinition, frame: FrameInfo, opts: { rim?: string; seed?: number; bolts?: boolean } = {}): void {
  const rim = opts.rim ?? "#D4AF37";
  const night = isNight(ship);
  const lit = ship.palette.glow ?? "#FFD27A";
  paint(ctx, (c) => circlePath(c, x, y, r + 5), rim, { width: 2.6 });
  const glass = night
    ? mix(lit, "#FFFFFF", 0.25)
    : linearGradient(ctx, x, y - r, x, y + r, [
        [0, "#D8F4FF"],
        [1, "#7FC6E0"],
      ]);
  paintIn(
    ctx,
    (c) => circlePath(c, x, y, r),
    glass,
    () => {
      ctx.beginPath();
      ctx.moveTo(x - r, y - r * 0.2);
      ctx.lineTo(x - r * 0.2, y - r);
      ctx.lineTo(x + r * 0.15, y - r);
      ctx.lineTo(x - r, y + r * 0.15);
      ctx.closePath();
      ctx.fillStyle = alpha("#FFFFFF", 0.6);
      ctx.fill();
    },
    { stroke: outlineFor(rim), width: 2.2 },
  );
  if (opts.bolts !== false && r >= 8) {
    ctx.fillStyle = shade(rim, -0.4);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.2;
      ctx.beginPath();
      circlePath(ctx, x + Math.cos(a) * (r + 2.5), y + Math.sin(a) * (r + 2.5), 1.3);
      ctx.fill();
    }
  }
  if (night) glow(ctx, x, y, r * 3.4, lit, 0.55 * flicker(frame, opts.seed ?? x));
}

// ---------------------------------------------------------------------------
// Periscope, smokestacks, turrets, telescopes

/** A periscope whose head slowly turns to look around. */
export function periscope(ctx: Ctx, x: number, baseY: number, topY: number, ship: ShipDefinition, frame: FrameInfo): void {
  const pipe = ship.palette.trim;
  paintIn(ctx, (c) => roundRectPath(c, x - 5, topY, 10, baseY - topY, 3), pipe, () => band(ctx, x + 1, topY, x + 6, baseY, shade(pipe, -0.2)), { width: 2.6 });
  for (let y = topY + 30; y < baseY - 10; y += 34) paint(ctx, (c) => roundRectPath(c, x - 7, y, 14, 5, 2), "#D4AF37", { width: 1.8 });
  const turn = Math.cos(frame.t * (frame.reducedMotion ? 0.03 : 0.35));
  const face = turn >= 0 ? 1 : -1;
  const w = 10 + 16 * Math.abs(turn);
  withTransform(ctx, { x, y: topY, scaleX: face }, () => {
    paint(ctx, (c) => roundRectPath(c, -8, -14, 8 + w, 18, [6, 4, 4, 6]), pipe, { width: 2.6 });
    paint(ctx, (c) => roundRectPath(c, w - 2, -12, 6, 14, 2), "#D4AF37", { width: 1.8 });
    if (Math.abs(turn) > 0.3) {
      ctx.beginPath();
      circlePath(ctx, w + 1, -5, 3);
      ctx.fillStyle = mix("#9EE6FF", "#FFFFFF", 0.4);
      ctx.fill();
    }
  });
}

export interface StackColors {
  body: string;
  band: string;
  cap: string;
}

/** A raked funnel. Returns the middle of its mouth (where smoke rises). */
export function smokestack(ctx: Ctx, x: number, baseY: number, topY: number, w: number, colors: StackColors, rake = 0.08): Point {
  const lean = (baseY - topY) * rake;
  const top = { x: x - lean, y: topY };
  paintIn(
    ctx,
    (c) => roundedPoly(c, [
      { x: x - w / 2, y: baseY, r: 0 },
      { x: top.x - w / 2, y: topY, r: 6 },
      { x: top.x + w / 2, y: topY, r: 6 },
      { x: x + w / 2, y: baseY, r: 0 },
    ]),
    colors.body,
    () => {
      ctx.save();
      ctx.transform(1, 0, -rake, 1, rake * baseY, 0);
      band(ctx, x + w * 0.18, topY, x + w, baseY, shade(colors.body, -0.18));
      band(ctx, x - w * 0.36, topY, x - w * 0.2, baseY, alpha("#FFFFFF", 0.22));
      band(ctx, x - w, topY + 14, x + w, topY + 34, colors.band);
      band(ctx, x - w, topY + 40, x + w, topY + 46, colors.band);
      ctx.restore();
    },
    { width: 3.2 },
  );
  paint(ctx, (c) => roundRectPath(c, top.x - w / 2 - 5, topY - 6, w + 10, 10, 4), colors.cap, { width: 3 });
  paint(ctx, (c) => ellipsePath(c, top.x, topY - 4, w / 2 - 2, 3), "#1A1A1E", { stroke: false });
  return { x: top.x, y: topY - 6 };
}

export interface TurretOptions {
  facing: 1 | -1;
  barrels: 2 | 3;
  size?: number;
  color?: string;
  seed?: number;
}

/** A gun turret on its barbette, standing on a deck surface at `y`. drawDeck. */
export function turret(ctx: Ctx, x: number, y: number, ship: ShipDefinition, frame: FrameInfo, opts: TurretOptions): void {
  const s = opts.size ?? 1;
  const color = opts.color ?? ship.palette.deck;
  const elev = -0.06 + 0.04 * sway(frame.t, 0.35, opts.seed ?? x, frame.reducedMotion);
  withTransform(ctx, { x, y: y - 12, scaleX: opts.facing, scale: undefined }, () => {
    ctx.scale(s, s);
    // Barrels first, so the housing covers their roots.
    for (let k = 0; k < opts.barrels; k++) {
      withTransform(ctx, { x: 34, y: -30 - k * 7 + (opts.barrels === 3 ? 4 : 0), rotate: elev }, () => {
        paint(ctx, (c) => roundedPoly(c, [
          { x: 0, y: -5, r: 1 },
          { x: 64, y: -3.5, r: 1 },
          { x: 64, y: 3.5, r: 1 },
          { x: 0, y: 5, r: 1 },
        ]), shade(color, -0.25 + k * 0.06), { width: 2.4 });
        paint(ctx, (c) => roundRectPath(c, 60, -5, 9, 10, 3), shade(color, -0.35), { width: 2 });
      });
    }
    paint(ctx, (c) => roundRectPath(c, -48, -16, 96, 18, 6), shade(color, -0.15), { width: 3 });
    paintIn(
      ctx,
      (c) => roundedPoly(c, [
        { x: -50, y: -14, r: 6 },
        { x: -44, y: -50, r: 10 },
        { x: 28, y: -50, r: 8 },
        { x: 46, y: -14, r: 4 },
      ]),
      color,
      () => {
        band(ctx, -60, -30, 60, -14, shade(color, -0.12));
        band(ctx, -40, -48, 20, -44, alpha("#FFFFFF", 0.3));
        rivetRow(ctx, -40, 30, -22, 12, color, 1.8);
      },
      { width: 3.2 },
    );
    paint(ctx, (c) => roundRectPath(c, -20, -58, 22, 9, 3), shade(color, -0.1), { width: 2.4 });
  });
}

/** A brass telescope on a pivot, slowly sweeping the horizon. */
export function telescope(ctx: Ctx, x: number, y: number, frame: FrameInfo, opts: { facing?: 1 | -1; size?: number; seed?: number } = {}): void {
  const s = opts.size ?? 1;
  const brass = "#D4A537";
  const pan = -0.22 + 0.12 * sway(frame.t, 0.3, opts.seed ?? x, frame.reducedMotion);
  withTransform(ctx, { x, y, scaleX: opts.facing ?? 1, scale: undefined }, () => {
    ctx.scale(s, s);
    line(ctx, [{ x: 0, y: -26 }, { x: -12, y: 0 }], outlineFor("#5A4632"), 5);
    line(ctx, [{ x: 0, y: -26 }, { x: 12, y: 0 }], outlineFor("#5A4632"), 5);
    line(ctx, [{ x: 0, y: -26 }, { x: -12, y: 0 }], "#5A4632", 2.5);
    line(ctx, [{ x: 0, y: -26 }, { x: 12, y: 0 }], "#5A4632", 2.5);
    withTransform(ctx, { y: -28, rotate: pan }, () => {
      paint(ctx, (c) => roundRectPath(c, -30, -5, 26, 10, 3), shade(brass, -0.1), { width: 2.4 });
      paint(ctx, (c) => roundRectPath(c, -6, -6, 28, 12, 3), brass, { width: 2.4 });
      paint(ctx, (c) => roundRectPath(c, 20, -7.5, 18, 15, 3), shade(brass, 0.12), { width: 2.4 });
      ctx.beginPath();
      ellipsePath(ctx, 38, 0, 2.5, 6);
      ctx.fillStyle = "#BFE8F5";
      ctx.fill();
    });
    paint(ctx, (c) => circlePath(c, 0, -28, 4), "#8A6A2A", { width: 2 });
  });
}

// ---------------------------------------------------------------------------
// Oars

export interface OarBankOptions {
  count: number;
  length: number;
  phase: number;
  color: string;
  blade?: string;
}

/** One bank of oars along the hull side, rowing together. drawFront. */
export function oarBank(ctx: Ctx, from: number, to: number, y: number, frame: FrameInfo, opts: OarBankOptions): void {
  const rm = frame.reducedMotion;
  const speed = rm ? 0.12 : 1.9;
  for (let k = 0; k < opts.count; k++) {
    const x = from + ((to - from) * (k + 0.5)) / opts.count;
    const p = frame.t * speed + opts.phase - k * 0.05;
    const swingA = 0.32 * Math.sin(p);
    const lift = 0.1 * Math.max(0, Math.cos(p));
    const a = Math.PI / 2 + 0.45 + swingA - lift;
    const tip = { x: x + Math.cos(a) * opts.length, y: y + Math.sin(a) * opts.length };
    paint(ctx, (c) => ellipsePath(c, x, y, 5, 4), "#2A1E1A", { width: 1.6 });
    line(ctx, [{ x, y }, tip], outlineFor(opts.color), 6.5);
    line(ctx, [{ x, y }, tip], opts.color, 3.5);
    withTransform(ctx, { x: tip.x, y: tip.y, rotate: a }, () => {
      paint(ctx, (c) => roundRectPath(c, -6, -6, 26, 12, 6), opts.blade ?? opts.color, { width: 2.2 });
    });
  }
}

// ---------------------------------------------------------------------------
// Wings

export interface WingOptions {
  span: number;
  /** Resting angle (radians). 0 points the wing straight aft; positive raises it. */
  angle: number;
  /** Flap amplitude in radians (default 0.18). */
  flap?: number;
  /** The far wing is a shade darker: it sits in the hull's shadow. */
  far?: boolean;
  phase?: number;
}

/** A big feathered wing rooted at `root`, reaching aft, flapping gently. */
export function wing(ctx: Ctx, root: Point, ship: ShipDefinition, frame: FrameInfo, opts: WingOptions): void {
  const white = opts.far ? mix(ship.palette.sail, ship.palette.sailShade, 0.6) : ship.palette.sail;
  const shadeC = opts.far ? shade(ship.palette.sailShade, -0.1) : ship.palette.sailShade;
  const gold = ship.palette.trim;
  const flap = (opts.flap ?? 0.18) * sway(frame.t, 1.3, opts.phase ?? 0, frame.reducedMotion);
  const S = opts.span;
  const feather = (bx: number, by: number, dir: number, len: number, w: number, fill: string) => {
    const tx = bx + Math.cos(dir) * len;
    const ty = by + Math.sin(dir) * len;
    const nx = -Math.sin(dir) * w;
    const ny = Math.cos(dir) * w;
    paint(ctx, (c) => {
      c.moveTo(bx - nx * 0.6, by - ny * 0.6);
      c.quadraticCurveTo(bx + (tx - bx) * 0.55 - nx, by + (ty - by) * 0.55 - ny, tx, ty);
      c.quadraticCurveTo(bx + (tx - bx) * 0.6 + nx, by + (ty - by) * 0.6 + ny, bx + nx * 0.6, by + ny * 0.6);
      c.closePath();
    }, fill, { width: 2.4 });
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + (tx - bx) * 0.8, by + (ty - by) * 0.8);
    ctx.strokeStyle = alpha(shade(shadeC, -0.3), 0.5);
    ctx.lineWidth = 1.2;
    ctx.stroke();
  };
  // Local frame: root at the origin, the wing's arm running toward -x.
  withTransform(ctx, { x: root.x, y: root.y, rotate: opts.angle + flap }, () => {
    // Primaries fan out from the hand: from hanging down to streaming aft.
    for (let k = 5; k >= 0; k--) {
      const t = k / 5;
      const dir = Math.PI * (0.58 + 0.38 * t);
      feather(-S * (0.5 + 0.09 * k), -S * 0.03 * k, dir, S * (0.3 + 0.07 * t), S * 0.045, k % 2 ? shadeC : white);
    }
    // Secondaries hang along the arm.
    for (let k = 4; k >= 0; k--) {
      feather(-S * (0.1 + 0.095 * k), S * 0.02, Math.PI * (0.52 + 0.012 * k), S * 0.24, S * 0.05, k % 2 ? white : shadeC);
    }
    // Coverts over the arm, with two rows of scalloped little feathers.
    paintIn(
      ctx,
      (c) => {
        c.moveTo(10, 8);
        c.bezierCurveTo(-S * 0.12, -S * 0.16, -S * 0.5, -S * 0.17, -S * 0.86, -S * 0.12);
        c.bezierCurveTo(-S * 0.7, -S * 0.02, -S * 0.4, S * 0.1, 6, S * 0.12);
        c.closePath();
      },
      white,
      () => {
        ctx.strokeStyle = alpha(shade(shadeC, -0.25), 0.7);
        ctx.lineWidth = 1.6;
        for (let row = 0; row < 2; row++) {
          ctx.beginPath();
          for (let x = -14; x > -S * 0.75; x -= 18) {
            const y = -S * 0.05 + row * S * 0.07 - x * 0.04;
            ctx.moveTo(x + 9, y - 4);
            ctx.quadraticCurveTo(x, y + 9, x - 9, y - 4);
          }
          ctx.stroke();
        }
      },
      { width: 2.8 },
    );
    ctx.beginPath();
    ctx.moveTo(8, 4);
    ctx.bezierCurveTo(-S * 0.12, -S * 0.15, -S * 0.5, -S * 0.16, -S * 0.84, -S * 0.12);
    ctx.strokeStyle = gold;
    ctx.lineWidth = 3.2;
    ctx.lineCap = "round";
    ctx.stroke();
  });
}

// ---------------------------------------------------------------------------
// Galley bits: kitchen chimney and fish fins

/** A stout copper kitchen stovepipe with a rain cap. Returns where the smoke comes out. */
export function kitchenChimney(ctx: Ctx, x: number, baseY: number, topY: number): Point {
  const copper = "#C77B3C";
  paint(ctx, (c) => roundRectPath(c, x - 22, baseY - 26, 44, 28, 4), "#B5523B", { width: 3 });
  ctx.strokeStyle = shade("#B5523B", -0.35);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let k = 1; k < 3; k++) {
    ctx.moveTo(x - 22, baseY - 26 + k * 9);
    ctx.lineTo(x + 22, baseY - 26 + k * 9);
  }
  ctx.stroke();
  paintIn(ctx, (c) => roundRectPath(c, x - 13, topY + 10, 26, baseY - 26 - topY - 8, 4), copper, () => {
    band(ctx, x + 4, topY, x + 14, baseY, shade(copper, -0.2));
    band(ctx, x - 9, topY, x - 5, baseY, alpha("#FFFFFF", 0.3));
  }, { width: 3 });
  for (let y = topY + 30; y < baseY - 34; y += 26) paint(ctx, (c) => roundRectPath(c, x - 15, y, 30, 5, 2), shade(copper, -0.12), { width: 2 });
  paint(ctx, (c) => {
    c.moveTo(x - 24, topY + 4);
    c.lineTo(x, topY - 12);
    c.lineTo(x + 24, topY + 4);
    c.closePath();
  }, "#5A3A2A", { width: 3 });
  line(ctx, [{ x: x - 9, y: topY + 4 }, { x: x - 9, y: topY + 12 }], "#5A3A2A", 3);
  line(ctx, [{ x: x + 9, y: topY + 4 }, { x: x + 9, y: topY + 12 }], "#5A3A2A", 3);
  return { x, y: topY + 6 };
}

export type FinKind = "pectoral" | "tail" | "dorsal";

/** A fish fin with rays that wiggles. `angle` points the fin (0 = toward +x). */
export function fishFin(ctx: Ctx, x: number, y: number, size: number, color: string, frame: FrameInfo, kind: FinKind, angle = 0, phase = 0): void {
  const wig = (kind === "tail" ? 0.12 : 0.18) * sway(frame.t, kind === "tail" ? 1.4 : 2.2, phase, frame.reducedMotion);
  withTransform(ctx, { x, y, rotate: angle + wig }, () => {
    const s = size;
    const build = (c: Ctx) => {
      if (kind === "tail") {
        c.moveTo(0, -s * 0.18);
        c.bezierCurveTo(s * 0.4, -s * 0.3, s * 0.7, -s * 0.9, s * 1.05, -s * 1.0);
        c.quadraticCurveTo(s * 0.8, -s * 0.2, s * 0.72, 0);
        c.quadraticCurveTo(s * 0.8, s * 0.2, s * 1.0, s * 0.8);
        c.bezierCurveTo(s * 0.7, s * 0.7, s * 0.4, s * 0.3, 0, s * 0.18);
        c.closePath();
      } else if (kind === "dorsal") {
        c.moveTo(-s * 0.5, 0);
        c.bezierCurveTo(-s * 0.3, -s * 0.7, s * 0.2, -s * 0.9, s * 0.5, -s * 0.8);
        c.quadraticCurveTo(s * 0.3, -s * 0.4, s * 0.5, 0);
        c.closePath();
      } else {
        c.moveTo(0, -s * 0.12);
        c.bezierCurveTo(s * 0.3, -s * 0.5, s * 0.8, -s * 0.5, s, -s * 0.15);
        c.quadraticCurveTo(s * 0.8, s * 0.08, s * 0.9, s * 0.3);
        c.bezierCurveTo(s * 0.5, s * 0.4, s * 0.2, s * 0.2, 0, s * 0.12);
        c.closePath();
      }
    };
    paintIn(ctx, build, color, () => {
      ctx.strokeStyle = alpha(shade(color, -0.35), 0.7);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      const rays = 5;
      for (let k = 0; k < rays; k++) {
        const t = (k + 0.5) / rays;
        if (kind === "tail") {
          ctx.moveTo(0, 0);
          ctx.lineTo(s, (t - 0.5) * s * 1.9);
        } else if (kind === "dorsal") {
          ctx.moveTo(-s * 0.4 + t * s * 0.8, 0);
          ctx.lineTo(-s * 0.2 + t * s * 0.7, -s * 0.85);
        } else {
          ctx.moveTo(0, 0);
          ctx.lineTo(s, (t - 0.5) * s * 0.9);
        }
      }
      ctx.stroke();
      band(ctx, -s, s * 0.05, s * 1.2, s, alpha(INK, 0.1));
    }, { width: 3 });
  });
}

// ---------------------------------------------------------------------------
// Solar ark pieces: astrolabe and stained glass

/** A brass armillary astrolabe with turning rings and a glowing sun at its heart. */
export function astrolabe(ctx: Ctx, x: number, y: number, r: number, ship: ShipDefinition, frame: FrameInfo): void {
  const brass = ship.palette.trim;
  const rm = frame.reducedMotion;
  const spin = frame.t * (rm ? 0.02 : 0.4);
  const ring = (rx: number, ry: number, rot: number, width: number, color: string) => {
    ctx.beginPath();
    ellipsePath(ctx, x, y, Math.max(0.5, rx), Math.max(0.5, ry), rot);
    ctx.strokeStyle = outlineFor(color);
    ctx.lineWidth = width + 4;
    ctx.stroke();
    ctx.beginPath();
    ellipsePath(ctx, x, y, Math.max(0.5, rx), Math.max(0.5, ry), rot);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  glow(ctx, x, y, r * 1.6, ship.palette.glow ?? "#FFD166", 0.55);
  ring(r * Math.abs(Math.cos(spin)), r, 0, 4, shade(brass, -0.1));
  ring(r, r * 0.3, -0.4, 5, brass);
  ring(r * 0.92, r * 0.92 * Math.abs(Math.sin(spin * 0.7 + 1)), 0.5, 3.5, shade(brass, 0.15));
  ring(r, r, 0, 6, brass);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    line(ctx, [{ x: x + Math.cos(a) * (r - 3), y: y + Math.sin(a) * (r - 3) }, { x: x + Math.cos(a) * (r + 3), y: y + Math.sin(a) * (r + 3) }], shade(brass, -0.4), 1.6);
  }
  paint(ctx, (c) => circlePath(c, x, y, r * 0.2), ship.palette.glow ?? "#FFD166", { width: 2.6 });
  line(ctx, [{ x: x - r * 1.15, y: y + r * 0.35 }, { x: x + r * 1.15, y: y - r * 0.35 }], outlineFor(brass), 6);
  line(ctx, [{ x: x - r * 1.15, y: y + r * 0.35 }, { x: x + r * 1.15, y: y - r * 0.35 }], brass, 3);
}

const GLASS = ["#FF8A3D", "#FFD166", "#E5532D", "#3FA7D6", "#9B5DE5", "#2EC4B6"];

/** A leaded stained-glass window with a sun pattern. `x, y` is its top middle. */
export function stainedGlass(ctx: Ctx, x: number, y: number, w: number, h: number, ship: ShipDefinition, frame: FrameInfo, seed = 0): void {
  const lead = "#3A2A1E";
  const build = (c: Ctx) => roundRectPath(c, x - w / 2, y, w, h, [w / 2, w / 2, 3, 3]);
  const shimmer = 0.85 + 0.15 * sway(frame.t, 0.8, seed, frame.reducedMotion);
  paint(ctx, (c) => roundRectPath(c, x - w / 2 - 5, y - 5, w + 10, h + 10, [w / 2 + 5, w / 2 + 5, 5, 5]), ship.palette.trim, { width: 3 });
  paintIn(
    ctx,
    build,
    GLASS[seed % GLASS.length],
    () => {
      const cx = x;
      const cy = y + h * 0.62;
      const n = 10;
      for (let k = 0; k < n; k++) {
        const a0 = Math.PI + (k / n) * Math.PI;
        const a1 = Math.PI + ((k + 1) / n) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a0) * h * 2, cy + Math.sin(a0) * h * 2);
        ctx.lineTo(cx + Math.cos(a1) * h * 2, cy + Math.sin(a1) * h * 2);
        ctx.closePath();
        ctx.fillStyle = GLASS[(k + seed) % GLASS.length];
        ctx.fill();
      }
      band(ctx, x - w, cy, x + w, y + h, GLASS[(seed + 3) % GLASS.length]);
      ctx.strokeStyle = lead;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (let k = 0; k <= n; k++) {
        const a = Math.PI + (k / n) * Math.PI;
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * h * 2, cy + Math.sin(a) * h * 2);
      }
      ctx.moveTo(x - w, cy);
      ctx.lineTo(x + w, cy);
      ctx.moveTo(x, cy);
      ctx.lineTo(x, y + h);
      ctx.stroke();
      paint(ctx, (c) => circlePath(c, cx, cy, w * 0.2), "#FFE08A", { stroke: lead, width: 2.2 });
      ctx.fillStyle = alpha("#FFFFFF", 0.25 * shimmer);
      ctx.fillRect(x - w / 2, y, w * 0.2, h);
    },
    { stroke: lead, width: 2.8 },
  );
  glow(ctx, x, y + h * 0.55, Math.max(w, h) * (isNight(ship) ? 1.6 : 0.9), ship.palette.glow ?? "#FFD166", (isNight(ship) ? 0.7 : 0.3) * shimmer);
}

// ---------------------------------------------------------------------------
// Cedar cabin and Greek pieces: stovepipe, ivy

/** A black woodstove stovepipe with a cap. Returns where the smoke comes out. */
export function stovepipe(ctx: Ctx, x: number, baseY: number, topY: number): Point {
  const iron = "#2E2B2B";
  paintIn(ctx, (c) => roundRectPath(c, x - 8, topY, 16, baseY - topY, 3), iron, () => band(ctx, x - 5, topY, x - 2, baseY, alpha("#FFFFFF", 0.2)), { width: 3 });
  paint(ctx, (c) => roundRectPath(c, x - 11, topY + (baseY - topY) * 0.45, 22, 6, 2), shade(iron, 0.15), { width: 2 });
  paint(ctx, (c) => {
    c.moveTo(x - 18, topY + 2);
    c.lineTo(x, topY - 10);
    c.lineTo(x + 18, topY + 2);
    c.closePath();
  }, iron, { width: 3 });
  return { x, y: topY + 2 };
}

/** Ivy trailing along a path, with alternating three-lobed leaves. */
export function ivy(ctx: Ctx, pts: Point[], frame: FrameInfo, seed: number, leaf = "#4F7A3A", spacing = 16): void {
  if (pts.length < 2) return;
  const r = rng(seed);
  ctx.beginPath();
  smoothPath(ctx, pts);
  ctx.strokeStyle = shade(leaf, -0.35);
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.stroke();
  let side = 1;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const dir = Math.atan2(b.y - a.y, b.x - a.x);
    for (let d = r() * spacing; d < len; d += spacing * (0.7 + r() * 0.6)) {
      const x = a.x + Math.cos(dir) * d;
      const y = a.y + Math.sin(dir) * d;
      const s = 5 + r() * 3;
      const rot = dir + side * (Math.PI / 2 - 0.4) + 0.12 * sway(frame.t, 1.2, x * 0.05, frame.reducedMotion);
      side = -side;
      withTransform(ctx, { x, y, rotate: rot }, () => {
        paint(ctx, (c) => {
          c.moveTo(0, 0);
          c.quadraticCurveTo(s * 0.4, -s * 0.9, s * 1.1, -s * 0.5);
          c.quadraticCurveTo(s * 1.5, 0, s * 1.1, s * 0.5);
          c.quadraticCurveTo(s * 0.4, s * 0.9, 0, 0);
          c.closePath();
        }, r() < 0.5 ? leaf : shade(leaf, 0.18), { width: 1.6 });
      });
    }
  }
}

/** A sprig of olive leaves (silvery green, slim). */
export function oliveSprig(ctx: Ctx, x: number, y: number, angle: number, frame: FrameInfo, seed: number): void {
  const sw = 0.08 * sway(frame.t, 1.1, seed, frame.reducedMotion);
  withTransform(ctx, { x, y, rotate: angle + sw }, () => {
    line(ctx, [{ x: 0, y: 0 }, { x: 34, y: 0 }], "#5E6B3A", 2);
    for (let k = 0; k < 5; k++) {
      const px = 6 + k * 6;
      const side = k % 2 ? 1 : -1;
      paint(ctx, (c) => ellipsePath(c, px + 3, side * 4, 6, 2.2, side * 0.6), k % 2 ? "#8A9A5B" : "#A3B07A", { width: 1.2 });
    }
    paint(ctx, (c) => ellipsePath(c, 30, 4, 3, 2.4), "#4A5A2A", { width: 1.2 });
  });
}

// ---------------------------------------------------------------------------
// The Golden Mane's swing

/** A rope swing hanging from `hook`, gently swaying. Its seat ends `drop` units lower. */
export function swing(ctx: Ctx, hook: Point, drop: number, frame: FrameInfo, rope = "#8A6A44", seat = "#B5835A"): void {
  const a = 0.09 * sway(frame.t, 1.05, 0.4, frame.reducedMotion);
  withTransform(ctx, { x: hook.x, y: hook.y, rotate: a }, () => {
    line(ctx, [{ x: -14, y: 0 }, { x: -22, y: drop }], outlineFor(rope), 5);
    line(ctx, [{ x: 14, y: 0 }, { x: 22, y: drop }], outlineFor(rope), 5);
    line(ctx, [{ x: -14, y: 0 }, { x: -22, y: drop }], rope, 2.5);
    line(ctx, [{ x: 14, y: 0 }, { x: 22, y: drop }], rope, 2.5);
    paint(ctx, (c) => roundRectPath(c, -30, drop - 2, 60, 9, 4), seat, { width: 3 });
    band(ctx, -26, drop + 3, 26, drop + 5, alpha(INK, 0.15));
  });
}
