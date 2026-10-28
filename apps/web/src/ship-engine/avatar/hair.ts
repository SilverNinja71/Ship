// Nine hair styles, each as a front piece (cap + bangs, drawn over the face)
// and an optional back piece (drawn behind the body). All coordinates are in
// the head frame. Under a hat the tall parts (tufts, spikes, the bun) are
// flattened or moved so nothing pokes through the crown.

import type { HairStyle } from "@ship/shared-types";
import { alpha } from "../draw.js";
import type { Ctx } from "../types.js";
import { curvyPath, fillPath, paintShaded, strokePath, type CurvePt } from "./kit.js";
import type { Look } from "./look.js";

export interface HairContext {
  turn: number;
  /** A hat hides the top of the head. */
  hatted: boolean;
  t: number;
}

const TOP_LIMIT = -40.5;

/** Under a hat, anything above the crown line is pressed down onto it. */
function flatten(pts: CurvePt[], hatted: boolean): CurvePt[] {
  if (!hatted) return pts;
  return pts.map((p) => {
    const y = Math.max(p[1], TOP_LIMIT);
    // Keep tufts and spikes inside a dome the hat covers, so none poke out like horns.
    const lim = y < -16 ? 41 * Math.sqrt(Math.max(0, 1 - ((y + 5) / 37) ** 2)) : Infinity;
    if (p[1] === y && Math.abs(p[0]) <= lim) return p;
    return [Math.sign(p[0]) * Math.min(Math.abs(p[0]), lim), y] as const;
  });
}

/** Shift the bangs towards the turn so the parting follows the face. */
function shifted(pts: CurvePt[], dx: number): CurvePt[] {
  return pts.map((p) => (p[2] === 1 ? ([p[0] + dx, p[1], 1] as const) : ([p[0] + dx, p[1]] as const)));
}

function dome(r = 41, side = 40.5): CurvePt[] {
  return [
    [side, -10],
    [side - 6, -27],
    [21, -37.5],
    [0, -r],
    [-21, -37.5],
    [-side + 6, -27],
    [-side, -10],
  ];
}

interface StyleDef {
  front(h: HairContext): CurvePt[];
  /** Behind the body. */
  back?(ctx: Ctx, look: Look, h: HairContext): void;
  /** Over the front piece (braids, a cowlick). */
  extra?(ctx: Ctx, look: Look, h: HairContext): void;
  /** Strand lines inside the front piece: [from, to] pairs. */
  strands?: readonly (readonly [number, number, number, number])[];
  /** Shine arc: center y, rx, ry, from angle, to angle (radians). */
  shine?: readonly [number, number, number, number, number] | null;
}

function backShape(ctx: Ctx, look: Look, pts: CurvePt[]): void {
  paintShaded(ctx, (c) => curvyPath(c, pts, 0.55), look.hairShade, null, null, { stroke: look.hairLine });
}

