// The Kaiju Behemoth Carrier's friendly leviathan: humps along the near side,
// a tail fluke astern and a long neck rising past the bow so its head can look
// back at the crew. Drawn in drawFront; the engine's front waves cover its belly.

import type { ShipDefinition } from "@ship/shared-types";
import { INK, alpha, circlePath, ellipsePath, outlineFor, paint, shade, sway, withTransform } from "../../ship-engine/draw.js";
import type { Ctx, FrameInfo, Point } from "../../ship-engine/types.js";
import { glow, isNight, paintIn } from "../kit.js";

const BODY = "#2F6F73";
const BELLY = "#9FE8D2";

export interface LeviathanPlacement {
  waterline: number;
  /** x of the humps, stern to bow. */
  humps: number[];
  /** Where the neck leaves the water, and where the head floats. */
  neckBase: Point;
  head: Point;
  tail: Point;
}

export function leviathan(ctx: Ctx, ship: ShipDefinition, at: LeviathanPlacement, frame: FrameInfo): void {
  const neon = ship.palette.glow ?? "#39FF88";
  const rm = frame.reducedMotion;
  const night = isNight(ship);
  const wl = at.waterline;

  // Tail fluke, flipping lazily.
  const flip = 0.25 * sway(frame.t, 0.9, 1, rm);
  withTransform(ctx, { x: at.tail.x, y: at.tail.y, rotate: -0.5 + flip }, () => {
    paint(ctx, (c) => {
      c.moveTo(30, 30);
      c.quadraticCurveTo(10, 0, 0, -10);
      c.bezierCurveTo(-26, -34, -54, -30, -66, -16);
      c.quadraticCurveTo(-40, -14, -22, 2);
      c.quadraticCurveTo(-40, 14, -52, 34);
      c.bezierCurveTo(-30, 30, -10, 20, 6, 8);
      c.quadraticCurveTo(14, 20, 16, 40);
      c.closePath();
    }, BODY, { width: 3.2 });
    neonDots(ctx, [{ x: -30, y: -16 }, { x: -34, y: 18 }], neon, night, 3);
  });

  // Humps, bobbing one after another.
  at.humps.forEach((x, k) => {
    const bob = 7 * sway(frame.t, 0.9, k * 1.4, rm);
    const rx = 64 - k * 4;
    const ry = 50 + bob;
    paintIn(
      ctx,
      (c) => {
        c.moveTo(x - rx, wl + 16);
        c.bezierCurveTo(x - rx, wl + 16 - ry * 1.3, x + rx, wl + 16 - ry * 1.3, x + rx, wl + 16);
        c.closePath();
      },
      BODY,
      () => {
        ctx.beginPath();
        ellipsePath(ctx, x + rx * 0.4, wl + 16, rx * 0.9, ry * 0.5);
        ctx.fillStyle = shade(BODY, -0.2);
        ctx.fill();
        ctx.beginPath();
        ellipsePath(ctx, x - rx * 0.35, wl + 16 - ry * 0.75, rx * 0.35, ry * 0.18, -0.3);
        ctx.fillStyle = alpha("#FFFFFF", 0.18);
        ctx.fill();
      },
      { width: 3.2 },
    );
    for (let s = -1; s <= 1; s++) {
      const sx = x + s * rx * 0.42;
      const sy = wl + 16 - ry * 0.98 * (1 - 0.25 * s * s);
      paint(ctx, (c) => {
        c.moveTo(sx - 8, sy + 4);
        c.quadraticCurveTo(sx - 2, sy - 18, sx + 8, sy - 16);
        c.quadraticCurveTo(sx + 4, sy - 4, sx + 8, sy + 4);
        c.closePath();
      }, neon, { stroke: outlineFor(BODY), width: 2.4 });
    }
    neonDots(ctx, [{ x: x - rx * 0.3, y: wl - ry * 0.25 }, { x: x + rx * 0.25, y: wl - ry * 0.35 }, { x: x + rx * 0.05, y: wl + 2 }], neon, night, 3.6);
  });

  // Neck.
  const bob = 6 * sway(frame.t, 0.75, 2, rm);
  const head = { x: at.head.x, y: at.head.y + bob };
  const neckPath = (c: Ctx) => {
    c.moveTo(at.neckBase.x, at.neckBase.y);
    c.bezierCurveTo(at.neckBase.x + 70, at.neckBase.y - 30, head.x + 24, head.y + 110, head.x + 6, head.y + 26);
  };
  ctx.lineCap = "round";
  ctx.beginPath();
  neckPath(ctx);
  ctx.strokeStyle = outlineFor(BODY);
  ctx.lineWidth = 52;
  ctx.stroke();
  ctx.beginPath();
  neckPath(ctx);
  ctx.strokeStyle = BODY;
  ctx.lineWidth = 45;
  ctx.stroke();
  ctx.save();
  ctx.translate(-10, 4);
  ctx.beginPath();
  neckPath(ctx);
  ctx.strokeStyle = BELLY;
  ctx.lineWidth = 18;
  ctx.stroke();
  ctx.restore();
  neonDots(ctx, [{ x: head.x + 36, y: head.y + 70 }, { x: head.x + 30, y: head.y + 110 }, { x: at.neckBase.x + 50, y: at.neckBase.y - 22 }], neon, night, 3.6);

  // Head, looking back toward the ship with a friendly smile.
  if (night) glow(ctx, head.x - 10, head.y, 110, neon, 0.45);
  withTransform(ctx, { x: head.x, y: head.y }, () => {
    // Frills.
    for (const [fx, fy, a] of [
      [24, -18, -0.6],
      [30, 2, 0.1],
      [18, -32, -1.1],
    ] as const) {
      withTransform(ctx, { x: fx, y: fy, rotate: a + 0.12 * sway(frame.t, 1.6, fx, rm) }, () => {
        paint(ctx, (c) => {
          c.moveTo(0, -8);
          c.quadraticCurveTo(26, -14, 34, 0);
          c.quadraticCurveTo(26, 10, 0, 8);
          c.closePath();
        }, neon, { stroke: outlineFor(BODY), width: 2.4 });
      });
    }
    paintIn(
      ctx,
      (c) => {
        c.moveTo(30, -26);
        c.bezierCurveTo(16, -48, -24, -46, -44, -28);
        c.bezierCurveTo(-64, -20, -72, -2, -62, 10);
        c.bezierCurveTo(-48, 26, -10, 30, 14, 22);
        c.bezierCurveTo(34, 16, 40, -8, 30, -26);
        c.closePath();
      },
      BODY,
      () => {
        ctx.beginPath();
        ellipsePath(ctx, -26, 18, 40, 12);
        ctx.fillStyle = BELLY;
        ctx.fill();
        ctx.beginPath();
        ellipsePath(ctx, -10, -34, 24, 7, -0.2);
        ctx.fillStyle = alpha("#FFFFFF", 0.18);
        ctx.fill();
      },
      { width: 3.4 },
    );
    // Little horns.
    for (const hx of [-4, 10]) {
      paint(ctx, (c) => {
        c.moveTo(hx - 6, -40);
        c.quadraticCurveTo(hx + 2, -60, hx + 12, -62);
        c.quadraticCurveTo(hx + 6, -50, hx + 6, -38);
        c.closePath();
      }, "#E2E8C8", { width: 2.4 });
    }
    // Eye, cheek and smile.
    paint(ctx, (c) => ellipsePath(c, -16, -14, 11, 12), "#FFFFFF", { width: 2.6 });
    ctx.beginPath();
    circlePath(ctx, -20, -12, 7);
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.beginPath();
    circlePath(ctx, -23, -16, 2.6);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.beginPath();
    ellipsePath(ctx, -30, 4, 8, 4.5);
    ctx.fillStyle = alpha("#FF8FB1", 0.55);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-62, 6);
    ctx.quadraticCurveTo(-48, 16, -34, 10);
    ctx.strokeStyle = shade(BODY, -0.55);
    ctx.lineWidth = 2.8;
    ctx.stroke();
    ctx.beginPath();
    circlePath(ctx, -58, -6, 2);
    ctx.fillStyle = shade(BODY, -0.55);
    ctx.fill();
    neonDots(ctx, [{ x: 6, y: -24 }, { x: 14, y: -8 }, { x: -2, y: 10 }], neon, night, 3);
  });
}

function neonDots(ctx: Ctx, pts: Point[], neon: string, night: boolean, r: number): void {
  for (const p of pts) {
    paint(ctx, (c) => circlePath(c, p.x, p.y, r), neon, { stroke: false });
    if (night) glow(ctx, p.x, p.y, r * 5, neon, 0.5);
  }
}
