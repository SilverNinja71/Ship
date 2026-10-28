// The interactive deck props the engine owns: the helm, the citrus tree and
// the ship's bell, plus name labels. Ship units, drawn at layout points.

import type { TreeState } from "../stores/voyageStore.js";
import { drawBellSprite, drawCitrusSprite, drawHelmSprite } from "./sprites/props.js";
import { INK, OUTLINE, alpha, circlePath, line, mix, paint, rng, roundRectPath, shade, smoothClosedPath, sway, withTransform } from "./draw.js";
import type { Ctx, FrameInfo, Point } from "./types.js";

/** A ship's wheel on a pedestal. `angle` turns it. */
export function drawHelm(ctx: Ctx, at: Point, angle: number, trim: string): void {
  if (drawHelmSprite(ctx, at, angle)) return;
  const wood = "#9C6B3F";
  const cx = at.x;
  const cy = at.y - 74;
  paint(ctx, (c) => {
    c.moveTo(cx - 12, at.y);
    c.lineTo(cx - 8, cy + 8);
    c.lineTo(cx + 8, cy + 8);
    c.lineTo(cx + 12, at.y);
    c.closePath();
  }, shade(wood, -0.1));
  withTransform(ctx, { x: cx, y: cy, rotate: angle }, () => {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      // Spokes stick out past the rim as handles.
      line(ctx, [{ x: 0, y: 0 }, { x: Math.cos(a) * 44, y: Math.sin(a) * 44 }], INK, 9);
      line(ctx, [{ x: 0, y: 0 }, { x: Math.cos(a) * 44, y: Math.sin(a) * 44 }], wood, 5);
    }
    ctx.beginPath();
    ctx.arc(0, 0, 31, 0, Math.PI * 2);
    ctx.lineWidth = 11;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.lineWidth = 6.5;
    ctx.strokeStyle = wood;
    ctx.stroke();
    paint(ctx, (c) => circlePath(c, 0, 0, 9), trim);
  });
}

export interface TreeLook {
  state: TreeState;
  /** Ripe fruit hanging, ready to pick. */
  fruit: number;
  /** 0..1 through the current voyage, for blossoms. */
  progress: number;
  /** Seconds since the last harvest, for a little shake. */
  shake: number;
}

const FRUIT_SPOTS: Point[] = [
  { x: -30, y: -128 },
  { x: 26, y: -136 },
  { x: -6, y: -158 },
  { x: 40, y: -112 },
  { x: -44, y: -104 },
  { x: 12, y: -106 },
  { x: -24, y: -150 },
  { x: 34, y: -154 },
];

/** A potted citrus tree, about 90 wide and 190 tall, standing on `at`. */
export function drawCitrusTree(ctx: Ctx, at: Point, look: TreeLook, frame: FrameInfo, seed = 1): void {
  const wilted = look.state === "wilted";
  const lean = sway(frame.t, 0.9, seed, frame.reducedMotion) * 0.035 * (0.4 + frame.wind) + (look.shake < 0.6 ? Math.sin(look.shake * 40) * 0.05 * (1 - look.shake / 0.6) : 0);
  if (drawCitrusSprite(ctx, at, {
    look: wilted ? "wilted" : look.state === "blooming" ? "blooming" : "normal",
    lean,
    fruit: FRUIT_SPOTS.slice(0, Math.min(look.fruit, FRUIT_SPOTS.length)),
    blossoms: look.state === "blooming" ? blossomSpots(look.progress) : [],
    droop: wilted ? 16 : 0,
  })) {
    if (look.fruit > FRUIT_SPOTS.length) drawLabel(ctx, `×${look.fruit}`, at.x, at.y - 246, 0.8);
    return;
  }
  // Pot.
  paint(ctx, (c) => {
    c.moveTo(at.x - 34, at.y - 44);
    c.lineTo(at.x + 34, at.y - 44);
    c.lineTo(at.x + 26, at.y);
    c.lineTo(at.x - 26, at.y);
    c.closePath();
  }, "#C8693F");
  paint(ctx, (c) => roundRectPath(c, at.x - 40, at.y - 54, 80, 14, 5), "#D9804F");

  withTransform(ctx, { x: at.x, y: at.y - 50, rotate: lean }, () => {
    // Trunk.
    paint(ctx, (c) => {
      c.moveTo(-7, 0);
      c.quadraticCurveTo(-10, -40, -4, -78);
      c.lineTo(5, -78);
      c.quadraticCurveTo(2, -40, 8, 0);
      c.closePath();
    }, "#7A5230");

    const leaf = wilted ? "#A3974E" : "#4FA05A";
    const droop = wilted ? 16 : 0;
    const rand = rng(seed * 97);
    const canopy: Point[] = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const r = 52 + rand() * 10;
      canopy.push({ x: Math.cos(a) * r, y: -128 + droop + Math.sin(a) * (wilted ? 34 : 44) + (wilted && Math.sin(a) > 0 ? 10 : 0) });
    }
    paint(ctx, (c) => smoothClosedPath(c, canopy), leaf);
    // A lighter patch on top gives the canopy some roundness.
    paint(ctx, (c) => c.ellipse(-10, -146 + droop, 30, 16, -0.2, 0, Math.PI * 2), shade(leaf, 0.18), { stroke: false });

    if (wilted) {
      for (let i = 0; i < 4; i++) {
        const x = -40 + i * 26;
        paint(ctx, (c) => c.ellipse(x, -88 + (i % 2) * 6, 9, 4, 1.2, 0, Math.PI * 2), shade(leaf, -0.15), { width: 2 });
      }
    }

    // Blossoms open as the voyage goes on.
    if (look.state === "blooming") {
      const spots = blossomSpots(look.progress);
      spots.forEach((p, i) => drawBlossom(ctx, p.x, p.y, 6 + (i === spots.length - 1 ? 2 * Math.sin(frame.t * 3) : 0)));
    }

    const fruit = Math.min(look.fruit, FRUIT_SPOTS.length);
    for (let i = 0; i < fruit; i++) {
      const p = FRUIT_SPOTS[i];
      const bob = sway(frame.t, 1.3, i, frame.reducedMotion) * 1.5;
      paint(ctx, (c) => circlePath(c, p.x, p.y + droop + bob, 11), wilted ? "#D9822B" : "#FF9F2E");
      paint(ctx, (c) => c.ellipse(p.x - 3, p.y + droop + bob - 4, 3.5, 2.2, -0.5, 0, Math.PI * 2), "#FFE0A6", { stroke: false });
      paint(ctx, (c) => c.ellipse(p.x + 4, p.y + droop + bob - 11, 5, 2.5, 0.6, 0, Math.PI * 2), "#4FA05A", { width: 2 });
    }
    if (look.fruit > FRUIT_SPOTS.length) {
      drawLabel(ctx, `×${look.fruit}`, 0, -196, 0.8);
    }
  });
}

