// Cute pastel costume minions drawn in Mr. Tiny Studio's soft rounded
// medium-grey marker brush (#8D8D8D) with smooth chubby blob silhouettes,
// big coral-peach cheeks (#F9A48B), and soft pastel fills.

import { alpha, circlePath, ellipsePath, line, paint, withTransform } from "./draw.js";
import type { Ctx, FrameInfo, Point } from "./types.js";

export type MinionCostume = "banana" | "teddy" | "bunny" | "frog" | "captain";

const PASTEL_SKIN = "#FFF5B8";
const PASTEL_BLUSH = "#F9A48B";
const MARKER_INK = "#8D8D8D";
const LINE_W = 3.2;

/**
 * Draws a single continuous chubby Mr. Tiny-style blob silhouette:
 * rounded dome head + tiny stubby side arms + soft curved feet.
 */
function chubbyBlobPath(ctx: Ctx, w = 18, h = 42): void {
  ctx.moveTo(0, -h);
  // Top-right head to right arm
  ctx.bezierCurveTo(w * 0.85, -h, w * 0.92, -h * 0.55, w * 0.9, -h * 0.36);
  // Tiny stubby right arm
  ctx.bezierCurveTo(w * 1.24, -h * 0.34, w * 1.24, -h * 0.16, w * 0.9, -h * 0.15);
  // Right hip to right foot
  ctx.bezierCurveTo(w * 0.92, -3, w * 0.84, 2, w * 0.42, 1);
  // Soft curved gap between little feet
  ctx.quadraticCurveTo(0, -4.5, -w * 0.42, 1);
  // Left foot to left hip
  ctx.bezierCurveTo(-w * 0.84, 2, -w * 0.92, -3, -w * 0.9, -h * 0.15);
  // Tiny stubby left arm
  ctx.bezierCurveTo(-w * 1.24, -h * 0.16, -w * 1.24, -h * 0.34, -w * 0.9, -h * 0.36);
  // Left head back to crown
  ctx.bezierCurveTo(-w * 0.92, -h * 0.55, -w * 0.85, -h, 0, -h);
  ctx.closePath();
}

export type MinionChore = "sweep" | "mop" | "spyglass" | "eat" | "swim" | "sing" | "none";

