// The one themed item in each Captain's Quarters (CABIN_DECOR), about 160
// units tall, standing on the floor point `at`. Front view; it's shown big,
// next to the desk.

import { INK, alpha, circlePath, ellipsePath, line, linearGradient, mix, outlineFor, paint, roundRectPath, shade, sway, withTransform } from "../ship-engine/draw.js";
import type { Ctx, FrameInfo, Point } from "../ship-engine/types.js";
import { band, flicker, glow, paintIn, rivetRow } from "./kit.js";
import { ivy, stainedGlass } from "./parts/extras.js";
import { sparkle } from "./parts/sails.js";
import { SHIPS } from "@ship/ship-theme-kit";

type Decor = (ctx: Ctx, frame: FrameInfo) => void;

export function drawCabinDecor(ctx: Ctx, shipId: string, at: Point, frame: FrameInfo): void {
  const draw = DECOR[shipId] ?? DECOR["woolly-wanderer"];
  withTransform(ctx, { x: at.x, y: at.y }, () => draw(ctx, frame));
}

const wood = "#9A6A44";
const brass = "#D4A537";

/** A soft contact shadow on the floor. */
function floorShadow(ctx: Ctx, w: number): void {
  ctx.beginPath();
  ellipsePath(ctx, 0, -2, w / 2, 7);
  ctx.fillStyle = alpha(INK, 0.22);
  ctx.fill();
}

function pedestal(ctx: Ctx, h: number, w: number, color = wood): void {
  floorShadow(ctx, w + 20);
  paint(ctx, (c) => roundRectPath(c, -w / 2 - 8, -14, w + 16, 14, 4), shade(color, -0.1), { width: 3 });
  paintIn(ctx, (c) => roundRectPath(c, -w / 2 + 6, -h + 10, w - 12, h - 22, 4), color, () => band(ctx, w * 0.12, -h, w, 0, shade(color, -0.15)), { width: 3 });
  paint(ctx, (c) => roundRectPath(c, -w / 2, -h, w, 14, 4), shade(color, 0.08), { width: 3 });
}

// ---------------------------------------------------------------------------

const sheepPlush: Decor = (ctx, frame) => {
  const wool = "#FFFDF5";
  const face = "#F1E0C8";
  floorShadow(ctx, 130);
  // Knitted footstool.
  paint(ctx, (c) => roundRectPath(c, -60, -40, 120, 40, 14), "#7DBE5A", { width: 3 });
  ctx.strokeStyle = alpha(shade("#7DBE5A", -0.35), 0.6);
  ctx.lineWidth = 1.6;
  for (let x = -50; x < 56; x += 10) {
    ctx.beginPath();
    ctx.moveTo(x - 3, -30);
    ctx.lineTo(x, -24);
    ctx.lineTo(x + 3, -30);
    ctx.stroke();
  }
  const breathe = 1 + 0.015 * sway(frame.t, 1.2, 0, frame.reducedMotion);
  withTransform(ctx, { y: -40, scaleY: breathe }, () => {
    // Body: a cloud of puffs.
    const puffs: [number, number, number][] = [
      [-30, -30, 26],
      [0, -40, 30],
      [30, -30, 26],
      [-20, -6, 24],
      [20, -6, 24],
      [0, -14, 28],
    ];
    ctx.beginPath();
    for (const [x, y, r] of puffs) circlePath(ctx, x, y, r);
    ctx.lineWidth = 6;
    ctx.strokeStyle = outlineFor("#C9B79C");
    ctx.stroke();
    ctx.fillStyle = wool;
    ctx.fill();
    // Knit stitches.
    ctx.strokeStyle = alpha("#C9B79C", 0.8);
    ctx.lineWidth = 1.4;
    for (let y = -60; y < 10; y += 10) {
      for (let x = -46; x < 50; x += 10) {
        ctx.beginPath();
        ctx.moveTo(x - 3, y);
        ctx.lineTo(x, y + 5);
        ctx.lineTo(x + 3, y);
        ctx.stroke();
      }
    }
    // Little hooves.
    for (const x of [-26, 26]) paint(ctx, (c) => roundRectPath(c, x - 9, 6, 18, 12, 5), "#8B5A2B", { width: 2.4 });
    // Head.
    paint(ctx, (c) => ellipsePath(c, 0, -84, 32, 28), face, { width: 3 });
    for (const side of [-1, 1]) {
      paint(ctx, (c) => ellipsePath(c, side * 36, -90, 13, 6, side * 0.4), shade(face, -0.08), { width: 2.4 });
      ctx.beginPath();
      ctx.arc(side * 24, -106, 11, 0, Math.PI * 2);
      ctx.strokeStyle = outlineFor("#E8B04B");
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.strokeStyle = "#E8B04B";
      ctx.lineWidth = 4.5;
      ctx.stroke();
      paint(ctx, (c) => circlePath(c, side * 11, -88, 5), "#3A2E2A", { width: 1.4 });
      ctx.beginPath();
      circlePath(ctx, side * 11 - 1.5, -89.5, 1.6);
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();
      paint(ctx, (c) => ellipsePath(c, side * 18, -76, 6, 3.5), alpha("#F49A7A", 0.6), { stroke: false });
    }
    for (const [x, y, r] of [
      [-10, -112, 9],
      [4, -116, 10],
      [16, -110, 8],
    ])
      paint(ctx, (c) => circlePath(c, x, y, r), wool, { width: 2.4 });
    ctx.beginPath();
    ctx.moveTo(-6, -72);
    ctx.quadraticCurveTo(0, -66, 6, -72);
    ctx.strokeStyle = "#3A2E2A";
    ctx.lineWidth = 2.2;
    ctx.stroke();
    // Knitted scarf.
    paint(ctx, (c) => roundRectPath(c, -30, -60, 60, 12, 6), "#E25B45", { width: 2.6 });
    paint(ctx, (c) => roundRectPath(c, 12, -54, 12, 30, 4), "#E25B45", { width: 2.4 });
  });
};

