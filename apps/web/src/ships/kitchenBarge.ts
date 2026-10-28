// Kitchen barge: the Floating Galley. A chubby, smiling fish-shaped barge
// with a tail fin for a stern, a galley cabin amidships (serving hatch,
// striped awning, a rooftop terrace) and a copper chimney that never stops.

import type { ShipDefinition } from "@ship/shared-types";
import { INK, alpha, circlePath, ellipsePath, hashString, line, mix, outlineFor, paint, rng, roundRectPath, shade } from "../ship-engine/draw.js";
import type { Ctx, FrameInfo } from "../ship-engine/types.js";
import { fishFin, kitchenChimney, lantern, porthole } from "./parts/extras.js";
import { arrange, band, bellBracket, drawDeckBand, drawMastFoot, drawMastPole, drawShrouds, farBulwark, mastAt, paintIn, postRail, rigColors } from "./kit.js";
import { capRail, hullPath, paintHull } from "./hullKit.js";
import type { HullDrawer, HullLayout } from "./types.js";

const LEFT = { from: -410, to: -140, y: 0 };
const CABIN = { from: -132, to: 132, roof: -124 };
const ROOF = { from: -122, to: 122, y: CABIN.roof };
const RIGHT = { from: 140, to: 420, y: 0 };
const TAIL = { x: -440 };

function layout(_ship: ShipDefinition): HullLayout {
  const s = arrange([
    { ...LEFT, items: ["helm", "desk"] },
    { ...ROOF, items: ["tree", "table"] },
    { ...RIGHT, items: ["table", "table"] },
  ]);
  const mastX = Math.round((s.tables[1].x + s.tables[2].x) / 2);
  return {
    deck: { from: LEFT.from, to: RIGHT.to },
    waterline: 84,
    keel: 150,
    masts: [mastAt(mastX, 0, -500)],
    bow: { x: 494, y: 34, angle: -0.12 },
    flag: { x: mastX, y: -500 },
    helm: s.helm,
    citrusTree: s.citrusTree,
    bell: { x: s.helm.x + 2, y: -206 },
    desk: s.desk,
    tables: s.tables,
    smoke: [{ x: CABIN.from + 18, y: CABIN.roof - 196 }],
    orchard: [],
    surfaces: s.surfaces,
    bounds: { left: -600, top: -506, right: 620, bottom: 155 },
  };
}

const outline = (c: Ctx) =>
  hullPath(
    c,
    [
      { x: TAIL.x, y: 30 },
      { x: TAIL.x + 10, y: -4, r: 16 },
      { x: 420, y: -4, r: 30 },
      { x: 450, y: 0 },
    ],
    (cc) => {
      // A round fish head, a smiling snout, and a plump belly back to the tail.
      cc.bezierCurveTo(500, 10, 512, 70, 470, 108);
      cc.bezierCurveTo(400, 158, 100, 160, -160, 152);
      cc.bezierCurveTo(-340, 146, -410, 100, -440, 30);
    },
  );

const drawBack: HullDrawer["drawBack"] = (ctx, ship, l, frame) => {
  const colors = rigColors(ship);
  const p = ship.palette;
  // Tail fin: the stern of the fish, flicking slowly.
  if (ship.extras.includes("fish-fins")) {
    ctx.save();
    ctx.translate(TAIL.x + 10, 26);
    ctx.scale(-1, 1);
    fishFin(ctx, 0, 0, 140, p.accent, frame, "tail", -0.15, 0.3);
    ctx.restore();
  }
  farBulwark(ctx, LEFT.from + 10, RIGHT.to, 0, 14, shade(p.hull, -0.1), p.trim);
  // The bell hangs from a post at the stern end of the deck, over the helm.
  const postX = LEFT.from - 4;
  paint(ctx, (c) => roundRectPath(c, postX - 6, l.bell.y - 16, 12, -24 - (l.bell.y - 16), 5), colors.wood, { width: 3 });
  bellBracket(ctx, { x: postX, y: l.bell.y - 9 }, l.bell, colors.wood, colors.iron);
  l.masts.forEach((_, i) => drawShrouds(ctx, ship, l, i, colors.rope));
  l.masts.forEach((_, i) => drawMastPole(ctx, ship, l, i, { wood: colors.wood, iron: colors.iron }));
};

