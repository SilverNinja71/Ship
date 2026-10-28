// Draws something translucent as ONE piece: it is painted opaque into an
// offscreen canvas at device resolution, then copied onto the target with a
// single globalAlpha, so overlapping parts (hair over face, hands over the
// desk) don't show through each other.

import type { Ctx } from "../types.js";

export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

type Surface = { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: Ctx };

const pool: Surface[] = [];
let depth = 0;

function makeSurface(w: number, h: number): Surface | null {
  try {
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d") as unknown as Ctx | null;
      return ctx ? { canvas, ctx } : null;
    }
    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      return ctx ? { canvas, ctx } : null;
    }
  } catch {
    // Fall through: no offscreen drawing in this environment.
  }
  return null;
}

/** A surface at least w × h for this nesting depth, grown in 128 px steps and reused. */
function surfaceFor(level: number, w: number, h: number): Surface | null {
  const gw = Math.ceil(w / 128) * 128;
  const gh = Math.ceil(h / 128) * 128;
  const s = pool[level];
  if (s && s.canvas.width >= w && s.canvas.height >= h) return s;
  const next = makeSurface(Math.max(gw, s?.canvas.width ?? 0), Math.max(gh, s?.canvas.height ?? 0));
  if (next) pool[level] = next;
  return next;
}

/** Drops the cached layers (tests; or to free memory after leaving a zoomed view). */
export function releaseLayers(): void {
  pool.length = 0;
}

/** The largest layer we allocate, so a huge zoom can't eat memory. */
const MAX_SIDE = 4096;

/**
 * Runs `draw` (in the current coordinate frame) at `opacity`. `bounds` is a
 * generous box, in the current frame's units, around everything it draws.
 */
export function drawTranslucent(ctx: Ctx, opacity: number, bounds: Bounds, draw: (c: Ctx) => void): void {
  if (!(opacity < 0.999)) {
    draw(ctx);
    return;
  }
  if (opacity <= 0.003) return;
  const m = typeof ctx.getTransform === "function" ? ctx.getTransform() : null;
  const canvas = (ctx as { canvas?: { width?: number; height?: number } }).canvas;
  const cw = typeof canvas?.width === "number" ? canvas.width : MAX_SIDE;
  const ch = typeof canvas?.height === "number" ? canvas.height : MAX_SIDE;
  if (!m || ![m.a, m.b, m.c, m.d, m.e, m.f].every(Number.isFinite)) return fallback(ctx, opacity, draw);

  // The bounds' corners in device pixels.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of [[bounds.x0, bounds.y0], [bounds.x1, bounds.y0], [bounds.x0, bounds.y1], [bounds.x1, bounds.y1]]) {
    const px = m.a * x + m.c * y + m.e;
    const py = m.b * x + m.d * y + m.f;
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
  }
  const bx = Math.max(0, Math.floor(minX) - 2);
  const by = Math.max(0, Math.floor(minY) - 2);
  const ex = Math.min(cw, Math.ceil(maxX) + 2);
  const ey = Math.min(ch, Math.ceil(maxY) + 2);
  const w = ex - bx;
  const h = ey - by;
  if (w <= 0 || h <= 0) return;
  if (w > MAX_SIDE || h > MAX_SIDE) return fallback(ctx, opacity, draw);

  const surface = surfaceFor(depth, w, h);
  if (!surface) return fallback(ctx, opacity, draw);
  const lc = surface.ctx;
  lc.save();
  lc.setTransform(1, 0, 0, 1, 0, 0);
  lc.globalAlpha = 1;
  lc.globalCompositeOperation = "source-over";
  lc.clearRect(0, 0, w, h);
  lc.setTransform(m.a, m.b, m.c, m.d, m.e - bx, m.f - by);
  depth++;
  try {
    draw(lc);
  } finally {
    depth--;
    lc.restore();
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha *= opacity;
  ctx.drawImage(surface.canvas as CanvasImageSource, 0, 0, w, h, bx, by, w, h);
  ctx.restore();
}

/** No offscreen canvas (tests, very old browsers): plain alpha, parts may overlap. */
function fallback(ctx: Ctx, opacity: number, draw: (c: Ctx) => void): void {
  ctx.save();
  ctx.globalAlpha *= opacity;
  try {
    draw(ctx);
  } finally {
    ctx.restore();
  }
}
