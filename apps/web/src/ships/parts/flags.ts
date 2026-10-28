// Flags for every FlagId, hoisted at layout.flag and streaming toward the stern
// (left). The cloth waves as a traveling sine; emblems ride the wave with a
// matching shear, so they bend with the cloth without an offscreen canvas.

import type { FlagId, ShipDefinition } from "@ship/shared-types";
import { INK, alpha, circlePath, clamp, ellipsePath, mix, outlineFor, paint, roundRectPath, shade, smoothClosedPath } from "../../ship-engine/draw.js";
import type { Ctx, FrameInfo, Point } from "../../ship-engine/types.js";
import { FLAG_DROP, glow, isNight } from "../kit.js";
import { sparkle } from "./sails.js";

export const FLAG_LENGTH = 116;
export const FLAG_HEIGHT = 70;

interface Cloth {
  /** Screen point for flag-space (u along the flag from the pole, v down). */
  at(u: number, v: number): Point;
  len: number;
  y0: number;
}

const FIELD: Record<FlagId, string> = {
  "jolly-roger": "#22202A",
  "straw-skull": "#24344F",
  "crossed-quills": "#C8452F",
  anchor: "#1F4E79",
  admiralty: "#1F3A5F",
  constellation: "#241C5A",
  sun: "#E5532D",
  marigold: "#4A1E6B",
  trident: "#1B8A8F",
  laurel: "#F4F1E6",
  pine: "#DCEAF1",
  "kaiju-claw": "#151E24",
};

export function drawFlag(ctx: Ctx, id: FlagId, pole: Point, frame: FrameInfo, ship: ShipDefinition): void {
  const w = frame.wind;
  const speed = (3 + 4 * w) * (frame.reducedMotion ? 0.08 : 1);
  const amp = 3 + 7 * w;
  const len = FLAG_LENGTH * (0.86 + 0.14 * w);
  const y0 = pole.y + 4;
  const H = Math.min(FLAG_HEIGHT, FLAG_DROP - 8);
  const off = (u: number) => amp * u * Math.sin(u * 2.4 * Math.PI - frame.t * speed) + (1 - w) * 12 * u * u;
  const cloth: Cloth = { at: (u, v) => ({ x: pole.x - u * len, y: y0 + v * H * (1 - 0.08 * u * (1 - w)) + off(u) }), len, y0 };
  const field = FIELD[id] ?? "#22202A";
  const outline = (c: Ctx) => region(c, cloth, 0, 1, 0, 1);

  ctx.beginPath();
  outline(ctx);
  ctx.fillStyle = field;
  ctx.fill();
  ctx.save();
  ctx.clip();
  try {
    emblem(ctx, id, cloth, off, frame, ship);
    folds(ctx, cloth, off);
  } finally {
    ctx.restore();
  }
  ctx.beginPath();
  outline(ctx);
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.strokeStyle = outlineFor(field === "#F4F1E6" || field === "#DCEAF1" ? "#8A9AA6" : field);
  ctx.stroke();
  // Toggles on the halyard.
  paint(ctx, (c) => roundRectPath(c, pole.x - 3, y0 - 2, 6, 7, 2), "#E8E0CC", { width: 1.6 });
  paint(ctx, (c) => roundRectPath(c, pole.x - 3, y0 + H - 5, 6, 7, 2), "#E8E0CC", { width: 1.6 });
}

/** A (u, v) rectangle of the cloth as a closed path that follows the wave. */
function region(c: Ctx, cloth: Cloth, u0: number, u1: number, v0: number, v1: number): void {
  const n = Math.max(2, Math.ceil((u1 - u0) * 16));
  for (let k = 0; k <= n; k++) {
    const p = cloth.at(u0 + ((u1 - u0) * k) / n, v0);
    if (k === 0) c.moveTo(p.x, p.y);
    else c.lineTo(p.x, p.y);
  }
  for (let k = n; k >= 0; k--) {
    const p = cloth.at(u0 + ((u1 - u0) * k) / n, v1);
    c.lineTo(p.x, p.y);
  }
  c.closePath();
}

