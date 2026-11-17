// Drawing helpers for Ship's cartoon look: flat fills, one soft shade, and a
// thick dark outline derived from the fill. Every renderer uses these so the
// ships, sailors and props read as one style.

import type { Ctx, Point } from "./types.js";

/** Outline width in ship units (roughly 3 px at a typical zoom). */
export const OUTLINE = 4;
/** The darkest line color: a deep plum-navy rather than black, which looks friendlier. */
export const INK = "#2A2238";

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const colorCache = new Map<string, Rgba>();

/** Parses #rgb, #rrggbb, #rrggbbaa and rgb()/rgba(). Unknown input reads as magenta so mistakes are visible. */
export function parseColor(color: string): Rgba {
  const cached = colorCache.get(color);
  if (cached) return cached;
  let out: Rgba = { r: 255, g: 0, b: 255, a: 1 };
  const c = color.trim();
  if (c.startsWith("#")) {
    let hex = c.slice(1);
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((ch) => ch + ch).join("");
    if (hex.length === 6 || hex.length === 8) {
      const n = Number.parseInt(hex.slice(0, 6), 16);
      out = { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: hex.length === 8 ? Number.parseInt(hex.slice(6), 16) / 255 : 1 };
    }
  } else {
    const m = /^rgba?\(([^)]+)\)$/.exec(c);
    if (m) {
      const [r, g, b, a] = m[1].split(",").map((p) => Number.parseFloat(p));
      out = { r, g, b, a: Number.isFinite(a) ? a : 1 };
    }
  }
  colorCache.set(color, out);
  return out;
}

const to2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");

export function toCss({ r, g, b, a }: Rgba): string {
  return a >= 1 ? `#${to2(r)}${to2(g)}${to2(b)}` : `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${+a.toFixed(3)})`;
}

/** Blend two colors; t = 0 gives `a`, t = 1 gives `b`. */
export function mix(a: string, b: string, t: number): string {
  const x = parseColor(a);
  const y = parseColor(b);
  return toCss({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t, a: x.a + (y.a - x.a) * t });
}

/** amount < 0 darkens towards ink, > 0 lightens towards white (-1..1). */
export function shade(color: string, amount: number): string {
  return amount < 0 ? mix(color, INK, -amount) : mix(color, "#FFFFFF", amount);
}

export function alpha(color: string, a: number): string {
  const c = parseColor(color);
  return toCss({ ...c, a: c.a * a });
}

/** The outline that goes with a fill: a dark, slightly saturated version of it. */
export function outlineFor(fill: string): string {
  if (handDrawnMode) return SOFT_GREY_INK;
  return mix(shade(fill, -0.62), INK, 0.35);
}

export const SOFT_GREY_INK = "#8D8D8D";
let handDrawnMode = false;
let grainyGreyPattern: CanvasPattern | null = null;

export function setHandDrawnMode(enabled: boolean): void {
  handDrawnMode = enabled;
}

function getGrainyGreyStroke(_ctx: Ctx): string {
  return SOFT_GREY_INK;
}

export interface PaintOptions {
  /** Outline color, or false for none. Defaults to outlineFor(fill). */
  stroke?: string | false;
  /** Outline width; defaults to OUTLINE. */
  width?: number;
  /** Shade the lower part of the shape a little, for roundness. */
  shadeFrom?: number;
}

