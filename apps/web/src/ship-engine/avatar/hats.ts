// Ten hats (including none), drawn in the head frame over the front hair.
// The straw hat is a generic wide sun hat with a blue ribbon and a side bow
// (deliberately not red, so the default sailor echoes no famous character).

import type { HatId } from "@ship/shared-types";
import { alpha, shade } from "../draw.js";
import type { Ctx } from "../types.js";
import { curvyPath, fillPath, paintShaded, strokePath, tube, withClip, type CurvePt } from "./kit.js";

export interface HatInfo {
  /** Whether the hat hides the top of the hair (tufts and spikes get flattened). */
  hides: boolean;
  /** Where aviator goggles sit on this hat: center y, lens spread, and a scale. */
  goggles: { y: number; spread: number; scale: number };
}

const INFO: Record<HatId, HatInfo> = {
  none: { hides: false, goggles: { y: -22, spread: 12.5, scale: 1 } },
  "straw-hat": { hides: true, goggles: { y: -29, spread: 11.5, scale: 0.9 } },
  tricorn: { hides: true, goggles: { y: -44, spread: 11, scale: 0.85 } },
  "captain-cap": { hides: true, goggles: { y: -27, spread: 12, scale: 0.85 } },
  bandana: { hides: true, goggles: { y: -24, spread: 12.5, scale: 1 } },
  "marine-cap": { hides: true, goggles: { y: -33, spread: 11, scale: 0.85 } },
  "aviator-cap": { hides: true, goggles: { y: -24, spread: 12.5, scale: 1 } },
  beanie: { hides: true, goggles: { y: -18, spread: 12.5, scale: 0.95 } },
  "laurel-wreath": { hides: false, goggles: { y: -28, spread: 12.5, scale: 0.95 } },
  "flower-crown": { hides: false, goggles: { y: -29, spread: 12.5, scale: 0.95 } },
};

export function hatInfo(hat: HatId): HatInfo {
  return INFO[hat] ?? INFO.none;
}

/** Points around an ellipse, with a little wobble for floppy brims. */
function ellipsePts(cx: number, cy: number, rx: number, ry: number, n: number, wobble = 0): CurvePt[] {
  const pts: CurvePt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const w = 1 + Math.sin(a * 5 + 0.7) * wobble;
    pts.push([cx + Math.cos(a) * rx * w, cy + Math.sin(a) * ry * w]);
  }
  return pts;
}

export function drawHat(ctx: Ctx, hat: HatId, turn: number, t: number): void {
  const dx = turn * 0.3;
  switch (hat) {
    case "none":
      return;
    case "straw-hat":
      return strawHat(ctx, dx);
    case "tricorn":
      return tricorn(ctx, dx);
    case "captain-cap":
      return captainCap(ctx, dx);
    case "bandana":
      return bandana(ctx, dx, t);
    case "marine-cap":
      return marineCap(ctx, dx);
    case "aviator-cap":
      return aviatorCap(ctx, dx, t);
    case "beanie":
      return beanie(ctx, dx, t);
    case "laurel-wreath":
      return laurel(ctx, dx);
    case "flower-crown":
      return flowerCrown(ctx, dx);
  }
}

const RIBBON = "#2E5E8B";
const RIBBON_LIGHT = "#5B8CC0";

