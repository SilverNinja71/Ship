// Shared helpers for the hull drawers: station packing, rig geometry, deck
// bands, masts, rails and glows. Everything is in ship units (see types.ts).

import type { DeckFinish, ShipDefinition } from "@ship/shared-types";
import { ENVIRONMENTS } from "@ship/ship-theme-kit";
import {
  INK,
  OUTLINE,
  alpha,
  circlePath,
  clamp,
  ellipsePath,
  hashString,
  line,
  mix,
  outlineFor,
  paint,
  radialGradient,
  rng,
  roundRectPath,
  shade,
  sway,
} from "../ship-engine/draw.js";
import type { PaintOptions } from "../ship-engine/draw.js";
import type { Ctx, FrameInfo, Point } from "../ship-engine/types.js";
import { DECK_DEPTH } from "./types.js";
import type { DeckSurface, HullLayout, MastSpot } from "./types.js";

// ---------------------------------------------------------------------------
// Ship facts

export function isNight(ship: ShipDefinition): boolean {
  return ENVIRONMENTS[ship.environment]?.night ?? false;
}

/** A deterministic random stream for one ship (plus a salt per use, so streams don't repeat). */
export function seeded(ship: ShipDefinition, salt = 0): () => number {
  return rng(hashString(ship.id) + salt * 7919);
}

export interface RigColors {
  /** Masts, yards and spars. */
  wood: string;
  rope: string;
  /** Hoops, hooks and fittings. */
  iron: string;
}

/** Mast and rope colors per ship: plain wood for most, gilded or painted for the mythic ships. */
export function rigColors(ship: ShipDefinition): RigColors {
  switch (ship.id) {
    case "pegasus-cloud-galleon":
      return { wood: "#E8C66A", rope: "#9C8FD6", iron: "#FFF2B3" };
    case "merfolk-coral-caravel":
      return { wood: "#E89A86", rope: "#2E9C8F", iron: "#5FE3D0" };
    case "chalkydri-solar-ark":
      return { wood: "#C9A24A", rope: "#7C4A18", iron: "#F2C14E" };
    case "alebrijes-spirit-galleon":
      return { wood: "#4B2C73", rope: "#1A0F30", iron: "#3DF2C2" };
    case "kaiju-behemoth-carrier":
      return { wood: "#6E7780", rope: "#2C3238", iron: "#E2A33B" };
    case "sasquatch-cedar-brig":
      return { wood: "#6B3A1F", rope: "#4A3424", iron: "#3E5A3A" };
    case "ironwood-war-galleon":
      return { wood: "#4A2E17", rope: "#3B2412", iron: "#D9B44A" };
    case "crimson-corsair":
      return { wood: "#5E3A1E", rope: "#3B2412", iron: "#E3B341" };
    case "gorgon-stone-trireme":
      return { wood: "#A47C4A", rope: "#6B5233", iron: "#C99A4A" };
    case "floating-galley":
      return { wood: "#9A6A44", rope: "#5A4632", iron: "#F2D16B" };
    case "admiralty-battleship":
    case "thunder-dreadnought":
    case "riveted-ironclad":
      return { wood: "#8A949E", rope: "#38434E", iron: ship.palette.trim };
    default:
      return { wood: "#8B5A2B", rope: "#5A4632", iron: "#4A3A2E" };
  }
}

// ---------------------------------------------------------------------------
// Station packing

export const FOOTPRINT = { helm: 70, tree: 90, desk: 150, table: 130, orchard: 90 } as const;
export type StationKind = keyof typeof FOOTPRINT;

/** A named space that isn't a station but must stay clear (a swing, a hatch...). */
export interface SlotRequest {
  slot: string;
  width: number;
}

export interface SurfacePlan {
  from: number;
  to: number;
  y: number;
  items: (StationKind | SlotRequest)[];
}

export interface Arranged {
  helm: Point;
  citrusTree: Point;
  desk: Point;
  tables: Point[];
  orchard: Point[];
  slots: Record<string, Point>;
  surfaces: DeckSurface[];
}