/** Builds a path with `build`, fills it, then outlines it. */
export function paint(ctx: Ctx, build: (ctx: Ctx) => void, fill: string | CanvasGradient, opts: PaintOptions = {}): void {
  ctx.beginPath();
  build(ctx);
  ctx.fillStyle = fill;
  ctx.fill();
  const stroke = opts.stroke ?? (typeof fill === "string" ? outlineFor(fill) : handDrawnMode ? SOFT_GREY_INK : INK);
  if (stroke !== false) {
    ctx.lineWidth = opts.width ?? OUTLINE;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    if (handDrawnMode) {
      const c = parseColor(stroke);
      const lum = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
      ctx.save();
      ctx.strokeStyle = lum > 0.65 && opts.stroke ? stroke : getGrainyGreyStroke(ctx);
      ctx.shadowBlur = 1.2;
      ctx.shadowColor = lum > 0.65 && opts.stroke ? alpha(stroke, 0.35) : "rgba(141, 141, 141, 0.32)";
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }
}

/** Strokes a line or path with round caps. */
export function line(ctx: Ctx, points: Point[], color: string, width = OUTLINE): void {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  if (handDrawnMode && points.length >= 2) {
    // Subtle hand-drawn midpoint wobble so lines aren't ruler-perfect
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const mx = (p0.x + p1.x) / 2;
      const my = (p0.y + p1.y) / 2;
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const wobble = Math.sin((p0.x + p0.y + i * 7.3) * 0.17) * Math.min(2.2, Math.hypot(dx, dy) * 0.025);
      ctx.quadraticCurveTo(mx - wobble * 0.4, my + wobble, p1.x, p1.y);
    }
  } else {
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (handDrawnMode) {
    const c = parseColor(color);
    const lum = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
    if (c.a < 0.85 && lum <= 0.65) {
      ctx.strokeStyle = alpha(SOFT_GREY_INK, c.a);
      ctx.stroke();
    } else if (lum <= 0.65) {
      ctx.strokeStyle = getGrainyGreyStroke(ctx);
      ctx.stroke();
      ctx.save();
      ctx.translate(0.55, 0.45);
      ctx.globalAlpha *= 0.35;
      ctx.lineWidth = Math.max(1, width * 0.7);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.strokeStyle = color;
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = color;
    ctx.stroke();
  }
}

function hashCoords(a: number, b: number, c = 0, d = 0): number {
  let h = 2166136261;
  const mixInt = (n: number) => {
    const v = Math.round(n * 16) | 0;
    h = Math.imul(h ^ v, 16777619);
  };
  mixInt(a);
  mixInt(b);
  mixInt(c);
  mixInt(d);
  return h >>> 0;
}

export function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number | [number, number, number, number]): void {
  const [tl, tr, br, bl] = typeof r === "number" ? [r, r, r, r] : r;
  const k = (v: number) => Math.max(0, Math.min(v, w / 2, h / 2));
  if (!handDrawnMode || w <= 0 || h <= 0) {
    ctx.moveTo(x + k(tl), y);
    ctx.lineTo(x + w - k(tr), y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + k(tr));
    ctx.lineTo(x + w, y + h - k(br));
    ctx.quadraticCurveTo(x + w, y + h, x + w - k(br), y + h);
    ctx.lineTo(x + k(bl), y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - k(bl));
    ctx.lineTo(x, y + k(tl));
    ctx.quadraticCurveTo(x, y, x + k(tl), y);
    ctx.closePath();
    return;
  }

  // Deterministic coordinate-seeded hand-drawn rounded rect with slight corner asymmetry
  const rand = rng(hashCoords(x, y, w, h));
  const j = (amp: number) => (rand() - 0.5) * 2 * amp;
  const minDim = Math.min(w, h);
  const maxDim = Math.max(w, h);
  const cAmp = Math.min(0.6, minDim * 0.015);
  const eAmp = Math.min(0.7, maxDim * 0.008);

  const rtl = k(tl * (0.9 + rand() * 0.2));
  const rtr = k(tr * (0.9 + rand() * 0.2));
  const rbr = k(br * (0.9 + rand() * 0.2));
  const rbl = k(bl * (0.9 + rand() * 0.2));

  const x0 = x + j(cAmp * 0.45);
  const y0 = y + j(cAmp * 0.45);
  const x1 = x + w + j(cAmp * 0.45);
  const y1 = y + h + j(cAmp * 0.45);

  const pTopStart = { x: x0 + rtl, y: y0 + j(cAmp * 0.3) };
  const pTopEnd = { x: x1 - rtr, y: y + j(cAmp * 0.35) };
  const pRightStart = { x: x1 + j(cAmp * 0.35), y: y + rtr };
  const pRightEnd = { x: x1 + j(cAmp * 0.35), y: y1 - rbr };
  const pBotStart = { x: x1 - rbr, y: y1 + j(cAmp * 0.35) };
  const pBotEnd = { x: x0 + rbl, y: y1 + j(cAmp * 0.35) };
  const pLeftStart = { x: x0 + j(cAmp * 0.35), y: y1 - rbl };
  const pLeftEnd = { x: x0 + j(cAmp * 0.35), y: y0 + rtl };

  ctx.moveTo(pTopStart.x, pTopStart.y);
  ctx.quadraticCurveTo((pTopStart.x + pTopEnd.x) * 0.5 + j(eAmp * 0.3), (pTopStart.y + pTopEnd.y) * 0.5 + j(eAmp), pTopEnd.x, pTopEnd.y);
  ctx.quadraticCurveTo(x1 + j(cAmp * 0.4), y + j(cAmp * 0.4), pRightStart.x, pRightStart.y);
  ctx.quadraticCurveTo((pRightStart.x + pRightEnd.x) * 0.5 + j(eAmp), (pRightStart.y + pRightEnd.y) * 0.5 + j(eAmp * 0.3), pRightEnd.x, pRightEnd.y);
  ctx.quadraticCurveTo(x1 + j(cAmp * 0.4), y1 + j(cAmp * 0.4), pBotStart.x, pBotStart.y);
  ctx.quadraticCurveTo((pBotStart.x + pBotEnd.x) * 0.5 + j(eAmp * 0.3), (pBotStart.y + pBotEnd.y) * 0.5 + j(eAmp), pBotEnd.x, pBotEnd.y);
  ctx.quadraticCurveTo(x0 + j(cAmp * 0.4), y1 + j(cAmp * 0.4), pLeftStart.x, pLeftStart.y);
  ctx.quadraticCurveTo((pLeftStart.x + pLeftEnd.x) * 0.5 + j(eAmp), (pLeftStart.y + pLeftEnd.y) * 0.5 + j(eAmp * 0.3), pLeftEnd.x, pLeftEnd.y);
  ctx.quadraticCurveTo(x0 + j(cAmp * 0.4), y0 + j(cAmp * 0.4), pTopStart.x, pTopStart.y);
  ctx.closePath();
}

export function ellipsePath(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, rotation = 0): void {
  if (!handDrawnMode || rx <= 0 || ry <= 0) {
    ctx.moveTo(cx + rx * Math.cos(rotation), cy + rx * Math.sin(rotation));
    ctx.ellipse(cx, cy, rx, ry, rotation, 0, Math.PI * 2);
    ctx.closePath();
    return;
  }

  // Deterministic coordinate-seeded organic wobbly ellipse
  const rand = rng(hashCoords(cx, cy, rx, ry));
  const n = 12;
  const minR = Math.min(rx, ry);
  const amp = Math.min(2.2, minR * 0.085);
  const skewX = (rand() - 0.5) * 0.08;
  const skewY = (rand() - 0.5) * 0.08;
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const dr = (rand() - 0.5) * 2 * amp;
    const da = (rand() - 0.5) * 0.085;
    const lx = (rx * (1 + skewX * Math.sin(a)) + dr) * Math.cos(a + da);
    const ly = (ry * (1 + skewY * Math.cos(a)) + dr) * Math.sin(a + da);
    pts.push({
      x: cx + lx * cosR - ly * sinR,
      y: cy + lx * sinR + ly * cosR,
    });
  }
  smoothClosedPath(ctx, pts, 0.5);
}