function strawHat(ctx: Ctx, dx: number): void {
  const straw = "#F2CD78";
  const strawShade = "#DDAF56";
  const brim = ellipsePts(dx, -21, 56, 13, 22, 0.025);
  paintShaded(ctx, (c) => curvyPath(c, brim, 0.5), straw, strawShade, (c) => c.ellipse(dx, -24, 34, 8.5, 0, 0, Math.PI * 2));
  // Woven rings on the brim.
  withClip(ctx, (c) => curvyPath(c, brim, 0.5), () => {
    ctx.save();
    ctx.setLineDash([3, 3]);
    strokePath(ctx, (c) => c.ellipse(dx, -21, 46, 10.2, 0, 0.05, Math.PI - 0.05), alpha(strawShade, 0.9), 1.3);
    ctx.restore();
  });
  const crown = (c: Ctx) =>
    curvyPath(c, [[dx - 27, -23], [dx - 26, -38], [dx - 15, -49], [dx + 2, -51.5], [dx + 17, -48.5], [dx + 27, -38], [dx + 28, -23], [dx + 14, -18.5, 1], [dx, -17.5], [dx - 14, -18.5, 1]], 0.5);
  paintShaded(ctx, crown, straw, strawShade, (c) => c.ellipse(dx + 20, -30, 13, 26, 0, 0, Math.PI * 2));
  withClip(ctx, crown, () => {
    ctx.save();
    ctx.setLineDash([2.5, 3]);
    for (const y of [-41, -34]) strokePath(ctx, (c) => c.ellipse(dx, y + 6, 27, 9, 0, Math.PI * 1.05, Math.PI * 1.95), alpha(strawShade, 0.9), 1.3);
    ctx.restore();
    // The blue ribbon around the base of the crown, with a soft highlight.
    paintShaded(ctx, (c) => {
      c.moveTo(dx - 30, -29);
      c.quadraticCurveTo(dx, -21, dx + 30, -29);
      c.lineTo(dx + 30, -16);
      c.lineTo(dx - 30, -16);
      c.closePath();
    }, RIBBON, null, null, { stroke: false });
    strokePath(ctx, (c) => {
      c.moveTo(dx - 26, -25.2);
      c.quadraticCurveTo(dx, -18.6, dx + 26, -25.2);
    }, RIBBON_LIGHT, 1.5);
    strokePath(ctx, (c) => {
      c.moveTo(dx - 30, -29);
      c.quadraticCurveTo(dx, -21, dx + 30, -29);
    }, shade(RIBBON, -0.5), 2);
  });
  strokePath(ctx, crown, "#7A5A2A");
  // A small ribbon bow on the band, off to one side.
  const bx = dx - 19;
  const by = -21.5;
  paintShaded(ctx, (c) => curvyPath(c, [[bx, by], [bx - 7, by - 5], [bx - 8, by + 2]], 0.6), RIBBON, null, null, { width: 2.4 });
  paintShaded(ctx, (c) => curvyPath(c, [[bx, by], [bx + 6, by - 5], [bx + 7, by + 2]], 0.6), RIBBON, null, null, { width: 2.4 });
  paintShaded(ctx, (c) => c.arc(bx, by, 2.4, 0, Math.PI * 2), RIBBON_LIGHT, null, null, { width: 2 });
}

function tricorn(ctx: Ctx, dx: number): void {
  const felt = "#3B3049";
  const gold = "#E8B84A";
  paintShaded(ctx, (c) => curvyPath(c, [[dx - 27, -33], [dx - 22, -50], [dx, -57], [dx + 22, -50], [dx + 27, -33]], 0.5), shade(felt, 0.12), null, null);
  const wings: CurvePt[] = [
    [dx - 56, -35, 1],
    [dx - 40, -46],
    [dx - 20, -42],
    [dx, -32, 1],
    [dx + 20, -42],
    [dx + 40, -46],
    [dx + 56, -35, 1],
    [dx + 40, -24],
    [dx + 20, -16],
    [dx + 1, -10, 1],
    [dx - 20, -16],
    [dx - 40, -24],
  ];
  paintShaded(ctx, (c) => curvyPath(c, wings, 0.5), felt, shade(felt, -0.25), (c) => c.ellipse(dx + 30, -24, 30, 14, 0.2, 0, Math.PI * 2));
  // Gold braid along the upturned edges.
  const braid = wings.slice(0, 7).map((p): CurvePt => (p[2] === 1 ? [p[0], p[1] + 2.4, 1] : [p[0], p[1] + 2.4]));
  strokePath(ctx, (c) => curvyPath(c, braid, 0.5, false), gold, 2.6);
  // Centre crease where the two front faces meet.
  strokePath(ctx, (c) => {
    c.moveTo(dx, -31);
    c.lineTo(dx + 0.5, -12);
  }, shade(felt, -0.5), 1.6);
  // A cockade.
  paintShaded(ctx, (c) => c.arc(dx - 30, -35, 5.5, 0, Math.PI * 2), "#F2EBDD", null, null, { width: 2.4 });
  paintShaded(ctx, (c) => c.arc(dx - 30, -35, 2.4, 0, Math.PI * 2), gold, null, null, { width: 1.6 });
}

