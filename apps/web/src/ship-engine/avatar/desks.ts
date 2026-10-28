// The eight desks and the galley table, in the station frame: the floor is
// y = 0, the desk top is a thin band from DESK_FAR (against the sailor) to
// DESK_NEAR (towards the viewer), and the front panel hides the sailor's legs.

import type { DeskId } from "@ship/shared-types";
import { alpha, radialGradient, shade } from "../draw.js";
import type { Ctx } from "../types.js";
import { drawSteam } from "./arms.js";
import { curvyPath, fillPath, hash01, paintShaded, strokePath, tube, withClip, type CurvePt } from "./kit.js";
import { DESK_FAR, DESK_NEAR } from "./look.js";
import { drawDeskSprite, drawGalleyTableSprite } from "../sprites/props.js";

const BRASS = "#E0B04A";

function floorShadow(ctx: Ctx, rx = 78): void {
  fillPath(ctx, (c) => c.ellipse(0, -0.5, rx, 5.5, 0, 0, Math.PI * 2), alpha("#2A2238", 0.2));
}

/** The desk top surface: a band, slightly wider at the near edge. */
function topPath(c: Ctx, half = 70, flare = 4, far = DESK_FAR - 1, near = DESK_NEAR): void {
  curvyPath(c, [[-half, far, 1], [half, far, 1], [half + flare, near, 1], [-half - flare, near, 1]], 0);
}

function slab(ctx: Ctx, top: string, edge: string, opts: { half?: number; flare?: number; thick?: number } = {}): void {
  const half = opts.half ?? 70;
  const flare = opts.flare ?? 4;
  const thick = opts.thick ?? 6;
  paintShaded(ctx, (c) => c.roundRect(-half - flare, DESK_NEAR - 1, (half + flare) * 2, thick + 1, [0, 0, 3, 3]), edge, null, null);
  paintShaded(ctx, (c) => topPath(c, half, flare), top, shade(top, -0.08), (c) => c.rect(-half - flare, DESK_FAR - 2, (half + flare) * 2, 3.5));
}

function grain(ctx: Ctx, x0: number, x1: number, y0: number, y1: number, color: string, seed: number, n = 5): void {
  strokePath(ctx, (c) => {
    for (let i = 0; i < n; i++) {
      const y = y0 + ((i + 0.5) / n) * (y1 - y0);
      const a = x0 + hash01(seed, i) * (x1 - x0) * 0.4;
      const b = a + (x1 - x0) * (0.3 + hash01(seed, i + 9) * 0.4);
      c.moveTo(a, y);
      c.bezierCurveTo(a + (b - a) * 0.3, y - 1.5, a + (b - a) * 0.7, y + 1.5, b, y);
    }
  }, color, 1.1);
}

export function drawDesk(ctx: Ctx, id: DeskId, t: number, seed: number): void {
  if (drawDeskSprite(ctx, id)) return;
  switch (id) {
    case "captains-desk":
      return captainsDesk(ctx);
    case "map-table":
      return mapTable(ctx);
    case "war-room":
      return warRoom(ctx);
    case "galley-counter":
      return galleyCounter(ctx, t);
    case "star-chart":
      return starChart(ctx, t);
    case "coral-vanity":
      return coralVanity(ctx, t, seed);
    case "stump-bench":
      return stumpBench(ctx);
    case "marble-plinth":
      return marblePlinth(ctx);
    default:
      return captainsDesk(ctx);
  }
}