const shipInBottle: Decor = (ctx) => {
  pedestal(ctx, 96, 70);
  withTransform(ctx, { y: -96 }, () => {
    // Little cradle, then the bottle lying in it.
    for (const x of [-34, 34]) paint(ctx, (c) => roundRectPath(c, x - 8, -18, 16, 18, 4), shade(wood, -0.15), { width: 2.4 });
    const glass = alpha("#BFE8F5", 0.45);
    // The tiny lion brig inside, sails and all.
    withTransform(ctx, { y: -20, scale: 0.62 }, () => {
      paint(ctx, (c) => roundRectPath(c, -48, 2, 96, 7, 3), "#5EC8F2", { width: 1.4 });
      paint(ctx, (c) => {
        c.moveTo(-34, -6);
        c.lineTo(30, -6);
        c.quadraticCurveTo(28, 6, 16, 8);
        c.lineTo(-26, 8);
        c.quadraticCurveTo(-34, 4, -34, -6);
        c.closePath();
      }, "#F2C14E", { width: 2 });
      paint(ctx, (c) => circlePath(c, 33, -8, 5), "#E8743B", { width: 1.6 });
      for (const [x, h] of [
        [-10, 38],
        [12, 32],
      ]) {
        line(ctx, [{ x, y: -6 }, { x, y: -6 - h }], "#7A4A21", 2);
        paint(ctx, (c) => roundRectPath(c, x - 11, -h - 2, 22, h - 10, 3), "#FFF8E7", { width: 1.6 });
      }
    });
    paintIn(
      ctx,
      (c) => {
        c.moveTo(-58, -50);
        c.lineTo(36, -50);
        c.quadraticCurveTo(52, -50, 56, -40);
        c.lineTo(66, -38);
        c.lineTo(66, -24);
        c.lineTo(56, -22);
        c.quadraticCurveTo(52, -12, 36, -12);
        c.lineTo(-58, -12);
        c.quadraticCurveTo(-68, -12, -68, -31);
        c.quadraticCurveTo(-68, -50, -58, -50);
        c.closePath();
      },
      glass,
      () => {
        band(ctx, -56, -46, 30, -41, alpha("#FFFFFF", 0.7));
        band(ctx, -40, -20, 10, -17, alpha("#FFFFFF", 0.35));
      },
      { stroke: alpha("#2E6F80", 0.9), width: 3 },
    );
    paint(ctx, (c) => roundRectPath(c, 64, -40, 14, 18, 4), "#B5835A", { width: 2.4 });
  });
};

const copperPans: Decor = (ctx, frame) => {
  floorShadow(ctx, 140);
  for (const x of [-60, 60]) paint(ctx, (c) => roundRectPath(c, x - 6, -160, 12, 160, 4), wood, { width: 3 });
  paint(ctx, (c) => roundRectPath(c, -72, -164, 144, 12, 5), shade(wood, 0.08), { width: 3 });
  paint(ctx, (c) => roundRectPath(c, -66, -40, 132, 10, 4), shade(wood, -0.08), { width: 3 });
  const copper = "#C77B3C";
  const items: [number, number, number][] = [
    [-36, 44, 22],
    [0, 60, 28],
    [38, 40, 18],
  ];
  items.forEach(([x, drop, r], k) => {
    const a = 0.06 * sway(frame.t, 1.3, k * 1.7, frame.reducedMotion);
    withTransform(ctx, { x, y: -152, rotate: a }, () => {
      line(ctx, [{ x: 0, y: 0 }, { x: 0, y: drop - r - 18 }], "#5A4632", 2);
      paint(ctx, (c) => roundRectPath(c, -4, drop - r - 26, 8, 22, 3), shade(copper, -0.2), { width: 2.2 });
      paintIn(ctx, (c) => circlePath(c, 0, drop, r), copper, () => {
        ctx.beginPath();
        ellipsePath(ctx, -r * 0.3, drop - r * 0.3, r * 0.35, r * 0.2, -0.6);
        ctx.fillStyle = alpha("#FFFFFF", 0.4);
        ctx.fill();
        ctx.beginPath();
        circlePath(ctx, 0, drop, r * 0.72);
        ctx.strokeStyle = shade(copper, -0.25);
        ctx.lineWidth = 2;
        ctx.stroke();
      }, { width: 3 });
    });
  });
  // A ladle and a whisk hanging at the end.
  withTransform(ctx, { x: 60, y: -150, rotate: 0.05 * sway(frame.t, 1.1, 2, frame.reducedMotion) }, () => {
    line(ctx, [{ x: 0, y: 0 }, { x: 0, y: 60 }], outlineFor("#9AA4AE"), 6);
    line(ctx, [{ x: 0, y: 0 }, { x: 0, y: 60 }], "#C9D2DA", 3);
    paint(ctx, (c) => ellipsePath(c, 0, 66, 10, 8), "#C9D2DA", { width: 2.4 });
  });
};