/** Spreads each surface's items across it with equal gaps, left to right. */
export function arrange(plans: SurfacePlan[]): Arranged {
  const out: Arranged = {
    helm: { x: 0, y: 0 },
    citrusTree: { x: 0, y: 0 },
    desk: { x: 0, y: 0 },
    tables: [],
    orchard: [],
    slots: {},
    surfaces: plans.map((p) => ({ from: p.from, to: p.to, y: p.y })),
  };
  for (const plan of plans) {
    const widths = plan.items.map((it) => (typeof it === "string" ? FOOTPRINT[it] : it.width));
    const total = widths.reduce((a, b) => a + b, 0);
    const gap = (plan.to - plan.from - total) / (widths.length + 1);
    let x = plan.from + gap;
    plan.items.forEach((it, i) => {
      const at = { x: Math.round(x + widths[i] / 2), y: plan.y };
      x += widths[i] + gap;
      if (typeof it !== "string") out.slots[it.slot] = at;
      else if (it === "helm") out.helm = at;
      else if (it === "tree") out.citrusTree = at;
      else if (it === "desk") out.desk = at;
      else if (it === "table") out.tables.push(at);
      else out.orchard.push(at);
    });
  }
  return out;
}

/** A mast standing on a deck whose surface is at `surface` (its base is the deck's centerline). */
export function mastAt(x: number, surface: number, top: number): MastSpot {
  return { x, base: surface - DECK_DEPTH / 2, top };
}

export function surfaceOfMast(m: MastSpot): number {
  return m.base + DECK_DEPTH / 2;
}

// ---------------------------------------------------------------------------
// Rig geometry, shared by the mast poles (drawBack) and the sail drawers.

export interface Rig {
  /** The crow's nest barrel, on the tallest mast of a sailing ship. */
  nest: { top: number; bottom: number } | null;
  /** Where the top yard hangs. */
  sailTop: number;
  /** Lowest edge of canvas: high enough that sailors (190 tall) stand clear below it. */
  sailFoot: number;
  /** Half the width of the widest sail on this mast. */
  halfWidth: number;
}

/** How far below its hoist point a flag reaches (flags.ts draws to this). */
export const FLAG_DROP = 78;

const NO_NEST = new Set(["solar-ark", "submarine", "battleship", "dreadnought", "ironclad"]);
const SINGLE_MAST_HALF: Record<string, number> = { trireme: 168, "kitchen-barge": 150, "carrier-barge": 128 };

export function tallestMast(layout: HullLayout): number {
  let best = 0;
  layout.masts.forEach((m, i) => {
    if (m.top < layout.masts[best].top) best = i;
  });
  return best;
}

export function rigFor(ship: ShipDefinition, layout: HullLayout, i: number): Rig {
  const m = layout.masts[i];
  const hasNest = !NO_NEST.has(ship.hull) && i === tallestMast(layout);
  // The flag hangs from the top of its mast, so canvas and nest start below it.
  const flagHere = Math.abs(layout.flag.x - m.x) < 2 && layout.flag.y <= m.top + 4;
  const clear = m.top + (flagHere ? FLAG_DROP + 6 : 26);
  const nest = hasNest ? { top: clear, bottom: clear + 36 } : null;
  const sailTop = nest ? nest.bottom + 14 : clear + 8;
  const sailFoot = surfaceOfMast(m) - 232;
  let spacing = Infinity;
  if (i > 0) spacing = Math.min(spacing, m.x - layout.masts[i - 1].x);
  if (i < layout.masts.length - 1) spacing = Math.min(spacing, layout.masts[i + 1].x - m.x);
  const halfWidth = Number.isFinite(spacing) ? clamp(spacing * 0.44, 80, 126) : (SINGLE_MAST_HALF[ship.hull] ?? 130);
  return { nest, sailTop, sailFoot: Math.max(sailFoot, sailTop + 90), halfWidth };
}

// ---------------------------------------------------------------------------
// Paths and painting

export interface Corner extends Point {
  r?: number;
}

