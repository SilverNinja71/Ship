// Trireme: the Gorgon Stone Trireme. A long, low marble galley with a Greek
// key band, a painted eye at the bow, a bronze ram, a curling aphlaston at
// the stern, three banks of rowing oars, ivy on the rails and olive sprigs.

import type { ShipDefinition } from "@ship/shared-types";
import { alpha, circlePath, ellipsePath, outlineFor, paint, shade } from "../ship-engine/draw.js";
import type { Ctx, Point } from "../ship-engine/types.js";
import { ivy, oarBank, oliveSprig } from "./parts/extras.js";
import { arrange, bellBracket, drawDeckBand, drawMastFoot, drawMastPole, drawShrouds, farBulwark, mastAt, paintIn, postRail, rigColors, stay } from "./kit.js";
import { capRail, hullPath, paintHull } from "./hullKit.js";
import type { HullDrawer, HullLayout } from "./types.js";

const STERN = { from: -458, to: -374, y: -44 };
const MAIN = { from: -368, to: 448, y: 0 };
const STEM = { x: 478, y: -84 };

function layout(_ship: ShipDefinition): HullLayout {
  const s = arrange([
    { ...STERN, items: ["helm"] },
    { ...MAIN, items: ["tree", "desk", "table", "table", "table", "table"] },
  ]);
  const mastX = s.tables[1].x;
  return {
    deck: { from: MAIN.from, to: MAIN.to },
    waterline: 72,
    keel: 128,
    masts: [mastAt(mastX, 0, -560)],
    bow: { x: 476, y: -46, angle: -0.42 },
    flag: { x: mastX, y: -560 },
    helm: s.helm,
    citrusTree: s.citrusTree,
    bell: { x: s.helm.x + 4, y: STERN.y - 200 },
    desk: s.desk,
    tables: s.tables,
    smoke: [],
    orchard: [],
    surfaces: s.surfaces,
    bounds: { left: -580, top: -566, right: 600, bottom: 130 },
  };
}

const outline = (c: Ctx) =>
  hullPath(
    c,
    [
      { x: -500, y: -40 },
      { x: -470, y: STERN.y, r: 10 },
      { x: STERN.to, y: STERN.y, r: 8 },
      { x: STERN.to, y: -4, r: 8 },
      { x: 446, y: -4, r: 20 },
      STEM,
    ],
    (cc) => {
      cc.bezierCurveTo(500, -40, 494, 30, 470, 60);
      cc.bezierCurveTo(430, 110, 200, 126, -150, 126);
      cc.bezierCurveTo(-380, 124, -460, 96, -484, 50);
      cc.bezierCurveTo(-498, 20, -506, -20, -500, -40);
    },
  );

/** The aphlaston: a fan of plumes curling up and forward over the helm. Returns its tip. */
function aphlaston(ctx: Ctx, ship: ShipDefinition): Point {
  const stone = ship.palette.hull;
  const plumes = [
    { dx: 0, h: 196, curl: 64 },
    { dx: -16, h: 166, curl: 44 },
    { dx: -30, h: 132, curl: 30 },
  ];
  let tip = { x: 0, y: 0 };
  for (const p of plumes) {
    const x = -486 + p.dx;
    const y0 = STERN.y + 10;
    const path = (c: Ctx) => {
      c.moveTo(x, y0);
      c.bezierCurveTo(x - 30, y0 - p.h * 0.5, x - 10, y0 - p.h, x + p.curl * 0.6, y0 - p.h - 6);
      c.bezierCurveTo(x + p.curl * 1.2, y0 - p.h - 8, x + p.curl * 1.3, y0 - p.h + 22, x + p.curl * 0.9, y0 - p.h + 26);
    };
    ctx.lineCap = "round";
    ctx.beginPath();
    path(ctx);
    ctx.strokeStyle = outlineFor(stone);
    ctx.lineWidth = 19;
    ctx.stroke();
    ctx.beginPath();
    path(ctx);
    ctx.strokeStyle = stone;
    ctx.lineWidth = 12;
    ctx.stroke();
    ctx.beginPath();
    path(ctx);
    ctx.strokeStyle = alpha(ship.palette.accent, 0.5);
    ctx.lineWidth = 3;
    ctx.stroke();
    if (p.dx === 0) tip = { x: x + p.curl * 0.6, y: y0 - p.h - 6 };
  }
  return tip;
}

const drawBack: HullDrawer["drawBack"] = (ctx, ship, l, frame) => {
  const colors = rigColors(ship);
  const p = ship.palette;
  const tip = aphlaston(ctx, ship);
  if (ship.extras.includes("ivy")) ivy(ctx, [{ x: -500, y: -40 }, { x: -520, y: -120 }, { x: -500, y: -200 }, { x: tip.x - 10, y: tip.y + 6 }], frame, 77, p.trim, 13);
  bellBracket(ctx, { x: tip.x - 20, y: l.bell.y - 9 }, l.bell, colors.wood, colors.iron);
  farBulwark(ctx, STERN.from - 6, STERN.to, STERN.y, 12, shade(p.hull, -0.08), p.trim);
  farBulwark(ctx, MAIN.from, MAIN.to - 6, 0, 12, shade(p.hull, -0.08), p.trim);
  stay(ctx, { x: l.masts[0].x, y: l.masts[0].top + 30 }, { x: STEM.x, y: STEM.y }, colors.rope, 20, 2);
  stay(ctx, { x: l.masts[0].x, y: l.masts[0].top + 30 }, { x: STERN.to, y: STERN.y - 24 }, colors.rope, 20, 2);
  drawShrouds(ctx, ship, l, 0, colors.rope);
  drawMastPole(ctx, ship, l, 0, { wood: colors.wood, iron: colors.iron });
};

