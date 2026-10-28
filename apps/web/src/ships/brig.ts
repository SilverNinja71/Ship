// Brig: a longer, sleeker two-master with a quarterdeck and forecastle.
// The Golden Mane (sunny yellow, a mane of painted wave-curls, a lawn with a
// swing) and the Sasquatch Cedar Timber-Brig (a hull of redwood logs, a snowy
// log-cabin quarterdeck with a woodstove pipe).

import type { ShipDefinition } from "@ship/shared-types";
import { INK, alpha, circlePath, ellipsePath, hashString, line, mix, outlineFor, paint, rng, roundRectPath, shade } from "../ship-engine/draw.js";
import type { Ctx, FrameInfo } from "../ship-engine/types.js";
import { lantern, stovepipe, swing } from "./parts/extras.js";
import { arrange, band, bellBracket, cabinWindow, mastAt, rigColors } from "./kit.js";
import type { Arranged } from "./kit.js";
import { capRail, drawBowspritSpar, drawDecks, drawFarBulwarks, drawRaisedRails, drawRig, hullPath, paintHull, steppedTop } from "./hullKit.js";
import type { HullDrawer, HullLayout } from "./types.js";

const QUARTER = { from: -494, to: -312, y: -54 };
const WAIST = { from: -308, to: 344 };
const FORE = { from: 348, to: 478, y: -34 };
const STEM = { x: 500, y: -66 };
const BOWSPRIT = { from: { x: 452, y: -46 }, to: { x: 604, y: -128 } };
const SWING_DROP = 150;

const isCedar = (ship: ShipDefinition) => ship.deck === "cedar";

function stations(ship: ShipDefinition): Arranged {
  const orchard = ship.extras.includes("citrus-trees");
  const hasSwing = ship.extras.includes("swing");
  return arrange([
    { ...QUARTER, items: ["helm", "tree"] },
    { ...WAIST, y: 0, items: hasSwing ? ["desk", "table", { slot: "swing", width: 58 }, "table", "table"] : ["desk", "table", "table", "table"] },
    { ...FORE, items: orchard ? ["orchard"] : ["table"] },
  ]);
}

function layout(ship: ShipDefinition): HullLayout {
  const s = stations(ship);
  const swingAt = s.slots.swing;
  const mainX = swingAt ? swingAt.x + 34 : s.tables[0].x;
  const waistTables = s.tables.filter((t) => t.y === 0);
  const foreX = waistTables[waistTables.length - 1].x;
  const masts = [mastAt(mainX, 0, -560), mastAt(foreX, 0, -500)];
  return {
    deck: { from: WAIST.from, to: WAIST.to },
    waterline: 100,
    keel: 160,
    masts,
    bow: { x: 498, y: -34, angle: -0.38 },
    flag: { x: masts[0].x, y: masts[0].top },
    helm: s.helm,
    citrusTree: s.citrusTree,
    bell: { x: s.helm.x + 2, y: QUARTER.y - 204 },
    desk: s.desk,
    tables: s.tables,
    smoke: isCedar(ship) ? [{ x: QUARTER.from + 14, y: QUARTER.y - 196 }] : [],
    orchard: s.orchard,
    surfaces: s.surfaces,
    bounds: { left: -560, top: -566, right: 640, bottom: 165 },
  };
}

const outline = (c: Ctx) =>
  hullPath(c, steppedTop({ stern: { x: -514, y: -80 }, castle: { to: QUARTER.to, y: QUARTER.y }, waist: -4, fore: { from: FORE.from, y: FORE.y }, stem: STEM }), (cc) => {
    cc.bezierCurveTo(520, 0, 506, 60, 450, 104);
    cc.bezierCurveTo(360, 150, 120, 160, -140, 160);
    cc.bezierCurveTo(-370, 158, -462, 130, -490, 80);
    cc.bezierCurveTo(-506, 40, -522, -20, -514, -80);
  });