function folds(ctx: Ctx, cloth: Cloth, off: (u: number) => number): void {
  const n = 16;
  for (let k = 0; k < n; k++) {
    const u0 = k / n;
    const u1 = (k + 1) / n;
    const slope = off(u1) - off(u0);
    const a = clamp(slope * 0.07, -0.22, 0.22);
    if (Math.abs(a) < 0.02) continue;
    ctx.beginPath();
    region(ctx, cloth, u0, u1 + 0.002, 0, 1);
    ctx.fillStyle = a > 0 ? alpha(INK, a) : alpha("#FFFFFF", -a * 0.8);
    ctx.fill();
  }
}

/** Runs `draw` in emblem space centered at (u, v): x right, y down, in flag units, sheared to follow the wave. */
function onCloth(ctx: Ctx, cloth: Cloth, off: (u: number) => number, u: number, v: number, draw: () => void): void {
  const p = cloth.at(u, v);
  const du = 0.02;
  const k = (off(u + du) - off(u - du)) / (-2 * du * cloth.len);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.transform(1, k, 0, 1, 0, 0);
  ctx.scale(cloth.len / FLAG_LENGTH, 1);
  try {
    draw();
  } finally {
    ctx.restore();
  }
}

function emblem(ctx: Ctx, id: FlagId, cloth: Cloth, off: (u: number) => number, frame: FrameInfo, ship: ShipDefinition): void {
  const on = (u: number, v: number, draw: () => void) => onCloth(ctx, cloth, off, u, v, draw);
  switch (id) {
    case "jolly-roger":
      on(0.5, 0.5, () => {
        crossbones(ctx, 0, 6, 1, "#F4EEDC");
        skull(ctx, 0, -2, 1, "#F4EEDC", false);
      });
      break;
    case "straw-skull":
      // The Sun-Hat Skull: a lilac sun hat with a teal band and a daisy, round
      // study glasses and a wink, over big crossed quills (never bones).
      on(0.5, 0.53, () => {
        studyQuill(ctx, 0, 13, 0.8);
        studyQuill(ctx, 0, 13, -0.8);
        skull(ctx, 0, 3, 1, "#F6F0DE", true);
        studyGlasses(ctx, 0, 3, 0.95);
        sunHat(ctx, 0, -14);
      });
      break;
    case "crossed-quills":
      on(0.5, 0.5, () => {
        quill(ctx, 0, 2, 0.6, 1.15);
        quill(ctx, 0, 2, -0.6, 1.15);
        inkpot(ctx, 0, 16);
        sparkle(ctx, 0, -22, 6, "#FFE08A");
      });
      break;
    case "anchor":
      on(0.5, 0.5, () => anchorMark(ctx, 0, 0, "#F2C14E"));
      break;
    case "admiralty":
      ctx.beginPath();
      region(ctx, cloth, 0, 1, 0.4, 0.6);
      region(ctx, cloth, 0.3, 0.44, 0, 1);
      ctx.fillStyle = "#F4F6F8";
      ctx.fill();
      on(0.74, 0.22, () => star5(ctx, 0, 0, 7, "#F2C14E"));
      break;
    case "constellation":
      on(0.5, 0.5, () => constellation(ctx, frame));
      break;
    case "sun":
      on(0.5, 0.5, () => sunDisc(ctx, 0, 0, 1));
      break;
    case "marigold":
      on(0.5, 0.5, () => marigold(ctx, 0, 2, 1));
      break;
    case "trident":
      ctx.beginPath();
      region(ctx, cloth, 0, 1, 0.82, 1);
      ctx.fillStyle = shade(FIELD.trident, -0.25);
      ctx.fill();
      on(0.5, 0.46, () => tridentMark(ctx, 0, 0, "#F2C14E"));
      break;
    case "laurel":
      ctx.beginPath();
      region(ctx, cloth, 0, 1, 0, 0.1);
      region(ctx, cloth, 0, 1, 0.9, 1);
      ctx.fillStyle = "#4F7A3A";
      ctx.fill();
      on(0.5, 0.5, () => laurelWreath(ctx, 0, 0, 1));
      break;
    case "pine":
      on(0.5, 0.5, () => pineMark(ctx));
      break;
    case "kaiju-claw":
      on(0.5, 0.5, () => {
        const neon = "#39FF88";
        if (isNight(ship)) glow(ctx, 0, 0, 46, neon, 0.6);
        for (let k = -1; k <= 1; k++) slash(ctx, k * 15, 0, neon);
      });
      break;
  }
}