/** Draws a cute pastel costume minion standing at `at` (origin at feet). */
export function drawPastelMinion(
  ctx: Ctx,
  at: Point,
  costume: MinionCostume,
  frame: FrameInfo,
  opts: { scale?: number; seed?: number; cheering?: boolean; chore?: MinionChore; shadow?: boolean } = {},
): void {
  const scale = opts.scale ?? 1;
  const seed = opts.seed ?? 1;
  const m = frame.reducedMotion ? 0 : 1;
  const bob = Math.sin(frame.t * (opts.cheering ? 5.2 : 2.3) + seed * 1.7) * (opts.cheering ? 3.0 : 1.3) * m;
  const tilt = Math.sin(frame.t * 1.4 + seed * 2.1) * 0.03 * m;
  const blink = !frame.reducedMotion && Math.sin(frame.t * 1.1 + seed * 3.1) > 0.965;

  withTransform(ctx, { x: at.x, y: at.y + bob, scale, rotate: tilt }, () => {
    // Clean Mr. Tiny flat light-grey oval shadow (omitted when perched on a desk or flat deck)
    if (opts.shadow !== false && opts.chore !== "swim") {
      paint(ctx, (c) => ellipsePath(c, 0, 2, 19, 5), "#DCDCDC", { stroke: false });
    }

    if (costume === "banana") {
      drawBananaMinion(ctx, blink);
    } else if (costume === "teddy") {
      drawTeddyMinion(ctx, blink);
    } else if (costume === "bunny") {
      drawBunnyMinion(ctx, blink);
    } else if (costume === "captain") {
      drawCaptainMinion(ctx, blink);
    } else {
      drawFrogMinion(ctx, blink);
    }

    if (opts.chore === "sweep") {
      const sweep = Math.sin(frame.t * 3.8 + seed) * 0.18 * m;
      withTransform(ctx, { x: 18, y: -12, rotate: sweep }, () => {
        line(ctx, [{ x: 0, y: -14 }, { x: 7, y: 12 }], "#B6CEA0", 2.8);
        paint(ctx, (c) => ellipsePath(c, 8, 12, 6, 3.5, 0.2), "#EFE9DA", { width: 2.4, stroke: MARKER_INK });
      });
    } else if (opts.chore === "mop") {
      const mop = Math.sin(frame.t * 4.2 + seed) * 0.22 * m;
      withTransform(ctx, { x: -18, y: -12, rotate: mop }, () => {
        line(ctx, [{ x: 0, y: -14 }, { x: -7, y: 12 }], "#D7C9A8", 2.8);
        paint(ctx, (c) => ellipsePath(c, -8, 12, 7.5, 4, -0.2), "#D8EBF8", { width: 2.2, stroke: MARKER_INK });
      });
    } else if (opts.chore === "spyglass") {
      line(ctx, [{ x: 13, y: -24 }, { x: 26, y: -29 }], "#D7C9A8", 4.2);
    } else if (opts.chore === "eat") {
      const nibble = Math.sin(frame.t * 5.0 + seed) * 1.5 * m;
      withTransform(ctx, { x: 11, y: -16 + nibble, rotate: -0.25 }, () => {
        paint(ctx, (c) => ellipsePath(c, 0, 0, 6.5, 4.2), "#FFF3A8", { width: 2.2, stroke: MARKER_INK });
        paint(ctx, (c) => circlePath(c, 3, -1.5, 2.2), PASTEL_BLUSH, { stroke: false });
      });
    } else if (opts.chore === "swim") {
      // Soft pastel-blue water ripple across lower body
      paint(ctx, (c) => ellipsePath(c, 0, -4, 24, 7), alpha("#D8EBF8", 0.92), { width: 2.2, stroke: "#8FB6D9" });
      paint(ctx, (c) => ellipsePath(c, -6, -1, 14, 3.5), alpha("#FFFFFF", 0.75), { stroke: false });
    } else if (opts.chore === "sing") {
      const floatY = ((frame.t * 14 + seed * 7) % 16);
      const swayX = Math.sin(frame.t * 3.5 + seed) * 3 * m;
      ctx.save();
      ctx.fillStyle = MARKER_INK;
      ctx.font = "700 13px Georgia, serif";
      ctx.textAlign = "center";
      ctx.globalAlpha = Math.max(0.25, 1 - floatY / 18);
      ctx.fillText("♪", -15 + swayX, -46 - floatY * 0.7);
      ctx.fillText("♫", 16 - swayX, -52 - floatY * 0.5);
      ctx.restore();
    }
  });
}

function drawMrTinyFace(ctx: Ctx, eyeY: number, oneEye: boolean, blink: boolean): void {
  // Big cute coral-peach cheeks (just like Mr. Tiny!)
  paint(ctx, (c) => circlePath(c, -10.5, eyeY + 5.5, 4.4), alpha(PASTEL_BLUSH, 0.92), { stroke: false });
  paint(ctx, (c) => circlePath(c, 10.5, eyeY + 5.5, 4.4), alpha(PASTEL_BLUSH, 0.92), { stroke: false });

  if (oneEye) {
    // Simple soft silver-grey goggle ring + cute dot pupil
    paint(ctx, (c) => circlePath(c, 0, eyeY, 6.2), "#FFFFFF", { width: 2.6, stroke: MARKER_INK });
    if (blink) {
      line(ctx, [{ x: -3.5, y: eyeY }, { x: 3.5, y: eyeY }], MARKER_INK, 2.2);
    } else {
      paint(ctx, (c) => circlePath(c, 0.4, eyeY, 2.8), MARKER_INK, { stroke: false });
      paint(ctx, (c) => circlePath(c, -0.8, eyeY - 1.0, 1.0), "#FFFFFF", { stroke: false });
    }
  } else {
    for (const ex of [-5.2, 5.2]) {
      if (blink) {
        line(ctx, [{ x: ex - 2.4, y: eyeY }, { x: ex + 2.4, y: eyeY }], MARKER_INK, 2.2);
      } else {
        paint(ctx, (c) => circlePath(c, ex, eyeY, 2.3), MARKER_INK, { stroke: false });
      }
    }
  }

  // Tiny gentle smile
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-2.5, eyeY + 6.5);
  ctx.quadraticCurveTo(0, eyeY + 9.2, 2.5, eyeY + 6.5);
  ctx.strokeStyle = MARKER_INK;
  ctx.lineWidth = 2.0;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();
}