const drawDeck: HullDrawer["drawDeck"] = (ctx, ship, l, frame) => {
  const p = ship.palette;
  const colors = rigColors(ship);
  drawDeckBand(ctx, ship, { from: LEFT.from, to: RIGHT.to, y: 0 });
  drawMastFoot(ctx, l.masts[0], { wood: colors.wood, iron: colors.iron });
  galleyCabin(ctx, ship, frame);
  drawDeckBand(ctx, ship, ROOF, { salt: 7, color: shade(p.deck, 0.06) });
  if (ship.extras.includes("kitchen-chimney") && l.smoke[0]) kitchenChimney(ctx, l.smoke[0].x, ROOF.y - 22, l.smoke[0].y);
};

const drawFront: HullDrawer["drawFront"] = (ctx, ship, _l, frame) => {
  const p = ship.palette;
  const belly = mix(p.hull, "#FFFFFF", 0.55);
  paintHull(ctx, ship, outline, {
    fill: p.hull,
    low: p.hullDark,
    lowFrom: 72,
    stripes: [[10, 18, p.trim]],
    inner: () => {
      // Scales, a pale belly and the gill line.
      ctx.strokeStyle = alpha(shade(p.hull, -0.3), 0.45);
      ctx.lineWidth = 1.8;
      for (let row = 0; row < 3; row++) {
        ctx.beginPath();
        for (let x = -420 + row * 14; x < 300; x += 28) {
          const y = 34 + row * 12;
          ctx.moveTo(x - 14, y);
          ctx.quadraticCurveTo(x, y + 11, x + 14, y);
        }
        ctx.stroke();
      }
      ctx.beginPath();
      ellipsePath(ctx, 40, 140, 470, 56);
      ctx.fillStyle = belly;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(338, 0);
      ctx.bezierCurveTo(372, 40, 372, 90, 344, 130);
      ctx.strokeStyle = shade(p.hull, -0.35);
      ctx.lineWidth = 3;
      ctx.stroke();
    },
  });
  // Face: a big friendly eye and a smile at the snout.
  paint(ctx, (c) => circlePath(c, 412, 36, 25), "#FFFFFF", { width: 3.2 });
  ctx.beginPath();
  circlePath(ctx, 418, 38, 15);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.beginPath();
  circlePath(ctx, 412, 31, 5.5);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(470, 80);
  ctx.quadraticCurveTo(486, 92, 500, 78);
  ctx.strokeStyle = shade(p.hull, -0.55);
  ctx.lineWidth = 3.2;
  ctx.lineCap = "round";
  ctx.stroke();
  paint(ctx, (c) => ellipsePath(c, 446, 66, 10, 6), alpha("#FF8FB1", 0.6), { stroke: false });
  if (ship.extras.includes("portholes")) [-340, -250, -160, 160, 250].forEach((x, k) => porthole(ctx, x, 46, 11, ship, frame, { rim: p.trim, seed: k }));
  capRail(ctx, TAIL.x + 6, 430, -4, p.trim);
  postRail(ctx, ROOF.from + 2, ROOF.to - 2, ROOF.y, 24, p.trim, 26);
  if (ship.extras.includes("fish-fins")) fishFin(ctx, 262, 40, 62, p.accent, frame, "pectoral", 0.45, 1.2);
  if (ship.extras.includes("lanterns")) {
    lantern(ctx, CABIN.from + 4, CABIN.roof + 40, ship, frame, { hang: 8, size: 0.9, seed: 3 });
    lantern(ctx, CABIN.to - 4, CABIN.roof + 40, ship, frame, { hang: 8, size: 0.9, seed: 8 });
  }
};