// ---------------------------------------------------------------------------
// Emblem pieces (emblem space, roughly 60 x 56)

function skull(ctx: Ctx, x: number, y: number, s: number, bone: string, grin: boolean): void {
  paint(ctx, (c) => {
    c.moveTo(x - 13 * s, y - 2 * s);
    c.bezierCurveTo(x - 15 * s, y - 22 * s, x + 15 * s, y - 22 * s, x + 13 * s, y - 2 * s);
    c.quadraticCurveTo(x + 13 * s, y + 6 * s, x + 8 * s, y + 7 * s);
    c.lineTo(x + 8 * s, y + 13 * s);
    c.quadraticCurveTo(x, y + 16 * s, x - 8 * s, y + 13 * s);
    c.lineTo(x - 8 * s, y + 7 * s);
    c.quadraticCurveTo(x - 13 * s, y + 6 * s, x - 13 * s, y - 2 * s);
    c.closePath();
  }, bone, { width: 2.4 });
  ctx.fillStyle = INK;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ellipsePath(ctx, x + side * 5.4 * s, y - 2 * s, 3.8 * s, (grin ? 3.4 : 4.4) * s);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(x, y + 3 * s);
  ctx.lineTo(x - 2.2 * s, y + 6.5 * s);
  ctx.lineTo(x + 2.2 * s, y + 6.5 * s);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6 * s;
  ctx.lineCap = "round";
  ctx.beginPath();
  if (grin) {
    ctx.moveTo(x - 6 * s, y + 9 * s);
    ctx.quadraticCurveTo(x, y + 13.5 * s, x + 6 * s, y + 9 * s);
    for (const dx of [-3, 0, 3]) {
      ctx.moveTo(x + dx * s, y + 10 * s);
      ctx.lineTo(x + dx * s, y + 12.5 * s);
    }
  } else {
    for (const dx of [-4, 0, 4]) {
      ctx.moveTo(x + dx * s, y + 9 * s);
      ctx.lineTo(x + dx * s, y + 13 * s);
    }
  }
  ctx.stroke();
}

function crossbones(ctx: Ctx, x: number, y: number, s: number, bone: string): void {
  for (const a of [0.62, -0.62]) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    paint(ctx, (c) => {
      roundRectPath(c, -22 * s, -2.6 * s, 44 * s, 5.2 * s, 2.6 * s);
      for (const end of [-1, 1]) {
        circlePath(c, end * 23 * s, -3 * s, 3.6 * s);
        circlePath(c, end * 23 * s, 3 * s, 3.6 * s);
      }
    }, bone, { width: 2.2 });
    ctx.restore();
  }
}

