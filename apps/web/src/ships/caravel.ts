// Caravel: a small, chubby two-master with a raised stern castle and a short
// forecastle. The Woolly Wanderer (cream, wool-trimmed, lawn deck) and the
// Merfolk Coral Caravel (coral pink, glowing coral rails, deck orchard).

import type { ShipDefinition } from "@ship/shared-types";
import { alpha, circlePath, ellipsePath, mix, outlineFor, paint, rng, hashString, shade, sway } from "../ship-engine/draw.js";
import type { Ctx, FrameInfo } from "../ship-engine/types.js";
import { lantern } from "./parts/extras.js";
import { arrange, band, cabinWindow, glow, isNight, mastAt, rigColors } from "./kit.js";
import type { Arranged } from "./kit.js";
import { capRail, drawBowspritSpar, drawDecks, drawFarBulwarks, drawRaisedRails, drawRig, hullPath, paintHull, steppedTop, sternPost } from "./hullKit.js";
import type { HullDrawer, HullLayout } from "./types.js";

const CASTLE = { from: -490, to: -322, y: -66 };
const WAIST = { from: -318, to: 328 };
const FORE = { from: 334, to: 462, y: -40 };
const STEM = { x: 488, y: -74 };
const BOWSPRIT = { from: { x: 440, y: -52 }, to: { x: 570, y: -134 } };

function stations(ship: ShipDefinition): Arranged {
  const coral = ship.id === "merfolk-coral-caravel";
  const orchard = ship.extras.includes("citrus-trees");
  return arrange([
    { ...CASTLE, items: ["helm", "tree"] },
    { ...WAIST, y: 0, items: coral ? ["desk", "orchard", "table", "table"] : ["desk", "table", "table", "table"] },
    { ...FORE, items: orchard ? ["orchard"] : ["table"] },
  ]);
}

function layout(ship: ShipDefinition): HullLayout {
  const s = stations(ship);
  const mainX = ship.id === "merfolk-coral-caravel" ? s.orchard[0].x : s.tables[0].x;
  const foreX = s.tables[s.tables.length - 1].x;
  const masts = [mastAt(mainX, 0, -560), mastAt(foreX, 0, -478)];
  const bell = { x: s.helm.x + 4, y: CASTLE.y - 206 };
  return {
    deck: { from: WAIST.from, to: WAIST.to },
    waterline: 104,
    keel: 168,
    masts,
    bow: { x: 486, y: -34, angle: -0.42 },
    flag: { x: masts[0].x, y: masts[0].top },
    helm: s.helm,
    citrusTree: s.citrusTree,
    bell,
    desk: s.desk,
    tables: s.tables,
    smoke: [],
    orchard: s.orchard,
    surfaces: s.surfaces,
    bounds: { left: -560, top: -566, right: 610, bottom: 170 },
  };
}

const outline = (c: Ctx) =>
  hullPath(c, steppedTop({ stern: { x: -512, y: -92 }, castle: { to: CASTLE.to, y: CASTLE.y }, waist: -4, fore: { from: FORE.from, y: FORE.y }, stem: STEM }), (cc) => {
    cc.bezierCurveTo(514, -14, 500, 76, 436, 124);
    cc.bezierCurveTo(340, 170, 90, 172, -150, 168);
    cc.bezierCurveTo(-360, 166, -458, 140, -482, 84);
    cc.bezierCurveTo(-500, 40, -520, -30, -512, -92);
  });

function look(ship: ShipDefinition) {
  const coral = ship.id === "merfolk-coral-caravel";
  return {
    coral,
    rail: coral ? ship.palette.trim : ship.palette.trim,
    bulwark: coral ? shade(ship.palette.hull, -0.12) : mix(ship.palette.hull, ship.palette.trim, 0.25),
    raisedDeck: coral ? undefined : shade(ship.palette.deck, -0.04),
  };
}

