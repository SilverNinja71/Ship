// Mr. Tiny Studio-inspired Focus / Study Desk, Break, and Pwedo Play scenes:
// soft pastel & kawaii hand-drawn stationery aesthetic with NO black outlines.

import { alpha, circlePath, ellipsePath, line, paint, roundRectPath, smoothClosedPath, withTransform } from "./draw.js";
import { drawPastelMinion } from "./minions.js";
import type { MinionCostume } from "./minions.js";
import { PORT_THEMES, SKETCH_INK, drawPaperTexture } from "./tinyInk.js";
import type { PortThemeId } from "./tinyInk.js";
import type { Viewport } from "./ShipRenderer.js";
import type { Ctx, FrameInfo } from "./types.js";

const SHADOW_GREY = "#EAE5DA";
const OUTLINE_GREY = "#A29C93";
const LINE_GREY = "#DCD6CA";

let pwedoPomoOpen = false;

export function setPwedoPomoOpen(open: boolean): void {
  pwedoPomoOpen = open;
}

export function isPwedoPomoOpen(): boolean {
  return pwedoPomoOpen;
}

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

/** Draws Pwedo, the cute plump white bird, with optional wing flap & rosy cheeks. */
function drawPwedoBird(
  ctx: Ctx,
  x: number,
  y: number,
  frame: FrameInfo,
  opts: { scale?: number; pastelWing?: string; flipX?: boolean; flap?: number; showFeet?: boolean; squashY?: number } = {},
): void {
  const scale = opts.scale ?? 1;
  const wingColor = opts.pastelWing ?? "#FFF3A8";
  const blink = !frame.reducedMotion && Math.sin(frame.t * 1.4 + 0.8) > 0.965;
  const sy = opts.squashY ?? 1;
  const sx = 1 / Math.sqrt(sy);

  withTransform(ctx, { x, y, scale }, () => {
    ctx.save();
    ctx.scale((opts.flipX ? -1 : 1) * sx, sy);

    if (opts.showFeet) {
      line(ctx, [{ x: -5, y: 12 }, { x: -7, y: 19 }], "#E5B96B", 2.4);
      line(ctx, [{ x: 4, y: 12 }, { x: 6, y: 19 }], "#E5B96B", 2.4);
    }

    // Plump kawaii bird silhouette
    paint(
      ctx,
      (c) =>
        smoothClosedPath(c, [
          { x: -19, y: 1 },
          { x: -12, y: -13 },
          { x: 6, y: -15 },
          { x: 19, y: -3 },
          { x: 13, y: 13 },
          { x: -8, y: 15 },
        ]),
      "#FFFFFF",
      { width: 3.1, stroke: OUTLINE_GREY },
    );

    // Flapping pastel wing
    const flapRot = (opts.flap ?? 0) * 0.45;
    withTransform(ctx, { x: 7, y: 2, rotate: 0.2 + flapRot }, () => {
      paint(ctx, (c) => c.ellipse(0, 0, 8.5, 5.5, 0, 0, Math.PI * 2), wingColor, {
        width: 1.8,
        stroke: alpha(OUTLINE_GREY, 0.45),
      });
    });

    // Coral-peach cheek
    paint(ctx, (c) => circlePath(c, -2, 3, 3.6), alpha("#F9A48B", 0.85), { stroke: false });

    // Eye
    if (blink) {
      line(ctx, [{ x: -9, y: -2.5 }, { x: -3.5, y: -2.5 }], OUTLINE_GREY, 2.2);
    } else {
      paint(ctx, (c) => circlePath(c, -6, -2.5, 2.7), OUTLINE_GREY, { stroke: false });
      paint(ctx, (c) => circlePath(c, -6.8, -3.3, 0.9), "#FFFFFF", { stroke: false });
    }

    // Tiny butter-yellow beak
    paint(
      ctx,
      (c) => {
        c.moveTo(-18, -2);
        c.lineTo(-26, 2);
        c.lineTo(-17, 5);
        c.closePath();
      },
      "#FFF3A8",
      { width: 2.6, stroke: OUTLINE_GREY },
    );

    ctx.restore();
  });
}