function captainCap(ctx: Ctx, dx: number): void {
  const navy = "#24345E";
  const white = "#F7F5EE";
  const band = (c: Ctx) => {
    c.moveTo(dx - 33, -36);
    c.quadraticCurveTo(dx, -29, dx + 33, -36);
    c.lineTo(dx + 32, -21);
    c.quadraticCurveTo(dx, -14, dx - 32, -21);
    c.closePath();
  };
  paintShaded(ctx, band, navy, null, null);
  // Gold cord across the band.
  strokePath(ctx, (c) => {
    c.moveTo(dx - 30, -24);
    c.quadraticCurveTo(dx, -18, dx + 30, -24);
  }, "#E8B84A", 2.2);
  paintShaded(ctx, (c) => c.ellipse(dx, -39, 41, 11.5, 0, 0, Math.PI * 2), white, "#DCDFE6", (c) => c.ellipse(dx, -31.5, 40, 6, 0, 0, Math.PI * 2));
  // The visor.
  paintShaded(ctx, (c) => {
    c.moveTo(dx - 28, -20);
    c.quadraticCurveTo(dx, -13, dx + 28, -20);
    c.quadraticCurveTo(dx + 24, -10, dx, -7.5);
    c.quadraticCurveTo(dx - 24, -10, dx - 28, -20);
    c.closePath();
  }, "#23212B", null, null);
  strokePath(ctx, (c) => {
    c.moveTo(dx - 15, -13);
    c.quadraticCurveTo(dx - 4, -10.5, dx + 8, -11.5);
  }, alpha("#FFFFFF", 0.5), 1.5);
  // Gold anchor badge.
  anchor(ctx, dx + 1, -29, 1);
}

export function anchor(ctx: Ctx, x: number, y: number, s: number): void {
  const gold = "#F0C24F";
  const ink = "#8A5E16";
  strokePath(ctx, (c) => {
    c.moveTo(x, y - 5 * s);
    c.lineTo(x, y + 5 * s);
    c.moveTo(x - 4 * s, y - 2.6 * s);
    c.lineTo(x + 4 * s, y - 2.6 * s);
    c.moveTo(x - 5 * s, y + 1.5 * s);
    c.quadraticCurveTo(x - 4 * s, y + 6 * s, x, y + 5.5 * s);
    c.quadraticCurveTo(x + 4 * s, y + 6 * s, x + 5 * s, y + 1.5 * s);
  }, ink, 3.6 * s);
  strokePath(ctx, (c) => {
    c.moveTo(x, y - 5 * s);
    c.lineTo(x, y + 5 * s);
    c.moveTo(x - 4 * s, y - 2.6 * s);
    c.lineTo(x + 4 * s, y - 2.6 * s);
    c.moveTo(x - 5 * s, y + 1.5 * s);
    c.quadraticCurveTo(x - 4 * s, y + 6 * s, x, y + 5.5 * s);
    c.quadraticCurveTo(x + 4 * s, y + 6 * s, x + 5 * s, y + 1.5 * s);
  }, gold, 1.8 * s);
  paintShaded(ctx, (c) => c.arc(x, y - 6 * s, 1.8 * s, 0, Math.PI * 2), gold, null, null, { stroke: ink, width: 1.2 });
}