/** A wide, floppy lilac sun hat with a teal band and a daisy. Deliberately not a straw hat. */
function sunHat(ctx: Ctx, x: number, y: number): void {
  const hat = "#C9B6F2";
  const teal = "#3FB59A";
  const brim: Point[] = [];
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const wav = 1 + 0.1 * Math.sin(a * 6);
    // Floppy: the brim dips at both ends.
    brim.push({ x: x + Math.cos(a) * 23 * wav, y: y + Math.sin(a) * 5.4 * wav + 3.5 * Math.abs(Math.cos(a)) ** 3 });
  }
  paint(ctx, (c) => smoothClosedPath(c, brim), hat, { width: 2.6 });
  paint(ctx, (c) => {
    c.moveTo(x - 11, y);
    c.bezierCurveTo(x - 13, y - 15, x + 13, y - 15, x + 11, y);
    c.closePath();
  }, shade(hat, 0.12), { width: 2.6 });
  paint(ctx, (c) => {
    c.moveTo(x - 11.6, y);
    c.quadraticCurveTo(x, y + 3, x + 11.6, y);
    c.lineTo(x + 11, y - 5.5);
    c.quadraticCurveTo(x, y - 2.5, x - 11, y - 5.5);
    c.closePath();
  }, teal, { width: 1.8 });
  // A daisy tucked into the band.
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    paint(ctx, (c) => ellipsePath(c, x + 8 + Math.cos(a) * 3.6, y - 4 + Math.sin(a) * 3.6, 2.8, 1.7, a), "#FFFFFF", { width: 1 });
  }
  paint(ctx, (c) => circlePath(c, x + 8, y - 4, 2), "#FFC93C", { width: 1 });
}

/** Round study glasses on the skull, with a cheeky wink. */
function studyGlasses(ctx: Ctx, x: number, y: number, s: number): void {
  const gold = "#F2C14E";
  for (const side of [-1, 1]) {
    const ex = x + side * 5.6 * s;
    const ey = y - 2 * s;
    ctx.beginPath();
    circlePath(ctx, ex, ey, 5.6 * s);
    ctx.fillStyle = "#E3F4F1";
    ctx.fill();
    ctx.lineWidth = 4.6;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = gold;
    ctx.stroke();
  }
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x - 1.4 * s, y - 2.6 * s);
  ctx.quadraticCurveTo(x, y - 4 * s, x + 1.4 * s, y - 2.6 * s);
  ctx.moveTo(x - 11.2 * s, y - 3 * s);
  ctx.lineTo(x - 13 * s, y - 5 * s);
  ctx.moveTo(x + 11.2 * s, y - 3 * s);
  ctx.lineTo(x + 13 * s, y - 5 * s);
  ctx.strokeStyle = gold;
  ctx.lineWidth = 2.2;
  ctx.stroke();
  // Left eye winks, right eye looks out.
  ctx.beginPath();
  ctx.moveTo(x - 8.4 * s, y - 1.4 * s);
  ctx.quadraticCurveTo(x - 5.6 * s, y - 4.6 * s, x - 2.8 * s, y - 1.4 * s);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  circlePath(ctx, x + 5.6 * s, y - 2 * s, 2.3 * s);
  ctx.fillStyle = INK;
  ctx.fill();
}

/** A big writing quill: a notched, teal-tinted feather vane, a bare shaft and an ink-dipped nib. */
function studyQuill(ctx: Ctx, x: number, y: number, angle: number): void {
  const vane = "#A8E6D6";
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  paint(ctx, (c) => {
    c.moveTo(0, -50);
    c.bezierCurveTo(8, -45, 11, -32, 10, -22);
    c.lineTo(6.5, -19);
    c.lineTo(9.5, -15);
    c.bezierCurveTo(8.5, -6, 5, 2, 1.4, 6);
    c.lineTo(-1.4, 6);
    c.bezierCurveTo(-5, 0, -7.5, -8, -7.5, -16);
    c.lineTo(-4.8, -20);
    c.lineTo(-7.5, -24);
    c.bezierCurveTo(-7.5, -36, -4, -45, 0, -50);
    c.closePath();
  }, vane, { width: 2.2 });
  ctx.strokeStyle = shade(vane, -0.4);
  ctx.lineCap = "round";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  for (let k = 0; k < 7; k++) {
    const yy = -42 + k * 7;
    ctx.moveTo(0, yy + 2);
    ctx.lineTo(7, yy - 3);
    ctx.moveTo(0, yy + 4);
    ctx.lineTo(-5.5, yy);
  }
  ctx.stroke();
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(0, -48);
  ctx.lineTo(0, 15);
  ctx.stroke();
  paint(ctx, (c) => roundRectPath(c, -2, 6, 4, 10, 1.5), "#F4EAD0", { width: 1.6 });
  paint(ctx, (c) => {
    c.moveTo(-2.8, 15);
    c.lineTo(2.8, 15);
    c.lineTo(0, 25);
    c.closePath();
  }, "#1A1A22", { stroke: "#0A0A10", width: 1.6 });
  ctx.restore();
}