/** A closed polygon with rounded corners (each corner can set its own radius). Chunky and friendly. */
export function roundedPoly(ctx: Ctx, pts: Corner[], r = 8): void {
  const n = pts.length;
  if (n < 3) return;
  const at = (i: number) => pts[(i + n) % n];
  const start = { x: (at(-1).x + at(0).x) / 2, y: (at(-1).y + at(0).y) / 2 };
  ctx.moveTo(start.x, start.y);
  for (let i = 0; i < n; i++) {
    const p = at(i);
    const a = at(i - 1);
    const b = at(i + 1);
    const d1 = Math.hypot(a.x - p.x, a.y - p.y);
    const d2 = Math.hypot(b.x - p.x, b.y - p.y);
    let rr = p.r ?? r;
    if (d1 > 0 && d2 > 0) {
      const cos = ((a.x - p.x) * (b.x - p.x) + (a.y - p.y) * (b.y - p.y)) / (d1 * d2);
      const half = Math.acos(clamp(cos, -1, 1)) / 2;
      rr = Math.min(rr, (Math.min(d1, d2) / 2) * Math.tan(half));
    }
    if (rr <= 0.05 || !Number.isFinite(rr)) ctx.lineTo(p.x, p.y);
    else ctx.arcTo(p.x, p.y, b.x, b.y, rr);
  }
  ctx.closePath();
}

/** Like paint(), but runs `inner` clipped to the shape before the outline goes on. */
export function paintIn(ctx: Ctx, build: (c: Ctx) => void, fill: string | CanvasGradient, inner: () => void, opts: PaintOptions = {}): void {
  ctx.beginPath();
  build(ctx);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.save();
  ctx.clip();
  try {
    inner();
  } finally {
    ctx.restore();
  }
  const stroke = opts.stroke ?? (typeof fill === "string" ? outlineFor(fill) : INK);
  if (stroke === false) return;
  ctx.beginPath();
  build(ctx);
  ctx.lineWidth = opts.width ?? OUTLINE;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

/** Fills a rectangle; handy inside clips for bands and stripes. */
export function band(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, color: string | CanvasGradient): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
}