const sonar: Decor = (ctx, frame) => {
  floorShadow(ctx, 120);
  const metal = "#2F3B4C";
  paintIn(ctx, (c) => roundRectPath(c, -56, -150, 112, 150, 12), metal, () => band(ctx, 30, -150, 60, 0, shade(metal, -0.2)), { width: 3.5 });
  rivetRow(ctx, -46, 46, -142, 12, metal, 1.8);
  const cx = 0;
  const cy = -98;
  const r = 38;
  paintIn(
    ctx,
    (c) => circlePath(c, cx, cy, r),
    "#0E3A2A",
    () => {
      ctx.strokeStyle = alpha("#39FF88", 0.45);
      ctx.lineWidth = 1.4;
      for (const rr of [12, 24, 36]) {
        ctx.beginPath();
        circlePath(ctx, cx, cy, rr);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx + r, cy);
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx, cy + r);
      ctx.stroke();
      const a = frame.t * (frame.reducedMotion ? 0.1 : 1.6);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a - 0.7, a);
      ctx.closePath();
      ctx.fillStyle = alpha("#39FF88", 0.25);
      ctx.fill();
      line(ctx, [{ x: cx, y: cy }, { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }], "#7DFFB5", 2.2);
      for (const [bx, by] of [
        [14, -12],
        [-20, 10],
        [8, 22],
      ]) {
        const ang = Math.atan2(by, bx);
        const since = (((a - ang) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const lit = Math.max(0, 1 - since / 2.5);
        ctx.beginPath();
        circlePath(ctx, cx + bx, cy + by, 3);
        ctx.fillStyle = alpha("#B6FFD2", 0.3 + 0.7 * lit);
        ctx.fill();
      }
    },
    { stroke: brass, width: 5 },
  );
  glow(ctx, cx, cy, 70, "#39FF88", 0.25);
  for (const [x, color] of [
    [-30, "#E25B45"],
    [-10, "#F6D33C"],
    [10, "#39FF88"],
  ] as const)
    paint(ctx, (c) => circlePath(c, x, -38, 6), color, { width: 2 });
  paint(ctx, (c) => circlePath(c, 34, -38, 11), brass, { width: 2.4 });
  line(ctx, [{ x: 34, y: -38 }, { x: 40, y: -44 }], INK, 2);
};

const treasureChest: Decor = (ctx, frame) => {
  floorShadow(ctx, 150);
  const chest = "#7A4A2B";
  const gold = "#E3B341";
  // Open lid, tilted back.
  paintIn(ctx, (c) => roundRectPath(c, -66, -150, 132, 56, [30, 30, 4, 4]), shade(chest, -0.15), () => band(ctx, -66, -122, 66, -116, alpha(INK, 0.2)), { width: 3.5 });
  for (const x of [-46, 46]) paint(ctx, (c) => roundRectPath(c, x - 6, -150, 12, 56, 3), gold, { width: 2.4 });
  // Pile of coins and gems.
  paint(ctx, (c) => {
    c.moveTo(-60, -84);
    c.quadraticCurveTo(-30, -122, 0, -112);
    c.quadraticCurveTo(30, -126, 60, -84);
    c.closePath();
  }, gold, { width: 3 });
  for (const [x, y] of [
    [-34, -96],
    [-12, -106],
    [10, -102],
    [32, -100],
    [-20, -90],
    [20, -90],
  ])
    paint(ctx, (c) => ellipsePath(c, x, y, 9, 4), shade(gold, 0.15), { width: 1.6 });
  paint(ctx, (c) => {
    c.moveTo(-4, -118);
    c.lineTo(6, -128);
    c.lineTo(16, -118);
    c.lineTo(6, -104);
    c.closePath();
  }, "#E25B9A", { width: 2 });
  paint(ctx, (c) => circlePath(c, -28, -110, 6), "#3FA7D6", { width: 2 });
  // The chest box.
  paintIn(
    ctx,
    (c) => roundRectPath(c, -70, -90, 140, 86, 6),
    chest,
    () => {
      ctx.strokeStyle = alpha(shade(chest, -0.4), 0.6);
      ctx.lineWidth = 1.6;
      for (let y = -70; y < 0; y += 20) {
        ctx.beginPath();
        ctx.moveTo(-70, y);
        ctx.lineTo(70, y);
        ctx.stroke();
      }
    },
    { width: 3.5 },
  );
  for (const x of [-48, 48]) paint(ctx, (c) => roundRectPath(c, x - 7, -92, 14, 90, 3), gold, { width: 2.6 });
  paint(ctx, (c) => roundRectPath(c, -12, -72, 24, 26, 5), gold, { width: 2.6 });
  paint(ctx, (c) => circlePath(c, 0, -62, 4), INK, { stroke: false });
  // A pearl necklace spilling over the edge.
  for (let k = 0; k < 8; k++) paint(ctx, (c) => circlePath(c, 30 + k * 4, -88 + k * k * 0.8, 3.2), "#FFF6EA", { width: 1.2 });
  const tw = 0.5 + 0.5 * sway(frame.t, 2.2, 0, frame.reducedMotion);
  sparkle(ctx, 14, -122, 5 + 4 * tw, alpha("#FFFFFF", 0.6 + 0.4 * tw));
  sparkle(ctx, -40, -100, 3 + 3 * (1 - tw), alpha("#FFFFFF", 0.8));
};

