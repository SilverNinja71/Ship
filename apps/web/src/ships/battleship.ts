// Battleship: the Admiralty Battleship. A long, crisp white-and-navy steel
// ship with a red boot-topping, twin-gun turrets fore and aft, a raked funnel,
// a bridge with a wing for the bell, and a signal mast with a turning radar.

import type { ShipDefinition } from "@ship/shared-types";
import { alpha, circlePath, shade } from "../ship-engine/draw.js";
import type { Ctx } from "../ship-engine/types.js";
import { smokestack, turret } from "./parts/extras.js";
import { arrange, band, bellBracket, drawDeckBand, paintIn } from "./kit.js";
import { hullPath, paintHull } from "./hullKit.js";
import { deckhouse, hawseAnchor, plating, signalMast, stanchions } from "./warship.js";
import type { HullDrawer, HullLayout } from "./types.js";

const DECK = { from: -470, to: 474 };
const STATIONS = { from: -378, to: 378 };
const MAST_X = -52;
const BRIDGE = { from: -150, to: 20, top: -252 };
const FUNNEL_X = -300;

function layout(ship: ShipDefinition): HullLayout {
  void ship;
  const s = arrange([{ ...STATIONS, y: 0, items: ["tree", "helm", "desk", "table", "table", "table"] }]);
  return {
    deck: DECK,
    waterline: 100,
    keel: 160,
    masts: [{ x: MAST_X, base: BRIDGE.top - 10, top: -520 }],
    bow: { x: 492, y: 6, angle: -0.2 },
    flag: { x: MAST_X, y: -520 },
    helm: s.helm,
    citrusTree: s.citrusTree,
    bell: { x: s.helm.x + 4, y: -206 },
    desk: s.desk,
    tables: s.tables,
    smoke: [{ x: Math.round(FUNNEL_X - 326 * 0.06), y: -356 }],
    orchard: [],
    surfaces: [{ ...DECK, y: 0 }],
    bounds: { left: -560, top: -526, right: 560, bottom: 165 },
  };
}

const outline = (c: Ctx) =>
  hullPath(
    c,
    [
      { x: -486, y: 30 },
      { x: -478, y: -4, r: 14 },
      { x: 480, y: -4, r: 4 },
      { x: 506, y: -16 },
    ],
    (cc) => {
      cc.bezierCurveTo(496, 40, 474, 100, 446, 150);
      cc.bezierCurveTo(300, 164, -260, 164, -420, 150);
      cc.bezierCurveTo(-480, 120, -500, 70, -486, 30);
    },
  );

const drawBack: HullDrawer["drawBack"] = (ctx, ship, l, frame) => {
  const p = ship.palette;
  const navy = p.hullDark;
  const steel = shade(p.hull, -0.06);
  smokestack(ctx, FUNNEL_X, -24, -350, 74, { body: navy, band: p.accent, cap: "#2A2F36" }, 0.06);
  deckhouse(ctx, ship, -230, 70, -150, -24, steel, frame, { rivets: true });
  deckhouse(ctx, ship, BRIDGE.from, BRIDGE.to, BRIDGE.top, -148, p.hull, frame, { windows: { y: BRIDGE.top + 22, h: 22, frame: navy }, roof: navy });
  signalMast(ctx, MAST_X, BRIDGE.top - 10, -520, frame, { color: navy, yard: -418, radar: -366, pennants: true });
  // Bridge wing reaching aft over the helm; the bell hangs under it.
  paintIn(ctx, (c) => c.rect(l.bell.x - 16, l.bell.y - 22, BRIDGE.from - (l.bell.x - 16), 10), navy, () => band(ctx, l.bell.x - 16, l.bell.y - 16, BRIDGE.from, l.bell.y - 12, alpha("#000000", 0.2)), { width: 3 });
  bellBracket(ctx, { x: l.bell.x + 12, y: l.bell.y - 12 }, l.bell, navy, p.accent);
};

const drawDeck: HullDrawer["drawDeck"] = (ctx, ship, l, frame) => {
  drawDeckBand(ctx, ship, { ...DECK, y: 0 });
  if (ship.extras.includes("turrets")) {
    turret(ctx, -430, 0, ship, frame, { facing: -1, barrels: 2, color: shade(ship.palette.deck, 0.1), seed: 1 });
    turret(ctx, 430, 0, ship, frame, { facing: 1, barrels: 2, color: shade(ship.palette.deck, 0.1), seed: 2 });
  }
  void l;
};

const drawFront: HullDrawer["drawFront"] = (ctx, ship, l, frame) => {
  const p = ship.palette;
  void frame;
  paintHull(ctx, ship, outline, {
    fill: p.hull,
    low: p.hullDark,
    lowFrom: 54,
    stripes: [[86, 100, p.accent]],
    inner: () => {
      if (ship.extras.includes("rivets")) plating(ctx, p.hull, -440, 460, -4, 54, 92);
      for (let x = -400; x < 420; x += 46) {
        ctx.beginPath();
        circlePath(ctx, x, 22, 4.5);
        ctx.fillStyle = shade(p.hullDark, -0.2);
        ctx.fill();
      }
      band(ctx, -520, -6, 520, -1, p.hullDark);
    },
  });
  hawseAnchor(ctx, 440, 20, "#2A2F36");
  stanchions(ctx, DECK.from + 8, DECK.to - 6, -3, p.hullDark, 22, 40);
  void l;
};

export const battleship: HullDrawer = { layout, drawBack, drawDeck, drawFront };