function captainsDesk(ctx: Ctx): void {
  const oak = "#B07443";
  floorShadow(ctx);
  for (const x of [-60, 60]) paintShaded(ctx, (c) => c.roundRect(x - 6, -6, 12, 6, [0, 0, 4, 4]), shade(oak, -0.25), null, null);
  paintShaded(ctx, (c) => c.rect(-66, -57, 132, 52), oak, shade(oak, -0.12), (c) => c.rect(-70, -15, 140, 12));
  // Recessed centre panel between the two drawer pedestals.
  paintShaded(ctx, (c) => c.roundRect(-21, -53, 42, 44, 2), shade(oak, -0.2), shade(oak, -0.3), (c) => c.rect(-22, -53, 44, 6), { width: 2.6 });
  for (const x0 of [-62, 25]) {
    for (const [y, h] of [[-53, 21], [-29, 21]] as const) {
      paintShaded(ctx, (c) => c.roundRect(x0, y, 37, h, 2.5), shade(oak, 0.1), null, null, { width: 2.6 });
      grain(ctx, x0 + 3, x0 + 34, y + 3, y + h - 3, alpha(shade(oak, -0.3), 0.5), x0 * 7 + y, 3);
      const hx = x0 + 18.5;
      const hy = y + h / 2;
      strokePath(ctx, (c) => c.arc(hx, hy - 1, 4.2, 0.15, Math.PI - 0.15), shade(BRASS, -0.5), 4);
      strokePath(ctx, (c) => c.arc(hx, hy - 1, 4.2, 0.15, Math.PI - 0.15), BRASS, 2);
      for (const s of [-1, 1]) paintShaded(ctx, (c) => c.arc(hx + s * 4.6, hy - 1.6, 1.6, 0, Math.PI * 2), BRASS, null, null, { width: 1.2 });
    }
  }
  slab(ctx, "#C98D55", "#9E6438");
  // Brass corner caps and an old ink stain.
  for (const s of [-1, 1]) paintShaded(ctx, (c) => curvyPath(c, [[s * 74, -62, 1], [s * 66, -62, 1], [s * 74, -55, 1]], 0), BRASS, null, null, { width: 1.6 });
  fillPath(ctx, (c) => curvyPath(c, [[-52, -70], [-47, -71.5], [-43, -69.5], [-44.5, -66.5], [-50, -66], [-53.5, -68]], 0.6), alpha("#2A2440", 0.55));
  fillPath(ctx, (c) => c.ellipse(-40, -65.5, 1.6, 0.9, 0, 0, Math.PI * 2), alpha("#2A2440", 0.5));
}

function mapTable(ctx: Ctx): void {
  const wood = "#A26E45";
  floorShadow(ctx);
  // Shadowy space under the table, with rolled charts on the low shelf.
  fillPath(ctx, (c) => c.rect(-58, -58, 116, 44), "#4A3328");
  for (const [x, w, col] of [[-48, 30, "#F1E3BF"], [-14, 24, "#E9D7AC"], [16, 30, "#F1E3BF"]] as const) {
    paintShaded(ctx, (c) => c.roundRect(x, -23.5, w, 8, 4), col, shade(col, -0.12), (c) => c.rect(x, -19, w, 5), { width: 2.4 });
    paintShaded(ctx, (c) => c.ellipse(x + w, -19.5, 2.2, 4, 0, 0, Math.PI * 2), shade(col, -0.05), null, null, { width: 1.8 });
    fillPath(ctx, (c) => c.rect(x + w * 0.45, -23.5, 2.6, 8), "#C9473F");
  }
  paintShaded(ctx, (c) => c.roundRect(-62, -15.5, 124, 6, 2), wood, null, null);
  // Turned legs.
  for (const s of [-1, 1]) {
    const x = s * 63;
    paintShaded(ctx, (c) => curvyPath(c, [[x - 4.5, -57], [x + 4.5, -57], [x + 3.5, -44], [x + 6.5, -34], [x + 3.5, -24], [x + 4, -4], [x + 6, 0, 1], [x - 6, 0, 1], [x - 4, -4], [x - 3.5, -24], [x - 6.5, -34], [x - 3.5, -44]], 0.5), wood, shade(wood, -0.18), (c) => c.rect(x + s * 1, -60, 8, 62));
  }
  paintShaded(ctx, (c) => c.rect(-68, -58, 136, 7), shade(wood, -0.05), null, null);
  slab(ctx, "#B9805A", "#8E5B38");
  // The chart: across the top, draped over the front edge with curled corners.
  const parchment = "#EFDDB2";
  const drape: CurvePt[] = [[-56, -73, 1], [54, -73, 1], [58, -62], [59, -50], [57, -39, 1], [40, -41], [20, -38], [0, -40.5], [-20, -38], [-40, -41], [-58, -38, 1], [-60, -50], [-59, -62]];
  paintShaded(ctx, (c) => curvyPath(c, drape, 0.45), parchment, "#DCC48F", (c) => c.rect(-62, -63, 124, 2.5), { stroke: "#9A7B4A" });
  withClip(ctx, (c) => curvyPath(c, drape, 0.45), () => {
    // An island, a dotted route and an X.
    paintShaded(ctx, (c) => curvyPath(c, [[-40, -54], [-30, -57], [-22, -52], [-25, -46], [-36, -45], [-43, -48]], 0.6), "#9CC28A", null, null, { stroke: "#6B8F5A", width: 1.6 });
    ctx.save();
    ctx.setLineDash([2.2, 2.2]);
    strokePath(ctx, (c) => {
      c.moveTo(-24, -50);
      c.bezierCurveTo(-8, -58, 10, -42, 30, -50);
    }, "#C9473F", 1.4);
    ctx.restore();
    strokePath(ctx, (c) => {
      c.moveTo(29, -54);
      c.lineTo(35, -48);
      c.moveTo(35, -54);
      c.lineTo(29, -48);
    }, "#C9473F", 1.8);
    // A small compass rose.
    const rx = 45;
    const ry = -50;
    paintShaded(ctx, (c) => curvyPath(c, [[rx, ry - 6, 1], [rx + 1.6, ry, 1], [rx, ry + 6, 1], [rx - 1.6, ry, 1]], 0), "#7A6340", null, null, { width: 0.8 });
    paintShaded(ctx, (c) => curvyPath(c, [[rx - 6, ry, 1], [rx, ry - 1.6, 1], [rx + 6, ry, 1], [rx, ry + 1.6, 1]], 0), "#B89A62", null, null, { width: 0.8 });
    strokePath(ctx, (c) => {
      c.moveTo(-50, -68);
      c.quadraticCurveTo(-30, -71, -10, -67);
      c.moveTo(14, -69);
      c.quadraticCurveTo(30, -66, 48, -69);
    }, alpha("#9A7B4A", 0.6), 1.1);
  });
  // Curled corners.
  for (const s of [-1, 1]) paintShaded(ctx, (c) => c.ellipse(s * 57.5, -39.5, 3, 4, 0, 0, Math.PI * 2), shade(parchment, -0.06), null, null, { stroke: "#9A7B4A", width: 2 });
}

