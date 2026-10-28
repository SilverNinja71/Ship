// Drawing sprites: snapped to their anchor, colored, waved like cloth, or
// tiled into a scrolling band.

import type { Ctx } from "../types.js";
import type { Sprite } from "./store.js";

export interface SpriteDraw {
  /** Scene units per image pixel, on top of the sprite's density. Default 1. */
  scale?: number;
  /** Radians, around the anchor. */
  rotation?: number;
  /** Mirror left-right around the anchor. */
  flipX?: boolean;
  /** The color a tintable sprite takes. Ignored for other sprites. */
  tint?: string;
}

/** Draws a sprite with its anchor at (x, y) in the current transform. */
export function drawSprite(ctx: Ctx, s: Sprite, x: number, y: number, o: SpriteDraw = {}): void {
  const k = (o.scale ?? 1) / (s.density ?? 1);
  ctx.save();
  ctx.translate(x, y);
  if (o.rotation) ctx.rotate(o.rotation);
  ctx.scale(o.flipX ? -k : k, k);
  ctx.drawImage(o.tint && s.tintable ? tinted(s, o.tint) : s.image, -s.anchorX, -s.anchorY, s.width, s.height);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Tinting

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const tints = new WeakMap<object, Map<string, CanvasImageSource>>();

/**
 * A grey sprite colored in: "hard-light" keeps mid-grey as the color itself,
 * darkens it toward black and lightens it toward white. Cached per color.
 */
export function tinted(s: Sprite, color: string): CanvasImageSource {
  if (!HEX.test(color)) return s.image;
  let byColor = tints.get(s.image);
  if (!byColor) tints.set(s.image, (byColor = new Map()));
  let hit = byColor.get(color);
  if (!hit) {
    hit = paintTint(s, color);
    if (byColor.size > 32) byColor.clear();
    byColor.set(color, hit);
  }
  return hit;
}

function paintTint(s: Sprite, color: string): CanvasImageSource {
  const canvas = makeCanvas(s.width, s.height);
  const g = canvas?.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null | undefined;
  if (!canvas || !g) return s.image;
  g.fillStyle = color;
  g.fillRect(0, 0, s.width, s.height);
  g.globalCompositeOperation = "hard-light";
  g.drawImage(s.image, 0, 0, s.width, s.height);
  // Keep only the sprite's own shape.
  g.globalCompositeOperation = "destination-in";
  g.drawImage(s.image, 0, 0, s.width, s.height);
  return canvas;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas | null {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

// ---------------------------------------------------------------------------
// Cloth and bands

/**
 * Draws a sprite in vertical strips, each shifted down by `dy(u)` scene units,
 * where u runs from 0 at the anchor's column to 1 at the far edge. Flags wave
 * this way: still at the pole, rippling toward the free end.
 */
export function drawWaving(ctx: Ctx, s: Sprite, x: number, y: number, dy: (u: number) => number, strips = 24): void {
  const d = s.density ?? 1;
  const reach = Math.max(s.anchorX, s.width - s.anchorX) || 1;
  const sw = s.width / strips;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1 / d, 1 / d);
  for (let i = 0; i < strips; i++) {
    const sx = i * sw;
    const u = Math.abs(sx + sw / 2 - s.anchorX) / reach;
    // Each strip overlaps the next by a pixel so no seams show.
    const w = Math.min(sw + 1, s.width - sx);
    ctx.drawImage(s.image, sx, 0, w, s.height, sx - s.anchorX, -s.anchorY + dy(u) * d, w, s.height);
  }
  ctx.restore();
}

export interface BandOptions {
  /** Screen y of the sprite's anchor row. */
  y: number;
  /** Pixels per image pixel (density already accounted for by the caller). */
  scale: number;
  /** How far the band has scrolled left, in pixels. */
  scroll: number;
  /** Screen width to cover. */
  width: number;
  /** Stretch the sprite's bottom row down to this screen y, so the sea reaches the bottom. */
  fillTo?: number;
}

/** Repeats a sprite sideways across the screen (waves, clouds). */
export function drawBand(ctx: Ctx, s: Sprite, o: BandOptions): void {
  const k = o.scale / (s.density ?? 1);
  const tileW = s.width * k;
  const h = s.height * k;
  if (tileW < 1) return;
  const top = o.y - s.anchorY * k;
  const start = -(((o.scroll % tileW) + tileW) % tileW);
  for (let x = start; x < o.width; x += tileW) {
    ctx.drawImage(s.image, 0, 0, s.width, s.height, x, top, tileW + 0.5, h);
    if (o.fillTo !== undefined && o.fillTo > top + h) {
      ctx.drawImage(s.image, 0, s.height - 1, s.width, 1, x, top + h - 0.5, tileW + 0.5, o.fillTo - top - h + 0.5);
    }
  }
}

/** Scales a sprite to cover a box, cropping what overflows (sky backdrops). */
export function drawCover(ctx: Ctx, s: Sprite, x: number, y: number, w: number, h: number): void {
  const k = Math.max(w / s.width, h / s.height);
  ctx.drawImage(s.image, x + (w - s.width * k) / 2, y + (h - s.height * k) / 2, s.width * k, s.height * k);
}
