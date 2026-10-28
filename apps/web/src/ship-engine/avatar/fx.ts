// Little effects around the sailor: Zzz bubbles while dozing, stretch lines.

import { alpha, smoothstep } from "../draw.js";
import type { Ctx, Point } from "../types.js";
import { fract, paintShaded, strokePath } from "./kit.js";

const Z_INK = "#5B4E86";

/**
 * Three "Z" bubbles rising from `from`, growing and fading. `t` is sleep time;
 * `flip` un-mirrors the letters when the sailor is drawn mirrored.
 */
export function drawZzz(ctx: Ctx, from: Point, t: number, flip: 1 | -1 = 1): void {
  for (let i = 0; i < 3; i++) {
    const u = fract(t * 0.36 + i / 3);
    const a = smoothstep(0, 0.12, u) * (1 - smoothstep(0.62, 1, u));
    if (a <= 0.01) continue;
    const x = from.x + u * 28 + Math.sin(u * 7 + i) * 3.5;
    const y = from.y - u * 56;
    const r = 6 + u * 5.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(flip, 1);
    ctx.globalAlpha *= a;
    paintShaded(ctx, (c) => c.arc(0, 0, r, 0, Math.PI * 2), alpha("#FFFFFF", 0.88), null, null, { stroke: alpha("#B9B0D9", 0.9), width: 1.6 });
    const z = r * 0.5;
    strokePath(ctx, (c) => {
      c.moveTo(-z * 0.8, -z * 0.75);
      c.lineTo(z * 0.8, -z * 0.75);
      c.lineTo(-z * 0.8, z * 0.75);
      c.lineTo(z * 0.8, z * 0.75);
    }, Z_INK, Math.max(1.8, r * 0.26));
    ctx.restore();
  }
}

/** Short curved "whoosh" lines beside a stretching hand. */
export function drawStretchLines(ctx: Ctx, hand: Point, side: -1 | 1, amount: number, t: number): void {
  if (amount < 0.75) return;
  const a = smoothstep(0.75, 1, amount) * (0.6 + 0.4 * Math.sin(t * 6));
  for (let i = 0; i < 2; i++) {
    const r = 10 + i * 4.5;
    strokePath(ctx, (c) => c.arc(hand.x, hand.y, r, side > 0 ? -1.2 : Math.PI + 0.4, side > 0 ? -0.4 : Math.PI + 1.2), alpha("#FFFFFF", 0.85 * a), 1.8);
  }
}
