// Galleon: a big three-master with a tall stern castle, stern gallery and
// forecastle. Three looks from one hull:
// - Crimson Corsair (buccaneer): deep red, gold filigree, one row of cannons.
// - Ironwood War Galleon (navy): dark oak, two gun decks in ochre bands.
// - Alebrijes Spirit Galleon (mythic): violet, neon folk-art patterns,
//   marigold garlands, paper lanterns and a copal censer.

import type { ShipDefinition } from "@ship/shared-types";
import { INK, alpha, circlePath, ellipsePath, hashString, line, mix, outlineFor, paint, rng, roundRectPath, shade, sway } from "../ship-engine/draw.js";
import type { Ctx, FrameInfo, Point } from "../ship-engine/types.js";
import { gunPort, lantern } from "./parts/extras.js";
import { arrange, band, bellBracket, cabinWindow, glow, isNight, mastAt, rigColors, stay } from "./kit.js";
import { capRail, drawBowspritSpar, drawDecks, drawFarBulwarks, drawRaisedRails, drawRig, hullPath, paintHull, steppedTop } from "./hullKit.js";
import type { HullDrawer, HullLayout } from "./types.js";

const POOP = { from: -494, to: -300, y: -74 };
const WAIST = { from: -296, to: 334 };
const FORE = { from: 338, to: 478, y: -46 };
const STEM = { x: 500, y: -80 };
const BOWSPRIT = { from: { x: 456, y: -60 }, to: { x: 612, y: -150 } };

type Look = "corsair" | "navy" | "spirit";
const lookOf = (ship: ShipDefinition): Look => (ship.category === "navy" ? "navy" : ship.category === "mythic" ? "spirit" : "corsair");

function layout(ship: ShipDefinition): HullLayout {
  const s = arrange([
    { ...POOP, items: ["helm", "tree"] },
    { ...WAIST, y: 0, items: ["desk", "table", "table", "table"] },
    { ...FORE, items: ["table"] },
  ]);
  const masts = [mastAt(s.citrusTree.x, POOP.y, -476), mastAt(s.tables[0].x, 0, -560), mastAt(s.tables[2].x, 0, -512)];
  const spirit = lookOf(ship) === "spirit";
  return {
    deck: { from: WAIST.from, to: WAIST.to },
    waterline: 110,
    keel: 172,
    masts,
    bow: { x: 500, y: -44, angle: -0.4 },
    flag: { x: masts[1].x, y: masts[1].top },
    helm: s.helm,
    citrusTree: s.citrusTree,
    bell: { x: s.helm.x + 4, y: POOP.y - 204 },
    desk: s.desk,
    tables: s.tables,
    // The Alebrijes burns copal in a censer on the stern.
    smoke: spirit ? [{ x: POOP.from - 4, y: POOP.y - 112 }] : [],
    orchard: [],
    surfaces: s.surfaces,
    bounds: { left: -560, top: -566, right: 650, bottom: 175 },
  };
}

const outline = (c: Ctx) =>
  hullPath(c, steppedTop({ stern: { x: -520, y: -104 }, castle: { to: POOP.to, y: POOP.y }, waist: -4, fore: { from: FORE.from, y: FORE.y }, stem: STEM }), (cc) => {
    cc.bezierCurveTo(526, -10, 512, 64, 452, 112);
    cc.bezierCurveTo(360, 170, 120, 174, -150, 172);
    cc.bezierCurveTo(-380, 170, -470, 140, -494, 86);
    cc.bezierCurveTo(-512, 40, -528, -40, -520, -104);
  });

const drawBack: HullDrawer["drawBack"] = (ctx, ship, l, frame) => {
  const colors = rigColors(ship);
  const look = lookOf(ship);
  const bulwark = look === "spirit" ? shade(ship.palette.hull, 0.12) : mix(ship.palette.hull, ship.palette.trim, look === "navy" ? 0.15 : 0.1);
  drawFarBulwarks(ctx, l.surfaces ?? [], bulwark, look === "navy" ? ship.palette.trim : ship.palette.trim, 18);
  drawBowspritSpar(ctx, BOWSPRIT.from, BOWSPRIT.to, colors.wood, colors.iron);
  drawRig(ctx, ship, l, { mast: { wood: colors.wood, iron: colors.iron }, bowsprit: BOWSPRIT });
  // The bell hangs off the mizzen on an arm over the helm.
  bellBracket(ctx, { x: l.masts[0].x, y: l.bell.y - 9 }, l.bell, colors.wood, colors.iron);
  if (look === "spirit") {
    paperLanternString(ctx, ship, l, frame);
  } else if (ship.extras.includes("lanterns")) {
    const fore = l.masts[2];
    lantern(ctx, (fore.x + BOWSPRIT.to.x) / 2 + 12, (fore.top + 30 + BOWSPRIT.to.y) / 2 + 18, ship, frame, { hang: 10, seed: 4 });
  }
};