const STYLES: Record<HairStyle, StyleDef> = {
  messy: {
    front: (h) => [
      [37, 19, 1],
      [40, 4],
      [40.5, -10],
      ...flatten([[44, -17, 1], [37.5, -24], [30, -33], [16, -40], [0, -42.5], [-16, -40], [-31, -32], [-39, -22]], h.hatted),
      [-45, -14, 1],
      [-41, -5],
      [-41, 7],
      [-38, 19, 1],
      ...shifted([[-33, 7], [-30, -5], [-24, 0, 1], [-19, -10], [-12, -2, 1], [-6, -12], [1, -1.5, 1], [6, -12], [13, -3, 1], [19, -11], [25, -1, 1], [29, -7]], h.turn * 0.35),
      [33, 6],
    ],
    back: (ctx, look) => backShape(ctx, look, [[-37, 2], [-42, 21, 1], [-33, 21], [-27, 28, 1], [0, 27], [27, 28, 1], [33, 21], [42, 21, 1], [37, 2], [30, -30], [0, -40], [-30, -30]]),
    extra: (ctx, look, h) => {
      if (h.hatted) return;
      // A bouncy cowlick.
      const s = Math.sin(h.t * 2.1) * 1.5;
      paintShaded(ctx, (c) => curvyPath(c, [[-3, -41], [1, -51], [9 + s, -57, 1], [6, -49], [5, -41]], 0.5), look.hair, null, null, { stroke: look.hairLine });
    },
    strands: [
      [-6, -34, -12, -8],
      [10, -34, 13, -9],
      [-24, -26, -24, -6],
    ],
    shine: [-12, 27, 22, 1.18, 1.62],
  },
  bob: {
    front: (h) => [
      [38, 26, 1],
      [41, 12],
      [41.5, -6],
      ...flatten(dome(42.5, 41.5).slice(1, -1), h.hatted),
      [-42, -6],
      [-42, 12],
      [-40, 27, 1],
      [-33.5, 24],
      [-31.5, 10],
      [-30.5, -1, 1],
      ...shifted([[-22, -3], [-12, -1.5], [-2, -0.8], [10, -1.5], [22, -3]], h.turn * 0.3),
      [30.5, -1, 1],
      [31.5, 10],
      [32.5, 23],
    ],
    back: (ctx, look) => backShape(ctx, look, [[-41, -6], [-43, 24], [-36, 31], [0, 33], [36, 31], [43, 24], [41, -6], [30, -32], [0, -42], [-30, -32]]),
    strands: [
      [-14, -35, -16, -4],
      [4, -38, 3, -3],
      [20, -33, 22, -4],
    ],
    shine: [-12, 29, 24, 1.15, 1.7],
  },
  long: {
    front: (h) => [
      [33, 54, 1],
      [39.5, 36],
      [41.5, 15],
      [41.5, -6],
      ...flatten(dome(42, 41).slice(1, -1), h.hatted),
      [-41.5, -6],
      [-41.5, 15],
      [-40, 37],
      [-34, 56, 1],
      [-29, 40],
      [-31, 18],
      [-31, 2],
      ...shifted([[-27, -4], [-20, -1.5, 1], [-16, -11], [-8, -16], [1, -22, 1], [8, -15], [15, -9], [22, -3, 1], [26, -6]], h.turn * 0.4),
      [31, 2],
      [31, 20],
      [29, 40],
    ],
    back: (ctx, look, h) => {
      const sw = Math.sin(h.t * 1.3) * 1.2;
      backShape(ctx, look, [[-41, -8], [-47, 30], [-50 + sw, 66], [-45 + sw, 96], [0, 100], [45 + sw, 96], [50 + sw, 66], [47, 30], [41, -8], [30, -32], [0, -42], [-30, -32]]);
    },
    strands: [
      [1, -35, -10, -12],
      [3, -35, 12, -10],
      [-30, -14, -36, 30],
      [32, -12, 36, 30],
    ],
    shine: [-12, 28, 22, 1.12, 1.55],
  },
  ponytail: {
    front: (h) => [
      [36, 5, 1],
      [39.5, -9],
      ...flatten(dome(41, 39.5).slice(1, -1), h.hatted),
      [-39.5, -10],
      [-38.5, -6, 1],
      [-32, -10],
      ...shifted([[-26, -6], [-17, -2, 1], [-12, -12], [-3, -5, 1], [1, -14], [13, -5, 1], [18, -13], [27, -7]], h.turn * 0.4),
      [32, -2],
    ],
    back: (ctx, look, h) => {
      const swing = Math.sin(h.t * 1.7) * 0.09;
      ctx.save();
      ctx.translate(-27, -25);
      ctx.rotate(swing);
      paintShaded(
        ctx,
        (c) => curvyPath(c, [[2, -6], [-18, -4], [-29, 14], [-30, 38], [-25, 60, 1], [-20, 40], [-16, 22], [-6, 10]], 0.55),
        look.hair,
        look.hairShade,
        (c) => curvyPath(c, [[-12, 6], [-24, 22], [-25, 58], [-14, 30]], 0.5),
        { stroke: look.hairLine },
      );
      ctx.restore();
    },
    extra: (ctx) => {
      // The hair tie where the tail leaves the head.
      paintShaded(ctx, (c) => c.ellipse(-35, -23, 4.5, 6, -0.5, 0, Math.PI * 2), "#E5596B", null, null, {});
    },
    strands: [
      [-30, -12, 4, -36],
      [-22, -4, 14, -34],
      [8, -8, 22, -32],
    ],
    shine: [-14, 26, 22, 1.2, 1.62],
  },
  buzz: {
    front: () => [
      [36.8, -3, 1],
      [37.5, -14],
      [32, -27],
      [17, -35.5],
      [0, -37],
      [-17, -35.5],
      [-32, -27],
      [-38.5, -14],
      [-38, -3, 1],
      [-33, -9],
      [-24, -16],
      [-10, -19.5],
      [2, -20],
      [14, -19],
      [26, -16],
      [33, -9],
    ],
    extra: (ctx, look) => {
      // A little stubble texture.
      fillPath(ctx, (c) => {
        for (let i = 0; i < 26; i++) {
          const a = Math.PI * (1.08 + (i % 13) * 0.065);
          const r = i < 13 ? 30 : 23;
          const x = Math.cos(a) * r;
          const y = -6 + Math.sin(a) * r * 0.95;
          c.moveTo(x + 0.9, y);
          c.arc(x, y, 0.9, 0, Math.PI * 2);
        }
      }, alpha(look.hairShade, 0.8));
    },
    shine: [-10, 26, 22, 1.25, 1.55],
  },
  braids: {
    front: (h) => [
      [36.5, 13, 1],
      [40, -4],
      ...flatten(dome(41.5, 40.5).slice(1, -1), h.hatted),
      [-40.5, -4],
      [-38, 13, 1],
      [-33, 3],
      ...shifted([[-27, -4], [-19, -2, 1], [-13, -11], [-5, -17], [2, -22, 1], [9, -16], [16, -11], [22, -2, 1], [27, -5]], h.turn * 0.4),
      [33, 3],
    ],
    extra: (ctx, look, h) => {
      for (const side of [-1, 1] as const) {
        const x0 = side * 35.5;
        const sw = Math.sin(h.t * 1.4 + side) * 0.8;
        for (let i = 0; i < 3; i++) {
          const y = 15 + i * 9.5;
          const x = x0 + side * (i * 0.6) + sw * i * 0.3;
          paintShaded(ctx, (c) => c.ellipse(x, y, 6.6 - i * 0.3, 6.2, side * 0.25, 0, Math.PI * 2), look.hair, look.hairShade, (c) => c.rect(x - 8, y + 1.5, 16, 8), { stroke: look.hairLine });
        }
        const by = 15 + 3 * 9.5;
        const bx = x0 + side * 2.4 + sw * 1.2;
        // Ribbon tie and brush end.
        paintShaded(ctx, (c) => curvyPath(c, [[bx - 3.5, by - 2], [bx + 3.5, by - 2], [bx + 5, by + 9, 1], [bx, by + 6], [bx - 5, by + 9, 1]], 0.5), look.hair, null, null, { stroke: look.hairLine });
        paintShaded(ctx, (c) => c.ellipse(bx, by - 2.5, 4.6, 2.6, 0, 0, Math.PI * 2), "#F2C24E", null, null, {});
      }
    },
    strands: [
      [2, -36, -14, -10],
      [2, -36, 16, -10],
    ],
    shine: [-12, 27, 22, 1.15, 1.58],
  },
  curls: {
    front: (h) => {
      const top: CurvePt[] = [];
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI * (0.02 - i * 0.104);
        const r = i % 2 === 0 ? 44 : 49;
        top.push(i % 2 === 0 ? [Math.cos(a) * r * 1.02, -6 + Math.sin(a) * r, 1] : [Math.cos(a) * r * 1.02, -6 + Math.sin(a) * r]);
      }
      const fringe: CurvePt[] = [];
      for (let i = 0; i <= 8; i++) {
        const x = -30 + i * 7.5;
        fringe.push(i % 2 === 0 ? [x, -9 + Math.abs(x) * 0.12, 1] : [x, -1 + Math.abs(x) * 0.12]);
      }
      return [[37, 16, 1], [43, 8], ...flatten(top, h.hatted), [-43, 8], [-38, 17, 1], [-34, 8], ...shifted(fringe, h.turn * 0.35), [33, 7]];
    },
    back: (ctx, look) => {
      const pts: CurvePt[] = [];
      for (let i = 0; i <= 16; i++) {
        const a = Math.PI * (0.25 - i * 0.094);
        const r = i % 2 === 0 ? 45 : 52;
        pts.push(i % 2 === 0 ? [Math.cos(a) * r * 1.08, 2 + Math.sin(a) * r, 1] : [Math.cos(a) * r * 1.08, 2 + Math.sin(a) * r]);
      }
      backShape(ctx, look, [...pts.map((p) => [p[0], Math.max(p[1], -44)] as const), [0, 34]]);
    },
    extra: (ctx, look) => {
      // Little curl swirls.
      for (const [x, y] of [[-22, -26], [6, -34], [26, -22], [-34, -8]] as const) {
        strokePath(ctx, (c) => c.arc(x, y, 3.6, 0.3, Math.PI * 1.6), alpha(look.hairShade, 0.95), 1.6);
      }
    },
    shine: null,
  },
  spiky: {
    front: (h) => [
      [37, 14, 1],
      [40, 1],
      [48, -8, 1],
      ...flatten([[39, -18], [47, -32, 1], [31, -36], [27, -51, 1], [15, -41], [2, -58, 1], [-9, -41], [-24, -53, 1], [-29, -37], [-47, -33, 1], [-39, -20]], h.hatted),
      [-49, -9, 1],
      [-40, 0],
      [-38, 14, 1],
      ...shifted([[-32, 3], [-27, -6], [-22, 2, 1], [-16, -9], [-9, 0, 1], [-4, -11], [4, 0.5, 1], [9, -10], [16, -1, 1], [21, -9], [27, 1, 1], [30, -4]], h.turn * 0.35),
      [33, 4],
    ],
    back: (ctx, look) => backShape(ctx, look, [[-38, 4], [-47, 22, 1], [-35, 20], [-31, 32, 1], [0, 27], [31, 32, 1], [35, 20], [47, 22, 1], [38, 4], [30, -30], [0, -40], [-30, -30]]),
    strands: [
      [2, -50, 1, -12],
      [-22, -46, -15, -12],
      [25, -45, 16, -12],
    ],
    shine: [-12, 27, 22, 1.2, 1.62],
  },
  bun: {
    front: () => [
      [35, 12, 1],
      [36.5, 1],
      [40, -9],
      [34.5, -27],
      [20, -38],
      [0, -41],
      [-20, -38],
      [-35, -26],
      [-39.5, -9],
      [-37, 1],
      [-35.5, 12, 1],
      [-33.5, 1],
      [-30, -7],
      [-24, -9],
      [-14, -3, 1],
      [-10, -13],
      [4, -6, 1],
      [6, -15],
      [19, -9],
      [29, -5],
      [33, 2],
    ],
    back: (ctx, look, h) => {
      const low = h.hatted;
      const bx = low ? -32 : -5;
      const by = low ? -16 : -46;
      const r = low ? 12.5 : 15;
      if (!low) {
        // A pencil through the bun.
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(-0.5);
        paintShaded(ctx, (c) => c.rect(-26, -2.6, 46, 5.2), "#F4C542", null, null, {});
        paintShaded(ctx, (c) => c.rect(-30, -2.6, 5, 5.2), "#F08A9A", null, null, {});
        paintShaded(ctx, (c) => {
          c.moveTo(20, -2.6);
          c.lineTo(28, 0);
          c.lineTo(20, 2.6);
          c.closePath();
        }, "#F1D2A6", null, null, {});
        ctx.restore();
      }
      paintShaded(ctx, (c) => c.arc(bx, by, r, 0, Math.PI * 2), look.hair, look.hairShade, (c) => c.arc(bx + 4, by + 5, r, 0, Math.PI * 2), { stroke: look.hairLine });
      strokePath(ctx, (c) => c.arc(bx, by, r * 0.55, Math.PI * 0.9, Math.PI * 1.9), alpha(look.hairShade, 0.9), 1.6);
    },
    strands: [
      [-26, -18, -2, -38],
      [-8, -10, 8, -38],
      [10, -12, 22, -34],
    ],
    shine: [-12, 27, 22, 1.18, 1.6],
  },
};

