// Building blocks shared by the wooden sailing hulls: the stepped hull
// outline (stern castle, waist, forecastle), its paint job, cap rails and the
// standard rig pass. Each hull file supplies its own shape and decoration.

import type { ShipDefinition } from "@ship/shared-types";
import { INK, alpha, line, outlineFor, paint, roundRectPath, shade } from "../ship-engine/draw.js";
import type { Ctx, Point } from "../ship-engine/types.js";
import {
  band,
  bellBracket,
  drawDeckBand,
  drawMastFoot,
  drawMastPole,
  drawShrouds,
  farBulwark,
  paintIn,
  planking,
  postRail,
  rigColors,
  stay,
  wavyBand,
} from "./kit.js";
import type { Corner, MastStyle } from "./kit.js";
import type { DeckSurface, HullLayout } from "./types.js";

/** Top edge (stern to bow, corners rounded with arcTo), then `bottom` must curve back to the first point. */
export function hullPath(c: Ctx, top: Corner[], bottom: (c: Ctx) => void): void {
  c.moveTo(top[0].x, top[0].y);
  for (let i = 1; i < top.length - 1; i++) {
    const p = top[i];
    const n = top[i + 1];
    if ((p.r ?? 10) <= 0) c.lineTo(p.x, p.y);
    else c.arcTo(p.x, p.y, n.x, n.y, p.r ?? 10);
  }
  const last = top[top.length - 1];
  c.lineTo(last.x, last.y);
  bottom(c);
  c.closePath();
}

/** The top edge for a hull with optional raised decks: [stern..castle] [waist] [forecastle..stem]. */
export function steppedTop(opts: {
  stern: Point;
  castle?: { to: number; y: number };
  waist: number;
  fore?: { from: number; y: number };
  stem: Point;
  r?: number;
}): Corner[] {
  const r = opts.r ?? 9;
  const pts: Corner[] = [opts.stern];
  if (opts.castle) {
    pts.push({ x: opts.stern.x + 10, y: opts.castle.y, r: 12 });
    pts.push({ x: opts.castle.to, y: opts.castle.y, r });
    pts.push({ x: opts.castle.to, y: opts.waist, r });
  } else {
    pts.push({ x: opts.stern.x + 14, y: opts.waist, r: 12 });
  }
  if (opts.fore) {
    pts.push({ x: opts.fore.from, y: opts.waist, r });
    pts.push({ x: opts.fore.from, y: opts.fore.y, r });
    pts.push({ x: opts.stem.x - 22, y: opts.fore.y, r: 12 });
  } else {
    pts.push({ x: opts.stem.x - 30, y: opts.waist, r: 14 });
  }
  pts.push(opts.stem);
  return pts;
}

export interface HullPaint {
  /** The main hull color, and the darker band near the waterline. */
  fill: string;
  low: string;
  /** y where the low band starts. */
  lowFrom: number;
  /** Plank seams, if the hull is wooden. */
  planks?: { spacing: number; color?: string };
  /** Horizontal stripes (wales) as [y0, y1, color]. */
  stripes?: [number, number, string][];
  /** Extra decoration inside the clipped hull. */
  inner?: () => void;
  stroke?: string;
}

export function paintHull(ctx: Ctx, ship: ShipDefinition, build: (c: Ctx) => void, p: HullPaint): void {
  paintIn(
    ctx,
    build,
    p.fill,
    () => {
      if (p.planks) planking(ctx, -620, 620, -200, 200, p.planks.spacing, p.planks.color ?? alpha(shade(p.fill, -0.45), 0.35), hashSeed(ship), true);
      // A soft highlight under the gunwale, and the shade band toward the water.
      band(ctx, -620, -200, 620, 6, alpha("#FFFFFF", 0.1));
      wavyBand(ctx, -620, 620, p.lowFrom, 240, p.low, 2.5, 160);
      band(ctx, -620, p.lowFrom + 26, 620, 240, alpha(INK, 0.1));
      for (const [y0, y1, color] of p.stripes ?? []) {
        band(ctx, -620, y0, 620, y1, color);
        band(ctx, -620, y1 - 2, 620, y1, alpha(INK, 0.18));
        band(ctx, -620, y0, 620, y0 + 2, alpha("#FFFFFF", 0.25));
      }
      p.inner?.();
    },
    { stroke: p.stroke ?? outlineFor(p.fill), width: 4.5 },
  );
}

