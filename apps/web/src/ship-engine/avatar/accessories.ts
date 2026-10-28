// Accessories. Goggles, eyepatch, glasses and earring are drawn in the head
// frame; the scarf in the torso frame; the parrot stands on the -x shoulder.

import { alpha, INK, shade } from "../draw.js";
import type { Ctx } from "../types.js";
import { curvyPath, fillPath, paintShaded, strokePath, tube } from "./kit.js";
import type { Look } from "./look.js";
import type { HatInfo } from "./hats.js";
import type { Pose } from "./pose.js";

const BRASS = "#D9A441";
const GOLD = "#F0C24F";

export function drawGoggles(ctx: Ctx, info: HatInfo, turn: number): void {
  const { y, spread, scale: k } = info.goggles;
  const dx = turn * 0.45;
  ctx.save();
  ctx.lineCap = "round";
  strokePath(ctx, (c) => {
    c.moveTo(-39, y + 5);
    c.quadraticCurveTo(dx, y - 4, 39, y + 5);
  }, "#3F2A22", 6.5 * k);
  strokePath(ctx, (c) => {
    c.moveTo(-39, y + 5);
    c.quadraticCurveTo(dx, y - 4, 39, y + 5);
  }, "#6B4632", 3.5 * k);
  ctx.restore();
  for (const s of [-1, 1]) {
    const x = dx + s * spread;
    const r = 7.6 * k * (s > 0 ? 0.94 : 1);
    paintShaded(ctx, (c) => c.arc(x, y, r, 0, Math.PI * 2), BRASS, null, null, {});
    paintShaded(ctx, (c) => c.arc(x, y, r * 0.66, 0, Math.PI * 2), "#8FD0DA", "#6BB4C3", (c) => c.rect(x - r, y + r * 0.1, r * 2, r), { stroke: shade(BRASS, -0.45), width: 1.6 });
    fillPath(ctx, (c) => c.ellipse(x - r * 0.22, y - r * 0.25, r * 0.18, r * 0.3, 0.5, 0, Math.PI * 2), "#FFFFFF");
  }
  paintShaded(ctx, (c) => c.roundRect(dx - spread + 7 * k, y - 1.8, spread * 2 - 14 * k, 3.6, 1.5), BRASS, null, null, { width: 1.6 });
}

export function drawEyepatch(ctx: Ctx, turn: number): void {
  const x = turn - 13.5;
  strokePath(ctx, (c) => {
    c.moveTo(x + 4, 1);
    c.quadraticCurveTo(10, -16, 33, -27);
    c.moveTo(x - 6, 4);
    c.lineTo(-37, 0);
  }, "#2A2532", 2.2);
  paintShaded(ctx, (c) => curvyPath(c, [[x - 7.5, 2], [x, -1.5], [x + 7.5, 2], [x + 5.5, 11], [x, 13], [x - 5.5, 11]], 0.6), "#2E2838", null, null, { stroke: "#17131D", width: 3 });
  strokePath(ctx, (c) => {
    c.moveTo(x - 3, 3);
    c.quadraticCurveTo(x, 1.5, x + 3.5, 3);
  }, alpha("#FFFFFF", 0.25), 1.3);
}

export function drawGlasses(ctx: Ctx, turn: number): void {
  const frame = "#3A3248";
  const lx = turn - 13.5;
  const rx = turn + 12.5;
  for (const [x, w] of [[lx, 8.2], [rx, 7.4]] as const) {
    fillPath(ctx, (c) => c.ellipse(x, 6.5, w, 7.6, 0, 0, Math.PI * 2), alpha("#E6F4FF", 0.2));
    strokePath(ctx, (c) => c.ellipse(x, 6.5, w, 7.6, 0, 0, Math.PI * 2), frame, 2);
    strokePath(ctx, (c) => {
      c.moveTo(x - w * 0.15, 1);
      c.lineTo(x + w * 0.45, -0.2);
    }, alpha("#FFFFFF", 0.7), 1.3);
  }
  strokePath(ctx, (c) => {
    c.moveTo(lx + 8.2, 5.5);
    c.quadraticCurveTo((lx + rx) / 2, 2.6, rx - 7.4, 5.5);
    c.moveTo(lx - 8.2, 5.5);
    c.lineTo(-34, 3);
  }, frame, 2);
}

export function drawEarring(ctx: Ctx): void {
  strokePath(ctx, (c) => c.arc(-38.6, 16.5, 3.6, 0, Math.PI * 2), shade(GOLD, -0.5), 3.6);
  strokePath(ctx, (c) => c.arc(-38.6, 16.5, 3.6, 0, Math.PI * 2), GOLD, 1.8);
  fillPath(ctx, (c) => c.arc(-40.5, 14.5, 0.8, 0, Math.PI * 2), "#FFF6D6");
}