function warRoom(ctx: Ctx): void {
  const wood = "#6E3A2B";
  floorShadow(ctx);
  for (const s of [-1, 1]) {
    paintShaded(ctx, (c) => curvyPath(c, [[s * 52, -8], [s * 66, -8], [s * 68, -2], [s * 64, 0.5], [s * 54, 0.5], [s * 51, -2]], 0.6), shade(wood, -0.15), null, null);
  }
  paintShaded(ctx, (c) => c.rect(-67, -57, 134, 50), wood, shade(wood, -0.18), (c) => c.rect(-70, -18, 140, 12));
  paintShaded(ctx, (c) => c.roundRect(-60, -52, 120, 39, 3), shade(wood, 0.07), null, null, { width: 2.6 });
  strokePath(ctx, (c) => c.roundRect(-56, -48.5, 112, 32, 2), alpha(BRASS, 0.9), 1.6);
  // A brass star emblem.
  const pts: CurvePt[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 4.2 : 10;
    pts.push([Math.cos(a) * r, -32.5 + Math.sin(a) * r, 1]);
  }
  paintShaded(ctx, (c) => curvyPath(c, pts, 0), BRASS, shade(BRASS, -0.2), (c) => c.rect(-12, -32, 24, 12), { width: 2.4 });
  slab(ctx, shade(wood, 0.12), shade(wood, -0.15));
  // The campaign map, pins and strings.
  const map = (c: Ctx) => curvyPath(c, [[-60, -74, 1], [60, -74, 1], [63, -63.5, 1], [-63, -63.5, 1]], 0);
  paintShaded(ctx, map, "#E9DDBA", null, null, { stroke: "#8E7650", width: 2 });
  withClip(ctx, map, () => {
    fillPath(ctx, (c) => curvyPath(c, [[-58, -73], [-30, -72], [-20, -67], [-34, -64], [-58, -64]], 0.5), alpha("#8DB07A", 0.8));
    fillPath(ctx, (c) => curvyPath(c, [[20, -74], [58, -74], [62, -64], [36, -64], [26, -69]], 0.5), alpha("#8DB07A", 0.8));
  });
  const pins: [number, number, string][] = [
    [-46, -69, "#D6463F"],
    [-22, -71, "#3B6FC2"],
    [-6, -66, "#D6463F"],
    [24, -70, "#F2C24E"],
    [46, -67, "#D6463F"],
    [56, -72, "#3B6FC2"],
  ];
  const strings = [[0, 2], [2, 4], [1, 3], [3, 5]];
  for (const [a, b] of strings) {
    strokePath(ctx, (c) => {
      c.moveTo(pins[a][0], pins[a][1] - 4);
      c.quadraticCurveTo((pins[a][0] + pins[b][0]) / 2, (pins[a][1] + pins[b][1]) / 2 - 1, pins[b][0], pins[b][1] - 4);
    }, "#C23A3A", 0.9);
  }
  for (const [x, y, col] of pins) {
    fillPath(ctx, (c) => c.ellipse(x + 1.5, y + 0.6, 2.2, 0.9, 0, 0, Math.PI * 2), alpha("#2A2238", 0.3));
    strokePath(ctx, (c) => {
      c.moveTo(x, y);
      c.lineTo(x, y - 4);
    }, "#8A8A96", 1);
    paintShaded(ctx, (c) => c.arc(x, y - 4.5, 2.1, 0, Math.PI * 2), col, null, null, { width: 1.2 });
  }
  // A tiny flag pin.
  strokePath(ctx, (c) => {
    c.moveTo(-34, -66);
    c.lineTo(-34, -76);
  }, "#6B5A4A", 1);
  paintShaded(ctx, (c) => curvyPath(c, [[-34, -76, 1], [-27, -74.5, 1], [-34, -72.5, 1]], 0), "#3B6FC2", null, null, { width: 1 });
}