function hashSeed(ship: ShipDefinition): number {
  let h = 0;
  for (const ch of ship.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** A cap rail along a raised deck's (or the waist's) near edge. drawFront. */
export function capRail(ctx: Ctx, from: number, to: number, y: number, color: string): void {
  paint(ctx, (c) => roundRectPath(c, from, y - 5, to - from, 10, 5), color, { width: 3 });
  paint(ctx, (c) => roundRectPath(c, from + 4, y - 4, to - from - 8, 3, 1.5), alpha("#FFFFFF", 0.3), { stroke: false });
}

export interface RigPass {
  mast: MastStyle;
  /** Bowsprit spar from-to, if any. Stays run from the fore mast top to its tip. */
  bowsprit?: { from: Point; to: Point };
}

/** Shrouds, stays, bowsprit and mast poles, in the right order. drawBack. */
export function drawRig(ctx: Ctx, ship: ShipDefinition, layout: HullLayout, pass: RigPass): void {
  const colors = rigColors(ship);
  const masts = layout.masts;
  // Stays between mast tops, and from the fore mast to the bowsprit.
  for (let i = 0; i < masts.length - 1; i++) stay(ctx, { x: masts[i].x, y: masts[i].top + 40 }, { x: masts[i + 1].x, y: masts[i + 1].top + 110 }, colors.rope, 14, 2);
  if (pass.bowsprit) {
    const fore = masts[masts.length - 1];
    if (fore) {
      stay(ctx, { x: fore.x, y: fore.top + 30 }, pass.bowsprit.to, colors.rope, 18, 2);
      stay(ctx, { x: fore.x, y: fore.top + 120 }, { x: (pass.bowsprit.from.x + pass.bowsprit.to.x) / 2, y: (pass.bowsprit.from.y + pass.bowsprit.to.y) / 2 }, colors.rope, 14, 1.6);
    }
  }
  masts.forEach((_, i) => drawShrouds(ctx, ship, layout, i, colors.rope));
  masts.forEach((_, i) => drawMastPole(ctx, ship, layout, i, pass.mast));
}

export function drawBowspritSpar(ctx: Ctx, from: Point, to: Point, wood: string, iron: string): void {
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  ctx.save();
  ctx.translate(from.x, from.y);
  ctx.rotate(ang);
  paintIn(
    ctx,
    (c) => {
      c.moveTo(0, -10);
      c.lineTo(len, -5);
      c.quadraticCurveTo(len + 6, 0, len, 5);
      c.lineTo(0, 10);
      c.closePath();
    },
    wood,
    () => band(ctx, 0, 1, len + 10, 12, shade(wood, -0.2)),
    { width: 3.5 },
  );
  for (const f of [0.45, 0.75]) paint(ctx, (c) => roundRectPath(c, len * f, -9, 6, 18, 3), iron, { width: 2 });
  ctx.restore();
}

/** Deck bands for every surface, then the mast feet on top. drawDeck. */
export function drawDecks(ctx: Ctx, ship: ShipDefinition, layout: HullLayout, surfaces: DeckSurface[], mast: MastStyle, raisedColor?: string): void {
  surfaces.forEach((s, k) => drawDeckBand(ctx, ship, s, { salt: k * 101, color: s.y < -1 && raisedColor ? raisedColor : undefined }));
  for (const m of layout.masts) drawMastFoot(ctx, m, mast);
}

/** Far bulwarks for every surface (the low wall behind the deck). drawBack. */
export function drawFarBulwarks(ctx: Ctx, surfaces: DeckSurface[], color: string, cap: string, height = 16): void {
  for (const s of surfaces) farBulwark(ctx, s.from - 2, s.to + 2, s.y, height, color, cap);
}

/** See-through rails on raised decks (and optionally the waist). drawFront. */
export function drawRaisedRails(ctx: Ctx, surfaces: DeckSurface[], color: string, height = 26, spacing = 26): void {
  for (const s of surfaces) if (s.y < -1) postRail(ctx, s.from + 4, s.to - 4, s.y, height, color, spacing);
}

/** A curved stern post carrying a lantern on top and the bell's arm. drawBack. */
export function sternPost(ctx: Ctx, x: number, foot: number, top: number, bell: Point, wood: string, iron: string): Point {
  paintIn(ctx, (c) => roundRectPath(c, x - 6, top, 12, foot - top, 5), wood, () => band(ctx, x + 1, top, x + 8, foot, shade(wood, -0.2)), { width: 3 });
  bellBracket(ctx, { x, y: bell.y - 9 }, bell, wood, iron);
  line(ctx, [{ x, y: bell.y + 30 }, { x: x + (bell.x - x) * 0.5, y: bell.y - 8 }], outlineFor(wood), 6);
  line(ctx, [{ x, y: bell.y + 30 }, { x: x + (bell.x - x) * 0.5, y: bell.y - 8 }], wood, 3);
  return { x, y: top };
}
