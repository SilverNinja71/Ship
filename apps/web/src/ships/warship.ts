// Pieces shared by the steel ships (battleship, dreadnought, ironclad,
// carrier): deckhouses with window bands, stanchion rails, signal masts with
// radar, and the hawse anchor.

import type { ShipDefinition } from "@ship/shared-types";
import { INK, alpha, circlePath, ellipsePath, line, mix, outlineFor, paint, roundRectPath, shade } from "../ship-engine/draw.js";
import type { Ctx, FrameInfo } from "../ship-engine/types.js";
import { band, glow, isNight, paintIn, rivetRow } from "./kit.js";

export interface DeckhouseOptions {
  /** A band of windows: its top y and height. */
  windows?: { y: number; h: number; frame?: string };
  roof?: string;
  rivets?: boolean;
  radius?: number;
}

/** A boxy superstructure block, standing on `bottom`. */
export function deckhouse(ctx: Ctx, ship: ShipDefinition, x0: number, x1: number, top: number, bottom: number, color: string, frame: FrameInfo, opts: DeckhouseOptions = {}): void {
  const rr = opts.radius ?? 8;
  paintIn(
    ctx,
    (c) => roundRectPath(c, x0, top, x1 - x0, bottom - top, [rr, rr, 2, 2]),
    color,
    () => {
      band(ctx, x1 - (x1 - x0) * 0.16, top, x1, bottom, shade(color, -0.12));
      band(ctx, x0 + 6, top, x0 + 12, bottom, alpha("#FFFFFF", 0.25));
      if (opts.rivets) {
        rivetRow(ctx, x0 + 8, x1 - 8, top + 10, 14, color, 1.8);
        rivetRow(ctx, x0 + 8, x1 - 8, bottom - 8, 14, color, 1.8);
      }
      if (opts.windows) windowBand(ctx, ship, x0 + 10, x1 - 10, opts.windows.y, opts.windows.h, opts.windows.frame ?? shade(color, -0.45), frame);
    },
    { width: 3.5 },
  );
  if (opts.roof) paint(ctx, (c) => roundRectPath(c, x0 - 8, top - 8, x1 - x0 + 16, 10, 4), opts.roof, { width: 3 });
}

/** A row of square windows with glass that catches the light (and glows at night). */
export function windowBand(ctx: Ctx, ship: ShipDefinition, x0: number, x1: number, y: number, h: number, frameColor: string, frame: FrameInfo): void {
  const n = Math.max(1, Math.round((x1 - x0) / (h * 1.3)));
  const w = (x1 - x0) / n;
  const night = isNight(ship);
  const lit = ship.palette.glow ?? "#FFF4C2";
  for (let k = 0; k < n; k++) {
    const x = x0 + k * w;
    paint(ctx, (c) => roundRectPath(c, x + 3, y, w - 6, h, 3), night ? mix(lit, "#FFFFFF", 0.2) : "#9FD3EA", { stroke: frameColor, width: 2.6 });
    band(ctx, x + 6, y + 3, x + 6 + (w - 12) * 0.3, y + h - 3, alpha("#FFFFFF", 0.45));
  }
  if (night) glow(ctx, (x0 + x1) / 2, y + h / 2, (x1 - x0) * 0.7, lit, 0.35 * (0.95 + 0.05 * Math.sin(frame.t * 3)));
}

/** Thin stanchions with two chain lines: a navy rail you can see through. drawFront. */
export function stanchions(ctx: Ctx, from: number, to: number, y: number, color: string, height = 24, spacing = 38): void {
  const n = Math.max(1, Math.round((to - from) / spacing));
  const top = y - height;
  for (const yy of [top + 2, top + height * 0.55]) {
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const a = from + ((to - from) * k) / n;
      const b = from + ((to - from) * (k + 1)) / n;
      ctx.moveTo(a, yy);
      ctx.quadraticCurveTo((a + b) / 2, yy + 4, b, yy);
    }
    ctx.strokeStyle = alpha(color, 0.9);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  for (let k = 0; k <= n; k++) {
    const x = from + ((to - from) * k) / n;
    line(ctx, [{ x, y }, { x, y: top }], outlineFor(color), 5);
    line(ctx, [{ x, y }, { x, y: top }], color, 2.6);
    paint(ctx, (c) => circlePath(c, x, top, 3), color, { width: 1.6 });
  }
}

export interface SignalMastOptions {
  color: string;
  /** y of the yardarm (signal-flag yard). */
  yard?: number;
  /** y of a rotating radar dish. */
  radar?: number;
  /** A tripod mast with a spotting top at this y (the dreadnought). */
  spottingTop?: number;
  pennants?: boolean;
}