/** A wavy band boundary: fills below a gently curving line, inside a clip. */
export function wavyBand(ctx: Ctx, x0: number, x1: number, y: number, bottom: number, color: string, amp = 3, wave = 90, phase = 0): void {
  ctx.beginPath();
  ctx.moveTo(x0, bottom);
  for (let x = x0; x <= x1 + 10; x += 10) ctx.lineTo(x, y + amp * Math.sin((x / wave) * Math.PI * 2 + phase));
  ctx.lineTo(x1, bottom);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** Horizontal plank seams with staggered butt joints, inside a clip. */
export function planking(ctx: Ctx, x0: number, x1: number, y0: number, y1: number, spacing: number, color: string, seed: number, joints = true): void {
  const r = rng(seed);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let y = y0 + spacing; y < y1; y += spacing) {
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    if (!joints) continue;
    for (let x = x0 + r() * 120; x < x1; x += 110 + r() * 90) {
      ctx.moveTo(x, y - spacing);
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
}

export function rivetRow(ctx: Ctx, x0: number, x1: number, y: number, spacing: number, color: string, r = 2.2): void {
  const dark = shade(color, -0.35);
  const light = shade(color, 0.45);
  for (let x = x0; x <= x1; x += spacing) {
    ctx.beginPath();
    circlePath(ctx, x, y, r);
    ctx.fillStyle = dark;
    ctx.fill();
    ctx.beginPath();
    circlePath(ctx, x - r * 0.35, y - r * 0.35, r * 0.45);
    ctx.fillStyle = light;
    ctx.fill();
  }
}

// ---------------------------------------------------------------------------
// Glows

/** A soft additive glow. Used sparingly: lanterns, portholes at night, sun sails. */
export function glow(ctx: Ctx, x: number, y: number, r: number, color: string, strength = 1): void {
  if (r <= 0 || strength <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = radialGradient(ctx, x, y, r, [
    [0, alpha(color, 0.5 * strength)],
    [0.35, alpha(color, 0.2 * strength)],
    [1, alpha(color, 0)],
  ]);
  ctx.beginPath();
  circlePath(ctx, x, y, r);
  ctx.fill();
  ctx.restore();
}

/** A candle-like flicker around 1, different per seed. */
export function flicker(frame: FrameInfo, seed: number): number {
  const rm = frame.reducedMotion;
  return 0.9 + 0.06 * sway(frame.t, 9.3, seed, rm) + 0.04 * sway(frame.t, 23.1, seed * 1.7, rm);
}

// ---------------------------------------------------------------------------
// Decks

export function deckColor(ship: ShipDefinition): string {
  return ship.palette.deck;
}

/** The deck band for a surface at `y` (its near edge), in the ship's deck finish. */
export function drawDeckBand(ctx: Ctx, ship: ShipDefinition, s: { from: number; to: number; y: number }, opts: { finish?: DeckFinish; color?: string; salt?: number } = {}): void {
  const finish = opts.finish ?? ship.deck;
  const color = opts.color ?? ship.palette.deck;
  const top = s.y - DECK_DEPTH;
  const seed = hashString(ship.id) + (opts.salt ?? 0) + Math.round(s.from);
  paintIn(
    ctx,
    (c) => roundRectPath(c, s.from, top, s.to - s.from, DECK_DEPTH, 5),
    color,
    () => {
      deckTexture(ctx, finish, color, s.from, s.to, top, s.y, seed);
      // The far edge sits in the bulwark's shadow.
      band(ctx, s.from, top, s.to, top + 5, alpha(INK, 0.14));
    },
    { width: 3 },
  );
}

function deckTexture(ctx: Ctx, finish: DeckFinish, color: string, x0: number, x1: number, top: number, bottom: number, seed: number): void {
  const r = rng(seed);
  const h = bottom - top;
  switch (finish) {
    case "lawn": {
      band(ctx, x0, bottom - 6, x1, bottom, shade(color, 0.12));
      ctx.lineWidth = 1.8;
      ctx.lineCap = "round";
      ctx.strokeStyle = shade(color, -0.22);
      ctx.beginPath();
      for (let x = x0 + 4; x < x1; x += 9 + r() * 7) {
        const y = top + 7 + r() * (h - 9);
        ctx.moveTo(x - 2.5, y + 3);
        ctx.lineTo(x - 1, y - 2);
        ctx.moveTo(x, y + 3);
        ctx.lineTo(x + 1.5, y - 3.5);
        ctx.moveTo(x + 2.5, y + 3);
        ctx.lineTo(x + 4, y - 1);
      }
      ctx.stroke();
      for (let x = x0 + 20 + r() * 40; x < x1 - 10; x += 60 + r() * 70) {
        const y = top + 8 + r() * (h - 12);
        const petal = r() < 0.5 ? "#FFFFFF" : "#FFE27A";
        for (let k = 0; k < 4; k++) {
          ctx.beginPath();
          circlePath(ctx, x + Math.cos((k * Math.PI) / 2) * 2.4, y + Math.sin((k * Math.PI) / 2) * 1.6, 1.8);
          ctx.fillStyle = petal;
          ctx.fill();
        }
        ctx.beginPath();
        circlePath(ctx, x, y, 1.2);
        ctx.fillStyle = "#F2A93B";
        ctx.fill();
      }
      break;
    }
    case "planks":
    case "cedar": {
      const rows = finish === "cedar" ? 2 : 3;
      planking(ctx, x0, x1, top, bottom + 0.5, h / rows, shade(color, -0.3), seed);
      band(ctx, x0, bottom - 3, x1, bottom, shade(color, 0.12));
      if (finish === "cedar") {
        for (let x = x0 + 30 + r() * 50; x < x1 - 10; x += 80 + r() * 90) {
          const y = top + 5 + r() * (h - 10);
          ctx.beginPath();
          ellipsePath(ctx, x, y, 4, 2);
          ctx.strokeStyle = shade(color, -0.35);
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = shade(color, -0.4);
        for (let x = x0 + 12; x < x1; x += 46) {
          for (let k = 0; k < rows; k++) {
            ctx.fillRect(x + (k % 2) * 23, top + (k + 0.5) * (h / rows) - 0.8, 1.6, 1.6);
          }
        }
      }
      break;
    }
    case "steel": {
      ctx.strokeStyle = alpha(shade(color, -0.4), 0.5);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let x = x0 + 4; x < x1; x += 9) {
        for (let y = top + 6; y < bottom - 2; y += 7) {
          const o = (Math.round((y - top) / 7) % 2) * 4.5;
          ctx.moveTo(x + o, y + 1.5);
          ctx.lineTo(x + o + 3, y - 1.5);
        }
      }
      ctx.stroke();
      ctx.strokeStyle = shade(color, -0.35);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let x = x0 + 70; x < x1; x += 96) {
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
      }
      ctx.stroke();
      band(ctx, x0, bottom - 3, x1, bottom, shade(color, 0.15));
      break;
    }
    case "marble": {
      ctx.strokeStyle = shade(color, -0.18);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let x = x0 + 50; x < x1; x += 56) {
        ctx.moveTo(x, top);
        ctx.lineTo(x, top + h / 2);
        ctx.moveTo(x + 28, top + h / 2);
        ctx.lineTo(x + 28, bottom);
      }
      ctx.moveTo(x0, top + h / 2);
      ctx.lineTo(x1, top + h / 2);
      ctx.stroke();
      ctx.strokeStyle = alpha("#8E9AA6", 0.45);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = x0 + r() * 60; x < x1 - 30; x += 70 + r() * 80) {
        const y = top + 4 + r() * (h - 8);
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + 8, y - 4, x + 16, y + 4, x + 26, y - 1);
      }
      ctx.stroke();
      break;
    }
    case "coral": {
      for (let x = x0 + 3; x < x1; x += 5 + r() * 6) {
        const y = top + 4 + r() * (h - 6);
        ctx.beginPath();
        circlePath(ctx, x, y, 1 + r() * 2);
        ctx.fillStyle = r() < 0.5 ? shade(color, -0.16) : shade(color, 0.3);
        ctx.fill();
      }
      for (let x = x0 + 40 + r() * 60; x < x1 - 20; x += 110 + r() * 90) {
        starfish(ctx, x, top + h * 0.55, 5, r() < 0.5 ? "#FFA94D" : "#FFE07A");
      }
      break;
    }
    case "brass": {
      ctx.strokeStyle = shade(color, -0.3);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let x = x0 + 60; x < x1; x += 76) {
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
      }
      ctx.stroke();
      for (let x = x0 + 60; x < x1; x += 76) {
        rivetRow(ctx, x - 6, x + 6, top + 7, 12, color, 1.6);
        rivetRow(ctx, x - 6, x + 6, bottom - 5, 12, color, 1.6);
      }
      band(ctx, x0, top + 9, x1, top + 12, alpha("#FFFFFF", 0.35));
      break;
    }
  }
}