function bandana(ctx: Ctx, dx: number, t: number): void {
  const red = "#D6463F";
  const shape: CurvePt[] = [
    [dx + 38.5, -8, 1],
    [40, -20],
    [33, -33],
    [18, -40.5],
    [0, -42.5],
    [-18, -40.5],
    [-33, -33],
    [-40, -20],
    [-40, -8, 1],
    [dx - 20, -15],
    [dx, -17.5],
    [dx + 20, -15],
  ];
  // The knot and its tails at the back, on the far (-x) side.
  const flap = Math.sin(t * 2.6) * 2;
  tube(ctx, [{ x: -40, y: -18 }, { x: -50, y: -10 + flap * 0.3 }, { x: -55, y: 1 + flap }], 6.5, shade(red, -0.08));
  tube(ctx, [{ x: -40, y: -18 }, { x: -47, y: -3 }, { x: -48 + flap * 0.4, y: 9 }], 6.5, shade(red, -0.15));
  paintShaded(ctx, (c) => curvyPath(c, shape, 0.5), red, shade(red, -0.18), (c) => c.ellipse(-30, -10, 22, 30, 0, 0, Math.PI * 2));
  withClip(ctx, (c) => curvyPath(c, shape, 0.5), () => {
    fillPath(ctx, (c) => {
      for (let i = 0; i < 18; i++) {
        const x = -34 + (i % 6) * 13.5 + (Math.floor(i / 6) % 2) * 6;
        const y = -38 + Math.floor(i / 6) * 9;
        c.moveTo(x + 1.9, y);
        c.arc(x, y, 1.9, 0, Math.PI * 2);
      }
    }, "#F8E9D2");
  });
  paintShaded(ctx, (c) => c.ellipse(-40, -17, 5.5, 5, 0, 0, Math.PI * 2), shade(red, -0.05), null, null);
}

function marineCap(ctx: Ctx, dx: number): void {
  const white = "#F8F7F2";
  const shadeW = "#D9DFE8";
  ctx.save();
  ctx.translate(dx, -24);
  ctx.rotate(-0.1);
  const crown = (c: Ctx) => curvyPath(c, [[-25, -3], [-24, -20], [-14, -28], [0, -30], [14, -28], [24, -20], [25, -3]], 0.5);
  paintShaded(ctx, crown, white, shadeW, (c) => c.ellipse(16, -10, 13, 24, 0, 0, Math.PI * 2), { stroke: "#5D6B80" });
  strokePath(ctx, (c) => {
    c.moveTo(-6, -29);
    c.quadraticCurveTo(-4, -16, -9, -4);
  }, alpha("#5D6B80", 0.5), 1.4);
  // The rolled brim, with a navy stripe.
  const brim = (c: Ctx) => {
    c.moveTo(-34, -6);
    c.quadraticCurveTo(0, 3, 34, -6);
    c.quadraticCurveTo(37, 1, 33, 6);
    c.quadraticCurveTo(0, 14, -33, 6);
    c.quadraticCurveTo(-37, 1, -34, -6);
    c.closePath();
  };
  paintShaded(ctx, brim, white, shadeW, (c) => c.rect(-40, 4, 80, 12), { stroke: "#5D6B80" });
  strokePath(ctx, (c) => {
    c.moveTo(-34, 0.5);
    c.quadraticCurveTo(0, 9, 34, 0.5);
  }, "#2E4A86", 2.2);
  ctx.restore();
}