export function circlePath(ctx: Ctx, cx: number, cy: number, r: number): void {
  ellipsePath(ctx, cx, cy, r, r);
}

/** A smooth closed shape through the points (Catmull-Rom turned into Béziers). */
export function smoothClosedPath(ctx: Ctx, pts: Point[], tension = 0.5): void {
  const n = pts.length;
  if (n < 3) return;
  const at = (i: number) => pts[(i + n) % n];
  ctx.moveTo(at(0).x, at(0).y);
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const k = tension / 3;
    ctx.bezierCurveTo(p1.x + (p2.x - p0.x) * k, p1.y + (p2.y - p0.y) * k, p2.x - (p3.x - p1.x) * k, p2.y - (p3.y - p1.y) * k, p2.x, p2.y);
  }
  ctx.closePath();
}

/** A smooth open curve through the points. */
export function smoothPath(ctx: Ctx, pts: Point[], tension = 0.5): void {
  const n = pts.length;
  if (n < 2) return;
  const at = (i: number) => pts[Math.max(0, Math.min(n - 1, i))];
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const k = tension / 3;
    ctx.bezierCurveTo(p1.x + (p2.x - p0.x) * k, p1.y + (p2.y - p0.y) * k, p2.x - (p3.x - p1.x) * k, p2.y - (p3.y - p1.y) * k, p2.x, p2.y);
  }
}

/** Runs `fn` with a temporary transform (and optional opacity), always restoring the context. */
export function withTransform(
  ctx: Ctx,
  t: { x?: number; y?: number; rotate?: number; scaleX?: number; scaleY?: number; scale?: number; alpha?: number },
  fn: () => void,
): void {
  ctx.save();
  if (t.x || t.y) ctx.translate(t.x ?? 0, t.y ?? 0);
  if (t.rotate) ctx.rotate(t.rotate);
  const sx = t.scaleX ?? t.scale ?? 1;
  const sy = t.scaleY ?? t.scale ?? 1;
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  if (t.alpha !== undefined) ctx.globalAlpha *= t.alpha;
  try {
    fn();
  } finally {
    ctx.restore();
  }
}

export function linearGradient(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [at, color] of stops) g.addColorStop(at, color);
  return g;
}

export function radialGradient(ctx: Ctx, x: number, y: number, r: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [at, color] of stops) g.addColorStop(at, color);
  return g;
}

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** Deterministic pseudo-random numbers (mulberry32), so drawings don't shimmer frame to frame. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable number for a string, to seed rng() per ship or sailor. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A gentle oscillation that respects reduced motion (it slows to almost nothing). */
export function sway(t: number, speed: number, phase = 0, reducedMotion = false): number {
  return Math.sin(t * speed * (reducedMotion ? 0.08 : 1) + phase);
}