const drawBack: HullDrawer["drawBack"] = (ctx, ship, l, frame) => {
  const colors = rigColors(ship);
  const cedar = isCedar(ship);
  drawFarBulwarks(ctx, l.surfaces ?? [], cedar ? "#7A3B20" : mix(ship.palette.hull, ship.palette.trim, 0.3), ship.palette.trim);
  if (cedar && l.smoke[0]) stovepipe(ctx, l.smoke[0].x, QUARTER.y - 24, l.smoke[0].y);
  drawBowspritSpar(ctx, BOWSPRIT.from, BOWSPRIT.to, colors.wood, colors.iron);
  drawRig(ctx, ship, l, { mast: { wood: colors.wood, iron: colors.iron }, bowsprit: BOWSPRIT });
  // The bell hangs from a boom off the stern rail, over the helm.
  const postX = QUARTER.from + 4;
  paint(ctx, (c) => roundRectPath(c, postX - 6, l.bell.y - 20, 12, QUARTER.y - 24 - (l.bell.y - 20), 5), colors.wood, { width: 3 });
  bellBracket(ctx, { x: postX, y: l.bell.y - 9 }, l.bell, colors.wood, colors.iron);
  if (ship.extras.includes("lanterns")) lantern(ctx, postX, l.bell.y - 20, ship, frame, { hang: 0, seed: 2 });
  const swingAt = stations(ship).slots.swing;
  if (swingAt) {
    // A short boom off the main mast, and the swing hanging from it.
    const hookY = -216;
    const m = l.masts[0];
    paint(ctx, (c) => roundRectPath(c, swingAt.x - 6, hookY - 6, m.x - swingAt.x + 6, 10, 4), colors.wood, { width: 3 });
    swing(ctx, { x: swingAt.x, y: hookY + 4 }, SWING_DROP, frame, "#8A6A44", ship.palette.accent);
  }
  if (ship.extras.includes("lanterns")) {
    const fore = l.masts[1];
    lantern(ctx, (fore.x + BOWSPRIT.to.x) / 2 + 10, (fore.top + 30 + BOWSPRIT.to.y) / 2 + 16, ship, frame, { hang: 10, size: 0.9, seed: 9 });
  }
};

const drawDeck: HullDrawer["drawDeck"] = (ctx, ship, l) => {
  const colors = rigColors(ship);
  drawDecks(ctx, ship, l, l.surfaces ?? [], { wood: colors.wood, iron: colors.iron });
};

const drawFront: HullDrawer["drawFront"] = (ctx, ship, l, frame) => {
  const p = ship.palette;
  const cedar = isCedar(ship);
  paintHull(ctx, ship, outline, {
    fill: p.hull,
    low: p.hullDark,
    lowFrom: 74,
    planks: cedar ? undefined : { spacing: 17 },
    stripes: cedar ? [] : [[20, 30, p.trim]],
    inner: () => (cedar ? logs(ctx, ship) : maneCurls(ctx, ship)),
  });
  if (cedar) {
    // A little log cabin under the quarterdeck, its window warm.
    paint(ctx, (c) => roundRectPath(c, -470, QUARTER.y + 14, 120, 40, 4), alpha(INK, 0.12), { stroke: false });
    cabinWindow(ctx, -436, QUARTER.y + 18, 30, 26, p.trim, ship, frame, 1);
    cabinWindow(ctx, -386, QUARTER.y + 18, 30, 26, p.trim, ship, frame, 2);
  } else {
    [-456, -404, -352].forEach((x, k) => roundPort(ctx, x, QUARTER.y + 30, 13, ship, frame, k));
  }
  capRail(ctx, QUARTER.from - 10, QUARTER.to + 2, QUARTER.y, p.trim);
  capRail(ctx, QUARTER.to - 2, FORE.from + 2, -4, p.trim);
  capRail(ctx, FORE.from - 2, STEM.x - 18, FORE.y, p.trim);
  drawRaisedRails(ctx, l.surfaces ?? [], p.trim, 24, 26);
  if (cedar) snowCaps(ctx, ship);
  if (ship.extras.includes("lanterns")) lantern(ctx, FORE.to - 4, FORE.y - 32, ship, frame, { hang: 0, size: 0.9, seed: 13 });
};