function galleyCounter(ctx: Ctx, t: number): void {
  const paint = "#E8DCC2";
  const wood = "#9B6B43";
  floorShadow(ctx);
  paintShaded(ctx, (c) => c.rect(-67, -10, 134, 10), wood, null, null);
  paintShaded(ctx, (c) => c.rect(-66, -57, 132, 48), paint, shade(paint, -0.1), (c) => c.rect(-70, -20, 140, 12));
  for (const x0 of [-61, 2]) {
    paintShaded(ctx, (c) => c.roundRect(x0, -51, 59, 37, 2.5), shade(paint, 0.05), null, null, { width: 2.6 });
    strokePath(ctx, (c) => c.roundRect(x0 + 4, -47, 51, 29, 2), alpha(shade(paint, -0.3), 0.6), 1.3);
    paintShaded(ctx, (c) => c.arc(x0 + (x0 < 0 ? 53 : 6), -32, 2, 0, Math.PI * 2), "#B88A5A", null, null, { width: 1.4 });
  }
  // A rail along the front with two little pans hanging from it.
  tube(ctx, [{ x: -60, y: -53.5 }, { x: 60, y: -53.5 }], 2.4, "#B8BCC6");
  for (const [x, r, col] of [[-30, 7, "#D27D46"], [32, 6, "#C46E3B"]] as const) {
    strokePath(ctx, (c) => {
      c.moveTo(x, -53.5);
      c.lineTo(x, -49);
    }, "#8A8E99", 1.4);
    tube(ctx, [{ x, y: -49 }, { x, y: -40 }], 2.8, shade(col, -0.1));
    paintShaded(ctx, (c) => c.arc(x, -40 + r, r, 0, Math.PI * 2), col, shade(col, -0.18), (c) => c.rect(x - r, -40 + r * 1.3, r * 2, r));
    fillPath(ctx, (c) => c.ellipse(x - r * 0.35, -40 + r * 0.7, r * 0.22, r * 0.35, 0.4, 0, Math.PI * 2), alpha("#FFFFFF", 0.45));
  }
  slab(ctx, "#F3F0E6", wood);
  // Blue and white tiles on the counter top.
  withClip(ctx, (c) => topPath(c), () => {
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 24; i++) {
        if ((i + row) % 2) continue;
        const y0 = DESK_FAR - 1 + row * 6.5;
        const w = 6.2 + row * 0.25;
        const x0 = -74 + i * w;
        fillPath(ctx, (c) => c.rect(x0, y0, w, 6.5), "#6F9BC4");
      }
    }
  });
  strokePath(ctx, (c) => topPath(c), "#5D6B80", 2);
  // A copper stock pot, simmering.
  const px = -53;
  drawSteam(ctx, px, -97, t, 0.9, 1.1);
  paintShaded(ctx, (c) => c.roundRect(px - 13, -94, 26, 23, [2, 2, 5, 5]), "#D27D46", "#B5652F", (c) => c.rect(px + 2, -95, 13, 25));
  for (const s of [-1, 1]) paintShaded(ctx, (c) => c.roundRect(px + s * 13 - (s < 0 ? 4 : 0), -89, 4, 4, 1.5), "#B5652F", null, null, { width: 1.8 });
  paintShaded(ctx, (c) => c.ellipse(px, -94.5, 14, 3.2, 0, 0, Math.PI * 2), "#C9C9D1", null, null, { width: 2.4 });
  paintShaded(ctx, (c) => c.arc(px, -98.3, 2.3, 0, Math.PI * 2), "#2E2A36", null, null, { width: 1.6 });
  fillPath(ctx, (c) => c.rect(px - 9, -90, 2.4, 15), alpha("#FFFFFF", 0.3));
}