const signalFlags: Decor = (ctx, frame) => {
  floorShadow(ctx, 120);
  for (const x of [-52, 52]) paint(ctx, (c) => roundRectPath(c, x - 6, -158, 12, 158, 4), "#5E4632", { width: 3 });
  const rows = [-150, -104, -58];
  const flags: ((ctx: Ctx) => void)[] = [
    (c) => {
      band(c, -14, -12, 14, 12, "#F2C14E");
      band(c, -14, -12, 0, 0, "#1F3A5F");
      band(c, 0, 0, 14, 12, "#1F3A5F");
    },
    (c) => {
      band(c, -14, -12, 14, 12, "#FFFFFF");
      c.beginPath();
      c.moveTo(-14, -12);
      c.lineTo(14, 12);
      c.lineTo(14, -12);
      c.closePath();
      c.fillStyle = "#C8102E";
      c.fill();
    },
    (c) => {
      band(c, -14, -12, 14, -4, "#1F3A5F");
      band(c, -14, -4, 14, 4, "#FFFFFF");
      band(c, -14, 4, 14, 12, "#C8102E");
    },
    (c) => {
      band(c, -14, -12, 14, 12, "#3FA7D6");
      band(c, -6, -4, 6, 4, "#FFFFFF");
    },
    (c) => {
      band(c, -14, -12, 14, 12, "#F2C14E");
      band(c, -4, -12, 4, 12, "#C8102E");
    },
    (c) => {
      band(c, -14, -12, 14, 12, "#FFFFFF");
      band(c, -14, -12, 14, -6, "#1F3A5F");
      band(c, -14, 6, 14, 12, "#1F3A5F");
    },
  ];
  rows.forEach((y, r) => {
    paint(ctx, (c) => roundRectPath(c, -60, y - 4, 120, 8, 4), "#7A5A3E", { width: 2.6 });
    for (let k = 0; k < 3; k++) {
      const x = -32 + k * 32;
      const flap = 0.05 * sway(frame.t, 1.4, r * 3 + k, frame.reducedMotion);
      withTransform(ctx, { x, y: y + 18, rotate: flap }, () => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(-14, -12, 28, 24);
        ctx.clip();
        flags[(r * 3 + k) % flags.length](ctx);
        ctx.restore();
        ctx.beginPath();
        ctx.rect(-14, -12, 28, 24);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2.4;
        ctx.stroke();
      });
    }
  });
};

const shipsClock: Decor = (ctx, frame) => {
  pedestal(ctx, 92, 54, "#5B3A1E");
  const cy = -132;
  // Wheel spokes around the case.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    line(ctx, [{ x: Math.cos(a) * 30, y: cy + Math.sin(a) * 30 }, { x: Math.cos(a) * 46, y: cy + Math.sin(a) * 46 }], outlineFor("#5B3A1E"), 9);
    line(ctx, [{ x: Math.cos(a) * 30, y: cy + Math.sin(a) * 30 }, { x: Math.cos(a) * 46, y: cy + Math.sin(a) * 46 }], "#8A5A2B", 5);
    paint(ctx, (c) => circlePath(c, Math.cos(a) * 46, cy + Math.sin(a) * 46, 4.5), "#8A5A2B", { width: 2 });
  }
  paint(ctx, (c) => circlePath(c, 0, cy, 34), brass, { width: 3.5 });
  paint(ctx, (c) => circlePath(c, 0, cy, 26), "#FFF8E7", { width: 2.4 });
  ctx.strokeStyle = INK;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    ctx.lineWidth = k % 3 === 0 ? 2.4 : 1.2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 20, cy + Math.sin(a) * 20);
    ctx.lineTo(Math.cos(a) * 24, cy + Math.sin(a) * 24);
    ctx.stroke();
  }
  const t = frame.reducedMotion ? 0 : frame.t;
  const minute = -Math.PI / 2 + t * 0.1;
  const hour = -Math.PI / 2 + 2 + t * 0.0083;
  line(ctx, [{ x: 0, y: cy }, { x: Math.cos(hour) * 13, y: cy + Math.sin(hour) * 13 }], INK, 3);
  line(ctx, [{ x: 0, y: cy }, { x: Math.cos(minute) * 20, y: cy + Math.sin(minute) * 20 }], INK, 2);
  paint(ctx, (c) => circlePath(c, 0, cy, 3), brass, { width: 1.4 });
};

