// Cute pastel costume crew drawn in Ship · Pwedo Pomo Studio's soft rounded
// marker brush (#8D8D8D) with smooth chubby silhouettes, coral-peach cheeks,
// soft pastel fills, expressive study/break poses, and theme-reactive accessories.

import { alpha, circlePath, ellipsePath, line, paint, withTransform } from "./draw.js";
import type { CrewAccessory } from "./kawaiiThemes.js";
import type { Ctx, FrameInfo, Point } from "./types.js";

export type MinionCostume = "banana" | "teddy" | "bunny" | "frog" | "captain";

const PASTEL_SKIN = "#FFF5B8";
const PASTEL_BLUSH = "#F9A48B";
const MARKER_INK = "#8D8D8D";
const LINE_W = 3.2;

/**
 * Draws a single continuous chubby marker-drawn blob silhouette:
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

export type MinionChore =
  | "sweep"
  | "mop"
  | "spyglass"
  | "eat"
  | "swim"
  | "sing"
  | "fire-focus"
  | "boba"
  | "slump"
  | "blanket-nap"
  | "none";

/** Draws a cute pastel crew character standing at `at` (origin at feet). */
export function drawPastelMinion(
  ctx: Ctx,
  at: Point,
  costume: MinionCostume,
  frame: FrameInfo,
  opts: {
    scale?: number;
    seed?: number;
    cheering?: boolean;
    chore?: MinionChore;
    shadow?: boolean;
    accessory?: CrewAccessory;
  } = {},
): void {
  const scale = opts.scale ?? 1;
  const seed = opts.seed ?? 1;
  const m = frame.reducedMotion ? 0 : 1;
  const isSleepy = opts.chore === "slump" || opts.chore === "blanket-nap";
  const bob = isSleepy
    ? Math.sin(frame.t * 1.2 + seed) * 0.7 * m
    : Math.sin(frame.t * (opts.cheering ? 5.2 : 2.3) + seed * 1.7) * (opts.cheering ? 3.0 : 1.3) * m;
  const tilt = opts.chore === "slump" ? 0.16 : Math.sin(frame.t * 1.4 + seed * 2.1) * 0.03 * m;
  const blink = isSleepy || (!frame.reducedMotion && Math.sin(frame.t * 1.1 + seed * 3.1) > 0.965);

  withTransform(ctx, { x: at.x, y: at.y + bob, scale, rotate: tilt }, () => {
    // Locked-in coral fire aura drawn behind character during active study sprints
    if (opts.chore === "fire-focus") {
      const flicker = Math.sin(frame.t * 9 + seed) * 2.5 * m;
      paint(
        ctx,
        (c) => {
          c.moveTo(-25, 0);
          c.quadraticCurveTo(-30, -28, -16, -42 - flicker);
          c.lineTo(-7, -54 + flicker * 0.5);
          c.lineTo(0, -64 - flicker);
          c.lineTo(8, -53 + flicker * 0.5);
          c.lineTo(17, -43 - flicker);
          c.quadraticCurveTo(30, -28, 25, 0);
          c.closePath();
        },
        alpha("#F38C7B", 0.72),
        { width: 2.2, stroke: MARKER_INK },
      );
    }

    // Flat light-grey oval shadow (omitted when perched on a desk, swimming, or on flat deck)
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

    if (opts.accessory && opts.accessory !== "none") {
      drawCrewAccessory(ctx, opts.accessory, frame);
    }

    if (opts.chore === "sweep") {
      const sweep = Math.sin(frame.t * 3.8 + seed) * 0.18 * m;
      withTransform(ctx, { x: 18, y: -12, rotate: sweep }, () => {
        line(ctx, [{ x: 0, y: -14 }, { x: 7, y: 12 }], "#B6CEA0", 2.8);
        paint(ctx, (c) => ellipsePath(c, 8, 12, 6, 3.5, 0.2), "#EFE9DA", { width: 2.4, stroke: MARKER_INK });
      });
      // Cute pastel dust-sparkle puffs while sweeping
      const puff = ((frame.t * 1.4 + seed) % 1);
      paint(ctx, (c) => circlePath(c, 25 + puff * 6, -2 - puff * 6, 2.2 * (1 - puff * 0.5)), alpha("#FFF3A8", 0.85 * (1 - puff)), { stroke: false });
      paint(ctx, (c) => circlePath(c, 29 - puff * 3, -6 - puff * 8, 1.8 * (1 - puff * 0.4)), alpha("#F9A48B", 0.7 * (1 - puff)), { stroke: false });
    } else if (opts.chore === "mop") {
      const mop = Math.sin(frame.t * 4.2 + seed) * 0.22 * m;
      withTransform(ctx, { x: -18, y: -12, rotate: mop }, () => {
        line(ctx, [{ x: 0, y: -14 }, { x: -7, y: 12 }], "#D7C9A8", 2.8);
        paint(ctx, (c) => ellipsePath(c, -8, 12, 7.5, 4, -0.2), "#D8EBF8", { width: 2.2, stroke: MARKER_INK });
      });
      // Tiny pastel soap bubbles while mopping
      const bub = ((frame.t * 1.1 + seed * 0.7) % 1);
      paint(ctx, (c) => circlePath(c, -26 - bub * 5, -4 - bub * 10, 2.6), alpha("#D8EBF8", 0.9 * (1 - bub)), { width: 1.3, stroke: "#8FB6D9" });
      paint(ctx, (c) => circlePath(c, -20 + bub * 3, -9 - bub * 12, 1.8), alpha("#FFFFFF", 0.85 * (1 - bub)), { width: 1.2, stroke: "#8FB6D9" });
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
    } else if (opts.chore === "boba") {
      // Cute pastel boba cup with straw
      paint(ctx, (c) => c.rect(12, -19, 10, 13), "#F4E5CA", { width: 2, stroke: MARKER_INK });
      paint(ctx, (c) => ellipsePath(c, 17, -19, 5.5, 2), "#D5E6C8", { width: 1.6, stroke: MARKER_INK });
      line(ctx, [{ x: 17, y: -19 }, { x: 20, y: -26 }], "#8EA87D", 1.8);
      paint(ctx, (c) => circlePath(c, 15, -9, 1.2), "#6E5A4F", { stroke: false });
      paint(ctx, (c) => circlePath(c, 18.5, -8.5, 1.2), "#6E5A4F", { stroke: false });
    } else if (opts.chore === "blanket-nap") {
      // Cozy striped nap blanket & floating zZ
      paint(ctx, (c) => ellipsePath(c, 0, -9, 21, 12), "#FFF3A8", { width: 2.4, stroke: MARKER_INK });
      line(ctx, [{ x: -13, y: -9 }, { x: 13, y: -9 }], "#F9C5C3", 2.8);
      ctx.save();
      ctx.fillStyle = MARKER_INK;
      ctx.font = "italic 700 11px Georgia, serif";
      ctx.fillText("zZ", 14, -44 - Math.sin(frame.t * 2) * 2 * m);
      ctx.restore();
    } else if (opts.chore === "slump") {
      // Tiny sigh puff after a long sprint
      paint(ctx, (c) => circlePath(c, 16, -24, 2.2), alpha("#FFFFFF", 0.85), { width: 1.4, stroke: MARKER_INK });
    }
  });
}

