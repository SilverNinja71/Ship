// Sky-galleon: the Pegasus Celestial Cloud-Galleon. A swan-curved lavender
// three-master with gilded trim and star studs, flying on great feathered
// wings over a twilight sea of clouds.

import type { ShipDefinition } from "@ship/shared-types";
import { alpha, circlePath, hashString, outlineFor, paint, rng, shade, sway } from "../ship-engine/draw.js";
import type { Ctx, FrameInfo } from "../ship-engine/types.js";
import { lantern, wing } from "./parts/extras.js";
import { sparkle } from "./parts/sails.js";
import { arrange, band, bellBracket, cabinWindow, isNight, mastAt, rigColors } from "./kit.js";
import { capRail, drawBowspritSpar, drawDecks, drawFarBulwarks, drawRaisedRails, drawRig, hullPath, paintHull, steppedTop } from "./hullKit.js";
import type { HullDrawer, HullLayout } from "./types.js";

const CASTLE = { from: -488, to: -300, y: -72 };
const WAIST = { from: -296, to: 336 };
const FORE = { from: 340, to: 470, y: -48 };
const STEM = { x: 498, y: -112 };
const BOWSPRIT = { from: { x: 450, y: -66 }, to: { x: 604, y: -160 } };

function layout(ship: ShipDefinition): HullLayout {
  const s = arrange([
    { ...CASTLE, items: ["helm", "tree"] },
    { ...WAIST, y: 0, items: ["desk", "table", "table", "table"] },
    { ...FORE, items: ["table"] },
  ]);
  const masts = [mastAt(s.citrusTree.x, CASTLE.y, -478), mastAt(s.tables[0].x, 0, -560), mastAt(s.tables[2].x, 0, -512)];
  return {
    deck: { from: WAIST.from, to: WAIST.to },
    waterline: 118,
    keel: 176,
    masts,
    bow: { x: 494, y: -52, angle: -0.5 },
    flag: { x: masts[1].x, y: masts[1].top },
    helm: s.helm,
    citrusTree: s.citrusTree,
    bell: { x: s.helm.x + 4, y: CASTLE.y - 204 },
    desk: s.desk,
    tables: s.tables,
    smoke: [],
    orchard: [],
    surfaces: s.surfaces,
    bounds: { left: -620, top: -566, right: 640, bottom: 180 },
  };
}

const outline = (c: Ctx) =>
  hullPath(c, steppedTop({ stern: { x: -524, y: -150 }, castle: { to: CASTLE.to, y: CASTLE.y }, waist: -4, fore: { from: FORE.from, y: FORE.y }, stem: STEM }), (cc) => {
    cc.bezierCurveTo(540, -30, 516, 70, 446, 118);
    cc.bezierCurveTo(350, 176, 120, 180, -150, 176);
    cc.bezierCurveTo(-390, 172, -480, 140, -500, 80);
    cc.bezierCurveTo(-516, 20, -540, -90, -524, -150);
  });

const drawBack: HullDrawer["drawBack"] = (ctx, ship, l, frame) => {
  const colors = rigColors(ship);
  // The far wing rises behind everything.
  // The far wing rises between the mizzen and main masts, behind the canvas.
  if (ship.extras.includes("wings")) wing(ctx, { x: (l.masts[0].x + l.masts[1].x) / 2 + 20, y: -60 }, ship, frame, { span: 380, angle: 1.22, flap: 0.12, far: true, phase: 0.5 });
  drawFarBulwarks(ctx, l.surfaces ?? [], shade(ship.palette.hull, -0.08), ship.palette.trim, 16);
  drawBowspritSpar(ctx, BOWSPRIT.from, BOWSPRIT.to, colors.wood, colors.iron);
  drawRig(ctx, ship, l, { mast: { wood: colors.wood, iron: colors.iron, nestColor: shade(ship.palette.hull, -0.1) }, bowsprit: BOWSPRIT });
  bellBracket(ctx, { x: l.masts[0].x, y: l.bell.y - 9 }, l.bell, colors.wood, colors.iron);
  if (ship.extras.includes("lanterns")) {
    const fore = l.masts[2];
    lantern(ctx, (fore.x + BOWSPRIT.to.x) / 2 + 10, (fore.top + 30 + BOWSPRIT.to.y) / 2 + 20, ship, frame, { hang: 10, seed: 6 });
    lantern(ctx, -516, -150, ship, frame, { hang: 0, size: 1.1, seed: 2 });
  }
};

