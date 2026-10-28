// Carrier barge: the Kaiju Behemoth Carrier. A patched-together scrap barge
// with a flight deck, hazard-striped edges, a little island tower with a
// crane (the bell hangs from it) and one mast of tattered canvas. A friendly
// neon leviathan swims alongside.

import type { ShipDefinition } from "@ship/shared-types";
import { INK, alpha, circlePath, hashString, line, mix, outlineFor, paint, rng, roundRectPath, shade, sway } from "../ship-engine/draw.js";
import type { Ctx } from "../ship-engine/types.js";
import { leviathan } from "./parts/leviathan.js";
import { arrange, band, bellBracket, drawDeckBand, drawMastFoot, drawMastPole, drawShrouds, glow, isNight, mastAt, paintIn, rigColors } from "./kit.js";
import { hullPath, paintHull } from "./hullKit.js";
import { deckhouse, plating } from "./warship.js";
import type { HullDrawer, HullLayout } from "./types.js";

const DECK = { from: -480, to: 480 };
const ISLAND = { from: -262, to: -128, top: -252 };

function layout(ship: ShipDefinition): HullLayout {
  void ship;
  const s = arrange([{ from: -476, to: 476, y: 0, items: ["helm", "tree", "desk", "table", "table", "table", "table"] }]);
  const mastX = s.tables[1].x;
  return {
    deck: DECK,
    waterline: 92,
    keel: 150,
    masts: [mastAt(mastX, 0, -548)],
    bow: { x: 476, y: 18, angle: -0.3 },
    flag: { x: mastX, y: -548 },
    helm: s.helm,
    citrusTree: s.citrusTree,
    bell: { x: s.helm.x + 4, y: -206 },
    desk: s.desk,
    tables: s.tables,
    smoke: [],
    orchard: [],
    surfaces: [{ ...DECK, y: 0 }],
    bounds: { left: -630, top: -554, right: 660, bottom: 155 },
  };
}

const outline = (c: Ctx) =>
  hullPath(
    c,
    [
      { x: -470, y: 40 },
      { x: -488, y: -4, r: 6 },
      { x: 488, y: -4, r: 6 },
      { x: 470, y: 30 },
    ],
    (cc) => {
      cc.lineTo(436, 126);
      cc.lineTo(-430, 128);
      cc.lineTo(-470, 40);
    },
  );

const drawBack: HullDrawer["drawBack"] = (ctx, ship, l, frame) => {
  const p = ship.palette;
  const colors = rigColors(ship);
  // Island tower with a crane reaching aft over the helm.
  deckhouse(ctx, ship, ISLAND.from, ISLAND.to, ISLAND.top, -24, shade(p.hull, 0.06), frame, { windows: { y: ISLAND.top + 18, h: 20, frame: p.hullDark }, roof: p.trim, rivets: true });
  const antennaX = ISLAND.to - 22;
  line(ctx, [{ x: antennaX, y: ISLAND.top - 8 }, { x: antennaX, y: ISLAND.top - 90 }], outlineFor(p.trim), 6);
  line(ctx, [{ x: antennaX, y: ISLAND.top - 8 }, { x: antennaX, y: ISLAND.top - 90 }], shade(p.hull, 0.3), 3);
  const blink = 0.5 + 0.5 * sway(frame.t, 2.4, 0, frame.reducedMotion);
  paint(ctx, (c) => circlePath(c, antennaX, ISLAND.top - 92, 5), mix(p.glow ?? p.accent, "#FFFFFF", 0.3 * blink), { width: 2 });
  if (isNight(ship)) glow(ctx, antennaX, ISLAND.top - 92, 34, p.glow ?? p.accent, 0.8 * blink);
  crane(ctx, ship, l);
  drawShrouds(ctx, ship, l, 0, colors.rope);
  drawMastPole(ctx, ship, l, 0, { wood: colors.wood, iron: colors.iron, nestColor: shade(p.hull, 0.1) });
};

function crane(ctx: Ctx, ship: ShipDefinition, l: HullLayout): void {
  const p = ship.palette;
  const root = { x: ISLAND.from + 10, y: ISLAND.top + 30 };
  const tip = { x: l.bell.x - 10, y: l.bell.y - 10 };
  // A lattice boom.
  const a = Math.atan2(tip.y - root.y, tip.x - root.x);
  const len = Math.hypot(tip.x - root.x, tip.y - root.y);
  ctx.save();
  ctx.translate(root.x, root.y);
  ctx.rotate(a);
  paint(ctx, (c) => roundRectPath(c, 0, -7, len + 14, 14, 3), alpha(p.trim, 0), { stroke: outlineFor(p.trim), width: 9 });
  paint(ctx, (c) => roundRectPath(c, 0, -7, len + 14, 14, 3), alpha(p.trim, 0), { stroke: p.trim, width: 4 });
  ctx.beginPath();
  for (let x = 0; x < len; x += 18) {
    ctx.moveTo(x, -7);
    ctx.lineTo(x + 18, 7);
  }
  ctx.strokeStyle = shade(p.trim, -0.3);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  bellBracket(ctx, { x: tip.x + 6, y: l.bell.y - 9 }, l.bell, shade(p.trim, -0.1), p.hullDark);
}