function quill(ctx: Ctx, x: number, y: number, angle: number, s: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  paint(ctx, (c) => {
    c.moveTo(0, -30 * s);
    c.bezierCurveTo(9 * s, -24 * s, 7 * s, 4 * s, 1.5 * s, 12 * s);
    c.lineTo(-1.5 * s, 12 * s);
    c.bezierCurveTo(-7 * s, 2 * s, -6 * s, -22 * s, 0, -30 * s);
    c.closePath();
  }, "#FBF6EA", { width: 2 });
  ctx.strokeStyle = shade("#FBF6EA", -0.35);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -27 * s);
  ctx.lineTo(0, 16 * s);
  for (let k = 0; k < 4; k++) {
    const yy = -20 * s + k * 7 * s;
    ctx.moveTo(0, yy);
    ctx.lineTo(4 * s, yy - 3 * s);
  }
  ctx.stroke();
  paint(ctx, (c) => {
    c.moveTo(-1.8 * s, 12 * s);
    c.lineTo(1.8 * s, 12 * s);
    c.lineTo(0, 21 * s);
    c.closePath();
  }, "#E3B341", { width: 1.6 });
  ctx.restore();
}

function inkpot(ctx: Ctx, x: number, y: number): void {
  paint(ctx, (c) => roundRectPath(c, x - 9, y - 7, 18, 13, 5), "#24344F", { width: 2 });
  paint(ctx, (c) => roundRectPath(c, x - 5, y - 11, 10, 5, 2), "#E3B341", { width: 1.6 });
}

