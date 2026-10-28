// The four study tools, on the desk top in front of the sailor (station
// frame). Each has an "under" part (drawn before the hands that work on it)
// and an "over" part (the laptop lid and the little monitor, which face the
// sailor, so we see their backs).

import type { StudyToolId } from "@ship/shared-types";
import { alpha, radialGradient, shade } from "../draw.js";
import type { Ctx } from "../types.js";
import { quill } from "./arms.js";
import { anchor } from "./hats.js";
import { curvyPath, fillPath, hash01, paintShaded, strokePath, withClip, type CurvePt } from "./kit.js";
import { NIB, type Pose } from "./pose.js";

const INKLINE = "#4A4060";

export interface ToolContext {
  pose: Pose;
  seed: number;
  /** The side of the desk with free room for a monitor (+1 right, -1 left). */
  screenSide: 1 | -1;
}

export function drawToolUnder(ctx: Ctx, tool: StudyToolId, tc: ToolContext): void {
  switch (tool) {
    case "quill-logbook":
      return logbook(ctx, tc);
    case "laptop":
      if (tc.pose.lid < 0.5) closedLaptop(ctx, tc);
      return;
    case "mech-keyboard":
      return keyboard(ctx, tc);
    case "tablet":
      return tablet(ctx, tc);
  }
}

export function drawToolOver(ctx: Ctx, tool: StudyToolId, tc: ToolContext): void {
  if (tool === "laptop" && tc.pose.lid >= 0.5) openLaptop(ctx, tc);
  if (tool === "mech-keyboard") monitor(ctx, tc);
}

function scribble(ctx: Ctx, x0: number, x1: number, y: number, seed: number, width = 1.1): void {
  if (x1 - x0 < 0.5) return;
  strokePath(ctx, (c) => {
    c.moveTo(x0, y);
    let x = x0;
    let i = 0;
    while (x < x1) {
      const step = Math.min(2.2, x1 - x);
      x += step;
      c.lineTo(x, y + (hash01(seed, i++) - 0.5) * 1.1);
    }
  }, alpha(INKLINE, 0.75), width);
}

function logbook(ctx: Ctx, { pose, seed }: ToolContext): void {
  const cover: CurvePt[] = [[-21, -76], [29, -76], [32.5, -60.5], [-24.5, -60.5]];
  paintShaded(ctx, (c) => curvyPath(c, cover.map((p) => [p[0], p[1], 1] as const), 0.2), "#7B4B35", null, null);
  // Brass corners.
  for (const [x, y] of [[-23.5, -61.5], [31.5, -61.5]] as const) fillPath(ctx, (c) => c.arc(x, y, 2.2, 0, Math.PI * 2), "#E0B04A");
  const page = (pts: CurvePt[]) => (c: Ctx) => curvyPath(c, pts, 0.35);
  const left = page([[-18.5, -73.5, 1], [-7, -75], [4, -72.5, 1], [4.6, -62, 1], [-8, -63.2], [-21.5, -62.6, 1]]);
  const right = page([[4, -72.5, 1], [15, -75], [26.5, -73.5, 1], [29.5, -62.6, 1], [17, -63.2], [4.6, -62, 1]]);
  paintShaded(ctx, left, "#FBF4E2", "#EADFC6", (c) => c.rect(-2, -76, 7, 16), { stroke: "#9C8C70", width: 2.4 });
  paintShaded(ctx, right, "#FBF4E2", "#EADFC6", (c) => c.rect(4, -76, 5, 16), { stroke: "#9C8C70", width: 2.4 });
  for (let r = 0; r < 4; r++) scribble(ctx, -16 + r * 0.3, 1 - (r === 3 ? 6 : 0), -71 + r * 2.4, seed + r);
  const writing = pose.state === "SAILING_FOCUS";
  const rows = writing ? pose.write.line : 2;
  for (let r = 0; r < rows; r++) scribble(ctx, 7.5, 25, -71 + r * 2.4, seed + 10 + r);
  if (writing) {
    const nib = writingNib(pose);
    scribble(ctx, 7.5, Math.min(25, nib.x), -71 + rows * 2.4, seed + 10 + rows);
  }
  // Ink pot; the quill rests in it when the sailor isn't writing.
  paintShaded(ctx, (c) => curvyPath(c, [[33, -73], [43, -73], [45, -64], [38, -61.5], [31, -64]], 0.6), "#2E3A5C", "#1F2842", (c) => c.ellipse(42, -64, 5, 5, 0, 0, Math.PI * 2));
  fillPath(ctx, (c) => c.ellipse(35, -68, 1.2, 2.6, 0, 0, Math.PI * 2), alpha("#FFFFFF", 0.5));
  paintShaded(ctx, (c) => c.roundRect(34, -76.5, 8, 4, 1.4), "#D9A441", null, null, { width: 2 });
  if (!writing) {
    ctx.save();
    ctx.translate(39, -73);
    ctx.rotate(0.12);
    quill(ctx);
    ctx.restore();
  }
}

