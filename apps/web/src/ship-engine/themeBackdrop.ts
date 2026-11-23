// Original hand-drawn stationery pattern backdrops and ambient props for all
// 10 Ship · Pwedo Pomo Studio kawaii themes (100% procedural Canvas 2D art).

import { alpha, circlePath, ellipsePath, line, paint, roundRectPath, withTransform } from "./draw.js";
import type { KawaiiTheme } from "./kawaiiThemes.js";
import type { Ctx, FrameInfo } from "./types.js";

function drawStarSparkle(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  paint(
    ctx,
    (c) => {
      c.moveTo(x, y - r);
      c.quadraticCurveTo(x + r * 0.2, y - r * 0.2, x + r, y);
      c.quadraticCurveTo(x + r * 0.2, y + r * 0.2, x, y + r);
      c.quadraticCurveTo(x - r * 0.2, y + r * 0.2, x - r, y);
      c.quadraticCurveTo(x - r * 0.2, y - r * 0.2, x, y - r);
      c.closePath();
    },
    color,
    { stroke: false },
  );
}

function drawTinyFlower(ctx: Ctx, x: number, y: number, r: number, petalColor: string, centerColor: string, ink: string): void {
  withTransform(ctx, { x, y }, () => {
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      paint(ctx, (c) => ellipsePath(c, Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72, r * 0.55, r * 0.34, a), petalColor, {
        width: 1.8,
        stroke: ink,
      });
    }
    paint(ctx, (c) => circlePath(c, 0, 0, r * 0.42), centerColor, { width: 1.8, stroke: ink });
  });
}

function drawTinyStrawberry(ctx: Ctx, x: number, y: number, s: number, ink: string): void {
  withTransform(ctx, { x, y, scale: s }, () => {
    paint(
      ctx,
      (c) => {
        c.moveTo(0, -10);
        c.bezierCurveTo(11, -10, 12, 5, 0, 14);
        c.bezierCurveTo(-12, 5, -11, -10, 0, -10);
        c.closePath();
      },
      "#F69395",
      { width: 2, stroke: ink },
    );
    // Tiny leafy crown
    paint(ctx, (c) => ellipsePath(c, -4, -10, 5, 2.5, -0.3), "#B8D89E", { width: 1.5, stroke: ink });
    paint(ctx, (c) => ellipsePath(c, 4, -10, 5, 2.5, 0.3), "#B8D89E", { width: 1.5, stroke: ink });
    // Tiny seeds
    for (const [sx, sy] of [[-4, -2], [3, -1], [-2, 4], [4, 5], [0, 8]]) {
      paint(ctx, (c) => circlePath(c, sx, sy, 0.9), "#FFF7DF", { stroke: false });
    }
  });
}

function drawTinyMushroom(ctx: Ctx, x: number, y: number, s: number, capColor: string, ink: string): void {
  withTransform(ctx, { x, y, scale: s }, () => {
    paint(ctx, (c) => roundRectPath(c, -6, 0, 12, 14, 5), "#FFFDF7", { width: 2, stroke: ink });
    paint(
      ctx,
      (c) => {
        c.arc(0, 2, 16, Math.PI, 0);
        c.closePath();
      },
      capColor,
      { width: 2.2, stroke: ink },
    );
    paint(ctx, (c) => circlePath(c, -6, -5, 3), "#FFFDF7", { stroke: false });
    paint(ctx, (c) => circlePath(c, 5, -7, 2.4), "#FFFDF7", { stroke: false });
    paint(ctx, (c) => circlePath(c, 1, -3, 1.8), "#FFFDF7", { stroke: false });
  });
}

function drawBabyJellyfish(ctx: Ctx, x: number, y: number, s: number, glowColor: string, ink: string, sway: number): void {
  withTransform(ctx, { x, y, scale: s }, () => {
    // Soft tentacles
    for (const tx of [-9, -3, 3, 9]) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(tx, 2);
      ctx.quadraticCurveTo(tx + sway * 4, 11, tx - sway * 3, 20);
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = 2.6;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.restore();
    }
    // Luminous dome
    paint(
      ctx,
      (c) => {
        c.arc(0, 2, 16, Math.PI, 0);
        c.quadraticCurveTo(16, 6, 0, 5);
        c.quadraticCurveTo(-16, 6, -16, 2);
        c.closePath();
      },
      alpha(glowColor, 0.88),
      { width: 2.2, stroke: ink },
    );
    // Tiny cute eyes & coral blush
    paint(ctx, (c) => circlePath(c, -5, -4, 1.5), ink, { stroke: false });
    paint(ctx, (c) => circlePath(c, 5, -4, 1.5), ink, { stroke: false });
    paint(ctx, (c) => circlePath(c, -9, -1, 2.2), alpha("#F9A48B", 0.75), { stroke: false });
    paint(ctx, (c) => circlePath(c, 9, -1, 2.2), alpha("#F9A48B", 0.75), { stroke: false });
  });
}