function roundPort(ctx: Ctx, x: number, y: number, r: number, ship: ShipDefinition, frame: FrameInfo, k: number): void {
  cabinWindow(ctx, x, y - r, r * 2, r * 2, ship.palette.trim, ship, frame, k);
}

/** The Golden Mane's painted mane: rolling orange curls along the hull. */
function maneCurls(ctx: Ctx, ship: ShipDefinition): void {
  const a = ship.palette.accent;
  ctx.lineCap = "round";
  for (let x = -480; x < 470; x += 58) {
    const y = 48;
    const curl = (w: number, color: string) => {
      ctx.beginPath();
      ctx.moveTo(x - 30, y + 10);
      ctx.bezierCurveTo(x - 20, y - 14, x + 18, y - 18, x + 22, y - 2);
      ctx.bezierCurveTo(x + 24, y + 8, x + 10, y + 12, x + 4, y + 4);
      ctx.bezierCurveTo(x, y - 2, x + 8, y - 6, x + 12, y - 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.stroke();
    };
    curl(9, outlineFor(a));
    curl(5, a);
  }
  band(ctx, -620, 64, 620, 68, alpha(shade(a, -0.2), 0.6));
}

/** Redwood logs, stacked lengthwise, with their cut ends showing at the stern. */
function logs(ctx: Ctx, ship: ShipDefinition): void {
  const r = rng(hashString(ship.id));
  const h = 22;
  for (let y = -110; y < 200; y += h) {
    const c0 = r() < 0.5 ? ship.palette.hull : shade(ship.palette.hull, 0.08);
    paint(ctx, (c) => roundRectPath(c, -620, y, 1240, h, h / 2), c0, { stroke: outlineFor(ship.palette.hull), width: 2.5 });
    band(ctx, -620, y + 3, 620, y + 6, alpha("#FFFFFF", 0.14));
    band(ctx, -620, y + h - 6, 620, y + h, alpha(INK, 0.14));
    ctx.strokeStyle = alpha(shade(ship.palette.hull, -0.35), 0.5);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let x = -600 + r() * 80; x < 600; x += 70 + r() * 80) {
      ctx.moveTo(x, y + h * 0.45);
      ctx.lineTo(x + 26 + r() * 20, y + h * 0.45);
    }
    ctx.stroke();
    // Log ends at the stern.
    const ex = -500 + (Math.round((y + 110) / h) % 2) * 6;
    paint(ctx, (c) => ellipsePath(c, ex, y + h / 2, 9, h / 2 - 1), "#D9A26B", { width: 2 });
    ctx.beginPath();
    ellipsePath(ctx, ex, y + h / 2, 5, h / 2 - 5);
    ctx.strokeStyle = shade("#D9A26B", -0.3);
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

/** Fresh snow on the rails and the stern. */
function snowCaps(ctx: Ctx, ship: ShipDefinition): void {
  const r = rng(hashString(ship.id) + 3);
  const snow = "#FFFFFF";
  const spans: [number, number, number][] = [
    [QUARTER.from, QUARTER.to, QUARTER.y - 28],
    [FORE.from, FORE.to, FORE.y - 28],
  ];
  for (const [a, b, y] of spans) {
    for (let x = a + 6; x < b - 6; x += 16 + r() * 20) {
      const w = 10 + r() * 12;
      paint(ctx, (c) => {
        c.moveTo(x - w / 2, y - 3);
        c.quadraticCurveTo(x, y - 9 - r() * 3, x + w / 2, y - 3);
        c.closePath();
      }, snow, { stroke: outlineFor("#C9D6E0"), width: 1.6 });
    }
  }
  line(ctx, [{ x: -512, y: -82 }, { x: -470, y: -60 }], snow, 0.1);
  void circlePath;
}

export const brig: HullDrawer = { layout, drawBack, drawDeck, drawFront };