const gauges: Decor = (ctx, frame) => {
  floorShadow(ctx, 130);
  const pipe = "#6B747D";
  paint(ctx, (c) => roundRectPath(c, -60, -160, 16, 160, 6), pipe, { width: 3 });
  paint(ctx, (c) => roundRectPath(c, -60, -160, 110, 16, 6), pipe, { width: 3 });
  paint(ctx, (c) => roundRectPath(c, 34, -160, 16, 70, 6), pipe, { width: 3 });
  for (const y of [-120, -60]) paint(ctx, (c) => roundRectPath(c, -64, y, 24, 8, 3), shade(pipe, -0.15), { width: 2.2 });
  // Valve wheel.
  paint(ctx, (c) => circlePath(c, -52, -30, 16), alpha("#B5651D", 0), { stroke: outlineFor("#B5651D"), width: 7 });
  paint(ctx, (c) => circlePath(c, -52, -30, 16), alpha("#B5651D", 0), { stroke: "#B5651D", width: 4 });
  line(ctx, [{ x: -68, y: -30 }, { x: -36, y: -30 }], "#B5651D", 3);
  line(ctx, [{ x: -52, y: -46 }, { x: -52, y: -14 }], "#B5651D", 3);
  const dials: [number, number, number][] = [
    [8, -116, 22],
    [42, -66, 18],
    [-2, -50, 15],
  ];
  dials.forEach(([x, y, r], k) => {
    line(ctx, [{ x: -44, y }, { x, y }], pipe, 6);
    paint(ctx, (c) => circlePath(c, x, y, r + 5), brass, { width: 3 });
    paint(ctx, (c) => circlePath(c, x, y, r), "#FFF8E7", { width: 2 });
    ctx.beginPath();
    ctx.arc(x, y, r - 4, Math.PI * 0.15, Math.PI * 0.45);
    ctx.strokeStyle = "#C8102E";
    ctx.lineWidth = 3;
    ctx.stroke();
    const a = Math.PI * (0.75 + 0.5 * k) * 0.6 + 0.25 * sway(frame.t, 2.4 + k, k, frame.reducedMotion) - Math.PI / 2;
    line(ctx, [{ x, y }, { x: x + Math.cos(a) * (r - 5), y: y + Math.sin(a) * (r - 5) }], INK, 2.2);
    paint(ctx, (c) => circlePath(c, x, y, 2.6), INK, { stroke: false });
  });
};

const tripodScope: Decor = (ctx, frame) => {
  floorShadow(ctx, 130);
  const legs = "#7A5A3E";
  for (const [x0, x1] of [
    [-50, -4],
    [52, 4],
    [8, 0],
  ]) {
    line(ctx, [{ x: x0, y: 0 }, { x: x1, y: -100 }], outlineFor(legs), 9);
    line(ctx, [{ x: x0, y: 0 }, { x: x1, y: -100 }], legs, 5);
  }
  paint(ctx, (c) => circlePath(c, 0, -104, 8), brass, { width: 2.6 });
  const tilt = -0.42 + 0.05 * sway(frame.t, 0.4, 0, frame.reducedMotion);
  withTransform(ctx, { y: -110, rotate: tilt }, () => {
    paint(ctx, (c) => roundRectPath(c, -58, -8, 40, 16, 4), shade(brass, -0.12), { width: 2.6 });
    paint(ctx, (c) => roundRectPath(c, -22, -10, 44, 20, 4), brass, { width: 2.6 });
    paint(ctx, (c) => roundRectPath(c, 18, -13, 38, 26, 4), shade(brass, 0.12), { width: 2.6 });
    band(ctx, -20, -8, 50, -5, alpha("#FFFFFF", 0.4));
    ctx.beginPath();
    ellipsePath(ctx, 56, 0, 3, 11);
    ctx.fillStyle = "#BFE8F5";
    ctx.fill();
  });
};

const orrery: Decor = (ctx, frame) => {
  pedestal(ctx, 70, 80, "#5A4A8A");
  const cy = -118;
  const t = frame.reducedMotion ? 0 : frame.t;
  line(ctx, [{ x: 0, y: -70 }, { x: 0, y: cy }], outlineFor(brass), 7);
  line(ctx, [{ x: 0, y: -70 }, { x: 0, y: cy }], brass, 4);
  ctx.beginPath();
  ellipsePath(ctx, 0, cy, 70, 16);
  ctx.strokeStyle = alpha("#E8C66A", 0.5);
  ctx.lineWidth = 1.6;
  ctx.stroke();
  const planets: [number, number, number, string][] = [
    [30, 0.9, 6, "#9EE6FF"],
    [50, 0.55, 8, "#F49A7A"],
    [68, 0.3, 7, "#C9B6F2"],
  ];
  const drawPlanet = (r: number, speed: number, size: number, color: string, front: boolean) => {
    const a = t * speed + r;
    const s = Math.sin(a);
    if (s >= 0 !== front) return;
    const x = Math.cos(a) * r;
    const y = cy + s * r * 0.22;
    line(ctx, [{ x: 0, y: cy }, { x, y }], alpha(brass, 0.9), 2);
    paint(ctx, (c) => circlePath(c, x, y, size), color, { width: 2 });
  };
  for (const p of planets) drawPlanet(p[0], p[1], p[2], p[3], false);
  glow(ctx, 0, cy, 60, "#FFF2B3", 0.8);
  paint(ctx, (c) => circlePath(c, 0, cy, 14), "#FFE58A", { width: 2.6 });
  for (const p of planets) drawPlanet(p[0], p[1], p[2], p[3], true);
  sparkle(ctx, -40, cy - 34, 5, "#FFF2B3");
  sparkle(ctx, 46, cy - 40, 4, "#FFFFFF");
};