/** Where the quill or stylus meets the page, from the writing hand. */
export function writingNib(pose: Pose): { x: number; y: number } {
  const h = pose.arms[1].hand;
  return { x: h.x - NIB.x, y: h.y - NIB.y };
}

const STICKERS = ["star", "heart", "anchor", "wave", "moon", "smile"] as const;

function sticker(ctx: Ctx, kind: (typeof STICKERS)[number], x: number, y: number, r: number): void {
  ctx.save();
  ctx.translate(x, y);
  const white = "#FFFFFF";
  const edge = "#8D88A3";
  switch (kind) {
    case "star": {
      const pts: CurvePt[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.48 : r;
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr, 1]);
      }
      paintShaded(ctx, (c) => curvyPath(c, pts, 0), "#F5C542", null, null, { stroke: white, width: 2 });
      break;
    }
    case "heart":
      paintShaded(ctx, (c) => curvyPath(c, [[0, r * 0.9, 1], [-r, -r * 0.1], [-r * 0.5, -r * 0.8], [0, -r * 0.35, 1], [r * 0.5, -r * 0.8], [r, -r * 0.1]], 0.55), "#F07A9A", null, null, { stroke: white, width: 2 });
      break;
    case "anchor":
      paintShaded(ctx, (c) => c.arc(0, 0, r, 0, Math.PI * 2), "#2E4A86", null, null, { stroke: white, width: 2 });
      anchor(ctx, 0, 0.4, r * 0.13);
      break;
    case "wave":
      paintShaded(ctx, (c) => c.roundRect(-r, -r * 0.7, r * 2, r * 1.4, 2), "#7FC8D8", null, null, { stroke: white, width: 2 });
      strokePath(ctx, (c) => {
        c.moveTo(-r * 0.7, r * 0.1);
        c.quadraticCurveTo(-r * 0.35, -r * 0.4, 0, r * 0.1);
        c.quadraticCurveTo(r * 0.35, r * 0.5, r * 0.7, 0);
      }, white, 1.4);
      break;
    case "moon":
      paintShaded(ctx, (c) => {
        c.arc(0, 0, r, Math.PI * 0.25, Math.PI * 1.75);
        c.quadraticCurveTo(-r * 0.2, 0, r * 0.7, r * 0.7);
      }, "#F7E3A1", null, null, { stroke: white, width: 2 });
      break;
    case "smile":
      paintShaded(ctx, (c) => c.arc(0, 0, r, 0, Math.PI * 2), "#9ED37A", null, null, { stroke: white, width: 2 });
      fillPath(ctx, (c) => {
        c.arc(-r * 0.35, -r * 0.2, r * 0.13, 0, Math.PI * 2);
        c.moveTo(r * 0.48, -r * 0.2);
        c.arc(r * 0.35, -r * 0.2, r * 0.13, 0, Math.PI * 2);
      }, "#3A4A2A");
      strokePath(ctx, (c) => c.arc(0, 0, r * 0.5, 0.35, Math.PI - 0.35), "#3A4A2A", 1.1);
      break;
  }
  void edge;
  ctx.restore();
}