function starChart(ctx: Ctx, t: number): void {
  const navy = "#2C3468";
  const gold = "#E8C35A";
  floorShadow(ctx);
  for (const x of [-60, 60]) paintShaded(ctx, (c) => c.roundRect(x - 5.5, -6, 11, 6, [0, 0, 3, 3]), gold, null, null, { width: 2.2 });
  paintShaded(ctx, (c) => c.rect(-66, -57, 132, 51), navy, shade(navy, -0.25), (c) => c.rect(-70, -18, 140, 12));
  strokePath(ctx, (c) => c.roundRect(-60, -52, 120, 40, 3), alpha(gold, 0.85), 1.6);
  // Constellations and a crescent moon.
  const stars: [number, number][] = [[-48, -42], [-38, -30], [-26, -38], [-18, -24], [22, -40], [34, -28], [46, -36], [52, -22]];
  strokePath(ctx, (c) => {
    c.moveTo(-48, -42);
    c.lineTo(-38, -30);
    c.lineTo(-26, -38);
    c.lineTo(-18, -24);
    c.moveTo(22, -40);
    c.lineTo(34, -28);
    c.lineTo(46, -36);
    c.lineTo(52, -22);
  }, alpha(gold, 0.6), 1);
  for (const [x, y] of stars) twinkle(ctx, x, y, 2.2, gold);
  paintShaded(ctx, (c) => {
    c.arc(0, -33, 9, Math.PI * 0.2, Math.PI * 1.8);
    c.quadraticCurveTo(-4, -33, 7.3, -27.7);
  }, gold, null, null, { width: 2 });
  slab(ctx, "#232A58", "#1B2148");
  withClip(ctx, (c) => topPath(c), () => {
    fillPath(ctx, (c) => {
      for (let i = 0; i < 26; i++) {
        const x = -70 + hash01(7, i) * 140;
        const r = 0.7 + hash01(9, i) * 0.7;
        c.moveTo(x + r, -74 + hash01(8, i) * 11);
        c.arc(x, -74 + hash01(8, i) * 11, r, 0, Math.PI * 2);
      }
    }, alpha("#FFF3C4", 0.85));
  });
  // A small brass astrolabe at the left end, its rete turning slowly.
  const ax = -55;
  const ay = -95;
  paintShaded(ctx, (c) => c.ellipse(ax, -71, 8, 2.6, 0, 0, Math.PI * 2), gold, null, null, { width: 2 });
  paintShaded(ctx, (c) => c.roundRect(ax - 1.8, -84, 3.6, 13, 1), shade(gold, -0.1), null, null, { width: 2 });
  paintShaded(ctx, (c) => c.arc(ax, ay, 13, 0, Math.PI * 2), gold, shade(gold, -0.2), (c) => c.rect(ax - 14, ay + 4, 28, 12));
  paintShaded(ctx, (c) => c.arc(ax, ay, 9.5, 0, Math.PI * 2), "#2B3E7A", null, null, { stroke: shade(gold, -0.45), width: 1.6 });
  strokePath(ctx, (c) => c.ellipse(ax, ay + 1.5, 7, 4.5, 0, 0, Math.PI * 2), alpha(gold, 0.7), 1);
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(t * 0.25);
  strokePath(ctx, (c) => {
    c.arc(0, 0, 6.5, 0, Math.PI * 2);
    c.moveTo(-8.5, 0);
    c.lineTo(8.5, 0);
    c.moveTo(0, -8.5);
    c.lineTo(0, 8.5);
  }, gold, 1.4);
  ctx.restore();
  paintShaded(ctx, (c) => c.arc(ax, ay, 1.8, 0, Math.PI * 2), "#FFF1B8", null, null, { width: 1.2 });
  paintShaded(ctx, (c) => c.arc(ax, ay - 14.5, 2.4, 0, Math.PI * 2), gold, null, null, { width: 1.6 });
}

function twinkle(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  paintShaded(ctx, (c) => curvyPath(c, [[x, y - r * 1.8, 1], [x + r * 0.45, y - r * 0.45, 1], [x + r * 1.8, y, 1], [x + r * 0.45, y + r * 0.45, 1], [x, y + r * 1.8, 1], [x - r * 0.45, y + r * 0.45, 1], [x - r * 1.8, y, 1], [x - r * 0.45, y - r * 0.45, 1]], 0), color, null, null, { stroke: false });
}