const drawDeck: HullDrawer["drawDeck"] = (ctx, ship, l) => {
  const colors = rigColors(ship);
  drawDeckBand(ctx, ship, { ...DECK, y: 0 });
  if (ship.extras.includes("flight-deck")) flightMarkings(ctx, ship);
  drawMastFoot(ctx, l.masts[0], { wood: colors.wood, iron: colors.iron });
};

const drawFront: HullDrawer["drawFront"] = (ctx, ship, l, frame) => {
  const p = ship.palette;
  paintHull(ctx, ship, outline, {
    fill: p.hull,
    low: p.hullDark,
    lowFrom: 76,
    inner: () => scrapPlates(ctx, ship),
  });
  hazardEdge(ctx, ship);
  if (ship.extras.includes("leviathan")) {
    leviathan(ctx, ship, { waterline: l.waterline, humps: [-330, -110, 110], neckBase: { x: 474, y: 104 }, head: { x: 586, y: -96 }, tail: { x: -540, y: 80 } }, frame);
  }
};

/** Mismatched steel patches with rust streaks, welded seams and rivets. */
function scrapPlates(ctx: Ctx, ship: ShipDefinition): void {
  const p = ship.palette;
  const r = rng(hashString(ship.id));
  for (let x = -500; x < 500; ) {
    const w = 60 + r() * 70;
    for (let y = 0; y < 140; ) {
      const h = 30 + r() * 30;
      const tint = r();
      const fill = tint < 0.25 ? shade(p.hull, 0.12) : tint < 0.45 ? shade(p.hull, -0.08) : tint < 0.55 ? mix(p.hull, "#8A5A3A", 0.35) : p.hull;
      paint(ctx, (c) => roundRectPath(c, x + 2, y + 2, w - 4, h - 4, 3), fill, { stroke: alpha(INK, 0.35), width: 1.6 });
      if (r() < 0.35) {
        ctx.fillStyle = alpha("#A0522D", 0.4);
        ctx.fillRect(x + 6 + r() * (w - 16), y + 4, 4, h * 0.6);
      }
      y += h;
    }
    x += w;
  }
  plating(ctx, p.hull, -460, 460, 6, 70, 115);
}

function hazardEdge(ctx: Ctx, ship: ShipDefinition): void {
  const p = ship.palette;
  paintIn(
    ctx,
    (c) => roundRectPath(c, DECK.from - 8, -6, DECK.to - DECK.from + 16, 14, 4),
    p.trim,
    () => {
      ctx.fillStyle = "#2A2A2E";
      for (let x = DECK.from - 20; x < DECK.to + 20; x += 24) {
        ctx.beginPath();
        ctx.moveTo(x, 8);
        ctx.lineTo(x + 10, -6);
        ctx.lineTo(x + 20, -6);
        ctx.lineTo(x + 10, 8);
        ctx.closePath();
        ctx.fill();
      }
    },
    { width: 3 },
  );
}

/** Faded runway paint: a dashed centerline and chevrons at the bow. */
function flightMarkings(ctx: Ctx, ship: ShipDefinition): void {
  const paintC = alpha("#F2E8C8", 0.7);
  ctx.save();
  ctx.beginPath();
  roundRectPath(ctx, DECK.from, -24, DECK.to - DECK.from, 24, 5);
  ctx.clip();
  ctx.fillStyle = paintC;
  for (let x = DECK.from + 20; x < DECK.to - 80; x += 46) ctx.fillRect(x, -13.5, 26, 3);
  ctx.strokeStyle = alpha(ship.palette.trim, 0.85);
  ctx.lineWidth = 3;
  for (let k = 0; k < 3; k++) {
    const x = DECK.to - 70 + k * 16;
    ctx.beginPath();
    ctx.moveTo(x, -22);
    ctx.lineTo(x + 10, -12);
    ctx.lineTo(x, -2);
    ctx.stroke();
  }
  ctx.fillStyle = alpha(ship.palette.trim, 0.5);
  ctx.fillRect(DECK.from + 4, -22, 6, 20);
  ctx.fillRect(DECK.from + 14, -22, 6, 20);
  ctx.restore();
}

export const carrierBarge: HullDrawer = { layout, drawBack, drawDeck, drawFront };
