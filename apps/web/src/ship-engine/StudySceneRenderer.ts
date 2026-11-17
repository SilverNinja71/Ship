// Mr. Tiny Studio-inspired Focus / Study Desk scene shown when the ship is
// underway: soft pastel & kawaii hand-drawn stationery aesthetic with NO black
// outlines — pastel minions sit behind the slanted desk studying hard beside you.

import { alpha, circlePath, line, paint, roundRectPath, smoothClosedPath, withTransform } from "./draw.js";
import { drawPastelMinion } from "./minions.js";
import type { MinionCostume } from "./minions.js";
import { PORT_THEMES, SKETCH_INK, drawPaperTexture } from "./tinyInk.js";
import type { PortThemeId } from "./tinyInk.js";
import type { Viewport } from "./ShipRenderer.js";
import type { Ctx, FrameInfo } from "./types.js";

const SHADOW_GREY = "#EAE5DA";
const OUTLINE_GREY = "#A29C93";
const LINE_GREY = "#DCD6CA";

function sketchJitter(seed: number, amp: number): number {
  const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return ((s - Math.floor(s)) * 2 - 1) * amp;
}

function sketchLine(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, color: string, width: number, seed: number): void {
  const mx = (x1 + x2) / 2 + sketchJitter(seed + 1, 1.3);
  const my = (y1 + y2) / 2 + sketchJitter(seed + 2, 1.6);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x1 + sketchJitter(seed + 3, 0.6), y1 + sketchJitter(seed + 4, 0.6));
  ctx.quadraticCurveTo(mx, my, x2 + sketchJitter(seed + 5, 0.6), y2 + sketchJitter(seed + 6, 0.6));
  ctx.stroke();
  ctx.restore();
}

/** Smooth hand-drawn rounded sketchbook box with soft drop shadow. */
function sketchOpenBox(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string, width: number, _seed: number): void {
  paint(ctx, (c) => roundRectPath(c, x + 5, y + 6, w, h, r), alpha(SHADOW_GREY, 0.8), { stroke: false });
  paint(ctx, (c) => roundRectPath(c, x, y, w, h, r), fill, { width, stroke: "#8D8D8D" });
}

export function renderStudyDeskScene(
  ctx: Ctx,
  view: Viewport,
  frame: FrameInfo,
  opts: { portTheme: PortThemeId; objective: string | null },
): void {
  const { width: w, height: h } = view;
  const theme = PORT_THEMES[opts.portTheme] ?? PORT_THEMES.classic;

  // Warm cream Mr. Tiny Studio stationery paper background
  ctx.fillStyle = "#FAF6E8";
  ctx.fillRect(0, 0, w, h);

  const unit = Math.min(w / 900, h / 620);
  const cx = w / 2;
  const cy = h * 0.55;
  const m = frame.reducedMotion ? 0 : 1;

  withTransform(ctx, { x: cx, y: cy, scale: unit }, () => {
    // 1. Cute pastel minions sitting BEHIND the slanted desk!
    const writeBob = Math.sin(frame.t * 3.4) * 1.5 * m;

    // Companion costume minion on the left
    const buddyCostume: MinionCostume =
      opts.portTheme === "grapes" || opts.portTheme === "lavender"
        ? "bunny"
        : opts.portTheme === "matcha"
          ? "frog"
          : "teddy";
    drawPastelMinion(ctx, { x: -115, y: 28 }, buddyCostume, frame, { scale: 1.95, seed: 2 });

    // Main banana-wrapped minion studying with the tiny white bird perched on its head
    drawPastelMinion(ctx, { x: 65, y: 36 + writeBob }, "banana", frame, { scale: 2.25, seed: 1 });
    withTransform(ctx, { x: 65, y: -79 + writeBob }, () => {
      paint(ctx, (c) => smoothClosedPath(c, [
        { x: -19, y: 1 },
        { x: -12, y: -13 },
        { x: 6, y: -15 },
        { x: 19, y: -3 },
        { x: 13, y: 13 },
        { x: -8, y: 15 },
      ]), "#FFFFFF", { width: 3.3, stroke: OUTLINE_GREY });
      paint(ctx, (c) => c.ellipse(9, 2, 8, 5.5, 0.2, 0, Math.PI * 2), theme.pastel, { stroke: false });
      paint(ctx, (c) => circlePath(c, -6, -2.5, 2.8), OUTLINE_GREY, { stroke: false });
      paint(ctx, (c) => {
        c.moveTo(-18, -2);
        c.lineTo(-26, 2);
        c.lineTo(-17, 5);
        c.closePath();
      }, "#FFFFFF", { width: 3, stroke: OUTLINE_GREY });
    });

    // 2. Slanted cream desk OVER the minions' lower bodies so they are tucked behind it
    ctx.save();
    ctx.rotate(0.11);
    paint(ctx, (c) => roundRectPath(c, -390, 22, 780, 165, 56), "#FFFDF8", { stroke: false });
    paint(ctx, (c) => roundRectPath(c, -386, 166, 772, 18, 9), alpha(SHADOW_GREY, 0.85), { stroke: false });
    sketchLine(ctx, -340, 22, 340, 22.5, OUTLINE_GREY, 3.1, 101);
    ctx.restore();

    // 3. Cute hand-drawn stack of notebooks on the left of the desk (open-corner outlines)
    withTransform(ctx, { x: -235, y: 12 }, () => {
      sketchOpenBox(ctx, -56, -22, 108, 64, 12, "#FFFDF8", 3.1, 201);
      sketchOpenBox(ctx, -50, -34, 108, 62, 12, theme.pastel, 3.1, 221);
      sketchLine(ctx, -34, -12, 38, -12, alpha(OUTLINE_GREY, 0.45), 2.5, 241);
      sketchLine(ctx, -34, 0, 24, 0, alpha(OUTLINE_GREY, 0.32), 2.5, 251);
    });

    // 4. Open study sheet / notebook right in front of the banana minion
    withTransform(ctx, { x: 35, y: 74, rotate: 0.14 }, () => {
      sketchOpenBox(ctx, -58, -38, 114, 78, 12, "#FFFFFF", 3.1, 301);
      sketchLine(ctx, -38, -18, 36, -18, LINE_GREY, 3.1, 321);
      sketchLine(ctx, -38, -2, 28, -2, LINE_GREY, 3.1, 331);
      sketchLine(ctx, -38, 14, 32, 14, LINE_GREY, 3.1, 341);
    });

    // 5. Extra active-recall flashcards on the right of the desk
    withTransform(ctx, { x: 215, y: 102, rotate: 0.09 }, () => {
      sketchOpenBox(ctx, -50, -32, 98, 68, 12, "#FFFFFF", 3.1, 401);
      paint(ctx, (c) => roundRectPath(c, -32, -16, 62, 14, 6), alpha(theme.pastel, 0.85), { stroke: false });
      sketchLine(ctx, -32, 10, 28, 10, LINE_GREY, 3.1, 421);
    });

    // 6. Optional subtle study goal pill at the top
    if (opts.objective) {
      sketchOpenBox(ctx, -210, -218, 420, 38, 19, "#FFFFFF", 2.4, 501);
      ctx.fillStyle = SKETCH_INK;
      ctx.font = '700 15px ui-rounded, "SF Pro Rounded", "Nunito", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = opts.objective.length > 42 ? `${opts.objective.slice(0, 41)}…` : opts.objective;
      ctx.fillText(label, 0, -199);
    }
  });

  drawPaperTexture(ctx, w, h);
}
