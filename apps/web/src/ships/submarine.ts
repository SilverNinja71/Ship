// Submarine: the Sunfish. A round, chubby yellow submarine with a brass
// walkway, a domed conning tower (the helm and the potted citrus tree share
// its open bridge), big riveted portholes, a sunfish-like tail fin and a
// periscope that slowly looks around.

import type { ShipDefinition } from "@ship/shared-types";
import { INK, alpha, circlePath, ellipsePath, outlineFor, paint, roundRectPath, shade, sway, withTransform } from "../ship-engine/draw.js";
import type { Ctx, FrameInfo } from "../ship-engine/types.js";
import { periscope, porthole } from "./parts/extras.js";
import { arrange, band, bellBracket, drawDeckBand, flagStaff, paintIn, postRail, rigColors, rivetRow } from "./kit.js";
import { capRail, paintHull } from "./hullKit.js";
import type { HullDrawer, HullLayout } from "./types.js";

const TOWER = { from: -272, to: -94, y: -128 };
const TOWER_BODY = { from: -284, to: -82 };
const WALK = { from: -76, to: 366, y: 0 };
const SCOPE_X = -100;
const STAFF_X = -304;

function layout(_ship: ShipDefinition): HullLayout {
  const s = arrange([
    { ...TOWER, items: ["tree", "helm"] },
    { ...WALK, items: ["desk", "table", "table"] },
  ]);
  return {
    deck: { from: WALK.from, to: WALK.to },
    waterline: 104,
    keel: 210,
    masts: [],
    bow: { x: 490, y: 70, angle: 0 },
    flag: { x: STAFF_X, y: -250 },
    helm: s.helm,
    citrusTree: s.citrusTree,
    bell: { x: s.helm.x - 4, y: TOWER.y - 202 },
    desk: s.desk,
    tables: s.tables,
    smoke: [],
    orchard: [],
    surfaces: s.surfaces,
    bounds: { left: -570, top: -420, right: 530, bottom: 212 },
  };
}

const outline = (c: Ctx) => {
  c.moveTo(-300, -4);
  c.lineTo(366, -4);
  c.bezierCurveTo(446, -4, 500, 40, 496, 98);
  c.bezierCurveTo(492, 172, 400, 208, 260, 210);
  c.bezierCurveTo(60, 214, -200, 214, -330, 198);
  c.bezierCurveTo(-452, 182, -502, 122, -488, 62);
  c.bezierCurveTo(-476, 14, -396, -4, -300, -4);
  c.closePath();
};

const drawBack: HullDrawer["drawBack"] = (ctx, ship, l, frame) => {
  const p = ship.palette;
  const colors = rigColors(ship);
  tailFin(ctx, ship, frame);
  flagStaff(ctx, STAFF_X, -8, l.flag.y, p.trim, "#D4AF37");
  if (ship.extras.includes("periscope")) periscope(ctx, SCOPE_X, TOWER.y - 20, TOWER.y - 268, ship, frame);
  bellBracket(ctx, { x: SCOPE_X, y: l.bell.y - 9 }, l.bell, p.trim, colors.iron);
};

const drawDeck: HullDrawer["drawDeck"] = (ctx, ship, _l, frame) => {
  const p = ship.palette;
  drawDeckBand(ctx, ship, { from: TOWER_BODY.from - 40, to: WALK.to + 4, y: 0 });
  // The conning tower, a rounded yellow dome with a great porthole.
  paintIn(
    ctx,
    (c) => roundRectPath(c, TOWER_BODY.from, TOWER.y - 6, TOWER_BODY.to - TOWER_BODY.from, -TOWER.y + 8, [46, 46, 4, 4]),
    p.hull,
    () => {
      band(ctx, TOWER_BODY.to - 36, TOWER.y, TOWER_BODY.to, 4, shade(p.hull, -0.12));
      band(ctx, TOWER_BODY.from, TOWER.y + 26, TOWER_BODY.to, TOWER.y + 38, p.accent);
      band(ctx, TOWER_BODY.from + 16, TOWER.y, TOWER_BODY.from + 28, 4, alpha("#FFFFFF", 0.3));
      rivetRow(ctx, TOWER_BODY.from + 10, TOWER_BODY.to - 10, TOWER.y + 18, 14, p.hull, 2);
      rivetRow(ctx, TOWER_BODY.from + 10, TOWER_BODY.to - 10, -12, 14, p.hull, 2);
    },
    { width: 4 },
  );
  porthole(ctx, (TOWER_BODY.from + TOWER_BODY.to) / 2, TOWER.y + 74, 24, ship, frame, { seed: 9 });
  drawDeckBand(ctx, ship, TOWER, { salt: 3 });
};