const drawDeck: HullDrawer["drawDeck"] = (ctx, ship, l) => {
  const colors = rigColors(ship);
  drawDeckBand(ctx, ship, STERN, { salt: 1 });
  drawDeckBand(ctx, ship, MAIN, { salt: 2 });
  drawMastFoot(ctx, l.masts[0], { wood: colors.wood, iron: colors.iron });
};

const drawFront: HullDrawer["drawFront"] = (ctx, ship, _l, frame) => {
  const p = ship.palette;
  const bronze = "#C9853A";
  // Bronze ram at the waterline.
  paint(ctx, (c) => {
    c.moveTo(440, 40);
    c.lineTo(566, 60);
    c.lineTo(440, 82);
    c.closePath();
  }, bronze, { width: 3.5 });
  for (const y of [52, 61, 70]) paint(ctx, (c) => c.rect(520, y - 2, 30, 4), shade(bronze, 0.25), { width: 1.4 });
  paintHull(ctx, ship, outline, {
    fill: p.hull,
    low: p.hullDark,
    lowFrom: 50,
    stripes: [[4, 8, p.accent], [26, 30, p.accent]],
    inner: () => {
      meander(ctx, -520, 520, 9, 25, p.accent);
      // Marble veining.
      ctx.strokeStyle = alpha("#8E9AA6", 0.35);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let x = -460; x < 440; x += 90) {
        ctx.moveTo(x, 36);
        ctx.bezierCurveTo(x + 12, 30, x + 24, 44, x + 40, 38);
      }
      ctx.stroke();
    },
  });
  // Three banks of oars, lowest first so the upper banks overlap them.
  if (ship.extras.includes("oars")) {
    oarBank(ctx, -318, 318, 52, frame, { count: 12, length: 62, phase: 0.6, color: "#A47C4A", blade: "#8C6A3E" });
    oarBank(ctx, -334, 334, 36, frame, { count: 13, length: 76, phase: 0.3, color: "#B08A55", blade: "#957044" });
    oarBank(ctx, -350, 350, 20, frame, { count: 14, length: 92, phase: 0, color: "#BD9660", blade: "#A07A4A" });
  }
  // The painted eye on the bow.
  paintIn(ctx, (c) => ellipsePath(c, 424, 30, 20, 13), "#FFFFFF", () => {
    ctx.beginPath();
    circlePath(ctx, 428, 30, 9);
    ctx.fillStyle = p.accent;
    ctx.fill();
    ctx.beginPath();
    circlePath(ctx, 428, 30, 4.5);
    ctx.fillStyle = "#1A1A22";
    ctx.fill();
  }, { width: 3 });
  capRail(ctx, -498, STERN.to + 2, STERN.y, p.trim);
  capRail(ctx, STERN.to - 2, 452, -4, p.trim);
  postRail(ctx, STERN.from, STERN.to - 4, STERN.y, 24, p.hull, 22);
  if (ship.extras.includes("ivy")) {
    const swag: Point[] = [];
    for (let x = MAIN.from; x <= 440; x += 52) swag.push({ x, y: Math.round(x / 52) % 2 === 0 ? -2 : 10 });
    ivy(ctx, swag, frame, 41, p.trim, 15);
    ivy(ctx, [{ x: STERN.from, y: STERN.y - 2 }, { x: -420, y: STERN.y + 10 }, { x: STERN.to, y: STERN.y }], frame, 43, p.trim, 14);
  }
  oliveSprig(ctx, 452, -20, -0.9, frame, 1);
  oliveSprig(ctx, 446, -12, -0.2, frame, 2);
};

/** A Greek key band between y0 and y1. */
function meander(ctx: Ctx, x0: number, x1: number, y0: number, y1: number, color: string): void {
  const h = y1 - y0;
  const P = 26;
  ctx.beginPath();
  for (let x = x0; x < x1; x += P) {
    ctx.moveTo(x, y1);
    ctx.lineTo(x, y0);
    ctx.lineTo(x + P * 0.78, y0);
    ctx.lineTo(x + P * 0.78, y0 + h * 0.72);
    ctx.lineTo(x + P * 0.3, y0 + h * 0.72);
    ctx.lineTo(x + P * 0.3, y0 + h * 0.36);
    ctx.lineTo(x + P * 0.52, y0 + h * 0.36);
    ctx.moveTo(x, y1);
    ctx.lineTo(x + P, y1);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.6;
  ctx.lineJoin = "miter";
  ctx.stroke();
}

export const trireme: HullDrawer = { layout, drawBack, drawDeck, drawFront };