function stickerSet(seed: number): (typeof STICKERS)[number][] {
  const a = Math.floor(hash01(seed, 21) * STICKERS.length);
  const b = (a + 1 + Math.floor(hash01(seed, 22) * (STICKERS.length - 1))) % STICKERS.length;
  let c = (b + 1 + Math.floor(hash01(seed, 23) * (STICKERS.length - 1))) % STICKERS.length;
  if (c === a) c = (c + 1) % STICKERS.length;
  return [STICKERS[a], STICKERS[b], STICKERS[c]];
}

const LID = "#CDCADB";

function openLaptop(ctx: Ctx, { seed }: ToolContext): void {
  // The hinge edge of the base peeks out below the lid.
  paintShaded(ctx, (c) => c.roundRect(-27, -66, 54, 5.5, 2.5), "#A9A6BC", null, null);
  const lid = (c: Ctx) => curvyPath(c, [[-25, -64, 1], [-23.5, -99, 1], [23.5, -99, 1], [25, -64, 1]], 0);
  ctx.save();
  ctx.beginPath();
  // Round the corners a touch.
  ctx.roundRect(-25, -100, 50, 36, 4);
  ctx.restore();
  paintShaded(ctx, (c) => c.roundRect(-25, -100, 50, 37, 4), LID, shade(LID, -0.1), (c) => c.rect(-26, -76, 52, 14));
  void lid;
  // Logo and stickers.
  fillPath(ctx, (c) => c.arc(0, -83, 3.6, 0, Math.PI * 2), alpha("#FFFFFF", 0.55));
  const [a, b, c] = stickerSet(seed);
  sticker(ctx, a, -14, -91, 5.2);
  sticker(ctx, b, 14.5, -88, 4.8);
  sticker(ctx, c, -11, -74, 4.4);
  strokePath(ctx, (cc) => {
    cc.moveTo(-21, -97);
    cc.lineTo(21, -97);
  }, alpha("#FFFFFF", 0.45), 1.4);
}

function closedLaptop(ctx: Ctx, { seed }: ToolContext): void {
  paintShaded(ctx, (c) => curvyPath(c, [[-24, -71, 1], [24, -71, 1], [27, -61, 1], [-27, -61, 1]], 0), LID, shade(LID, -0.12), (c) => c.rect(-30, -64, 60, 5));
  const [a, b] = stickerSet(seed);
  ctx.save();
  ctx.translate(0, -66);
  ctx.scale(1, 0.45);
  sticker(ctx, a, -12, 0, 5);
  sticker(ctx, b, 12, 0, 4.6);
  ctx.restore();
}

const KEY_ACCENTS = ["#F2A7C3", "#8CC9B5", "#F5C46A", "#A9B7F0"];

function keyboard(ctx: Ctx, { pose, seed }: ToolContext): void {
  const kx = -1;
  paintShaded(ctx, (c) => curvyPath(c, [[kx - 30, -75, 1], [kx + 30, -75, 1], [kx + 32.5, -61, 1], [kx - 32.5, -61, 1]], 0), "#EFE7D6", "#DCD2BE", (c) => c.rect(kx - 34, -63.5, 68, 4));
  const accent = KEY_ACCENTS[Math.floor(hash01(seed, 31) * KEY_ACCENTS.length)];
  const rows = [
    { y: -73.2, x0: kx - 27.6, w: 4.4, n: 11, skew: 0 },
    { y: -68.6, x0: kx - 29, w: 4.6, n: 11, skew: 0 },
  ];
  rows.forEach((row, ri) => {
    for (let i = 0; i < row.n; i++) {
      const isSpace = ri === 1 && i >= 3 && i <= 7;
      if (ri === 1 && i > 3 && i <= 7) continue;
      const idx = ri * 6 + Math.floor(i / 2);
      const pressed = pose.keys[0] === idx || pose.keys[1] === idx;
      const w = isSpace ? row.w * 5 + 0.6 * 4 : row.w;
      const x = row.x0 + i * (row.w + 0.6);
      const y = row.y + (pressed ? 0.9 : 0);
      const special = (ri === 0 && (i === 0 || i === row.n - 1)) || (ri === 1 && i === row.n - 1);
      const top = pressed ? "#FFFFFF" : special ? accent : "#FBF6EC";
      paintShaded(ctx, (c) => c.roundRect(x, y, w, 3.9, 1), shade(top, -0.14), null, null, { stroke: "#9C927E", width: 1 });
      fillPath(ctx, (c) => c.roundRect(x + 0.5, y + 0.2, w - 1, 2.7, 0.8), top);
      if (pressed) fillPath(ctx, (c) => c.ellipse(x + w / 2, y + 1.5, w, 3, 0, 0, Math.PI * 2), alpha(accent, 0.35));
    }
  });
  // A soft underglow along the front.
  fillPath(ctx, (c) => c.roundRect(kx - 30, -61.8, 60, 1.6, 0.8), alpha(accent, 0.8));
}