const drawBack: HullDrawer["drawBack"] = (ctx, ship, l, frame) => {
  const L = look(ship);
  const colors = rigColors(ship);
  drawFarBulwarks(ctx, l.surfaces ?? [], L.bulwark, L.coral ? ship.palette.trim : ship.palette.trim);
  const post = sternPost(ctx, CASTLE.from + 6, CASTLE.y - 20, CASTLE.y - 236, l.bell, colors.wood, colors.iron);
  if (ship.extras.includes("lanterns")) lantern(ctx, post.x, post.y - 4, ship, frame, { hang: 0, size: 1.1, seed: 3 });
  drawBowspritSpar(ctx, BOWSPRIT.from, BOWSPRIT.to, colors.wood, colors.iron);
  drawRig(ctx, ship, l, { mast: { wood: colors.wood, iron: colors.iron }, bowsprit: BOWSPRIT });
  if (ship.extras.includes("lanterns")) {
    const fore = l.masts[1];
    lantern(ctx, (fore.x + BOWSPRIT.to.x) / 2 + 6, (fore.top + 30 + BOWSPRIT.to.y) / 2 + 12, ship, frame, { hang: 10, size: 0.9, seed: 7 });
  }
};

const drawDeck: HullDrawer["drawDeck"] = (ctx, ship, l) => {
  const colors = rigColors(ship);
  drawDecks(ctx, ship, l, l.surfaces ?? [], { wood: colors.wood, iron: colors.iron }, look(ship).raisedDeck);
};

const drawFront: HullDrawer["drawFront"] = (ctx, ship, l, frame) => {
  const L = look(ship);
  const p = ship.palette;
  paintHull(ctx, ship, outline, {
    fill: p.hull,
    low: p.hullDark,
    lowFrom: 76,
    planks: L.coral ? undefined : { spacing: 16 },
    stripes: [[22, 33, p.trim]],
    inner: () => {
      if (L.coral) coralSkin(ctx, ship, frame);
      // A painted band along the castle's side.
      band(ctx, -520, CASTLE.y + 6, CASTLE.to, CASTLE.y + 12, alpha(p.accent, 0.85));
    },
  });
  // Stern cabin windows: the Captain's Quarters.
  [-460, -412, -364].forEach((x, k) => cabinWindow(ctx, x, CASTLE.y + 20, 26, 30, L.coral ? p.trim : p.accent, ship, frame, k));
  scroll(ctx, -500, -84, 13, L.coral ? p.trim : p.accent, -1);
  scroll(ctx, STEM.x - 6, STEM.y + 10, 11, L.coral ? p.trim : p.accent, 1);
  capRail(ctx, CASTLE.from - 8, CASTLE.to + 2, CASTLE.y, p.trim);
  capRail(ctx, CASTLE.to - 2, FORE.from + 2, -4, p.trim);
  capRail(ctx, FORE.from - 2, STEM.x - 18, FORE.y, p.trim);
  if (L.coral) coralRails(ctx, ship, l, frame);
  else drawRaisedRails(ctx, l.surfaces ?? [], p.trim, 24, 24);
  if (ship.id === "woolly-wanderer") woolTrim(ctx, ship);
  if (ship.extras.includes("lanterns")) lantern(ctx, FORE.to - 6, FORE.y - 34, ship, frame, { hang: 0, size: 0.9, seed: 11 });
};

/** A fleecy wool trim along the waist: the Woolly Wanderer's signature. */
function woolTrim(ctx: Ctx, ship: ShipDefinition): void {
  const wool = "#FFFDF5";
  const r = rng(hashString(ship.id));
  const puffs: [number, number, number][] = [];
  for (let x = WAIST.from + 6; x < FORE.from - 6; x += 13 + r() * 6) puffs.push([x, 9 + (r() - 0.5) * 6, 9 + r() * 5]);
  // Outline every puff first, then fill them all: they merge into one fleece.
  ctx.beginPath();
  for (const [x, y, rr] of puffs) circlePath(ctx, x, y, rr);
  ctx.lineWidth = 5;
  ctx.strokeStyle = outlineFor(ship.palette.hullDark);
  ctx.stroke();
  ctx.fillStyle = wool;
  ctx.fill();
  ctx.fillStyle = shade(wool, -0.07);
  for (const [x, y, rr] of puffs) {
    ctx.beginPath();
    ellipsePath(ctx, x + rr * 0.15, y + rr * 0.45, rr * 0.75, rr * 0.4);
    ctx.fill();
  }
  ctx.fillStyle = "#FFFFFF";
  for (const [x, y, rr] of puffs) {
    ctx.beginPath();
    circlePath(ctx, x - rr * 0.3, y - rr * 0.35, rr * 0.28);
    ctx.fill();
  }
}