function drawSparkle(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  paint(
    ctx,
    (c) => {
      c.moveTo(x, y - r);
      c.quadraticCurveTo(x + r * 0.18, y - r * 0.18, x + r, y);
      c.quadraticCurveTo(x + r * 0.18, y + r * 0.18, x, y + r);
      c.quadraticCurveTo(x - r * 0.18, y + r * 0.18, x - r, y);
      c.quadraticCurveTo(x - r * 0.18, y - r * 0.18, x, y - r);
      c.closePath();
    },
    color,
    { stroke: false },
  );
}

/**
 * Playful pastel scene shown when the user opens "Pwedo Pomo":
 * Pwedo (the cute bird) hops and flutters joyfully on a pastel stationery backdrop.
 */
export function renderPwedoPlayScene(
  ctx: Ctx,
  view: Viewport,
  frame: FrameInfo,
  opts: { portTheme: PortThemeId },
): void {
  const { width: w, height: h } = view;
  const theme = PORT_THEMES[opts.portTheme] ?? PORT_THEMES.classic;

  // Soft pastel cream background
  ctx.fillStyle = "#FAF6E8";
  ctx.fillRect(0, 0, w, h);

  const unit = Math.min(w / 900, h / 620);
  const cx = w / 2;
  const cy = h * 0.52;
  const m = frame.reducedMotion ? 0 : 1;

  withTransform(ctx, { x: cx, y: cy, scale: unit }, () => {
    // Soft pastel backdrop hill & clouds
    paint(ctx, (c) => c.ellipse(0, 145, 360, 78, 0, 0, Math.PI * 2), alpha(theme.pastel, 0.45), { stroke: false });
    paint(ctx, (c) => c.ellipse(-210, -110, 72, 28, 0, 0, Math.PI * 2), alpha("#FFFFFF", 0.9), { stroke: false });
    paint(ctx, (c) => c.ellipse(225, -95, 84, 32, 0, 0, Math.PI * 2), alpha("#FFFFFF", 0.9), { stroke: false });

    // Playful hopping trajectory for Pwedo
    const hopCycle = frame.t * 2.2;
    const hopPhase = hopCycle % 1;
    const hopArc = Math.sin(hopPhase * Math.PI) * 58 * m;
    const travelX = Math.sin(frame.t * 0.85) * 145 * m;
    const facingRight = Math.cos(frame.t * 0.85) >= 0;
    const squash = hopPhase < 0.12 || hopPhase > 0.88 ? 0.9 : 1.06;
    const flap = Math.sin(frame.t * 14) * m;

    // Ground shadow that shrinks as Pwedo jumps higher
    const shadowScale = 1 - (hopArc / 90) * 0.45;
    paint(ctx, (c) => ellipsePath(c, travelX, 108, 34 * shadowScale, 8 * shadowScale), alpha(SHADOW_GREY, 0.9), { stroke: false });

    // Pwedo jumping around!
    drawPwedoBird(ctx, travelX, 72 - hopArc, frame, {
      scale: 2.35,
      pastelWing: theme.pastel,
      flipX: facingRight,
      flap,
      showFeet: true,
      squashY: squash,
    });

    // Floating pastel sparkles & musical chirp
    const sp1 = Math.sin(frame.t * 2.5) * 6 * m;
    const sp2 = Math.cos(frame.t * 2.1) * 6 * m;
    drawSparkle(ctx, travelX - 68, 22 - hopArc + sp1, 9, "#FFF3A8");
    drawSparkle(ctx, travelX + 74, 14 - hopArc + sp2, 7, "#F9A48B");
    drawSparkle(ctx, -180, -35 + sp2, 8, "#DCEAF9");
    drawSparkle(ctx, 185, -45 + sp1, 8, "#ECE4FA");

    ctx.save();
    ctx.fillStyle = OUTLINE_GREY;
    ctx.font = '700 15px ui-rounded, "SF Pro Rounded", "Nunito", sans-serif';
    ctx.textAlign = "center";
    ctx.globalAlpha = 0.78;
    ctx.fillText("chirp! ♪", travelX + (facingRight ? 54 : -54), 24 - hopArc);
    ctx.restore();

    // Subtle header
    ctx.fillStyle = SKETCH_INK;
    ctx.font = '400 16px Georgia, "Playfair Display", serif';
    ctx.textAlign = "center";
    ctx.fillText("Pwedo is cheering you on · Pick your focus rhythm below", 0, -175);
  });

  drawPaperTexture(ctx, w, h);
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

    // Main banana-wrapped minion studying with Pwedo perched on its head
    drawPastelMinion(ctx, { x: 65, y: 36 + writeBob }, "banana", frame, { scale: 2.25, seed: 1 });
    drawPwedoBird(ctx, 65, -79 + writeBob, frame, { scale: 1.0, pastelWing: theme.pastel });

    // Soft floating study sparkles
    const sp = Math.sin(frame.t * 2.2) * 5 * m;
    drawSparkle(ctx, -220, -105 + sp, 7, "#FFF3A8");
    drawSparkle(ctx, 210, -95 - sp, 6, "#F9A48B");

    // 2. 3D Slanted cream desk OVER the minions' lower bodies so they are tucked behind it
    ctx.save();
    ctx.rotate(0.11);
    paint(ctx, (c) => roundRectPath(c, -384, 172, 774, 22, 11), alpha(SHADOW_GREY, 0.9), { stroke: false });
    paint(ctx, (c) => roundRectPath(c, -390, 58, 780, 126, 48), "#F4ECE0", { width: 2.8, stroke: OUTLINE_GREY });
    paint(ctx, (c) => roundRectPath(c, -390, 22, 780, 136, 48), "#FFFDF8", { stroke: false });
    sketchLine(ctx, -340, 22, 340, 22.5, OUTLINE_GREY, 3.1, 101);
    sketchLine(ctx, -356, 154, 356, 154.5, alpha(OUTLINE_GREY, 0.45), 2.4, 109);
    ctx.restore();

    // 3. Cute hand-drawn stack of notebooks on the left of the desk
    withTransform(ctx, { x: -235, y: 12 }, () => {
      sketchOpenBox(ctx, -56, -22, 108, 64, 12, "#FFFDF8", 3.1, 201);
      sketchOpenBox(ctx, -50, -34, 108, 62, 12, theme.pastel, 3.1, 221);
      sketchLine(ctx, -34, -12, 38, -12, alpha(OUTLINE_GREY, 0.45), 2.5, 241);
      sketchLine(ctx, -34, 0, 24, 0, alpha(OUTLINE_GREY, 0.32), 2.5, 251);
    });

    // Cute warm tea mug with gentle rising steam on the desk
    withTransform(ctx, { x: -125, y: 42 }, () => {
      paint(ctx, (c) => roundRectPath(c, -16, -16, 30, 28, 8), "#FFFDF8", { width: 2.6, stroke: OUTLINE_GREY });
      paint(ctx, (c) => ellipsePath(c, -1, -15, 13, 4.5), "#F5E1C0", { width: 2, stroke: OUTLINE_GREY });
      const steam = ((frame.t * 0.7) % 1);
      ctx.save();
      ctx.strokeStyle = alpha(OUTLINE_GREY, 0.45 * (1 - steam));
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-4, -22 - steam * 12);
      ctx.quadraticCurveTo(2, -28 - steam * 12, -3, -34 - steam * 12);
      ctx.stroke();
      ctx.restore();
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

/**
 * Cozy Break scene shown during shore-leave:
 * cute pastel minions eating snacks on a picnic mat, swimming in pastel waves,
 * and Captain & Pwedo singing with floating musical notes!
 */
export function renderBreakScene(
  ctx: Ctx,
  view: Viewport,
  frame: FrameInfo,
  opts: { portTheme: PortThemeId },
): void {
  const { width: w, height: h } = view;
  const theme = PORT_THEMES[opts.portTheme] ?? PORT_THEMES.classic;

  ctx.fillStyle = "#FAF6E8";
  ctx.fillRect(0, 0, w, h);

  const unit = Math.min(w / 900, h / 620);
  const cx = w / 2;
  const cy = h * 0.56;
  const m = frame.reducedMotion ? 0 : 1;

  withTransform(ctx, { x: cx, y: cy, scale: unit }, () => {
    // 1. Soft pastel picnic mat on the left (eating snacks)
    paint(ctx, (c) => roundRectPath(c, -355, 22, 340, 130, 32), alpha(theme.pastel, 0.55), { width: 2.8, stroke: OUTLINE_GREY });
    paint(ctx, (c) => roundRectPath(c, -335, 38, 300, 98, 22), "#FFFDF7", { stroke: false });

    // Little snack plate with pastel treats on the mat
    paint(ctx, (c) => c.ellipse(-185, 86, 46, 17, 0, 0, Math.PI * 2), "#FFF5B8", { width: 2.4, stroke: OUTLINE_GREY });
    paint(ctx, (c) => circlePath(c, -198, 82, 7.5), "#F9A48B", { stroke: false });
    paint(ctx, (c) => circlePath(c, -176, 84, 7.5), "#CDE5C4", { stroke: false });
    paint(ctx, (c) => circlePath(c, -186, 76, 6.5), "#ECE4FA", { stroke: false });

    drawPastelMinion(ctx, { x: -265, y: 74 }, "teddy", frame, { scale: 1.8, seed: 2, chore: "eat", shadow: false });
    drawPastelMinion(ctx, { x: -110, y: 76 }, "banana", frame, { scale: 1.85, seed: 1, chore: "eat", shadow: false });

    // 2. Soft pastel sea pool on the right (swimming!)
    paint(ctx, (c) => c.ellipse(215, 92, 165, 58, 0, 0, Math.PI * 2), alpha("#D8EBF8", 0.85), { width: 2.8, stroke: "#8FB6D9" });
    const swimBob = Math.sin(frame.t * 2.8) * 3.5 * m;
    drawPastelMinion(ctx, { x: 215, y: 86 + swimBob }, "bunny", frame, { scale: 1.85, seed: 4, chore: "swim", shadow: false });

    // Cute tiny pastel floatie ring bobbing in the pool
    paint(ctx, (c) => c.ellipse(300, 102 - swimBob * 0.6, 18, 9, 0, 0, Math.PI * 2), "#FFF3A8", { width: 2.2, stroke: OUTLINE_GREY });
    paint(ctx, (c) => c.ellipse(300, 102 - swimBob * 0.6, 7, 3.5, 0, 0, Math.PI * 2), "#D8EBF8", { width: 1.8, stroke: "#8FB6D9" });

    // 3. Captain & Pwedo singing together in the center
    drawPastelMinion(ctx, { x: 14, y: -12 }, "captain", frame, { scale: 1.75, seed: 5, cheering: true, chore: "sing", shadow: false });
    const birdSingBob = Math.sin(frame.t * 4.5) * 3 * m;
    drawPwedoBird(ctx, 64, -36 + birdSingBob, frame, { scale: 1.15, pastelWing: theme.pastel, flap: Math.sin(frame.t * 8) * 0.4 * m });

    // Soft pastel sparkles
    drawSparkle(ctx, -295, -80, 7, "#FFF3A8");
    drawSparkle(ctx, 275, -75, 7, "#F9A48B");

    // Subtle header
    ctx.fillStyle = SKETCH_INK;
    ctx.font = '400 16px Georgia, "Playfair Display", serif';
    ctx.textAlign = "center";
    ctx.fillText("Break Time · Snacks, Swim & Song", 0, -185);
  });

  drawPaperTexture(ctx, w, h);
}