function drawCrewAccessory(ctx: Ctx, accessory: CrewAccessory, frame: FrameInfo): void {
  const m = frame.reducedMotion ? 0 : 1;
  switch (accessory) {
    case "astro-helmet":
      // Bubble glass astronaut helmet over head (preserving silhouette inside)
      paint(ctx, (c) => circlePath(c, 0, -25, 22), alpha("#DCEBFA", 0.26), { width: 2.2, stroke: "#B5C8E4" });
      line(ctx, [{ x: 11, y: -39 }, { x: 15, y: -33 }], "#FFFFFF", 2.2);
      break;
    case "cafe-apron":
      paint(ctx, (c) => ellipsePath(c, 0, -10, 12, 9), "#B7CFA0", { width: 2.0, stroke: MARKER_INK });
      paint(ctx, (c) => circlePath(c, 0, -10, 2.4), "#FFFDF7", { stroke: false });
      break;
    case "woodland-sprout": {
      const sway = Math.sin(frame.t * 2.5) * 0.12 * m;
      withTransform(ctx, { x: 0, y: -43, rotate: sway }, () => {
        line(ctx, [{ x: 0, y: 2 }, { x: 0, y: -7 }], "#7C935A", 2.0);
        paint(ctx, (c) => ellipsePath(c, -4, -7, 4.5, 2.5, -0.4), "#B7D68E", { width: 1.6, stroke: MARKER_INK });
        paint(ctx, (c) => ellipsePath(c, 4, -7, 4.5, 2.5, 0.4), "#B7D68E", { width: 1.6, stroke: MARKER_INK });
      });
      break;
    }
    case "sunflower":
      withTransform(ctx, { x: 13, y: -38 }, () => {
        paint(ctx, (c) => circlePath(c, 0, 0, 5.5), "#FFE066", { width: 1.8, stroke: MARKER_INK });
        paint(ctx, (c) => circlePath(c, 0, 0, 2.4), "#B97D45", { stroke: false });
      });
      break;
    case "pumpkin-cap":
      paint(ctx, (c) => ellipsePath(c, 0, -43, 9, 5), "#F09B4B", { width: 2, stroke: MARKER_INK });
      line(ctx, [{ x: 0, y: -48 }, { x: 2, y: -52 }], "#7C935A", 2.2);
      break;
    case "star-pin":
      paint(ctx, (c) => circlePath(c, 12, -37, 4.2), "#FFE48E", { width: 1.8, stroke: MARKER_INK });
      break;
    case "jelly-bow":
      paint(ctx, (c) => ellipsePath(c, -3, -43, 4.5, 2.6, 0.3), "#B5DCF9", { width: 1.8, stroke: MARKER_INK });
      paint(ctx, (c) => ellipsePath(c, 3, -43, 4.5, 2.6, -0.3), "#B5DCF9", { width: 1.8, stroke: MARKER_INK });
      break;
  }
}

function drawMrTinyFace(ctx: Ctx, eyeY: number, oneEye: boolean, blink: boolean): void {
  // Big cute coral-peach cheeks
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