const drawDeck: HullDrawer["drawDeck"] = (ctx, ship, l) => {
  const colors = rigColors(ship);
  drawDecks(ctx, ship, l, l.surfaces ?? [], { wood: colors.wood, iron: colors.iron });
};

const drawFront: HullDrawer["drawFront"] = (ctx, ship, l, frame) => {
  const p = ship.palette;
  paintHull(ctx, ship, outline, {
    fill: p.hull,
    low: p.hullDark,
    lowFrom: 84,
    planks: { spacing: 18, color: alpha(shade(p.hullDark, -0.1), 0.3) },
    stripes: [[22, 28, p.trim], [64, 69, p.trim]],
    inner: () => stars(ctx, ship, frame),
  });
  [-452, -400, -348].forEach((x, k) => cabinWindow(ctx, x, CASTLE.y + 18, 28, 34, p.trim, ship, frame, k));
  capRail(ctx, CASTLE.from - 10, CASTLE.to + 2, CASTLE.y, p.trim);
  capRail(ctx, CASTLE.to - 2, FORE.from + 2, -4, p.trim);
  capRail(ctx, FORE.from - 2, STEM.x - 26, FORE.y, p.trim);
  drawRaisedRails(ctx, l.surfaces ?? [], p.trim, 26, 22);
  swanCurl(ctx, -524, -150, p.trim, -1);
  swanCurl(ctx, STEM.x, STEM.y, p.trim, 1);
  // The near wing tucks along the hull, primaries trailing toward the clouds.
  if (ship.extras.includes("wings")) wing(ctx, { x: 160, y: 62 }, ship, frame, { span: 370, angle: -0.04, flap: 0.07, phase: 0 });
};

/** Gold star studs and a crescent moon on the hull. */
function stars(ctx: Ctx, ship: ShipDefinition, frame: FrameInfo): void {
  const r = rng(hashString(ship.id));
  const night = isNight(ship);
  for (let x = -250; x < 440; x += 46) {
    const tw = 0.6 + 0.4 * sway(frame.t, 1.8, x, frame.reducedMotion);
    sparkle(ctx, x + r() * 10, 45 + r() * 8, night ? 4 + 2 * tw : 4.5, ship.palette.trim);
  }
  paint(ctx, (c) => {
    c.arc(-420, 64, 18, 0.6, Math.PI * 2 - 0.6);
    c.arc(-412, 60, 14, Math.PI * 2 - 0.9, 0.9, true);
    c.closePath();
  }, ship.palette.trim, { width: 2.4 });
  band(ctx, -540, CASTLE.y + 6, CASTLE.to, CASTLE.y + 10, alpha(ship.palette.accent, 0.7));
}

/** A swan-neck curl in gold, rising at stern and stem. */
function swanCurl(ctx: Ctx, x: number, y: number, gold: string, dir: 1 | -1): void {
  const path = (c: Ctx) => {
    c.moveTo(x - dir * 6, y + 30);
    c.bezierCurveTo(x - dir * 2, y - 10, x + dir * 30, y - 34, x + dir * 34, y - 12);
    c.bezierCurveTo(x + dir * 36, y + 2, x + dir * 20, y + 4, x + dir * 18, y - 8);
  };
  ctx.lineCap = "round";
  ctx.beginPath();
  path(ctx);
  ctx.strokeStyle = outlineFor(gold);
  ctx.lineWidth = 11;
  ctx.stroke();
  ctx.beginPath();
  path(ctx);
  ctx.strokeStyle = gold;
  ctx.lineWidth = 6;
  ctx.stroke();
  paint(ctx, (c) => circlePath(c, x + dir * 18, y - 8, 4), shade(gold, 0.3), { width: 2 });
}

export const skyGalleon: HullDrawer = { layout, drawBack, drawDeck, drawFront };