function drawBananaMinion(ctx: Ctx, blink: boolean): void {
  // Cute banana stem
  paint(ctx, (c) => ellipsePath(c, 0, -44, 3, 5), "#E8D79B", { width: 2.4, stroke: MARKER_INK });
  // Chubby butter-yellow body
  paint(ctx, (c) => chubbyBlobPath(c, 17, 42), PASTEL_SKIN, { width: LINE_W, stroke: MARKER_INK });
  // Soft pastel blue overall bib
  paint(ctx, (c) => ellipsePath(c, 0, -10, 11, 8), "#DCEAF9", { width: 2.2, stroke: "#B2C8E0" });
  drawMrTinyFace(ctx, -27, true, blink);
}

function drawTeddyMinion(ctx: Ctx, blink: boolean): void {
  // Cute round teddy ears
  for (const side of [-1, 1]) {
    paint(ctx, (c) => circlePath(c, side * 12.5, -39, 6.2), "#EFE2D6", { width: LINE_W, stroke: MARKER_INK });
    paint(ctx, (c) => circlePath(c, side * 12.5, -39, 3.2), alpha(PASTEL_BLUSH, 0.8), { stroke: false });
  }
  paint(ctx, (c) => chubbyBlobPath(c, 18, 42), "#EFE2D6", { width: LINE_W, stroke: MARKER_INK });
  paint(ctx, (c) => ellipsePath(c, 0, -24, 12.5, 10.5), PASTEL_SKIN, { stroke: false });
  drawMrTinyFace(ctx, -26, false, blink);
}

function drawBunnyMinion(ctx: Ctx, blink: boolean): void {
  // Long floppy pastel lavender ears
  for (const side of [-1, 1]) {
    paint(ctx, (c) => ellipsePath(c, side * 8, -48, 4.4, 11.5, side * 0.16), "#ECE4FA", { width: LINE_W, stroke: MARKER_INK });
    paint(ctx, (c) => ellipsePath(c, side * 8, -48, 2.0, 6.8, side * 0.16), alpha(PASTEL_BLUSH, 0.75), { stroke: false });
  }
  paint(ctx, (c) => chubbyBlobPath(c, 17, 41), "#ECE4FA", { width: LINE_W, stroke: MARKER_INK });
  paint(ctx, (c) => ellipsePath(c, 0, -24, 12, 10), PASTEL_SKIN, { stroke: false });
  drawMrTinyFace(ctx, -25, false, blink);
}

function drawCaptainMinion(ctx: Ctx, blink: boolean): void {
  paint(ctx, (c) => chubbyBlobPath(c, 17, 41), PASTEL_SKIN, { width: LINE_W, stroke: MARKER_INK });
  // Crisp white & soft grey captain cap
  paint(ctx, (c) => ellipsePath(c, 0, -43, 14, 6), "#FFFFFF", { width: 2.8, stroke: MARKER_INK });
  paint(ctx, (c) => ellipsePath(c, 0, -38, 15, 2.6), "#D5CFC4", { width: 2.2, stroke: MARKER_INK });
  drawMrTinyFace(ctx, -26, false, blink);
}

function drawFrogMinion(ctx: Ctx, blink: boolean): void {
  for (const side of [-1, 1]) {
    paint(ctx, (c) => circlePath(c, side * 10, -40, 5.8), "#D8EEDB", { width: LINE_W, stroke: MARKER_INK });
    paint(ctx, (c) => circlePath(c, side * 10, -40, 1.8), MARKER_INK, { stroke: false });
  }
  paint(ctx, (c) => chubbyBlobPath(c, 18, 41), "#D8EEDB", { width: LINE_W, stroke: MARKER_INK });
  paint(ctx, (c) => ellipsePath(c, 0, -24, 12, 10), PASTEL_SKIN, { stroke: false });
  drawMrTinyFace(ctx, -25, true, blink);
}