function coralVanity(ctx: Ctx, t: number, seed: number): void {
  const coral = "#F28A86";
  floorShadow(ctx);
  // A lumpy coral body.
  const body: CurvePt[] = [];
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    body.push([-66 + 132 * u, -4 + (i % 2 ? 3 : 0)]);
  }
  const outline: CurvePt[] = [[-64, -57], [64, -57], [67, -44], [64, -32], [68, -18], [65, -4], ...body.reverse(), [-68, -18], [-64, -32], [-67, -44]];
  paintShaded(ctx, (c) => curvyPath(c, outline, 0.5), coral, shade(coral, -0.16), (c) => c.rect(-72, -20, 144, 20));
  withClip(ctx, (c) => curvyPath(c, outline, 0.5), () => {
    fillPath(ctx, (c) => {
      for (let i = 0; i < 16; i++) {
        const x = -60 + hash01(seed + 3, i) * 120;
        const y = -52 + hash01(seed + 4, i) * 44;
        const rx = 2.6 + hash01(seed, i) * 2.5;
        c.moveTo(x + rx, y);
        c.ellipse(x, y, rx, 1.8 + hash01(seed, i + 3), 0, 0, Math.PI * 2);
      }
    }, alpha(shade(coral, -0.3), 0.55));
    // Branching coral fronds in relief.
    for (const [x, h] of [[-44, 30], [-8, 24], [30, 32]] as const) {
      strokePath(ctx, (c) => {
        c.moveTo(x, -6);
        c.quadraticCurveTo(x + 2, -6 - h * 0.6, x - 4, -6 - h);
        c.moveTo(x + 1, -6 - h * 0.45);
        c.quadraticCurveTo(x + 8, -6 - h * 0.7, x + 9, -6 - h * 0.95);
      }, alpha(shade(coral, 0.3), 0.8), 3);
    }
  });
  // Bioluminescent spots pulsing.
  for (let i = 0; i < 7; i++) {
    const x = -56 + (i / 6) * 112 + Math.sin(i * 3.1) * 6;
    const y = -46 + ((i * 37) % 30);
    const pulse = 0.55 + 0.45 * Math.sin(t * 1.6 + i * 1.7);
    const col = i % 2 ? "#7FF5E6" : "#FFC2DE";
    fillPath(ctx, (c) => c.arc(x, y, 7, 0, Math.PI * 2), radialGradient(ctx, x, y, 7, [[0, alpha(col, 0.55 * pulse)], [1, alpha(col, 0)]]));
    fillPath(ctx, (c) => c.arc(x, y, 1.6, 0, Math.PI * 2), alpha("#FFFFFF", 0.6 + 0.4 * pulse));
  }
  slab(ctx, "#F9E6E1", "#E6B6B0");
  // A string of pearls along the front edge.
  paintShaded(ctx, (c) => {
    for (let i = 0; i < 25; i++) {
      const x = -70 + i * 5.83;
      const y = -57 + Math.sin(i * 0.9) * 0.6;
      c.moveTo(x + 1.9, y);
      c.arc(x, y, 1.9, 0, Math.PI * 2);
    }
  }, "#FFFDF8", null, null, { width: 1, stroke: "#B9A8B6" });
  // The shell mirror at the left end.
  const mx = -54;
  const my = -105;
  tube(ctx, [{ x: mx, y: -74 }, { x: mx + 1, y: -86 }], 5, shade(coral, 0.05));
  const ribs = 9;
  const shell: CurvePt[] = [[mx - 6, my + 16, 1]];
  for (let i = 0; i <= ribs; i++) {
    const a = Math.PI * (0.98 + (i / ribs) * 1.04);
    const r = 20;
    shell.push([mx + Math.cos(a) * r, my + 2 + Math.sin(a) * r * 0.95]);
    if (i < ribs) {
      const a2 = a + (Math.PI * 1.04) / ribs / 2;
      shell.push([mx + Math.cos(a2) * (r - 2.2), my + 2 + Math.sin(a2) * (r - 2.2) * 0.95, 1]);
    }
  }
  shell.push([mx + 6, my + 16, 1]);
  paintShaded(ctx, (c) => curvyPath(c, shell, 0.5), "#F7C9AE", "#E8A98B", (c) => c.rect(mx - 22, my + 6, 44, 12));
  for (let i = 1; i < ribs; i++) {
    const a = Math.PI * (0.98 + (i / ribs) * 1.04);
    strokePath(ctx, (c) => {
      c.moveTo(mx, my + 14);
      c.lineTo(mx + Math.cos(a) * 18, my + 2 + Math.sin(a) * 17);
    }, alpha("#C98B6E", 0.6), 1);
  }
  paintShaded(ctx, (c) => c.ellipse(mx, my + 1, 11, 10, 0, 0, Math.PI * 2), "#CFE9F2", "#B1D5E3", (c) => c.rect(mx - 12, my + 4, 24, 8), { stroke: "#B98A73", width: 2.6 });
  const glint = 0.5 + 0.5 * Math.sin(t * 0.9);
  strokePath(ctx, (c) => {
    c.moveTo(mx - 6, my - 2);
    c.lineTo(mx - 1, my - 7);
    c.moveTo(mx - 4, my + 2.5);
    c.lineTo(mx + 3, my - 4.5);
  }, alpha("#FFFFFF", 0.55 + 0.4 * glint), 1.6);
  fillPath(ctx, (c) => c.arc(mx, my + 14, 2.3, 0, Math.PI * 2), "#FFFDF8");
}