function monitor(ctx: Ctx, { pose, screenSide }: ToolContext): void {
  const mx = screenSide * 49;
  const on = pose.state === "DRIFTING_IDLE" ? 0.35 : 1;
  const glow = radialGradient(ctx, mx, -104, 34, [
    [0, alpha("#AEE6FF", 0.45 * on)],
    [1, alpha("#AEE6FF", 0)],
  ]);
  fillPath(ctx, (c) => c.arc(mx, -104, 34, 0, Math.PI * 2), glow);
  paintShaded(ctx, (c) => c.ellipse(mx, -69.5, 10, 3, 0, 0, Math.PI * 2), "#6E7288", null, null, { width: 2.4 });
  paintShaded(ctx, (c) => c.roundRect(mx - 2.4, -94, 4.8, 25, 1.5), "#7C809A", null, null, { width: 2.4 });
  const back = (c: Ctx) => c.roundRect(mx - 16, -120, 32, 27, 4);
  paintShaded(ctx, back, "#565A73", "#474A60", (c) => c.rect(mx - 17, -102, 34, 12));
  // Screen light spilling past the edge that faces the sailor.
  strokePath(ctx, (c) => {
    c.moveTo(mx - screenSide * 16.5, -117);
    c.lineTo(mx - screenSide * 16.5, -96);
  }, alpha("#CFF2FF", 0.85 * on), 1.6);
  withClip(ctx, back, () => {
    for (let i = 0; i < 4; i++) {
      strokePath(ctx, (c) => {
        c.moveTo(mx - 7, -112 + i * 3);
        c.lineTo(mx + 7, -112 + i * 3);
      }, alpha("#2E3044", 0.5), 1.2);
    }
  });
  paintShaded(ctx, (c) => curvyPath(c, [[mx + 7.5, -97.5, 1], [mx + 4.5, -100.5], [mx + 6, -103], [mx + 7.5, -101.5, 1], [mx + 9, -103], [mx + 10.5, -100.5]], 0.55), "#F07A9A", null, null, { width: 1.4, stroke: "#FFFFFF" });
}

function tablet(ctx: Ctx, { pose, seed }: ToolContext): void {
  const body = (c: Ctx) => curvyPath(c, [[-21, -75, 1], [23, -75, 1], [26, -61.5, 1], [-24, -61.5, 1]], 0);
  paintShaded(ctx, body, "#343A4C", null, null);
  const awake = pose.state !== "DRIFTING_IDLE";
  const screen = (c: Ctx) => curvyPath(c, [[-18.6, -73.2, 1], [20.6, -73.2, 1], [23, -63.2, 1], [-21.4, -63.2, 1]], 0);
  paintShaded(ctx, screen, awake ? "#EAF6FA" : "#56607A", null, null, { stroke: false });
  if (!awake) return;
  withClip(ctx, screen, () => {
    // A doodle in progress: a wave and a little star.
    strokePath(ctx, (c) => {
      c.moveTo(-16, -66);
      c.quadraticCurveTo(-12, -71, -8, -66);
      c.quadraticCurveTo(-4, -61, 0, -66);
    }, "#5BA7D6", 1.4);
    fillPath(ctx, (c) => c.arc(-12 + hash01(seed, 41) * 4, -70, 1.4, 0, Math.PI * 2), "#F5C542");
    if (pose.state === "SAILING_FOCUS") {
      const nib = writingNib(pose);
      strokePath(ctx, (c) => {
        c.moveTo(-3, -70.5 + pose.write.line * 1.8);
        c.lineTo(Math.max(-3, nib.x), nib.y - 0.4);
      }, "#E26D8B", 1.3);
    }
  });
}