function starfish(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  paint(
    ctx,
    (c) => {
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 === 0 ? r : r * 0.45;
        const px = x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr * 0.6;
        if (k === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.closePath();
    },
    color,
    { width: 1.2 },
  );
}

// ---------------------------------------------------------------------------
// Masts and rigging

export interface MastStyle {
  wood: string;
  /** Hoop color. */
  iron: string;
  /** Pole width at the deck. */
  width?: number;
  /** Skip the crow's nest even on the tallest mast. */
  noNest?: boolean;
  nestColor?: string;
}

/** A tapered mast pole with hoops, a truck on top and (on the tallest) a crow's nest. drawBack. */
export function drawMastPole(ctx: Ctx, ship: ShipDefinition, layout: HullLayout, i: number, style: MastStyle): void {
  const m = layout.masts[i];
  const rig = rigFor(ship, layout, i);
  const w0 = style.width ?? 22;
  const w1 = w0 * 0.55;
  const bottom = m.base;
  paintIn(
    ctx,
    (c) => roundedPoly(c, [
      { x: m.x - w0 / 2, y: bottom, r: 0 },
      { x: m.x - w1 / 2, y: m.top + 8, r: 3 },
      { x: m.x + w1 / 2, y: m.top + 8, r: 3 },
      { x: m.x + w0 / 2, y: bottom, r: 0 },
    ]),
    style.wood,
    () => {
      band(ctx, m.x + w1 * 0.1, m.top, m.x + w0, bottom, shade(style.wood, -0.2));
      band(ctx, m.x - w0 * 0.32, m.top, m.x - w0 * 0.12, bottom, alpha("#FFFFFF", 0.18));
    },
    { width: 3.5 },
  );
  for (let y = m.top + 60; y < bottom - 60; y += 96) {
    const t = (y - m.top) / (bottom - m.top);
    const w = w1 + (w0 - w1) * t + 5;
    paint(ctx, (c) => roundRectPath(c, m.x - w / 2, y, w, 6, 3), style.iron, { width: 2.5 });
  }
  paint(ctx, (c) => circlePath(c, m.x, m.top + 2, w1 * 0.75), style.iron, { width: 3 });
  if (rig.nest && !style.noNest) drawCrowsNest(ctx, m.x, rig.nest.top, rig.nest.bottom, style.nestColor ?? style.wood, style.iron);
}

export function drawCrowsNest(ctx: Ctx, x: number, top: number, bottom: number, wood: string, iron: string): void {
  const w = 66;
  paintIn(
    ctx,
    (c) => roundedPoly(c, [
      { x: x - w / 2, y: top, r: 4 },
      { x: x + w / 2, y: top, r: 4 },
      { x: x + w / 2 - 7, y: bottom, r: 9 },
      { x: x - w / 2 + 7, y: bottom, r: 9 },
    ]),
    wood,
    () => {
      for (let k = -2; k <= 2; k++) line(ctx, [{ x: x + k * 12, y: top }, { x: x + k * 11, y: bottom }], shade(wood, -0.3), 1.6);
      band(ctx, x + 12, top, x + w, bottom, alpha(INK, 0.14));
    },
    { width: 3.5 },
  );
  paint(ctx, (c) => roundRectPath(c, x - w / 2 - 4, top - 4, w + 8, 9, 4), iron, { width: 3 });
  paint(ctx, (c) => roundRectPath(c, x - w / 2 + 4, bottom - 14, w - 8, 6, 3), iron, { width: 2 });
}

/** Shrouds with ratlines on both sides of a mast, down to the deck's edge. drawBack, before the poles. */
export function drawShrouds(ctx: Ctx, ship: ShipDefinition, layout: HullLayout, i: number, rope: string): void {
  const m = layout.masts[i];
  const rig = rigFor(ship, layout, i);
  const from = rig.nest ? rig.nest.bottom : m.top + 60;
  const deck = surfaceOfMast(m) - DECK_DEPTH;
  const spread = clamp((deck - from) * 0.18, 46, 92);
  const c = alpha(rope, 0.75);
  for (const side of [-1, 1]) {
    const a = { x: m.x + side * 4, y: from };
    const b1 = { x: m.x + side * spread, y: deck };
    const b2 = { x: m.x + side * (spread + 26), y: deck };
    line(ctx, [a, b1], c, 2);
    line(ctx, [a, b2], c, 2);
    ctx.beginPath();
    for (let k = 1; k < 14; k++) {
      const t = k / 14;
      if (t < 0.12) continue;
      ctx.moveTo(a.x + (b1.x - a.x) * t, a.y + (b1.y - a.y) * t);
      ctx.lineTo(a.x + (b2.x - a.x) * t, a.y + (b2.y - a.y) * t);
    }
    ctx.strokeStyle = alpha(rope, 0.5);
    ctx.lineWidth = 1.3;
    ctx.stroke();
    paint(ctx, (cc) => roundRectPath(cc, b1.x - 4 + side * 6, deck - 6, 34 - 12, 6, 3), shade(rope, 0.1), { width: 1.5 });
  }
}

/** A stay: a slightly sagging rope between two points. */
export function stay(ctx: Ctx, a: Point, b: Point, rope: string, sag = 10, width = 2): void {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + sag, b.x, b.y);
  ctx.strokeStyle = alpha(rope, 0.8);
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.stroke();
}