const jellyJar: Decor = (ctx, frame) => {
  floorShadow(ctx, 110);
  // Coral stand.
  paint(ctx, (c) => roundRectPath(c, -44, -30, 88, 30, 10), "#F28C8C", { width: 3 });
  const cy = -96;
  const bob = 6 * sway(frame.t, 0.9, 0, frame.reducedMotion);
  glow(ctx, 0, cy + bob, 90, "#5FE3D0", 0.7);
  paintIn(
    ctx,
    (c) => roundRectPath(c, -42, -150, 84, 120, [24, 24, 14, 14]),
    alpha("#BFF5EC", 0.35),
    () => {
      band(ctx, -42, -60, 42, -30, alpha("#5FE3D0", 0.25));
      withTransform(ctx, { y: cy + bob }, () => {
        for (let k = -2; k <= 2; k++) {
          ctx.beginPath();
          ctx.moveTo(k * 7, 0);
          ctx.bezierCurveTo(k * 8 + 6 * sway(frame.t, 2, k, frame.reducedMotion), 14, k * 6 - 6, 26, k * 8, 40);
          ctx.strokeStyle = alpha("#9EF7E8", 0.9);
          ctx.lineWidth = 2.4;
          ctx.stroke();
        }
        paint(ctx, (c) => {
          c.moveTo(-24, 2);
          c.bezierCurveTo(-26, -26, 26, -26, 24, 2);
          c.quadraticCurveTo(0, 8, -24, 2);
          c.closePath();
        }, alpha("#7FF2DE", 0.9), { stroke: "#2E9C8F", width: 2.4 });
        for (const side of [-1, 1]) {
          ctx.beginPath();
          circlePath(ctx, side * 7, -8, 2.4);
          ctx.fillStyle = "#1E4E48";
          ctx.fill();
        }
      });
      band(ctx, -34, -146, -26, -40, alpha("#FFFFFF", 0.5));
    },
    { stroke: alpha("#2E6F80", 0.9), width: 3.2 },
  );
  paint(ctx, (c) => roundRectPath(c, -32, -160, 64, 14, 5), "#B5835A", { width: 3 });
};

const sunWindow: Decor = (ctx, frame) => {
  floorShadow(ctx, 110);
  paint(ctx, (c) => roundRectPath(c, -50, -14, 100, 14, 4), "#7C4A18", { width: 3 });
  for (const x of [-38, 38]) paint(ctx, (c) => roundRectPath(c, x - 5, -40, 10, 30, 3), "#C9A24A", { width: 2.4 });
  stainedGlass(ctx, 0, -158, 92, 118, SHIPS.find((s) => s.id === "chalkydri-solar-ark") ?? SHIPS[0], frame, 1);
};

const ofrenda: Decor = (ctx, frame) => {
  floorShadow(ctx, 160);
  const cloth = "#7A3E9D";
  paint(ctx, (c) => roundRectPath(c, -76, -56, 152, 56, 4), cloth, { width: 3 });
  paint(ctx, (c) => roundRectPath(c, -54, -98, 108, 44, 4), shade(cloth, 0.12), { width: 3 });
  // Papel picado edging.
  for (const [y, w] of [
    [-56, 76],
    [-98, 54],
  ] as const) {
    for (let x = -w; x < w; x += 12) {
      paint(ctx, (c) => {
        c.moveTo(x, y);
        c.lineTo(x + 12, y);
        c.lineTo(x + 12, y + 10);
        c.quadraticCurveTo(x + 6, y + 6, x, y + 10);
        c.closePath();
      }, ["#FF7AC6", "#FFB84D", "#3DF2C2", "#FFE25C"][Math.abs(Math.round(x / 12)) % 4], { width: 1.2 });
    }
  }
  // Marigold garland.
  for (let k = 0; k <= 12; k++) {
    const t = k / 12;
    const x = -74 + 148 * t;
    const y = -30 + 16 * 4 * t * (1 - t);
    paint(ctx, (c) => circlePath(c, x, y, 6), k % 3 ? "#FF8A1F" : "#FFC94A", { width: 1.4 });
  }
  // Sugar skull, a framed picture and the candle.
  paint(ctx, (c) => {
    c.moveTo(-40, -98);
    c.bezierCurveTo(-58, -100, -58, -132, -40, -132);
    c.bezierCurveTo(-22, -132, -22, -100, -40, -98);
    c.closePath();
  }, "#FFF6EA", { width: 2.4 });
  for (const side of [-1, 1]) paint(ctx, (c) => circlePath(c, -40 + side * 6, -118, 4.5), side > 0 ? "#3DF2C2" : "#FF7AC6", { width: 1.4 });
  paint(ctx, (c) => circlePath(c, -40, -108, 2), INK, { stroke: false });
  paint(ctx, (c) => roundRectPath(c, 8, -142, 36, 44, 4), "#E3B341", { width: 2.6 });
  paint(ctx, (c) => roundRectPath(c, 14, -136, 24, 32, 3), "#FFD6A0", { width: 1.6 });
  paint(ctx, (c) => circlePath(c, 26, -124, 6), "#9A6A44", { stroke: false });
  paint(ctx, (c) => roundRectPath(c, -12, -132, 14, 34, 3), "#FFF6EA", { width: 2.2 });
  const f = flicker(frame, 3);
  paint(ctx, (c) => {
    c.moveTo(-5, -133);
    c.quadraticCurveTo(-11, -142, -5, -133 - 19 * f);
    c.quadraticCurveTo(1, -142, -5, -133);
    c.closePath();
  }, "#FFC94A", { stroke: "#E5532D", width: 1.6 });
  glow(ctx, -5, -142, 70, "#FFB84D", 0.9 * f);
};