export function hairFront(style: HairStyle, h: HairContext): CurvePt[] {
  return (STYLES[style] ?? STYLES.messy).front(h);
}

export function drawHairBack(ctx: Ctx, look: Look, style: HairStyle, h: HairContext): void {
  STYLES[style]?.back?.(ctx, look, h);
}

/** The shadow the bangs cast on the forehead (clipped to the head by the caller). */
export function hairShadow(style: HairStyle, h: HairContext): (c: Ctx) => void {
  const pts = hairFront(style, h).map((p) => [p[0], p[1] + 3.2] as const);
  return (c) => curvyPath(c, pts, 0.5);
}

export function drawHairFront(ctx: Ctx, look: Look, style: HairStyle, h: HairContext): void {
  const def = STYLES[style] ?? STYLES.messy;
  const pts = def.front(h);
  const build = (c: Ctx) => curvyPath(c, pts, 0.5);
  ctx.save();
  ctx.beginPath();
  build(ctx);
  ctx.fillStyle = look.hair;
  ctx.fill();
  ctx.clip();
  // One soft shade under the crown, towards the far side of the head.
  fillPath(ctx, (c) => c.ellipse(-30, 4, 22, 30, 0.2, 0, Math.PI * 2), alpha(look.hairShade, 0.9));
  if (def.strands) {
    strokePath(ctx, (c) => {
      for (const [x0, y0, x1, y1] of def.strands ?? []) {
        c.moveTo(x0, y0);
        c.quadraticCurveTo((x0 + x1) / 2 + 3, (y0 + y1) / 2, x1, y1);
      }
    }, alpha(look.hairShade, 0.85), 1.6);
  }
  if (def.shine && !h.hatted) {
    const [cy, rx, ry, a0, a1] = def.shine;
    ctx.save();
    ctx.setLineDash([9, 5]);
    strokePath(ctx, (c) => c.ellipse(h.turn * 0.4, cy, rx, ry, 0, Math.PI * a0, Math.PI * a1), alpha(look.hairShine, 0.8), 3.4);
    ctx.restore();
  }
  ctx.restore();
  strokePath(ctx, build, look.hairLine);
  def.extra?.(ctx, look, h);
}