function anchorMark(ctx: Ctx, x: number, y: number, gold: string): void {
  const s = outlineFor(gold);
  ctx.lineCap = "round";
  const stroke = (w: number, color: string) => {
    ctx.beginPath();
    ctx.arc(x, y - 19, 5, 0, Math.PI * 2);
    ctx.moveTo(x, y - 14);
    ctx.lineTo(x, y + 20);
    ctx.moveTo(x - 12, y - 8);
    ctx.lineTo(x + 12, y - 8);
    ctx.moveTo(x - 19, y + 6);
    ctx.quadraticCurveTo(x - 16, y + 21, x, y + 21);
    ctx.quadraticCurveTo(x + 16, y + 21, x + 19, y + 6);
    ctx.lineWidth = w;
    ctx.strokeStyle = color;
    ctx.stroke();
  };
  stroke(9, s);
  stroke(5, gold);
  for (const side of [-1, 1]) {
    paint(ctx, (c) => {
      c.moveTo(x + side * 19, y + 1);
      c.lineTo(x + side * 24, y + 9);
      c.lineTo(x + side * 15, y + 9);
      c.closePath();
    }, gold, { width: 2 });
  }
  ctx.beginPath();
  ctx.moveTo(x - 7, y - 2);
  ctx.bezierCurveTo(x + 10, y, x - 10, y + 8, x + 6, y + 12);
  ctx.strokeStyle = "#F4EEDC";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function star5(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  paint(ctx, (c) => {
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const rr = k % 2 === 0 ? r : r * 0.45;
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (k === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.closePath();
  }, color, { width: 1.6 });
}

const HORSE: Point[] = [
  { x: -30, y: -16 },
  { x: -20, y: -8 },
  { x: -6, y: -4 },
  { x: 14, y: -2 },
  { x: 28, y: -12 },
  { x: 18, y: 16 },
  { x: -12, y: 18 },
  { x: -4, y: -24 },
  { x: 10, y: -22 },
];
const HORSE_LINES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [3, 5],
  [2, 6],
  [2, 7],
  [7, 8],
  [8, 3],
];

function constellation(ctx: Ctx, frame: FrameInfo): void {
  ctx.strokeStyle = alpha("#E6DEFF", 0.55);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (const [a, b] of HORSE_LINES) {
    ctx.moveTo(HORSE[a].x, HORSE[a].y);
    ctx.lineTo(HORSE[b].x, HORSE[b].y);
  }
  ctx.stroke();
  HORSE.forEach((p, k) => {
    const tw = 0.5 + 0.5 * Math.sin(frame.t * (frame.reducedMotion ? 0.2 : 2.4) + k * 1.9);
    sparkle(ctx, p.x, p.y, 3.5 + (k % 3 === 0 ? 2 : 0) + tw * 1.5, k % 2 ? "#FFF2B3" : "#FFFFFF");
  });
}

function sunDisc(ctx: Ctx, x: number, y: number, s: number): void {
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const r0 = 13 * s;
    const r1 = (k % 2 ? 23 : 27) * s;
    paint(ctx, (c) => {
      c.moveTo(x + Math.cos(a - 0.17) * r0, y + Math.sin(a - 0.17) * r0);
      c.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
      c.lineTo(x + Math.cos(a + 0.17) * r0, y + Math.sin(a + 0.17) * r0);
      c.closePath();
    }, k % 2 ? "#FFB347" : "#FFD166", { width: 1.8 });
  }
  paint(ctx, (c) => circlePath(c, x, y, 14 * s), "#FFD166", { width: 2.2 });
  ctx.strokeStyle = shade("#FFD166", -0.55);
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const side of [-1, 1]) {
    ctx.moveTo(x + side * 7 * s, y - 2 * s);
    ctx.quadraticCurveTo(x + side * 4.5 * s, y - 4.5 * s, x + side * 2 * s, y - 2 * s);
  }
  ctx.moveTo(x - 4 * s, y + 4 * s);
  ctx.quadraticCurveTo(x, y + 7.5 * s, x + 4 * s, y + 4 * s);
  ctx.stroke();
}

function marigold(ctx: Ctx, x: number, y: number, s: number): void {
  for (const side of [-1, 1]) {
    paint(ctx, (c) => ellipsePath(c, x + side * 14 * s, y + 18 * s, 10 * s, 4 * s, side * 0.5), "#4E9A4A", { width: 1.6 });
  }
  const rings: [number, number, string][] = [
    [17, 14, "#FF8A1F"],
    [12, 11, "#FFA62E"],
    [7, 8, "#FFC94A"],
  ];
  for (const [r, n, color] of rings) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + r;
      paint(ctx, (c) => circlePath(c, x + Math.cos(a) * r * s, y + Math.sin(a) * r * s * 0.95, 5.6 * s), color, { width: 1.4 });
    }
  }
  paint(ctx, (c) => circlePath(c, x, y, 4 * s), "#E0601A", { width: 1.4 });
}

function tridentMark(ctx: Ctx, x: number, y: number, gold: string): void {
  paint(ctx, (c) => roundRectPath(c, x - 2.6, y - 10, 5.2, 34, 2), gold, { width: 2 });
  paint(ctx, (c) => {
    c.moveTo(x - 15, y - 22);
    c.lineTo(x - 15, y - 8);
    c.quadraticCurveTo(x - 14, y - 2, x, y - 2);
    c.quadraticCurveTo(x + 14, y - 2, x + 15, y - 8);
    c.lineTo(x + 15, y - 22);
    c.lineTo(x + 11, y - 22);
    c.lineTo(x + 11, y - 9);
    c.quadraticCurveTo(x + 10, y - 6, x + 3, y - 6);
    c.lineTo(x + 3, y - 26);
    c.lineTo(x - 3, y - 26);
    c.lineTo(x - 3, y - 6);
    c.quadraticCurveTo(x - 10, y - 6, x - 11, y - 9);
    c.lineTo(x - 11, y - 22);
    c.closePath();
  }, gold, { width: 2 });
  for (const dx of [-13, 0, 13]) {
    paint(ctx, (c) => {
      c.moveTo(x + dx - 4.5, y - 22 - (dx === 0 ? 4 : 0));
      c.lineTo(x + dx, y - 31 - (dx === 0 ? 4 : 0));
      c.lineTo(x + dx + 4.5, y - 22 - (dx === 0 ? 4 : 0));
      c.closePath();
    }, gold, { width: 1.8 });
  }
  ctx.strokeStyle = "#E9FBFF";
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let k = -2; k < 2; k++) {
    const x0 = x + k * 12;
    ctx.moveTo(x0, y + 26);
    ctx.quadraticCurveTo(x0 + 6, y + 21, x0 + 12, y + 26);
  }
  ctx.stroke();
}