/** Where a mast goes into its deck: the pole over the deck band, plus a collar. drawDeck. */
export function drawMastFoot(ctx: Ctx, m: MastSpot, style: MastStyle): void {
  const w = style.width ?? 22;
  const s = surfaceOfMast(m);
  paint(ctx, (c) => roundRectPath(c, m.x - w / 2, s - DECK_DEPTH - 6, w, m.base - (s - DECK_DEPTH - 6), 0), style.wood, { width: 3 });
  paint(ctx, (c) => ellipsePath(c, m.x, m.base, w * 0.85, 5), shade(style.wood, -0.1), { width: 3 });
}

// ---------------------------------------------------------------------------
// Rails and bulwarks

/** The far bulwark: a low wall along the deck's far edge, with a cap rail. drawBack. */
export function farBulwark(ctx: Ctx, from: number, to: number, surface: number, height: number, color: string, cap: string): void {
  const top = surface - DECK_DEPTH - height;
  paintIn(
    ctx,
    (c) => roundRectPath(c, from, top, to - from, height + 6, 4),
    color,
    () => band(ctx, from, top + height * 0.55, to, top + height + 6, alpha(INK, 0.12)),
    { width: 3 },
  );
  paint(ctx, (c) => roundRectPath(c, from - 3, top - 5, to - from + 6, 8, 4), cap, { width: 3 });
}