const kaijuScale: Decor = (ctx, frame) => {
  floorShadow(ctx, 120);
  const legs = "#5E4632";
  for (const [x0, x1] of [
    [-44, -14],
    [44, 14],
  ]) {
    line(ctx, [{ x: x0, y: 0 }, { x: x1, y: -150 }], outlineFor(legs), 8);
    line(ctx, [{ x: x0, y: 0 }, { x: x1, y: -150 }], legs, 4.5);
  }
  paint(ctx, (c) => roundRectPath(c, -60, -64, 120, 10, 4), legs, { width: 3 });
  paint(ctx, (c) => roundRectPath(c, -54, -160, 108, 100, 12), "#6B4A33", { width: 3 });
  const pulse = 0.7 + 0.3 * sway(frame.t, 1.1, 0, frame.reducedMotion);
  glow(ctx, 0, -110, 80, "#39FF88", 0.45 * pulse);
  const grad = linearGradient(ctx, -36, -150, 36, -70, [
    [0, "#3E8E86"],
    [0.5, "#2F6F73"],
    [1, "#5B3E8A"],
  ]);
  // One great scale: a rounded top tapering to a point, with growth ridges.
  const edge = (c: Ctx, k: number) => {
    const w = 40 * k;
    const top = -110 - 40 * k;
    const tip = -110 + 44 * k;
    c.moveTo(0, tip);
    c.bezierCurveTo(-w * 0.6, tip - 20 * k, -w, -110 + 6 * k, -w, -118 * 1 + (1 - k) * 8);
    c.bezierCurveTo(-w, top + 4, -w * 0.5, top, 0, top);
    c.bezierCurveTo(w * 0.5, top, w, top + 4, w, -118 + (1 - k) * 8);
    c.bezierCurveTo(w, -110 + 6 * k, w * 0.6, tip - 20 * k, 0, tip);
    c.closePath();
  };
  paintIn(
    ctx,
    (c) => edge(c, 1),
    grad,
    () => {
      ctx.strokeStyle = alpha("#9FE8D2", 0.55);
      ctx.lineWidth = 1.8;
      for (const k of [0.78, 0.56, 0.34]) {
        ctx.beginPath();
        edge(ctx, k);
        ctx.stroke();
      }
      ctx.beginPath();
      ellipsePath(ctx, -16, -128, 7, 13, 0.4);
      ctx.fillStyle = alpha("#FFFFFF", 0.3);
      ctx.fill();
    },
    { stroke: mix("#39FF88", "#0A3A1E", 0.3 * (1 - pulse)), width: 4 },
  );
};

const bustOnColumn: Decor = (ctx, frame) => {
  const marble = "#EDE8DC";
  floorShadow(ctx, 90);
  paint(ctx, (c) => roundRectPath(c, -36, -14, 72, 14, 3), shade(marble, -0.08), { width: 3 });
  paintIn(ctx, (c) => roundRectPath(c, -24, -90, 48, 78, 2), marble, () => {
    ctx.strokeStyle = alpha(shade(marble, -0.3), 0.6);
    ctx.lineWidth = 1.6;
    for (let x = -16; x <= 16; x += 8) {
      ctx.beginPath();
      ctx.moveTo(x, -90);
      ctx.lineTo(x, -12);
      ctx.stroke();
    }
  }, { width: 3 });
  paint(ctx, (c) => roundRectPath(c, -32, -100, 64, 12, 3), shade(marble, -0.05), { width: 3 });
  // The bust: shoulders, neck, a serene face with curls.
  paint(ctx, (c) => {
    c.moveTo(-34, -100);
    c.bezierCurveTo(-34, -124, -16, -128, 0, -128);
    c.bezierCurveTo(16, -128, 34, -124, 34, -100);
    c.closePath();
  }, marble, { width: 3 });
  paint(ctx, (c) => roundRectPath(c, -8, -140, 16, 16, 4), shade(marble, -0.06), { width: 2.6 });
  paint(ctx, (c) => ellipsePath(c, 0, -154, 18, 22), marble, { width: 3 });
  for (const [x, y] of [
    [-14, -168],
    [-4, -174],
    [8, -172],
    [16, -164],
    [-18, -156],
  ])
    paint(ctx, (c) => circlePath(c, x, y, 6.5), shade(marble, -0.04), { width: 2 });
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 9 - 4, -152);
    ctx.quadraticCurveTo(side * 9, -156, side * 9 + 4, -152);
    ctx.strokeStyle = shade(marble, -0.55);
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
  ivy(ctx, [{ x: 22, y: -100 }, { x: -20, y: -76 }, { x: 22, y: -48 }, { x: -18, y: -20 }, { x: 10, y: -4 }], frame, 7, "#4F7A3A", 12);
  ivy(ctx, [{ x: -24, y: -112 }, { x: -6, y: -122 }, { x: 18, y: -112 }], frame, 8, "#5E8A45", 11);
};