/** A carved spiral scroll, the cartoon flourish at stern and stem. */
function scroll(ctx: Ctx, x: number, y: number, r: number, color: string, dir: 1 | -1): void {
  const path = (c: Ctx) => {
    for (let k = 0; k <= 28; k++) {
      const a = (k / 28) * Math.PI * 3.2;
      const rr = r * (1 - k / 34);
      const px = x + dir * Math.cos(a) * rr;
      const py = y - Math.sin(a) * rr;
      if (k === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
  };
  ctx.beginPath();
  path(ctx);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = outlineFor(color);
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.beginPath();
  path(ctx);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.stroke();
}

/** Bioluminescent freckles and scalloped scales on the coral hull. */
function coralSkin(ctx: Ctx, ship: ShipDefinition, frame: FrameInfo): void {
  const r = rng(hashString(ship.id) + 5);
  ctx.strokeStyle = alpha(shade(ship.palette.hull, -0.3), 0.4);
  ctx.lineWidth = 1.6;
  for (let row = 0; row < 3; row++) {
    ctx.beginPath();
    for (let x = -500 + row * 12; x < 500; x += 24) {
      const y = 34 + row * 10;
      ctx.moveTo(x - 12, y);
      ctx.quadraticCurveTo(x, y + 9, x + 12, y);
    }
    ctx.stroke();
  }
  const glowC = ship.palette.glow ?? ship.palette.trim;
  for (let k = 0; k < 26; k++) {
    const x = -480 + r() * 940;
    const y = -40 + r() * 90;
    const tw = 0.6 + 0.4 * sway(frame.t, 1.4, k, frame.reducedMotion);
    ctx.beginPath();
    circlePath(ctx, x, y, 2 + r() * 2);
    ctx.fillStyle = alpha(mix(glowC, "#FFFFFF", 0.3), 0.55 + 0.35 * tw);
    ctx.fill();
  }
}

/** Branching coral posts instead of balusters, their tips glowing. */
function coralRails(ctx: Ctx, ship: ShipDefinition, l: HullLayout, frame: FrameInfo): void {
  const coral = ship.palette.accent;
  const tip = ship.palette.glow ?? ship.palette.trim;
  const night = isNight(ship);
  for (const s of l.surfaces ?? []) {
    if (s.y > -1) continue;
    const r = rng(hashString(ship.id) + Math.round(s.from));
    for (let x = s.from + 14; x < s.to - 6; x += 34 + r() * 10) {
      const h = 22 + r() * 12;
      const lean = (r() - 0.5) * 10;
      ctx.lineCap = "round";
      const branch = (w: number, color: string) => {
        ctx.beginPath();
        ctx.moveTo(x, s.y);
        ctx.quadraticCurveTo(x + lean * 0.3, s.y - h * 0.6, x + lean, s.y - h);
        ctx.moveTo(x + lean * 0.2, s.y - h * 0.45);
        ctx.quadraticCurveTo(x - 9, s.y - h * 0.6, x - 10, s.y - h * 0.85);
        ctx.moveTo(x + lean * 0.3, s.y - h * 0.55);
        ctx.quadraticCurveTo(x + 10, s.y - h * 0.65, x + 11, s.y - h * 0.95);
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.stroke();
      };
      branch(8, outlineFor(coral));
      branch(4.5, coral);
      const tw = 0.7 + 0.3 * sway(frame.t, 1.7, x, frame.reducedMotion);
      for (const [tx, ty] of [
        [x + lean, s.y - h],
        [x - 10, s.y - h * 0.85],
        [x + 11, s.y - h * 0.95],
      ]) {
        ctx.beginPath();
        ellipsePath(ctx, tx, ty, 3, 3);
        ctx.fillStyle = mix(tip, "#FFFFFF", 0.3 * tw);
        ctx.fill();
      }
      if (night) glow(ctx, x, s.y - h, 26, tip, 0.5 * tw);
    }
  }
  void l;
}

export const caravel: HullDrawer = { layout, drawBack, drawDeck, drawFront };