const drawDeck: HullDrawer["drawDeck"] = (ctx, ship, l, frame) => {
  const colors = rigColors(ship);
  drawDecks(ctx, ship, l, l.surfaces ?? [], { wood: colors.wood, iron: colors.iron });
  if (lookOf(ship) === "spirit" && l.smoke[0]) censer(ctx, ship, l.smoke[0], frame);
};

const drawFront: HullDrawer["drawFront"] = (ctx, ship, l, frame) => {
  const p = ship.palette;
  const look = lookOf(ship);
  const gold = p.trim;
  const stripes: [number, number, string][] =
    look === "navy" ? [[8, 34, "#C9A44A"], [50, 76, "#C9A44A"]] : look === "corsair" ? [[24, 30, gold], [64, 70, gold]] : [[18, 26, p.trim]];
  paintHull(ctx, ship, outline, {
    fill: p.hull,
    low: p.hullDark,
    lowFrom: look === "navy" ? 86 : 80,
    planks: { spacing: 17, color: alpha(shade(p.hull, look === "spirit" ? 0.3 : -0.5), 0.3) },
    stripes,
    inner: () => {
      if (look === "spirit") folkArt(ctx, ship, frame);
      if (look === "corsair") filigree(ctx, gold);
      // Stern gallery panel.
      band(ctx, -540, POOP.y + 8, POOP.to, POOP.y + 60, alpha(look === "navy" ? p.accent : look === "spirit" ? "#160C33" : INK, look === "corsair" ? 0.22 : 0.55));
    },
  });
  // Stern gallery windows: the Captain's Quarters.
  const winFrame = look === "spirit" ? p.accent : gold;
  [-462, -416, -370, -324].forEach((x, k) => cabinWindow(ctx, x, POOP.y + 16, 28, 34, winFrame, ship, frame, k));
  // Gun ports.
  if (ship.extras.includes("cannons")) {
    const rows = look === "navy" ? [21, 63] : [47];
    for (const y of rows) {
      for (let x = -262; x <= 300; x += 70) gunPort(ctx, x + (y === 63 ? 35 : 0), y, ship, { size: 0.95, frameColor: look === "navy" ? "#7A5A22" : shade(gold, -0.1), lid: look === "corsair" ? p.hullDark : shade(p.hull, -0.2) });
    }
  }
  capRail(ctx, POOP.from - 14, POOP.to + 2, POOP.y, look === "spirit" ? p.trim : gold);
  capRail(ctx, POOP.to - 2, FORE.from + 2, -4, look === "spirit" ? p.trim : gold);
  capRail(ctx, FORE.from - 2, STEM.x - 18, FORE.y, look === "spirit" ? p.trim : gold);
  drawRaisedRails(ctx, l.surfaces ?? [], look === "spirit" ? p.trim : shade(gold, -0.1), 26, 24);
  if (look === "spirit") marigoldGarland(ctx, ship, frame);
  // Three great stern lanterns on the taffrail.
  if (ship.extras.includes("lanterns") && look !== "spirit") {
    paint(ctx, (c) => roundRectPath(c, -514, -122, 10, 26, 3), shade(gold, -0.2), { width: 2.6 });
    lantern(ctx, -509, -158, ship, frame, { hang: 0, size: 1.25, seed: 1 });
  }
};

/** Gold scrollwork along the Corsair's upper strake. */
function filigree(ctx: Ctx, gold: string): void {
  ctx.strokeStyle = gold;
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let x = -280; x < 440; x += 44) {
    ctx.moveTo(x - 18, 12);
    ctx.bezierCurveTo(x - 8, 2, x + 8, 2, x + 10, 10);
    ctx.bezierCurveTo(x + 12, 16, x + 4, 18, x + 2, 13);
  }
  ctx.stroke();
}

const NEON = ["#FF4FA3", "#3DF2C2", "#FFB84D", "#FFE25C", "#A98BFF"];