function aviatorCap(ctx: Ctx, dx: number, t: number): void {
  const leather = "#8C5B3A";
  const fleece = "#F3E3C6";
  const flap = (side: -1 | 1) => {
    const x = side * 36;
    const pts: CurvePt[] = [
      [x - side * 6, -12],
      [x + side * 6, -14],
      [x + side * 7.5, 6],
      [x + side * 4, 21],
      [x - side * 3, 22],
      [x - side * 6.5, 8],
    ];
    paintShaded(ctx, (c) => curvyPath(c, pts, 0.5), fleece, null, null, { stroke: "#B49A75" });
    const inner: CurvePt[] = pts.map((p) => [p[0] + side * 1.5, p[1] - 1.2]);
    paintShaded(ctx, (c) => curvyPath(c, inner.map((p) => [x + (p[0] - x) * 0.8, p[1] * 0.95] as const), 0.5), leather, shade(leather, -0.2), (c) => c.rect(x - 10, 6, 20, 20));
  };
  // A loose chin strap from the near flap.
  const sw = Math.sin(t * 2) * 1.5;
  tube(ctx, [{ x: 38, y: 18 }, { x: 37 + sw, y: 30 }, { x: 33 + sw, y: 38 }], 3.2, shade(leather, -0.1));
  flap(-1);
  flap(1);
  const cap: CurvePt[] = [
    [38, -9, 1],
    [39.5, -21],
    [33, -33],
    [18, -40.5],
    [0, -42],
    [-18, -40.5],
    [-33, -33],
    [-40, -21],
    [-39, -9, 1],
    [dx - 20, -18],
    [dx, -20.5],
    [dx + 20, -18],
  ];
  paintShaded(ctx, (c) => curvyPath(c, cap, 0.5), leather, shade(leather, -0.2), (c) => c.ellipse(-28, -12, 22, 30, 0, 0, Math.PI * 2));
  strokePath(ctx, (c) => {
    c.moveTo(dx + 2, -42);
    c.quadraticCurveTo(dx + 4, -30, dx + 1, -20);
  }, shade(leather, -0.35), 1.4);
  // Fleece trim along the front edge.
  const trim: CurvePt[] = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    const x = -38 + 76 * u + (dx * (1 - Math.abs(u - 0.5) * 2));
    const y = -11 - Math.sin(u * Math.PI) * 9.5;
    trim.push(i % 2 === 0 ? [x, y] : [x, y - 2.2]);
  }
  ctx.save();
  ctx.lineCap = "round";
  strokePath(ctx, (c) => curvyPath(c, trim, 0.5, false), "#B49A75", 8.5);
  strokePath(ctx, (c) => curvyPath(c, trim, 0.5, false), fleece, 5);
  ctx.restore();
}

function beanie(ctx: Ctx, dx: number, t: number): void {
  const knit = "#E0A63C";
  const knitShade = shade(knit, -0.2);
  const body = (c: Ctx) => curvyPath(c, [[39, -15], [36, -32], [22, -44], [2, -48.5], [-20, -45], [-35, -33], [-39.5, -15]], 0.5);
  paintShaded(ctx, body, knit, knitShade, (c) => c.ellipse(-26, -24, 18, 30, 0, 0, Math.PI * 2));
  withClip(ctx, body, () =>
    strokePath(ctx, (c) => {
      for (let i = -4; i <= 4; i++) {
        c.moveTo(dx + i * 8.5, -14);
        c.quadraticCurveTo(dx + i * 7.5, -32, dx + i * 3.5, -48);
      }
    }, alpha(knitShade, 0.75), 1.3),
  );
  const cuff = (c: Ctx) => {
    c.moveTo(-40.5, -25);
    c.quadraticCurveTo(dx, -17, 40.5, -25);
    c.lineTo(40, -12);
    c.quadraticCurveTo(dx, -3, -40, -12);
    c.closePath();
  };
  paintShaded(ctx, cuff, shade(knit, 0.06), knitShade, (c) => c.rect(-45, -10, 90, 10));
  withClip(ctx, cuff, () =>
    strokePath(ctx, (c) => {
      for (let i = -9; i <= 9; i++) {
        c.moveTo(dx + i * 4.3, -26);
        c.lineTo(dx + i * 4.3, -2);
      }
    }, alpha(knitShade, 0.8), 1.3),
  );
  const bob = Math.sin(t * 2.4) * 0.8;
  const pom: CurvePt[] = ellipsePts(1, -51 + bob, 9.5, 8.5, 12).map((p, i) => (i % 2 ? [p[0] * 1.04, p[1]] : [p[0], p[1], 1] as const));
  paintShaded(ctx, (c) => curvyPath(c, pom, 0.7), "#FBF1DF", "#E7D8BD", (c) => c.ellipse(4, -46 + bob, 8, 5, 0, 0, Math.PI * 2), { stroke: "#B9A27A" });
}

function leaf(ctx: Ctx, x: number, y: number, angle: number, len: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  paintShaded(ctx, (c) => curvyPath(c, [[0, 0, 1], [len * 0.5, -len * 0.32], [len, 0, 1], [len * 0.5, len * 0.32]], 0.5), color, null, null, { width: 1.8 });
  strokePath(ctx, (c) => {
    c.moveTo(len * 0.15, 0);
    c.lineTo(len * 0.8, 0);
  }, alpha(shade(color, -0.4), 0.8), 0.9);
  ctx.restore();
}