const woodstove: Decor = (ctx, frame) => {
  floorShadow(ctx, 130);
  const iron = "#2E2B2B";
  for (const x of [-42, 42]) paint(ctx, (c) => roundRectPath(c, x - 6, -22, 12, 22, 3), iron, { width: 2.6 });
  paintIn(ctx, (c) => roundRectPath(c, -56, -96, 112, 78, 12), iron, () => {
    band(ctx, 30, -96, 60, -18, shade(iron, 0.06));
    band(ctx, -46, -92, -40, -24, alpha("#FFFFFF", 0.12));
  }, { width: 3.5 });
  // Fire window.
  const f = flicker(frame, 5);
  paintIn(ctx, (c) => roundRectPath(c, -30, -78, 60, 44, [22, 22, 4, 4]), "#4A1E10", () => {
    for (let k = 0; k < 3; k++) {
      const x = -14 + k * 14;
      const h = (22 + k * 4) * (0.85 + 0.15 * sway(frame.t, 7 + k, k, frame.reducedMotion));
      ctx.beginPath();
      ctx.moveTo(x - 9, -34);
      ctx.quadraticCurveTo(x - 8, -34 - h * 0.7, x, -34 - h);
      ctx.quadraticCurveTo(x + 8, -34 - h * 0.7, x + 9, -34);
      ctx.closePath();
      ctx.fillStyle = k === 1 ? "#FFC94A" : "#FF8A3D";
      ctx.fill();
    }
  }, { stroke: "#8A8A8A", width: 3 });
  for (let k = -1; k <= 1; k++) line(ctx, [{ x: k * 14, y: -76 }, { x: k * 14, y: -36 }], "#8A8A8A", 2);
  glow(ctx, 0, -56, 90, "#FF9A4D", 0.75 * f);
  // Stovepipe and a kettle on top.
  paint(ctx, (c) => roundRectPath(c, 22, -170, 18, 76, 4), iron, { width: 3 });
  paint(ctx, (c) => roundRectPath(c, 18, -126, 26, 6, 2), shade(iron, 0.2), { width: 2 });
  paint(ctx, (c) => roundRectPath(c, -62, -104, 124, 10, 4), shade(iron, 0.12), { width: 3 });
  paint(ctx, (c) => {
    c.moveTo(-36, -104);
    c.bezierCurveTo(-40, -132, -2, -132, -6, -104);
    c.closePath();
  }, "#D96C2C", { width: 2.6 });
  line(ctx, [{ x: -8, y: -116 }, { x: 2, y: -124 }], outlineFor("#D96C2C"), 5);
  line(ctx, [{ x: -8, y: -116 }, { x: 2, y: -124 }], "#D96C2C", 2.5);
  ctx.beginPath();
  ctx.arc(-21, -126, 9, Math.PI, 0);
  ctx.strokeStyle = "#3B2412";
  ctx.lineWidth = 2.2;
  ctx.stroke();
  const steam = frame.reducedMotion ? 0 : (frame.t * 10) % 20;
  for (let k = 0; k < 2; k++) {
    ctx.beginPath();
    circlePath(ctx, 6 + k * 6, -132 - k * 12 - steam * 0.5, 4 + k * 2);
    ctx.fillStyle = alpha("#FFFFFF", 0.5 - k * 0.15);
    ctx.fill();
  }
};

const DECOR: Record<string, Decor> = {
  "woolly-wanderer": sheepPlush,
  "golden-mane": shipInBottle,
  "floating-galley": copperPans,
  sunfish: sonar,
  "crimson-corsair": treasureChest,
  "admiralty-battleship": signalFlags,
  "ironwood-war-galleon": shipsClock,
  "riveted-ironclad": gauges,
  "thunder-dreadnought": tripodScope,
  "pegasus-cloud-galleon": orrery,
  "merfolk-coral-caravel": jellyJar,
  "chalkydri-solar-ark": sunWindow,
  "alebrijes-spirit-galleon": ofrenda,
  "kaiju-behemoth-carrier": kaijuScale,
  "gorgon-stone-trireme": bustOnColumn,
  "sasquatch-cedar-brig": woodstove,
};