/** Alebrije patterns: dot rows, zigzags and little flowers in neon on violet. */
function folkArt(ctx: Ctx, ship: ShipDefinition, frame: FrameInfo): void {
  const r = rng(hashString(ship.id));
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Zigzag band.
  ctx.beginPath();
  for (let x = -520; x <= 520; x += 16) ctx.lineTo(x, 40 + ((x / 16) % 2 === 0 ? -7 : 7));
  ctx.strokeStyle = NEON[0];
  ctx.lineWidth = 3.2;
  ctx.stroke();
  // Dot rows.
  for (let x = -520; x <= 520; x += 14) {
    ctx.beginPath();
    circlePath(ctx, x, 56, 2.6);
    ctx.fillStyle = NEON[1];
    ctx.fill();
    ctx.beginPath();
    circlePath(ctx, x + 7, 9, 2);
    ctx.fillStyle = NEON[2];
    ctx.fill();
  }
  // Flowers.
  for (let x = -250; x < 440; x += 92 + r() * 30) {
    const y = 74 + r() * 6;
    const color = NEON[Math.floor(r() * NEON.length)];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      ctx.beginPath();
      ellipsePath(ctx, x + Math.cos(a) * 6, y + Math.sin(a) * 6, 5, 3, a);
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.beginPath();
    circlePath(ctx, x, y, 3);
    ctx.fillStyle = NEON[3];
    ctx.fill();
  }
  if (isNight(ship)) {
    const pulse = 0.7 + 0.3 * sway(frame.t, 1.2, 0, frame.reducedMotion);
    for (let x = -360; x < 460; x += 160) glow(ctx, x, 40, 60, NEON[0], 0.25 * pulse);
  }
}

/** Orange marigold garlands swagged along the waist rail. */
function marigoldGarland(ctx: Ctx, ship: ShipDefinition, frame: FrameInfo): void {
  const swags: [number, number, number][] = [
    [POOP.from, POOP.to, POOP.y + 2],
    [POOP.to, FORE.from, 0],
    [FORE.from, FORE.to, FORE.y + 2],
  ];
  const sag = 12;
  const r = rng(hashString(ship.id) + 1);
  for (const [a, b, y] of swags) {
    const n = Math.max(1, Math.round((b - a) / 90));
    for (let k = 0; k < n; k++) {
      const x0 = a + ((b - a) * k) / n;
      const x1 = a + ((b - a) * (k + 1)) / n;
      for (let t = 0; t <= 1.001; t += 1 / 9) {
        const x = x0 + (x1 - x0) * t;
        const yy = y + 6 + sag * 4 * t * (1 - t) + 1.5 * sway(frame.t, 1.3, x * 0.03, frame.reducedMotion);
        paint(ctx, (c) => circlePath(c, x, yy, 4.6 + r() * 1.5), r() < 0.7 ? "#FF8A1F" : "#FFC94A", { width: 1.6 });
      }
    }
  }
}

/** Paper lanterns strung along the stays, glowing in the marigold night. */
function paperLanternString(ctx: Ctx, ship: ShipDefinition, l: HullLayout, frame: FrameInfo): void {
  const colors = ["#FF7AC6", "#FFB84D", "#3DF2C2", "#FFE25C"];
  const runs: [Point, Point][] = [
    [{ x: POOP.from + 6, y: POOP.y - 150 }, { x: l.masts[0].x, y: l.masts[0].top + 150 }],
    [{ x: l.masts[2].x, y: l.masts[2].top + 120 }, { x: BOWSPRIT.to.x - 30, y: BOWSPRIT.to.y + 14 }],
  ];
  let k = 0;
  for (const [a, b] of runs) {
    stay(ctx, a, b, "#2B1840", 26, 1.8);
    for (let t = 0.2; t < 0.95; t += 0.25) {
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t + 26 * 2 * t * (1 - t);
      lantern(ctx, x, y, ship, frame, { hang: 6, size: 0.8, paper: colors[k % colors.length], seed: k * 3 + 1 });
      k++;
    }
  }
  paint(ctx, (c) => roundRectPath(c, POOP.from + 1, POOP.y - 152, 10, 130, 4), rigColors(ship).wood, { width: 3 });
}

/** A copal censer on a stand at the stern; the engine's smoke rises from it. */
function censer(ctx: Ctx, ship: ShipDefinition, top: Point, frame: FrameInfo): void {
  const brass = "#C9A24A";
  line(ctx, [{ x: top.x, y: top.y + 18 }, { x: top.x, y: POOP.y - 12 }], outlineFor("#4B2C73"), 7);
  line(ctx, [{ x: top.x, y: top.y + 18 }, { x: top.x, y: POOP.y - 12 }], "#4B2C73", 4);
  paint(ctx, (c) => {
    c.moveTo(top.x - 16, top.y + 4);
    c.quadraticCurveTo(top.x, top.y + 28, top.x + 16, top.y + 4);
    c.closePath();
  }, brass, { width: 2.6 });
  paint(ctx, (c) => roundRectPath(c, top.x - 18, top.y, 36, 6, 3), shade(brass, 0.1), { width: 2.2 });
  const f = 0.8 + 0.2 * sway(frame.t, 5, 1, frame.reducedMotion);
  glow(ctx, top.x, top.y + 2, 30, ship.palette.glow ?? "#FFB84D", 0.6 * f);
}

export const galleon: HullDrawer = { layout, drawBack, drawDeck, drawFront };