/** Points along the front of a ring around the head (u from 0 left to 1 right). */
function ringPt(u: number, dx: number, cy: number, rx: number, ry: number, back = false): { x: number; y: number; a: number } {
  const a = back ? Math.PI * (2 - u) : Math.PI * (1 - u);
  const x = Math.cos(a) * rx + dx * (back ? 0.3 : 1) * Math.sin(u * Math.PI);
  const y = cy + Math.sin(a) * ry;
  return { x, y, a: Math.atan2(Math.cos(a) * ry, -Math.sin(a) * rx) };
}

function laurel(ctx: Ctx, dx: number): void {
  const green = "#6FA552";
  const dark = "#4F8640";
  for (let i = 0; i < 9; i++) {
    const u = 0.08 + (i / 8) * 0.84;
    const p = ringPt(u, dx, -21, 38, 9.5, true);
    leaf(ctx, p.x, p.y, p.a + (i % 2 ? 0.6 : -0.6) + Math.PI, 9, dark);
  }
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < 7; i++) {
      const u = side < 0 ? 0.04 + i * 0.065 : 0.96 - i * 0.065;
      const p = ringPt(u, dx, -21, 39, 10);
      const along = side < 0 ? p.a : p.a + Math.PI;
      leaf(ctx, p.x, p.y, along - side * 0.1 + (i % 2 ? 0.55 : -0.55), 11, i % 2 ? green : dark);
    }
  }
  // Gold berries where the two branches meet at the front.
  for (const [x, y] of [[dx - 3, -12], [dx + 3, -12.5]] as const) paintShaded(ctx, (c) => c.arc(x, y, 2.4, 0, Math.PI * 2), "#F1C04B", null, null, { width: 1.6 });
}

function flowerCrown(ctx: Ctx, dx: number): void {
  for (let i = 0; i < 8; i++) {
    const p = ringPt(0.06 + (i / 7) * 0.88, dx, -22, 37, 9, true);
    leaf(ctx, p.x, p.y, p.a + Math.PI + (i % 2 ? 0.5 : -0.5), 8, "#5E9447");
  }
  for (let i = 0; i < 6; i++) {
    const p = ringPt(0.05 + (i / 5) * 0.9, dx, -21, 38, 10.5);
    leaf(ctx, p.x, p.y, p.a + 0.9, 9, "#6FA552");
    leaf(ctx, p.x, p.y, p.a + Math.PI - 0.9, 9, "#5E9447");
  }
  const flowers = [0.02, 0.21, 0.4, 0.6, 0.79, 0.98];
  flowers.forEach((u, i) => {
    const p = ringPt(u, dx, -21, 38.5, 10.5);
    if (i % 2 === 0) marigold(ctx, p.x, p.y - 1, u > 0.3 && u < 0.7 ? 7.5 : 6.5);
    else blossom(ctx, p.x, p.y - 1, 6.5);
  });
}

function marigold(ctx: Ctx, x: number, y: number, r: number): void {
  const pts: CurvePt[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rr = i % 2 ? r : r * 0.78;
    pts.push(i % 2 ? [x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.9] : [x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.9, 1]);
  }
  paintShaded(ctx, (c) => curvyPath(c, pts, 0.6), "#F29A2E", "#E07B1F", (c) => c.arc(x, y, r * 0.55, 0, Math.PI * 2), { width: 2 });
  paintShaded(ctx, (c) => c.arc(x, y, r * 0.3, 0, Math.PI * 2), "#C5631A", null, null, { stroke: false });
}

function blossom(ctx: Ctx, x: number, y: number, r: number): void {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    paintShaded(ctx, (c) => c.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.5, r * 0.5, r * 0.42, a, 0, Math.PI * 2), "#FFF8EC", null, null, { width: 1.6, stroke: "#B9A98E" });
  }
  paintShaded(ctx, (c) => c.arc(x, y, r * 0.28, 0, Math.PI * 2), "#F6C843", null, null, { width: 1.2 });
}
