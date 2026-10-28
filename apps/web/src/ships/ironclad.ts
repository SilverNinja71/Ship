// Ironclad: the Riveted Ironclad. Barely above the water: a low steel hull
// with a ram bow, and amidships a sloped, riveted casemate like a tortoise
// shell, with cannons in its ports and one tall stack. The crew picnics on
// the casemate roof; the helm and tree sit on the after deck.

import type { ShipDefinition } from "@ship/shared-types";
import { INK, alpha, shade } from "../ship-engine/draw.js";
import type { Ctx } from "../ship-engine/types.js";
import { gunPort, smokestack } from "./parts/extras.js";
import { arrange, band, bellBracket, drawDeckBand, flagStaff, paintIn, rivetRow, roundedPoly } from "./kit.js";
import { hullPath, paintHull } from "./hullKit.js";
import { hawseAnchor, plating, stanchions } from "./warship.js";
import type { HullDrawer, HullLayout } from "./types.js";

const AFT = { from: -488, to: -310, y: 0 };
const ROOF = { from: -250, to: 214, y: -136 };
const FORE = { from: 278, to: 474, y: 0 };
const CASEMATE = { from: -310, to: 276 };
const STAFF_X = -494;
const STACK_TOP = -472;
const STACK_RAKE = 0.07;

/** The stack rises from the roof in the gap between the desk and the first table. */
const stackXOf = (deskX: number, tableX: number) => Math.round((deskX + 75 + tableX - 65) / 2);

function layout(_ship: ShipDefinition): HullLayout {
  const s = arrange([
    { ...AFT, items: ["helm", "tree"] },
    { ...ROOF, items: ["desk", "table", "table"] },
    { ...FORE, items: ["table"] },
  ]);
  const stackX = stackXOf(s.desk.x, s.tables[0].x);
  return {
    deck: { from: AFT.from, to: FORE.to },
    waterline: 44,
    keel: 110,
    masts: [],
    bow: { x: 500, y: 4, angle: -0.1 },
    flag: { x: STAFF_X, y: -244 },
    helm: s.helm,
    citrusTree: s.citrusTree,
    bell: { x: s.helm.x + 2, y: -206 },
    desk: s.desk,
    tables: s.tables,
    smoke: [{ x: Math.round(stackX - (ROOF.y - 20 - STACK_TOP) * STACK_RAKE), y: STACK_TOP - 6 }],
    orchard: [],
    surfaces: s.surfaces,
    bounds: { left: -620, top: -490, right: 560, bottom: 115 },
  };
}

const outline = (c: Ctx) =>
  hullPath(
    c,
    [
      { x: -500, y: 24 },
      { x: -492, y: -4, r: 10 },
      { x: 486, y: -4, r: 6 },
      { x: 500, y: 0 },
    ],
    (cc) => {
      cc.bezierCurveTo(506, 20, 520, 36, 548, 46);
      cc.bezierCurveTo(520, 60, 490, 80, 440, 96);
      cc.bezierCurveTo(200, 112, -300, 112, -450, 96);
      cc.bezierCurveTo(-490, 80, -506, 50, -500, 24);
    },
  );

const casematePath = (c: Ctx) =>
  roundedPoly(c, [
    { x: CASEMATE.from, y: 2, r: 4 },
    { x: ROOF.from - 4, y: ROOF.y - 6, r: 14 },
    { x: ROOF.to + 4, y: ROOF.y - 6, r: 14 },
    { x: CASEMATE.to, y: 2, r: 4 },
  ]);

const drawBack: HullDrawer["drawBack"] = (ctx, ship, l) => {
  const p = ship.palette;
  smokestack(ctx, stackXOf(l.desk.x, l.tables[0].x), ROOF.y - 20, STACK_TOP, 56, { body: shade(p.hull, -0.1), band: p.accent, cap: p.hullDark }, STACK_RAKE);
  flagStaff(ctx, STAFF_X, -14, l.flag.y, p.trim, p.accent);
  bellBracket(ctx, { x: STAFF_X, y: l.bell.y - 9 }, l.bell, p.trim, p.accent);
};

const drawDeck: HullDrawer["drawDeck"] = (ctx, ship) => {
  const p = ship.palette;
  drawDeckBand(ctx, ship, { from: AFT.from, to: FORE.to, y: 0 });
  // The casemate: sloped armor plates, riveted, with gun ports.
  paintIn(
    ctx,
    casematePath,
    p.hull,
    () => {
      ctx.strokeStyle = alpha(shade(p.hull, -0.45), 0.6);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let y = ROOF.y + 30; y < 0; y += 34) {
        ctx.moveTo(CASEMATE.from - 40, y);
        ctx.lineTo(CASEMATE.to + 40, y);
      }
      for (let x = CASEMATE.from + 70; x < CASEMATE.to - 20; x += 96) {
        ctx.moveTo(x, ROOF.y);
        ctx.lineTo(x, 0);
      }
      ctx.stroke();
      if (ship.extras.includes("rivets")) for (let y = ROOF.y + 14; y < 0; y += 34) rivetRow(ctx, CASEMATE.from, CASEMATE.to, y, 14, p.hull, 1.8);
      band(ctx, CASEMATE.from, ROOF.y, CASEMATE.to, ROOF.y + 12, alpha("#FFFFFF", 0.18));
      band(ctx, CASEMATE.from, -24, CASEMATE.to, 4, alpha(INK, 0.16));
    },
    { width: 4 },
  );
  if (ship.extras.includes("cannons")) [-176, -40, 96].forEach((x) => gunPort(ctx, x, -64, ship, { size: 1.15, frameColor: p.accent }));
  drawDeckBand(ctx, ship, ROOF, { salt: 9, color: shade(p.deck, 0.08) });
};

const drawFront: HullDrawer["drawFront"] = (ctx, ship) => {
  const p = ship.palette;
  paintHull(ctx, ship, outline, {
    fill: p.hull,
    low: p.hullDark,
    lowFrom: 30,
    stripes: [[8, 14, p.accent]],
    inner: () => {
      if (ship.extras.includes("rivets")) plating(ctx, p.hull, -460, 480, 14, 40, 80);
    },
  });
  hawseAnchor(ctx, 460, 10, "#20262E");
  // A low rail on the roof edge, so the crew up there looks safe.
  stanchions(ctx, ROOF.from - 2, ROOF.to + 2, ROOF.y - 2, p.trim, 20, 36);
  stanchions(ctx, AFT.from + 6, AFT.to - 4, -3, p.trim, 18, 40);
  stanchions(ctx, FORE.from + 4, FORE.to - 10, -3, p.trim, 18, 40);
};

export const ironclad: HullDrawer = { layout, drawBack, drawDeck, drawFront };