/** A signal mast from `base` to `top`: yardarm, radar, signal pennants, maybe a tripod. drawBack. */
export function signalMast(ctx: Ctx, x: number, base: number, top: number, frame: FrameInfo, opts: SignalMastOptions): void {
  const c0 = opts.color;
  if (opts.spottingTop !== undefined) {
    for (const dx of [-44, 44]) {
      line(ctx, [{ x: x + dx, y: base }, { x, y: opts.spottingTop + 20 }], outlineFor(c0), 9);
      line(ctx, [{ x: x + dx, y: base }, { x, y: opts.spottingTop + 20 }], c0, 5);
    }
  }
  paintIn(
    ctx,
    (c) => roundRectPath(c, x - 7, top, 14, base - top, 4),
    c0,
    () => band(ctx, x + 1, top, x + 8, base, shade(c0, -0.2)),
    { width: 3 },
  );
  paint(ctx, (c) => circlePath(c, x, top + 1, 6), shade(c0, 0.2), { width: 2.4 });
  if (opts.yard !== undefined) {
    paint(ctx, (c) => roundRectPath(c, x - 70, opts.yard!, 140, 8, 4), c0, { width: 3 });
    if (opts.pennants) {
      const colors = ["#C8102E", "#F2C14E", "#1F3A5F", "#FFFFFF", "#3FA7D6"];
      for (const side of [-1, 1]) {
        const ax = x + side * 66;
        const ay = opts.yard + 6;
        const bx = x + side * 26;
        const by = base - 6;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.strokeStyle = alpha(INK, 0.5);
        ctx.lineWidth = 1.4;
        ctx.stroke();
        for (let k = 1; k < 6; k++) {
          const t = k / 6.5;
          const px = ax + (bx - ax) * t;
          const py = ay + (by - ay) * t;
          const flap = 2 * Math.sin(frame.t * (frame.reducedMotion ? 0.2 : 3) + k + side);
          paint(ctx, (cc) => {
            cc.moveTo(px - 6, py);
            cc.lineTo(px + 6, py);
            cc.lineTo(px + flap, py + 13);
            cc.closePath();
          }, colors[(k + (side > 0 ? 2 : 0)) % colors.length], { width: 1.4 });
        }
      }
    }
  }
  if (opts.spottingTop !== undefined) {
    const y = opts.spottingTop;
    paintIn(ctx, (c) => roundRectPath(c, x - 34, y - 26, 68, 34, [10, 10, 4, 4]), c0, () => {
      band(ctx, x - 34, y - 18, x + 34, y - 10, "#2A3440");
      band(ctx, x + 12, y - 26, x + 34, y + 8, shade(c0, -0.15));
    }, { width: 3 });
  }
  if (opts.radar !== undefined) {
    const turn = Math.cos(frame.t * (frame.reducedMotion ? 0.05 : 1.2));
    paint(ctx, (c) => roundRectPath(c, x - 4, opts.radar! - 4, 8, 14, 2), c0, { width: 2 });
    paint(ctx, (c) => ellipsePath(c, x, opts.radar! - 8, Math.max(3, 30 * Math.abs(turn)), 9), shade(c0, 0.25), { width: 2.6 });
  }
}

/** An anchor hanging at the hawse on the bow. */
export function hawseAnchor(ctx: Ctx, x: number, y: number, color: string): void {
  paint(ctx, (c) => ellipsePath(c, x, y - 12, 9, 7), "#1A1F26", { width: 2.4 });
  const build = (c: Ctx) => {
    c.moveTo(x, y - 6);
    c.lineTo(x, y + 30);
    c.moveTo(x - 12, y + 2);
    c.lineTo(x + 12, y + 2);
    c.moveTo(x - 16, y + 20);
    c.quadraticCurveTo(x - 12, y + 34, x, y + 34);
    c.quadraticCurveTo(x + 12, y + 34, x + 16, y + 20);
  };
  ctx.lineCap = "round";
  ctx.beginPath();
  build(ctx);
  ctx.strokeStyle = outlineFor(color);
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.beginPath();
  build(ctx);
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.stroke();
}

/** Steel plate seams and rivets over a hull, inside its clip. */
export function plating(ctx: Ctx, color: string, x0: number, x1: number, y0: number, y1: number, cols = 92, rivets = true): void {
  ctx.strokeStyle = alpha(shade(color, -0.4), 0.45);
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (let x = x0; x <= x1; x += cols) {
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
  }
  ctx.stroke();
  if (!rivets) return;
  for (let x = x0; x <= x1; x += cols) for (let y = y0 + 10; y < y1; y += 14) rivetRow(ctx, x - 6, x - 6, y, 10, color, 1.6);
}
