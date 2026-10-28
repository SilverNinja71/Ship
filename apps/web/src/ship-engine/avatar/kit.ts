// Small drawing helpers the sailor artwork shares on top of ../draw.ts:
// curves with optional sharp tips (hair locks, spikes), outlined "tube" limbs,
// and shapes with one soft shade clipped inside them.

import { OUTLINE, outlineFor } from "../draw.js";
import type { Ctx, Point } from "../types.js";

/** A curve point: [x, y], or [x, y, 1] for a sharp corner (a hair tip, a spike). */
export type CurvePt = readonly [number, number] | readonly [number, number, 1];

/**
 * A smooth path through the points (Catmull-Rom as Béziers). Points marked
 * sharp get no tangent, so the curve meets them in a crisp point.
 */
export function curvyPath(ctx: Ctx, pts: readonly CurvePt[], tension = 0.5, closed = true): void {
  const n = pts.length;
  if (n < 2) return;
  const at = (i: number) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const k = tension / 3;
  const tangent = (i: number): Point => {
    const p = at(i);
    if (p[2] === 1 || (!closed && (i <= 0 || i >= n - 1))) return { x: 0, y: 0 };
    const a = at(i - 1);
    const b = at(i + 1);
    return { x: (b[0] - a[0]) * k, y: (b[1] - a[1]) * k };
  };
  ctx.moveTo(pts[0][0], pts[0][1]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p1 = at(i);
    const p2 = at(i + 1);
    const t1 = tangent(i);
    const t2 = tangent(i + 1);
    ctx.bezierCurveTo(p1[0] + t1.x, p1[1] + t1.y, p2[0] - t2.x, p2[1] - t2.y, p2[0], p2[1]);
  }
  if (closed) ctx.closePath();
}

/** Mirrors curve points left-right (x → -x), keeping sharp marks. */
export function mirrorPts(pts: readonly CurvePt[]): CurvePt[] {
  return pts.map((p) => (p[2] === 1 ? ([-p[0], p[1], 1] as const) : ([-p[0], p[1]] as const)));
}

export interface ShadeOptions {
  stroke?: string | false;
  width?: number;
}

/** Fill, then one soft shade clipped inside the shape, then the outline on top. */
export function paintShaded(
  ctx: Ctx,
  build: (c: Ctx) => void,
  fill: string,
  shadeColor: string | null,
  shadeBuild: ((c: Ctx) => void) | null,
  opts: ShadeOptions = {},
): void {
  ctx.save();
  ctx.beginPath();
  build(ctx);
  ctx.fillStyle = fill;
  ctx.fill();
  if (shadeColor && shadeBuild) {
    ctx.clip();
    ctx.beginPath();
    shadeBuild(ctx);
    ctx.fillStyle = shadeColor;
    ctx.fill();
  }
  ctx.restore();
  const stroke = opts.stroke ?? outlineFor(fill);
  if (stroke === false) return;
  ctx.beginPath();
  build(ctx);
  ctx.lineWidth = opts.width ?? OUTLINE;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

/** Clips to the shape and runs `fn` (for patterns: stripes, plaid, wood grain). */
export function withClip(ctx: Ctx, build: (c: Ctx) => void, fn: () => void): void {
  ctx.save();
  ctx.beginPath();
  build(ctx);
  ctx.clip();
  try {
    fn();
  } finally {
    ctx.restore();
  }
}

export function fillPath(ctx: Ctx, build: (c: Ctx) => void, fill: string | CanvasGradient): void {
  ctx.beginPath();
  build(ctx);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function strokePath(ctx: Ctx, build: (c: Ctx) => void, color: string, width = OUTLINE): void {
  ctx.beginPath();
  build(ctx);
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.stroke();
}

function polyline(ctx: Ctx, pts: readonly Point[]): void {
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 3) {
    // Bend smoothly through the middle point (an elbow).
    const [a, b, c] = pts;
    const m1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const m2 = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
    ctx.lineTo(m1.x, m1.y);
    ctx.quadraticCurveTo(b.x, b.y, m2.x, m2.y);
    ctx.lineTo(c.x, c.y);
    return;
  }
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
}

export interface TubeOptions {
  outline?: string;
  /** Bands across the tube (sleeve stripes): [color, on, off]. */
  stripes?: readonly [string, number, number];
  cap?: CanvasLineCap;
}

/** An outlined round-capped tube along the points: arms, straps, scarf tails. */
export function tube(ctx: Ctx, pts: readonly Point[], width: number, fill: string, opts: TubeOptions = {}): void {
  if (pts.length < 2) return;
  ctx.beginPath();
  polyline(ctx, pts);
  ctx.lineCap = opts.cap ?? "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = opts.outline ?? outlineFor(fill);
  ctx.lineWidth = width + OUTLINE;
  ctx.stroke();
  ctx.strokeStyle = fill;
  ctx.lineWidth = Math.max(1, width - OUTLINE);
  ctx.stroke();
  if (opts.stripes) {
    const [color, on, off] = opts.stripes;
    ctx.save();
    ctx.setLineDash([on, off]);
    ctx.lineCap = "butt";
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
  }
}

/** A repeating 0..1 sawtooth. */
export const fract = (x: number) => x - Math.floor(x);

/** Stable pseudo-random 0..1 for an integer pair (seed, index), for per-cycle choices. */
export function hash01(seed: number, i: number): number {
  let h = Math.imul((seed ^ 0x9e3779b9) >>> 0, 0x85ebca6b) ^ Math.imul(i + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export const lerpPt = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const addPt = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });

/** Rotates a point around the origin. */
export function rotPt(p: Point, angle: number): Point {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}