function drawPastelGhost(ctx: Ctx, x: number, y: number, s: number, ink: string): void {
  withTransform(ctx, { x, y, scale: s }, () => {
    paint(
      ctx,
      (c) => {
        c.moveTo(-13, 12);
        c.lineTo(-13, -3);
        c.arc(0, -3, 13, Math.PI, 0);
        c.lineTo(13, 12);
        c.quadraticCurveTo(8, 7, 4, 12);
        c.quadraticCurveTo(0, 7, -4, 12);
        c.quadraticCurveTo(-8, 7, -13, 12);
        c.closePath();
      },
      "#FFFFFF",
      { width: 2.2, stroke: ink },
    );
    paint(ctx, (c) => circlePath(c, -4.5, -3, 1.6), ink, { stroke: false });
    paint(ctx, (c) => circlePath(c, 4.5, -3, 1.6), ink, { stroke: false });
    paint(ctx, (c) => circlePath(c, -8.5, 0, 2.2), alpha("#F9A48B", 0.85), { stroke: false });
    paint(ctx, (c) => circlePath(c, 8.5, 0, 2.2), alpha("#F9A48B", 0.85), { stroke: false });
  });
}

/** Draws the active theme's full-canvas kawaii stationery pattern and ambient scenery props. */
export function drawThemeBackdrop(
  ctx: Ctx,
  w: number,
  h: number,
  theme: KawaiiTheme,
  frame: FrameInfo,
  opts: { showAffirmation?: boolean } = {},
): void {
  const m = frame.reducedMotion ? 0 : 1;
  const ink = theme.canvas.inkStroke;

  // Base gradient fill
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, theme.canvas.skyTop);
  grad.addColorStop(1, theme.canvas.skyBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  switch (theme.patternKind) {
    case "gingham-stripes": {
      const colW = 54;
      ctx.fillStyle = alpha(theme.canvas.paperAlt, 0.32);
      for (let x = 0; x < w; x += colW * 2) {
        ctx.fillRect(x, 0, colW, h);
      }
      ctx.fillStyle = alpha("#DCE6C8", 0.16);
      for (let y = 0; y < h; y += colW * 2) {
        ctx.fillRect(0, y, w, colW);
      }
      break;
    }

    case "wavy-hills": {
      paint(
        ctx,
        (c) => {
          c.moveTo(0, h * 0.72);
          c.bezierCurveTo(w * 0.3, h * 0.64, w * 0.65, h * 0.79, w, h * 0.68);
          c.lineTo(w, h);
          c.lineTo(0, h);
          c.closePath();
        },
        alpha(theme.canvas.paperAlt, 0.32),
        { width: 2.2, stroke: alpha(ink, 0.45) },
      );
      drawTinyMushroom(ctx, w * 0.14, h * 0.76, 1.05, "#D97B72", ink);
      drawTinyMushroom(ctx, w * 0.85, h * 0.73, 0.85, "#E08E80", ink);
      break;
    }

    case "sunflowers": {
      const drift = Math.sin(frame.t * 0.8) * 4 * m;
      drawTinyFlower(ctx, w * 0.12, h * 0.24 + drift, 26, "#FFD85E", "#C88A4B", ink);
      drawTinyFlower(ctx, w * 0.87, h * 0.28 - drift, 22, "#FFD85E", "#C88A4B", ink);
      drawTinyFlower(ctx, w * 0.19, h * 0.76, 18, "#FFE48E", "#C88A4B", ink);
      drawStarSparkle(ctx, w * 0.24, h * 0.2, 8, "#FFFFFF");
      drawStarSparkle(ctx, w * 0.78, h * 0.19, 9, "#FFFFFF");
      break;
    }

    case "strawberries": {
      const bob = Math.sin(frame.t * 1.1) * 4 * m;
      for (const [rx, ry, sc] of [
        [0.1, 0.24, 1.1],
        [0.88, 0.22, 1.0],
        [0.15, 0.75, 0.95],
        [0.86, 0.78, 1.15],
      ]) {
        drawTinyStrawberry(ctx, w * rx, h * ry + bob, sc, ink);
      }
      drawTinyFlower(ctx, w * 0.2, h * 0.32, 11, "#FFFFFF", "#FFE48E", ink);
      drawTinyFlower(ctx, w * 0.81, h * 0.34, 11, "#FFFFFF", "#FFE48E", ink);
      break;
    }

    case "watermelon": {
      // Soft sage picnic horizon stripe
      paint(ctx, (c) => c.rect(0, h * 0.76, w, h * 0.24), alpha("#C6D3A5", 0.55), { stroke: false });
      line(ctx, [{ x: 0, y: h * 0.76 }, { x: w, y: h * 0.76 }], "#FFFFFF", 5);
      // Mini watermelon slice motifs
      for (const [rx, ry, rot] of [
        [0.12, 0.26, -0.25],
        [0.88, 0.28, 0.22],
      ]) {
        withTransform(ctx, { x: w * rx, y: h * ry, rotate: rot }, () => {
          paint(
            ctx,
            (c) => {
              c.arc(0, 0, 22, 0, Math.PI);
              c.closePath();
            },
            "#E97875",
            { width: 2.2, stroke: "#8FB87B" },
          );
          for (const sx of [-7, 0, 7]) paint(ctx, (c) => circlePath(c, sx, 8, 1.2), "#5C4742", { stroke: false });
        });
      }
      break;
    }

    case "autumn-forest": {
      drawTinyMushroom(ctx, w * 0.13, h * 0.72, 1.35, "#BA5C50", ink);
      drawTinyMushroom(ctx, w * 0.87, h * 0.74, 1.05, "#BA5C50", ink);
      // Drifting autumn oak leaves
      const fall = Math.sin(frame.t * 0.9) * 8 * m;
      for (const [lx, ly, color] of [
        [0.16, 0.24, "#D7925E"],
        [0.83, 0.25, "#A9BA83"],
      ] as const) {
        withTransform(ctx, { x: w * lx, y: h * ly + fall, rotate: Math.sin(frame.t + lx) * 0.2 * m }, () => {
          paint(ctx, (c) => ellipsePath(c, 0, 0, 12, 7), color, { width: 1.8, stroke: ink });
          line(ctx, [{ x: -10, y: 0 }, { x: 10, y: 0 }], ink, 1.4);
        });
      }
      break;
    }

    case "pumpkin-patch": {
      paint(
        ctx,
        (c) => {
          c.moveTo(0, h * 0.74);
          c.quadraticCurveTo(w * 0.5, h * 0.65, w, h * 0.75);
          c.lineTo(w, h);
          c.lineTo(0, h);
          c.closePath();
        },
        alpha(theme.canvas.paperAlt, 0.25),
        { stroke: false },
      );
      drawPastelGhost(ctx, w * 0.14, h * 0.28 + Math.sin(frame.t * 1.4) * 5 * m, 1.0, ink);
      drawStarSparkle(ctx, w * 0.86, h * 0.24, 8, "#FFFFFF");
      break;
    }

    case "periwinkle-cosmos":
    case "midnight-moon": {
      const dark = theme.patternKind === "midnight-moon";
      const twinkle = 0.65 + 0.35 * Math.sin(frame.t * 2.2) * m;
      for (const [sx, sy, sr] of [
        [0.12, 0.22, 8],
        [0.24, 0.14, 5],
        [0.78, 0.16, 7],
        [0.89, 0.28, 9],
        [0.16, 0.74, 6],
        [0.84, 0.72, 6],
      ]) {
        drawStarSparkle(ctx, w * sx, h * sy, sr, alpha("#FFE48E", twinkle));
      }
      // Ringed planet motif
      withTransform(ctx, { x: w * 0.86, y: h * 0.23, rotate: -0.25 }, () => {
        paint(ctx, (c) => circlePath(c, 0, 0, 14), "#FCE07C", { width: 2, stroke: ink });
        paint(ctx, (c) => ellipsePath(c, 0, 0, 26, 6), "transparent", { width: 2.2, stroke: dark ? "#D5D9FF" : "#FFFFFF" });
      });
      if (dark) {
        drawPastelGhost(ctx, w * 0.13, h * 0.32 + Math.sin(frame.t * 1.5) * 6 * m, 1.15, "#8E92A8");
      }
      break;
    }

    case "deep-sea": {
      const floatA = Math.sin(frame.t * 1.3) * 8 * m;
      const sway = Math.sin(frame.t * 2.2) * m;
      drawBabyJellyfish(ctx, w * 0.12, h * 0.28 + floatA, 1.25, "#A8D5FA", ink, sway);
      drawBabyJellyfish(ctx, w * 0.87, h * 0.32 - floatA * 0.7, 1.05, "#BFE2FC", ink, -sway);
      drawStarSparkle(ctx, w * 0.21, h * 0.2, 6, "#FFE48E");
      drawStarSparkle(ctx, w * 0.78, h * 0.19, 7, "#FFE48E");
      for (const [bx, by, br] of [
        [0.16, 0.62, 4],
        [0.83, 0.66, 5],
      ]) {
        paint(ctx, (c) => circlePath(c, w * bx, h * by + floatA * 0.4, br), alpha("#FFFFFF", 0.35), { width: 1.5, stroke: alpha("#FFFFFF", 0.65) });
      }
      break;
    }
  }

  // Optional tiny handwritten-style theme affirmation caption
  if (opts.showAffirmation && theme.affirmation) {
    ctx.save();
    ctx.fillStyle = alpha(theme.canvas.textInk, 0.76);
    ctx.font = 'italic 400 13px Georgia, Cambria, "Times New Roman", serif';
    ctx.textAlign = "right";
    ctx.fillText(`"${theme.affirmation}"`, w - 24, h - 22);
    ctx.restore();
  }
}