const drawFront: HullDrawer["drawFront"] = (ctx, ship, _l, frame) => {
  const p = ship.palette;
  paintHull(ctx, ship, outline, {
    fill: p.hull,
    low: p.hullDark,
    lowFrom: 88,
    stripes: [[70, 79, p.accent]],
    inner: () => {
      ctx.strokeStyle = alpha(shade(p.hull, -0.35), 0.5);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let x = -380; x < 460; x += 110) {
        ctx.moveTo(x, -10);
        ctx.lineTo(x, 220);
      }
      ctx.stroke();
      if (ship.extras.includes("rivets")) {
        rivetRow(ctx, -460, 470, 8, 15, p.hull, 2.2);
        rivetRow(ctx, -470, 480, 62, 15, p.hull, 2.2);
        for (let x = -380; x < 460; x += 110) for (let y = 20; y < 62; y += 14) rivetRow(ctx, x - 5, x - 5, y, 10, p.hull, 1.8);
      }
      // A highlight along the round top, for volume.
      ctx.beginPath();
      ctx.moveTo(-440, 30);
      ctx.bezierCurveTo(-420, 6, -360, 4, -300, 4);
      ctx.lineTo(380, 4);
      ctx.bezierCurveTo(430, 4, 470, 30, 480, 60);
      ctx.strokeStyle = alpha("#FFFFFF", 0.35);
      ctx.lineWidth = 6;
      ctx.stroke();
    },
  });
  if (ship.extras.includes("portholes")) [-390, -272, -152, -34, 84, 202, 320, 430].forEach((x, k) => porthole(ctx, x, 38, 14, ship, frame, { seed: k }));
  capRail(ctx, -300, 372, -4, "#D4AF37");
  postRail(ctx, TOWER.from - 6, TOWER.to + 6, TOWER.y, 24, "#D4AF37", 22);
  divePlane(ctx, 420, 92, p, frame, 1);
  divePlane(ctx, -430, 92, p, frame, -1);
};

function tailFin(ctx: Ctx, ship: ShipDefinition, frame: FrameInfo): void {
  const p = ship.palette;
  paintIn(
    ctx,
    (c) => {
      c.moveTo(-430, 40);
      c.bezierCurveTo(-440, -40, -480, -110, -520, -100);
      c.bezierCurveTo(-552, -90, -548, -10, -500, 70);
      c.closePath();
    },
    p.hull,
    () => {
      band(ctx, -560, -120, -440, 80, alpha(INK, 0.06));
      ctx.strokeStyle = alpha(shade(p.hull, -0.35), 0.6);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        ctx.moveTo(-452 - k * 8, 40);
        ctx.lineTo(-480 - k * 14, -66 + k * 24);
      }
      ctx.stroke();
      band(ctx, -560, -30, -400, -20, p.accent);
    },
    { width: 4 },
  );
  // Propeller, turning (seen side-on, the blades flicker in width).
  const spin = frame.t * (frame.reducedMotion ? 0.3 : 9);
  withTransform(ctx, { x: -506, y: 88 }, () => {
    paint(ctx, (c) => roundRectPath(c, 0, -5, 30, 10, 4), shade(p.trim, 0.2), { width: 2.4 });
    for (let k = 0; k < 3; k++) {
      const a = spin + (k * Math.PI * 2) / 3;
      const h = 30 * Math.cos(a);
      paint(ctx, (c) => ellipsePath(c, -2, h / 2, 6, Math.max(2, Math.abs(h) / 2)), "#D4AF37", { width: 2.2 });
    }
    paint(ctx, (c) => circlePath(c, -2, 0, 7), "#D4AF37", { width: 2.4 });
  });
}

function divePlane(ctx: Ctx, x: number, y: number, p: ShipDefinition["palette"], frame: FrameInfo, dir: 1 | -1): void {
  const tilt = 0.08 * sway(frame.t, 0.6, x, frame.reducedMotion);
  withTransform(ctx, { x, y, rotate: tilt, scaleX: dir }, () => {
    paint(ctx, (c) => {
      c.moveTo(-26, -4);
      c.quadraticCurveTo(10, -14, 40, -6);
      c.quadraticCurveTo(44, 0, 40, 4);
      c.quadraticCurveTo(10, 10, -26, 6);
      c.closePath();
    }, p.trim, { width: 3 });
    paint(ctx, (c) => circlePath(c, -18, 1, 4), "#D4AF37", { stroke: outlineFor(p.trim), width: 1.6 });
  });
}

export const submarine: HullDrawer = { layout, drawBack, drawDeck, drawFront };