/** A knitted scarf around the neck (torso frame), its tail fluttering in the wind. */
export function drawScarf(ctx: Ctx, look: Look, turn: number, t: number, wind: number): void {
  const col = look.scarf;
  const stripe = shade(col, col === "#F2E6C9" ? -0.35 : 0.45);
  const flap = Math.sin(t * (2 + wind * 2)) * (1 + wind * 2.2);
  const tail = (x0: number, len: number, phase: number, color: string) => {
    const pts = [
      { x: x0, y: 3 },
      { x: x0 + 3 + flap * 0.4, y: 3 + len * 0.5 },
      { x: x0 + 2 + flap * (0.9 + phase), y: 3 + len },
    ];
    tube(ctx, pts, 9, color, { stripes: [stripe, 2.4, 6] });
    // Fringe.
    const end = pts[2];
    for (const dx of [-2.6, 0, 2.6]) {
      strokePath(ctx, (c) => {
        c.moveTo(end.x + dx, end.y + 4);
        c.lineTo(end.x + dx + flap * 0.15, end.y + 8);
      }, shade(color, -0.4), 1.6);
    }
  };
  tail(turn + 9, 18, 0.3, shade(col, -0.12));
  tail(turn + 14, 26, 0, col);
  paintShaded(
    ctx,
    (c) => curvyPath(c, [[-21, -1], [-13, -8], [13, -8], [21, -1], [19, 7], [turn, 10.5], [-19, 7]], 0.55),
    col,
    shade(col, -0.16),
    (c) => c.rect(-25, 3.5, 50, 10),
  );
  for (const x of [-11, -3, 5, 13]) {
    strokePath(ctx, (c) => {
      c.moveTo(x, -6.5);
      c.quadraticCurveTo(x + 1, 1, x, 8.5);
    }, alpha(stripe, 0.75), 1.3);
  }
}

/** The parrot, feet at the origin, facing +x. */
export function drawParrot(ctx: Ctx, pose: Pose): void {
  const red = "#E2453C";
  const p = pose.parrot;
  const asleep = p.asleep;
  const bob = asleep ? Math.sin(pose.t * 1.1) * 0.6 : p.bob * 1.3;
  ctx.save();
  ctx.scale(0.88, 0.88);
  // Tail feathers hang behind the shoulder.
  tube(ctx, [{ x: -3, y: -6 }, { x: -7, y: 6 }, { x: -11, y: 18 }], 5.5, "#3B7DD8");
  tube(ctx, [{ x: -1, y: -6 }, { x: -3, y: 6 }, { x: -5, y: 17 }], 5, red);
  paintShaded(ctx, (c) => c.ellipse(-1.5, -11, 8, 11.5, -0.15, 0, Math.PI * 2), red, shade(red, -0.2), (c) => c.ellipse(-6, -6, 6, 10, 0, 0, Math.PI * 2));
  // Wing, raised a little when it flaps.
  ctx.save();
  ctx.translate(-5, -18);
  ctx.rotate(-0.15 - p.flap * 1.1);
  paintShaded(ctx, (c) => curvyPath(c, [[0, 0], [4, 4], [3.5, 15], [-1, 22, 1], [-4, 12], [-3.5, 3]], 0.5), "#F5C242", "#3B7DD8", (c) => c.rect(-6, 11, 12, 14), { stroke: shade("#F5C242", -0.6) });
  ctx.restore();
  // Head.
  ctx.save();
  ctx.translate(1, -24 + bob * 0.6 + (asleep ? 2.5 : 0));
  ctx.rotate(p.tilt * (asleep ? 0.2 : 1) + (asleep ? 0.25 : 0));
  paintShaded(ctx, (c) => c.arc(0, 0, 7.6, 0, Math.PI * 2), red, null, null);
  fillPath(ctx, (c) => c.ellipse(3, -0.5, 3.8, 3.4, 0, 0, Math.PI * 2), "#FBF3EA");
  if (asleep) {
    strokePath(ctx, (c) => {
      c.moveTo(1.4, -0.4);
      c.quadraticCurveTo(3, 1.4, 4.6, -0.4);
    }, INK, 1.4);
  } else {
    fillPath(ctx, (c) => c.arc(3.2, -0.6, 1.6, 0, Math.PI * 2), INK);
    fillPath(ctx, (c) => c.arc(3.7, -1.2, 0.6, 0, Math.PI * 2), "#FFFFFF");
  }
  // Hooked beak.
  paintShaded(ctx, (c) => curvyPath(c, [[5.5, -3.5], [10.5, -2], [11, 3.5, 1], [8.6, 1.5], [5.5, 2.5]], 0.5), "#F1DDBB", "#4A3A3A", (c) => c.rect(8.4, 1.2, 4, 4), { width: 2.2 });
  // A little crest.
  paintShaded(ctx, (c) => curvyPath(c, [[-3, -6.5], [-5.5, -11.5, 1], [-1, -8], [0.5, -12, 1], [2, -7.2]], 0.5), red, null, null, { width: 2 });
  ctx.restore();
  // Feet gripping the shoulder.
  for (const x of [-4, 2]) paintShaded(ctx, (c) => c.ellipse(x, 0, 2.6, 1.8, 0, 0, Math.PI * 2), "#8E8A92", null, null, { width: 1.6 });
  ctx.restore();
}
