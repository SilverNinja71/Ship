// Dreadnought: the Thunder Dreadnought. Heavier and darker than the
// battleship: slate-blue steel with brass bands, a brass deck, triple-gun
// turrets, two tall funnels, a wide war-room bridge with brass telescopes on
// its wings, a tripod mast with a spotting top, and a ram bow.

import type { ShipDefinition } from "@ship/shared-types";
import { alpha, shade } from "../ship-engine/draw.js";
import type { Ctx } from "../ship-engine/types.js";
import { porthole, smokestack, telescope, turret } from "./parts/extras.js";
import { arrange, band, bellBracket, drawDeckBand, paintIn } from "./kit.js";
import { hullPath, paintHull } from "./hullKit.js";
import { deckhouse, hawseAnchor, plating, signalMast, stanchions } from "./warship.js";
import type { HullDrawer, HullLayout } from "./types.js";

const DECK = { from: -480, to: 484 };
const STATIONS = { from: -382, to: 382 };
const MAST_X = -30;
const BRIDGE = { from: -170, to: 70, top: -262 };
const FUNNELS = [-286, -372];

function layout(ship: ShipDefinition): HullLayout {
  void ship;
  const s = arrange([{ ...STATIONS, y: 0, items: ["tree", "helm", "desk", "table", "table", "table"] }]);
  return {
    deck: DECK,
    waterline: 104,
    keel: 166,
    masts: [{ x: MAST_X, base: BRIDGE.top - 10, top: -540 }],
    bow: { x: 498, y: 10, angle: -0.15 },
    flag: { x: MAST_X, y: -540 },
    helm: s.helm,
    citrusTree: s.citrusTree,
    bell: { x: s.helm.x + 4, y: -206 },
    desk: s.desk,
    tables: s.tables,
    smoke: FUNNELS.map((x, k) => ({ x: Math.round(x - (356 - k * 20) * 0.07), y: -386 + k * 20 })),
    orchard: [],
    surfaces: [{ ...DECK, y: 0 }],
    bounds: { left: -566, top: -546, right: 570, bottom: 170 },
  };
}

const outline = (c: Ctx) =>
  hullPath(
    c,
    [
      { x: -494, y: 40 },
      { x: -488, y: -4, r: 18 },
      { x: 488, y: -4, r: 6 },
      { x: 500, y: 0 },
    ],
    (cc) => {
      // A plumb stem that juts forward into a ram at the waterline.
      cc.bezierCurveTo(502, 40, 506, 70, 530, 92);
      cc.bezierCurveTo(520, 104, 500, 112, 470, 130);
      cc.bezierCurveTo(300, 168, -260, 170, -430, 156);
      cc.bezierCurveTo(-490, 130, -506, 80, -494, 40);
    },
  );

const drawBack: HullDrawer["drawBack"] = (ctx, ship, l, frame) => {
  const p = ship.palette;
  const steel = shade(p.hull, 0.12);
  const brass = p.trim;
  FUNNELS.forEach((x, k) => smokestack(ctx, x, -24, -380 + k * 20, 68, { body: p.hullDark, band: brass, cap: shade(brass, -0.3) }, 0.07));
  signalMast(ctx, MAST_X, BRIDGE.top - 10, -540, frame, { color: shade(p.hull, -0.1), spottingTop: -420 });
  deckhouse(ctx, ship, -240, 120, -160, -24, p.hull, frame, { rivets: true });
  deckhouse(ctx, ship, BRIDGE.from, BRIDGE.to, BRIDGE.top, -156, steel, frame, { windows: { y: BRIDGE.top + 24, h: 26, frame: brass }, roof: p.hullDark, rivets: true });
  // Bridge wings with brass telescopes; the aft wing carries the bell over the helm.
  const wingY = l.bell.y - 22;
  paintIn(ctx, (c) => c.rect(l.bell.x - 30, wingY, BRIDGE.from - (l.bell.x - 30), 12), p.hullDark, () => band(ctx, l.bell.x - 30, wingY + 7, BRIDGE.from, wingY + 12, alpha("#000000", 0.25)), { width: 3 });
  paintIn(ctx, (c) => c.rect(BRIDGE.to, wingY, 70, 12), p.hullDark, () => band(ctx, BRIDGE.to, wingY + 7, BRIDGE.to + 70, wingY + 12, alpha("#000000", 0.25)), { width: 3 });
  if (ship.extras.includes("telescope")) {
    telescope(ctx, l.bell.x - 12, wingY, frame, { facing: -1, seed: 1 });
    telescope(ctx, BRIDGE.to + 50, wingY, frame, { facing: 1, seed: 2 });
  }
  bellBracket(ctx, { x: l.bell.x + 16, y: l.bell.y - 10 }, l.bell, p.hullDark, brass);
};

const drawDeck: HullDrawer["drawDeck"] = (ctx, ship, _l, frame) => {
  drawDeckBand(ctx, ship, { ...DECK, y: 0 });
  if (ship.extras.includes("turrets")) {
    const color = shade(ship.palette.hull, 0.18);
    turret(ctx, -434, 0, ship, frame, { facing: -1, barrels: 3, color, size: 1.04, seed: 3 });
    turret(ctx, 434, 0, ship, frame, { facing: 1, barrels: 3, color, size: 1.04, seed: 4 });
  }
};

const drawFront: HullDrawer["drawFront"] = (ctx, ship, _l, frame) => {
  const p = ship.palette;
  paintHull(ctx, ship, outline, {
    fill: p.hull,
    low: p.hullDark,
    lowFrom: 66,
    stripes: [[10, 17, p.trim], [58, 62, p.trim]],
    inner: () => {
      plating(ctx, p.hull, -450, 470, 18, 58, 84);
      band(ctx, -520, -6, 520, -1, shade(p.trim, -0.2));
    },
  });
  for (let x = -420; x < 420; x += 60) porthole(ctx, x, 37, 6.5, ship, frame, { rim: p.trim, seed: x, bolts: false });
  hawseAnchor(ctx, 452, 22, "#20262E");
  stanchions(ctx, DECK.from + 8, DECK.to - 8, -3, p.trim, 22, 40);
};

export const dreadnought: HullDrawer = { layout, drawBack, drawDeck, drawFront };