/** One blossom per eighth of the voyage so far, beside the fruit spots. */
function blossomSpots(progress: number): Point[] {
  const count = Math.ceil(progress * FRUIT_SPOTS.length);
  return Array.from({ length: count }, (_, i) => {
    const p = FRUIT_SPOTS[(i + 3) % FRUIT_SPOTS.length];
    return { x: p.x + 8, y: p.y - 6 };
  });
}

function drawBlossom(ctx: Ctx, x: number, y: number, r: number): void {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    paint(ctx, (c) => circlePath(c, x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8, r * 0.62), "#FFFDF5", { width: 1.8 });
  }
  paint(ctx, (c) => circlePath(c, x, y, r * 0.38), "#FFD166", { stroke: false });
}

/** The ship's bell on a little bracket. `swing` is radians. */
export function drawBell(ctx: Ctx, at: Point, swing: number, glow: string): void {
  if (!drawBellSprite(ctx, at, swing)) drawBellBody(ctx, at, swing);
  if (Math.abs(swing) > 0.05) {
    // Little sound-lines while it rings (even with sound off, you can see it).
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.arc(at.x, at.y + 26, 34 + i * 10, side < 0 ? Math.PI * 0.85 : -Math.PI * 0.15, side < 0 ? Math.PI * 1.15 : Math.PI * 0.15);
        ctx.strokeStyle = alpha(mix(glow, "#FFFFFF", 0.4), Math.min(1, Math.abs(swing) * 2.5));
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }
  }
}

function drawBellBody(ctx: Ctx, at: Point, swing: number): void {
  const brass = "#E3B341";
  line(ctx, [{ x: at.x - 18, y: at.y }, { x: at.x + 18, y: at.y }], INK, 8);
  line(ctx, [{ x: at.x - 18, y: at.y }, { x: at.x + 18, y: at.y }], "#7A5230", 4.5);
  withTransform(ctx, { x: at.x, y: at.y + 4, rotate: swing }, () => {
    paint(ctx, (c) => {
      c.moveTo(-6, 0);
      c.quadraticCurveTo(-12, 6, -14, 26);
      c.quadraticCurveTo(-16, 40, -22, 46);
      c.lineTo(22, 46);
      c.quadraticCurveTo(16, 40, 14, 26);
      c.quadraticCurveTo(12, 6, 6, 0);
      c.closePath();
    }, brass);
    paint(ctx, (c) => c.ellipse(-6, 22, 3, 10, 0.1, 0, Math.PI * 2), alpha("#FFF6C8", 0.8), { stroke: false });
    paint(ctx, (c) => circlePath(c, Math.sin(swing * 2) * 6, 50, 5), shade(brass, -0.35));
  });
}

/** A rounded name tag, centered on (x, y). */
export function drawLabel(ctx: Ctx, text: string, x: number, y: number, scale = 1, tone: "plain" | "ghost" = "plain"): void {
  ctx.save();
  ctx.font = `700 ${Math.round(17 * scale)}px ui-rounded, "SF Pro Rounded", Nunito, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const w = ctx.measureText(text).width + 18 * scale;
  const h = 26 * scale;
  paint(ctx, (c) => roundRectPath(c, x - w / 2, y - h / 2, w, h, h / 2), tone === "ghost" ? "rgba(233,236,255,0.75)" : "#FFFDF5", { width: OUTLINE * 0.6 * scale, stroke: INK });
  ctx.fillStyle = INK;
  ctx.fillText(text, x, y + 1 * scale);
  ctx.restore();
}
