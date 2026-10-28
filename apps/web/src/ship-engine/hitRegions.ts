// Clickable parts of the scene. The ship bobs and tilts, so regions are
// rebuilt every frame from the current canvas transform and kept in CSS pixels.

import type { Ctx, Point } from "./types.js";

export type HitId =
  | "helm"
  | "tree"
  | "bell"
  | "desk"
  | "avatar"
  | "figurehead"
  | "flag"
  | "porthole"
  | "decor"
  | "bookshelf"
  | `crew:${string}`
  | `ghost:${string}`;

export interface HitRegion {
  id: HitId;
  /** Corners in CSS pixels (a rotated rectangle, usually). */
  points: Point[];
  label: string;
}

/** Maps a point from the current drawing space to CSS pixels. */
export function toScreen(ctx: Ctx, p: Point, dpr: number): Point {
  const m = ctx.getTransform();
  return { x: (m.a * p.x + m.c * p.y + m.e) / dpr, y: (m.b * p.x + m.d * p.y + m.f) / dpr };
}

/** A rectangle in the current drawing space, recorded as a screen polygon. */
export function rectRegion(ctx: Ctx, dpr: number, id: HitId, label: string, x: number, y: number, w: number, h: number): HitRegion {
  const corners = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
  return { id, label, points: corners.map((p) => toScreen(ctx, p, dpr)) };
}

function inside(p: Point, poly: Point[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** The topmost region under a point (later regions are drawn on top). */
export function hitTest(regions: readonly HitRegion[], p: Point): HitRegion | null {
  for (let i = regions.length - 1; i >= 0; i--) if (inside(p, regions[i].points)) return regions[i];
  return null;
}

/** Outlines every region, for the "show clickable areas" setting. */
export function drawRegions(ctx: Ctx, regions: readonly HitRegion[], hover: HitId | null): void {
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 1.5;
  ctx.font = "600 11px system-ui, sans-serif";
  for (const r of regions) {
    ctx.strokeStyle = r.id === hover ? "#FFD166" : "rgba(255,255,255,0.7)";
    ctx.beginPath();
    r.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(r.id, r.points[0].x + 3, r.points[0].y + 12);
  }
  ctx.restore();
}