/** The galley cabin: plank walls, a serving hatch with a counter, a door and a striped awning. */
function galleyCabin(ctx: Ctx, ship: ShipDefinition, frame: FrameInfo): void {
  const p = ship.palette;
  const wall = "#F2E2C4";
  const r = rng(hashString(ship.id));
  paintIn(
    ctx,
    (c) => roundRectPath(c, CABIN.from, CABIN.roof - 6, CABIN.to - CABIN.from, -CABIN.roof + 6, [10, 10, 0, 0]),
    wall,
    () => {
      ctx.strokeStyle = alpha(shade(wall, -0.35), 0.5);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let y = CABIN.roof + 12; y < 0; y += 16) {
        ctx.moveTo(CABIN.from, y);
        ctx.lineTo(CABIN.to, y);
      }
      ctx.stroke();
      band(ctx, CABIN.to - 30, CABIN.roof, CABIN.to, 0, alpha(INK, 0.08));
    },
    { width: 3.5 },
  );
  // Serving hatch with warm kitchen light and pots on the counter.
  const lit = p.glow ?? "#FFC46B";
  paint(ctx, (c) => roundRectPath(c, -98, -100, 120, 56, 6), mix(lit, "#FFFFFF", 0.25), { stroke: outlineFor(p.trim), width: 3 });
  for (const [x, w, h] of [
    [-74, 22, 16],
    [-40, 28, 20],
    [-8, 18, 13],
  ] as const) {
    paint(ctx, (c) => roundRectPath(c, x - w / 2, -46 - h, w, h, 4), r() < 0.5 ? "#9AA4AE" : "#C77B3C", { width: 2.2 });
  }
  paint(ctx, (c) => roundRectPath(c, -104, -48, 132, 10, 3), "#B5835A", { width: 2.6 });
  // Door.
  paint(ctx, (c) => roundRectPath(c, 50, -86, 46, 86, [20, 20, 0, 0]), "#9A6A44", { width: 3 });
  paint(ctx, (c) => circlePath(c, 86, -42, 3.5), p.trim, { width: 1.6 });
  paint(ctx, (c) => circlePath(c, 73, -66, 10), mix(lit, "#FFFFFF", 0.3), { stroke: outlineFor("#9A6A44"), width: 2 });
  // Striped awning over the hatch, scalloped edge fluttering a little.
  const flutter = 1.5 * Math.sin(frame.t * (frame.reducedMotion ? 0.1 : 2));
  const stripes = 8;
  const x0 = -112;
  const x1 = 36;
  for (let k = 0; k < stripes; k++) {
    const a = x0 + ((x1 - x0) * k) / stripes;
    const b = x0 + ((x1 - x0) * (k + 1)) / stripes;
    paint(ctx, (c) => {
      c.moveTo(a + 6, -114);
      c.lineTo(b + 6, -114);
      c.lineTo(b, -94 + flutter);
      c.quadraticCurveTo((a + b) / 2, -86 + flutter, a, -94 + flutter);
      c.closePath();
    }, k % 2 ? "#FFFFFF" : p.accent, { width: 2.2 });
  }
  line(ctx, [{ x: x0 + 6, y: -114 }, { x: x1 + 6, y: -114 }], outlineFor(p.accent), 3);
  // A little hanging sign with a fish-and-spoon.
  line(ctx, [{ x: 108, y: -110 }, { x: 108, y: -100 }], "#5A4632", 2);
  paint(ctx, (c) => roundRectPath(c, 96, -100, 26, 18, 4), p.trim, { width: 2.2 });
  paint(ctx, (c) => ellipsePath(c, 109, -91, 7, 4), p.hull, { width: 1.4 });
}

export const kitchenBarge: HullDrawer = { layout, drawBack, drawDeck, drawFront };