function laurelWreath(ctx: Ctx, x: number, y: number, s: number): void {
  const leaf = "#4F7A3A";
  for (const side of [-1, 1]) {
    for (let k = 0; k < 7; k++) {
      const a = Math.PI / 2 + side * (0.35 + k * 0.36);
      const r = 20 * s;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r * 1.05;
      paint(ctx, (c) => ellipsePath(c, px, py, 6.5 * s, 3 * s, a + (side * Math.PI) / 2.4), k % 2 ? leaf : shade(leaf, 0.2), { width: 1.4 });
    }
  }
  paint(ctx, (c) => {
    c.moveTo(x - 9, y + 19);
    c.lineTo(x + 9, y + 19);
    c.lineTo(x + 14, y + 29);
    c.lineTo(x + 6, y + 25);
    c.lineTo(x, y + 24);
    c.lineTo(x - 6, y + 25);
    c.lineTo(x - 14, y + 29);
    c.closePath();
  }, "#E3B341", { width: 1.8 });
}

function pineMark(ctx: Ctx): void {
  paint(ctx, (c) => {
    c.moveTo(-70, 22);
    c.quadraticCurveTo(-30, 8, 0, 18);
    c.quadraticCurveTo(30, 26, 70, 14);
    c.lineTo(70, 50);
    c.lineTo(-70, 50);
    c.closePath();
  }, "#FFFFFF", { width: 2 });
  paint(ctx, (c) => roundRectPath(c, -3.5, 8, 7, 12, 2), "#7A4A2B", { width: 1.8 });
  const green = "#2F5A3A";
  const tiers: [number, number][] = [
    [10, 18],
    [-2, 14],
    [-13, 10],
  ];
  for (const [y, w] of tiers) {
    paint(ctx, (c) => {
      c.moveTo(0, y - 14);
      c.lineTo(w, y);
      c.quadraticCurveTo(0, y + 3, -w, y);
      c.closePath();
    }, green, { width: 2 });
    paint(ctx, (c) => {
      c.moveTo(0, y - 14);
      c.lineTo(w * 0.42, y - 8);
      c.quadraticCurveTo(0, y - 6, -w * 0.42, y - 8);
      c.closePath();
    }, "#FFFFFF", { width: 1.2 });
  }
  ctx.fillStyle = "#FFFFFF";
  for (const [sx, sy] of [
    [-30, -20],
    [26, -16],
    [-22, 2],
    [34, 0],
    [12, -26],
  ]) {
    ctx.beginPath();
    circlePath(ctx, sx, sy, 2);
    ctx.fill();
  }
}

function slash(ctx: Ctx, x: number, y: number, neon: string): void {
  const build = (c: Ctx) => {
    c.moveTo(x - 12, y - 24);
    c.quadraticCurveTo(x + 2, y - 4, x + 10, y + 24);
    c.quadraticCurveTo(x - 4, y + 2, x - 12, y - 24);
    c.closePath();
  };
  paint(ctx, build, neon, { stroke: mix(neon, "#0A3A1E", 0.6), width: 1.8 });
  void alpha;
}
