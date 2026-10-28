// Solar ark: the Chalkydri Solar Ark. A broad, tall copper ark with gold sun
// motifs, a stained-glass solarium in its stern castle, a brass astrolabe on
// the taffrail and three masts carrying twelve fiery sails.

import type { ShipDefinition } from "@ship/shared-types";
import { alpha, circlePath, outlineFor, paint, roundRectPath, shade } from "../ship-engine/draw.js";
import type { Ctx } from "../ship-engine/types.js";
import { astrolabe, stainedGlass } from "./parts/extras.js";
import { arrange, bellBracket, mastAt, rigColors, rivetRow } from "./kit.js";
import { capRail, drawBowspritSpar, drawDecks, drawFarBulwarks, drawRaisedRails, drawRig, hullPath, paintHull, steppedTop } from "./hullKit.js";
import type { HullDrawer, HullLayout } from "./types.js";

const CASTLE = { from: -486, to: -306, y: -84 };
const WAIST = { from: -302, to: 336 };
const FORE = { from: 340, to: 470, y: -46 };
const STEM = { x: 492, y: -90 };
const BOWSPRIT = { from: { x: 450, y: -60 }, to: { x: 590, y: -140 } };
const ASTRO = { x: -508, y: -296, r: 44 };

function layout(_ship: ShipDefinition): HullLayout {
  const s = arrange([
    { ...CASTLE, items: ["helm", "tree"] },
    { ...WAIST, y: 0, items: ["desk", "table", "table", "table"] },
    { ...FORE, items: ["table"] },
  ]);
  const masts = [mastAt(s.citrusTree.x + 20, CASTLE.y, -540), mastAt(s.tables[0].x, 0, -560), mastAt(s.tables[2].x, 0, -530)];
  return {
    deck: { from: WAIST.from, to: WAIST.to },
    waterline: 112,
    keel: 176,
    masts,
    bow: { x: 488, y: -50, angle: -0.42 },
    flag: { x: masts[1].x, y: masts[1].top },
    helm: s.helm,
    citrusTree: s.citrusTree,
    bell: { x: s.helm.x + 4, y: CASTLE.y - 204 },
    desk: s.desk,
    tables: s.tables,
    smoke: [],
    orchard: [],
    surfaces: s.surfaces,
    bounds: { left: -566, top: -566, right: 620, bottom: 180 },
  };
}

const outline = (c: Ctx) =>
  hullPath(c, steppedTop({ stern: { x: -512, y: -112 }, castle: { to: CASTLE.to, y: CASTLE.y }, waist: -4, fore: { from: FORE.from, y: FORE.y }, stem: STEM, r: 12 }), (cc) => {
    cc.bezierCurveTo(516, -20, 512, 90, 440, 140);
    cc.bezierCurveTo(330, 186, 100, 182, -160, 178);
    cc.bezierCurveTo(-400, 176, -482, 150, -500, 90);
    cc.bezierCurveTo(-512, 30, -516, -60, -512, -112);
  });

const drawBack: HullDrawer["drawBack"] = (ctx, ship, l) => {
  const colors = rigColors(ship);
  drawFarBulwarks(ctx, l.surfaces ?? [], shade(ship.palette.hull, 0.1), ship.palette.trim, 16);
  // The astrolabe's pedestal rises from the taffrail.
  paint(ctx, (c) => roundRectPath(c, ASTRO.x - 7, ASTRO.y + ASTRO.r - 4, 14, CASTLE.y - 20 - (ASTRO.y + ASTRO.r - 4), 4), colors.wood, { width: 3 });
  drawBowspritSpar(ctx, BOWSPRIT.from, BOWSPRIT.to, colors.wood, colors.iron);
  drawRig(ctx, ship, l, { mast: { wood: colors.wood, iron: colors.iron }, bowsprit: BOWSPRIT });
  bellBracket(ctx, { x: l.masts[0].x, y: l.bell.y - 9 }, l.bell, colors.wood, colors.iron);
};

const drawDeck: HullDrawer["drawDeck"] = (ctx, ship, l, frame) => {
  const colors = rigColors(ship);
  drawDecks(ctx, ship, l, l.surfaces ?? [], { wood: colors.wood, iron: colors.iron });
  // In front of the mizzen's canvas, so the rings always show.
  if (ship.extras.includes("astrolabe")) astrolabe(ctx, ASTRO.x, ASTRO.y, ASTRO.r, ship, frame);
};

const drawFront: HullDrawer["drawFront"] = (ctx, ship, l, frame) => {
  const p = ship.palette;
  paintHull(ctx, ship, outline, {
    fill: p.hull,
    low: p.hullDark,
    lowFrom: 86,
    stripes: [[14, 22, p.trim], [70, 76, p.trim]],
    inner: () => {
      // Riveted copper plates and a row of gold sun medallions.
      ctx.strokeStyle = alpha(shade(p.hull, -0.4), 0.45);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let x = -500; x < 520; x += 64) {
        ctx.moveTo(x, -120);
        ctx.lineTo(x, 200);
      }
      ctx.stroke();
      rivetRow(ctx, -500, 500, 32, 16, p.hull, 1.8);
      for (let x = -230; x < 440; x += 96) sunMedallion(ctx, x, 48, p.trim);
    },
  });
  // The solarium: tall stained-glass windows in the stern castle.
  if (ship.extras.includes("stained-glass")) [-450, -396, -342].forEach((x, k) => stainedGlass(ctx, x, CASTLE.y + 12, 38, 62, ship, frame, k * 2));
  capRail(ctx, CASTLE.from - 12, CASTLE.to + 2, CASTLE.y, p.trim);
  capRail(ctx, CASTLE.to - 2, FORE.from + 2, -4, p.trim);
  capRail(ctx, FORE.from - 2, STEM.x - 20, FORE.y, p.trim);
  drawRaisedRails(ctx, l.surfaces ?? [], p.trim, 26, 26);
  paint(ctx, (c) => circlePath(c, STEM.x - 4, STEM.y + 6, 9), p.trim, { width: 3 });
};

function sunMedallion(ctx: Ctx, x: number, y: number, gold: string): void {
  ctx.beginPath();
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    ctx.moveTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9);
    ctx.lineTo(x + Math.cos(a) * 15, y + Math.sin(a) * 15);
  }
  ctx.strokeStyle = gold;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.stroke();
  paint(ctx, (c) => circlePath(c, x, y, 8), gold, { stroke: outlineFor(gold), width: 2 });
}

export const solarArk: HullDrawer = { layout, drawBack, drawDeck, drawFront };