function stumpBench(ctx: Ctx): void {
  const bark = "#8A3B24";
  floorShadow(ctx, 84);
  const body: CurvePt[] = [[-68, -63], [68, -63], [69, -45], [71, -22], [75, -9], [84, -1, 1], [70, -2], [58, 0, 1], [20, -1], [-14, 0], [-56, -1], [-70, 0, 1], [-80, -1, 1], [-72, -9], [-70, -24], [-69, -45]];
  paintShaded(ctx, (c) => curvyPath(c, body, 0.45), bark, shade(bark, -0.2), (c) => c.ellipse(-62, -28, 20, 40, 0, 0, Math.PI * 2));
  withClip(ctx, (c) => curvyPath(c, body, 0.45), () => {
    const xs = Array.from({ length: 13 }, (_, i) => -62 + i * 10.3 + hash01(5, i) * 3);
    strokePath(ctx, (c) => {
      for (const x of xs) {
        c.moveTo(x, -62);
        c.bezierCurveTo(x - 3, -45, x + 3, -25, x + (x > 0 ? 4 : -4), -2);
      }
    }, alpha(shade(bark, -0.4), 0.7), 1.6);
    strokePath(ctx, (c) => {
      xs.forEach((x, i) => {
        if (i % 3 !== 1) return;
        c.moveTo(x + 4, -55);
        c.quadraticCurveTo(x + 5, -46, x + 3.5, -38);
      });
    }, alpha(shade(bark, 0.25), 0.7), 1.4);
  });
  // Moss at the base, a red mushroom and a sprout.
  for (const [x, w] of [[-62, 16], [-20, 12], [44, 18]] as const) {
    paintShaded(ctx, (c) => curvyPath(c, [[x - w / 2, -1], [x - w / 3, -5], [x, -6.5], [x + w / 3, -5], [x + w / 2, -1]], 0.6), "#7BAA52", null, null, { width: 2.2 });
  }
  paintShaded(ctx, (c) => c.roundRect(64, -10, 4, 9, 1.5), "#F4EADB", null, null, { width: 1.8 });
  paintShaded(ctx, (c) => {
    c.moveTo(58.5, -9);
    c.quadraticCurveTo(66, -20, 73.5, -9);
    c.closePath();
  }, "#D9473F", null, null, { width: 2.2 });
  for (const [x, y] of [[63, -12.5], [68, -14], [66.5, -10.5]] as const) fillPath(ctx, (c) => c.arc(x, y, 1.1, 0, Math.PI * 2), "#FFF6EA");
  tube(ctx, [{ x: -71, y: -30 }, { x: -76, y: -36 }], 1.6, "#5E9447");
  paintShaded(ctx, (c) => c.ellipse(-79, -38, 4, 2.2, -0.5, 0, Math.PI * 2), "#7BAA52", null, null, { width: 1.6 });
  // The sanded top: cut wood with growth rings and a bark rim.
  const top = (c: Ctx) => c.ellipse(0, -68.5, 69.5, 7.5, 0, 0, Math.PI * 2);
  paintShaded(ctx, top, "#DDA46C", "#C98D55", (c) => c.ellipse(0, -63, 70, 3, 0, 0, Math.PI * 2), { stroke: shade(bark, -0.3) });
  withClip(ctx, top, () => {
    for (let i = 1; i <= 5; i++) strokePath(ctx, (c) => c.ellipse(6, -68.6, i * 12, i * 1.25, 0, 0, Math.PI * 2), alpha("#A8693D", 0.5), 1);
    strokePath(ctx, (c) => {
      c.moveTo(6, -68.6);
      c.lineTo(30, -66);
      c.lineTo(38, -66.6);
    }, alpha("#8E5530", 0.6), 1.1);
  });
}