/** A see-through rail of posts and a top rail: lets sailors behind it stay visible. */
export function postRail(ctx: Ctx, from: number, to: number, surface: number, height: number, color: string, spacing = 28): void {
  const top = surface - height;
  const n = Math.max(1, Math.round((to - from) / spacing));
  for (let k = 0; k <= n; k++) {
    const x = from + ((to - from) * k) / n;
    paint(ctx, (c) => roundRectPath(c, x - 3, top, 6, height, 2), color, { width: 2.2 });
  }
  paint(ctx, (c) => roundRectPath(c, from - 4, top - 4, to - from + 8, 8, 4), color, { width: 3 });
}

/** A bracket arm that a ship's bell hangs from: a beam from `from` to just past `at`, with a hook at `at`. */
export function bellBracket(ctx: Ctx, from: Point, at: Point, wood: string, iron: string): void {
  const dir = Math.sign(at.x - from.x) || 1;
  paint(ctx, (c) => roundRectPath(c, Math.min(from.x, at.x + dir * 12) - 2, at.y - 14, Math.abs(at.x + dir * 12 - from.x) + 4, 10, 4), wood, { width: 3 });
  if (Math.abs(from.y - (at.y - 9)) > 4) {
    // A diagonal brace back to the structure.
    line(ctx, [{ x: from.x, y: from.y }, { x: from.x + (at.x - from.x) * 0.55, y: at.y - 8 }], outlineFor(wood), 6);
    line(ctx, [{ x: from.x, y: from.y }, { x: from.x + (at.x - from.x) * 0.55, y: at.y - 8 }], wood, 3);
  }
  paint(ctx, (c) => roundRectPath(c, at.x - 2.5, at.y - 6, 5, 7, 2), iron, { width: 2 });
}

/** A flag staff (for ships without a flag mast). drawBack. */
export function flagStaff(ctx: Ctx, x: number, bottom: number, top: number, wood: string, iron: string): void {
  paint(ctx, (c) => roundRectPath(c, x - 4, top, 8, bottom - top, 3), wood, { width: 3 });
  paint(ctx, (c) => circlePath(c, x, top - 2, 6), iron, { width: 2.5 });
}

/** A simple bowsprit spar from the bow up and forward. drawBack. Returns its tip. */
export function bowsprit(ctx: Ctx, from: Point, to: Point, wood: string, iron: string): Point {
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  ctx.save();
  ctx.translate(from.x, from.y);
  ctx.rotate(ang);
  paintIn(
    ctx,
    (c) => roundedPoly(c, [
      { x: 0, y: -9, r: 0 },
      { x: len, y: -5, r: 4 },
      { x: len, y: 5, r: 4 },
      { x: 0, y: 9, r: 0 },
    ]),
    wood,
    () => band(ctx, 0, 1, len, 10, shade(wood, -0.2)),
    { width: 3.5 },
  );
  paint(ctx, (c) => roundRectPath(c, len * 0.55, -9, 7, 18, 3), iron, { width: 2 });
  ctx.restore();
  return to;
}

/** Arched windows with warm light, for stern cabins. */
export function cabinWindow(ctx: Ctx, x: number, y: number, w: number, h: number, frameColor: string, ship: ShipDefinition, frame: FrameInfo, seed: number): void {
  const night = isNight(ship);
  const lit = ship.palette.glow ?? "#FFD27A";
  const glass = night ? mix(lit, "#FFFFFF", 0.2) : mix("#BFE8F5", lit, 0.25);
  paint(ctx, (c) => roundRectPath(c, x - w / 2 - 4, y - 4, w + 8, h + 8, [w / 2 + 4, w / 2 + 4, 4, 4]), frameColor, { width: 3 });
  paintIn(
    ctx,
    (c) => roundRectPath(c, x - w / 2, y, w, h, [w / 2, w / 2, 2, 2]),
    glass,
    () => {
      line(ctx, [{ x, y }, { x, y: y + h }], shade(frameColor, -0.1), 2.5);
      line(ctx, [{ x: x - w / 2, y: y + h * 0.55 }, { x: x + w / 2, y: y + h * 0.55 }], shade(frameColor, -0.1), 2.5);
      band(ctx, x - w / 2, y, x - w / 2 + w * 0.22, y + h, alpha("#FFFFFF", 0.35));
    },
    { width: 2.5 },
  );
  if (night) glow(ctx, x, y + h / 2, w * 2.2, lit, 0.55 * flicker(frame, seed));
}

export { DECK_DEPTH };