function marblePlinth(ctx: Ctx): void {
  const marble = "#EEEAE3";
  const vein = "#B8B2A8";
  floorShadow(ctx);
  paintShaded(ctx, (c) => c.rect(-68, -6, 136, 6), shade(marble, -0.05), null, null);
  paintShaded(ctx, (c) => c.rect(-63, -11, 126, 6), marble, null, null);
  const shaft = (c: Ctx) => c.rect(-58, -55, 116, 45);
  paintShaded(ctx, shaft, marble, shade(marble, -0.08), (c) => c.rect(-60, -55, 20, 46));
  withClip(ctx, shaft, () => {
    paintShaded(ctx, (c) => {
      for (let i = 0; i < 9; i++) c.roundRect(-52 + i * 13, -50, 6.5, 35, 3.2);
    }, shade(marble, -0.07), null, null, { stroke: alpha(vein, 0.8), width: 1.2 });
    strokePath(ctx, (c) => {
      c.moveTo(-40, -55);
      c.bezierCurveTo(-30, -40, -45, -28, -20, -10);
      c.moveTo(30, -55);
      c.bezierCurveTo(26, -42, 40, -30, 34, -10);
    }, alpha(vein, 0.7), 1.2);
  });
  paintShaded(ctx, (c) => c.roundRect(-64, -58, 128, 4, 1.5), marble, null, null);
  slab(ctx, "#F6F3EE", "#E2DDD4", { thick: 5 });
  withClip(ctx, (c) => topPath(c), () => {
    strokePath(ctx, (c) => {
      c.moveTo(-60, -73);
      c.bezierCurveTo(-40, -66, -20, -72, 0, -64);
      c.moveTo(20, -74);
      c.bezierCurveTo(36, -68, 50, -70, 66, -63);
    }, alpha(vein, 0.75), 1.1);
  });
  // An olive sprig.
  tube(ctx, [{ x: -62, y: -66 }, { x: -50, y: -69 }, { x: -40, y: -68 }], 1.4, "#7A6A4A");
  for (const [x, y, a] of [[-58, -68, -0.8], [-53, -70.5, 0.6], [-47, -71, -0.6], [-43, -69.5, 0.7]] as const) {
    paintShaded(ctx, (c) => c.ellipse(x, y, 4, 1.5, a, 0, Math.PI * 2), "#8DAA6A", null, null, { width: 1.3 });
  }
  paintShaded(ctx, (c) => c.ellipse(-50, -65.5, 1.8, 1.5, 0, 0, Math.PI * 2), "#5A5F3A", null, null, { width: 1 });
}

/** The galley table's long plank top and front, in the table frame (seat scale applied by the caller). */
export function drawGalleyTableBody(ctx: Ctx, half: number): void {
  if (drawGalleyTableSprite(ctx)) return;
  const wood = "#B5835A";
  floorShadow(ctx, half + 6);
  for (const s of [-1, 1]) paintShaded(ctx, (c) => c.roundRect(s * (half - 8) - 5, -12, 10, 12, [0, 0, 2, 2]), shade(wood, -0.25), null, null);
  const front = (c: Ctx) => c.rect(-half + 4, -57, (half - 4) * 2, 46);
  paintShaded(ctx, front, wood, shade(wood, -0.14), (c) => c.rect(-half, -22, half * 2, 12));
  withClip(ctx, front, () => {
    for (let x = -half + 4 + 22; x < half - 4; x += 22) {
      strokePath(ctx, (c) => {
        c.moveTo(x, -57);
        c.lineTo(x, -11);
      }, alpha(shade(wood, -0.45), 0.8), 1.5);
    }
    grain(ctx, -half + 6, half - 6, -52, -16, alpha(shade(wood, -0.3), 0.45), 3, 6);
  });
  // Nail heads along the batten.
  strokePath(ctx, (c) => {
    c.moveTo(-half + 4, -50);
    c.lineTo(half - 4, -50);
  }, alpha(shade(wood, -0.35), 0.6), 1.2);
  for (let x = -half + 15; x < half - 4; x += 22) {
    fillPath(ctx, (c) => c.arc(x, -53.5, 1.1, 0, Math.PI * 2), "#5A4636");
  }
  slab(ctx, "#C99668", "#9E6B45", { half: half - 4, flare: 4 });
  withClip(ctx, (c) => topPath(c, half - 4, 4), () => {
    for (const y of [-70, -66]) {
      strokePath(ctx, (c) => {
        c.moveTo(-half, y);
        c.lineTo(half, y + 0.3);
      }, alpha(shade(wood, -0.3), 0.55), 1);
    }
  });
}

/** A ladder-back chair seen from the front, behind a seated sailor (seat frame). */
export function drawChairBack(ctx: Ctx): void {
  const wood = "#9B6B43";
  for (const y of [-114, -101, -88]) paintShaded(ctx, (c) => c.roundRect(-39, y, 78, 5.5, 2), shade(wood, 0.04), null, null, { width: 2.6 });
  for (const s of [-1, 1]) {
    paintShaded(ctx, (c) => c.roundRect(s * 41 - 3.5, -120, 7, 52, 3), wood, shade(wood, -0.15), (c) => c.rect(s * 41 - (s < 0 ? 4 : 0), -120, 4, 52));
    paintShaded(ctx, (c) => c.arc(s * 41, -121.5, 4.4, 0, Math.PI * 2), shade(wood, 0.05), null, null);
  }
}
