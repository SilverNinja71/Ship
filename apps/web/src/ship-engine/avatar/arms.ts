// Arms as outlined sleeve tubes ending in round mitten hands, plus the things
// a hand can hold: a quill, a stylus, a boba cup, a teacup or a brass spyglass.

import { alpha, OUTLINE, shade } from "../draw.js";
import type { Ctx, Point } from "../types.js";
import type { SleeveStyle } from "./coats.js";
import { curvyPath, fillPath, fract, paintShaded, strokePath, tube } from "./kit.js";
import { HAND_R, SLEEVE_W, type Look } from "./look.js";
import type { ArmPose, Pose } from "./pose.js";

const norm = (dx: number, dy: number) => {
  const d = Math.hypot(dx, dy) || 1;
  return { x: dx / d, y: dy / d };
};

export function drawArm(ctx: Ctx, look: Look, sleeve: SleeveStyle, arm: ArmPose, side: -1 | 1, pose: Pose): void {
  const { shoulder: s, elbow: e, hand: h } = arm;
  const dir = norm(h.x - e.x, h.y - e.y);
  const wrist = { x: h.x - dir.x * HAND_R * 0.75, y: h.y - dir.y * HAND_R * 0.75 };
  // Start a little inside the shoulder so the arm grows out of the body.
  const sIn = { x: s.x - side * 2, y: s.y + 1 };

  if (sleeve.bare) {
    tube(ctx, [sIn, e, wrist], SLEEVE_W - 1.5, look.skin, { outline: look.skinLine });
    const cap = { x: sIn.x + (e.x - sIn.x) * 0.45, y: sIn.y + (e.y - sIn.y) * 0.45 };
    tube(ctx, [sIn, cap], SLEEVE_W + 1, sleeve.bare);
  } else {
    tube(ctx, [sIn, e, wrist], SLEEVE_W, sleeve.fill, { outline: sleeve.line, stripes: sleeve.stripes });
    if (sleeve.cuff) {
      const len = sleeve.cuffWide ? 6.5 : 3.2;
      const c0 = { x: wrist.x - dir.x * len, y: wrist.y - dir.y * len };
      tube(ctx, [c0, wrist], SLEEVE_W + (sleeve.cuffWide ? 2.5 : 0.5), sleeve.cuff);
    }
  }

  if (arm.hold !== "none") drawHeld(ctx, arm, pose);
  drawHand(ctx, look, h, side, arm);
}

/** A round mitten hand with a hint of a thumb on the inner side. */
export function drawHand(ctx: Ctx, look: Look, h: Point, side: -1 | 1, arm: Pick<ArmPose, "hold">): void {
  const holding = arm.hold === "quill" || arm.hold === "stylus";
  const ry = HAND_R * (holding ? 0.95 : 0.86);
  paintShaded(ctx, (c) => c.ellipse(h.x, h.y, HAND_R, ry, 0, 0, Math.PI * 2), look.skin, alpha(look.skinShade, 0.8), (c) => c.ellipse(h.x + side * 1.5, h.y + ry + 1.2, HAND_R, 2.6, 0, 0, Math.PI * 2), { stroke: look.skinLine, width: 3 });
  strokePath(ctx, (c) => {
    c.moveTo(h.x - side * HAND_R * 0.15, h.y - ry * 0.35);
    c.quadraticCurveTo(h.x - side * HAND_R * 0.7, h.y - ry * 0.2, h.x - side * HAND_R * 0.62, h.y + ry * 0.35);
  }, alpha(look.skinLine, 0.55), 1.3);
}

function drawHeld(ctx: Ctx, arm: ArmPose, pose: Pose): void {
  const h = arm.hand;
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(arm.angle);
  switch (arm.hold) {
    case "quill":
      quill(ctx);
      break;
    case "stylus":
      paintShaded(ctx, (c) => {
        c.moveTo(-2.6, 7.5);
        c.lineTo(8.5, -19);
        c.lineTo(11.5, -17.6);
        c.lineTo(0.2, 8.6);
        c.closePath();
      }, "#3E4A7A", null, null, { width: 2 });
      paintShaded(ctx, (c) => c.arc(-1.4, 8.6, 1.4, 0, Math.PI * 2), "#D7DCE6", null, null, { width: 1 });
      break;
    case "boba":
      boba(ctx, pose);
      break;
    case "tea":
      teacup(ctx, pose);
      break;
    case "spyglass":
      spyglass(ctx, pose);
      break;
  }
  ctx.restore();
}

/** A quill feather, nib at the bottom-left of the hand, vane rising behind it. */
export function quill(ctx: Ctx): void {
  const vane = (c: Ctx) =>
    curvyPath(c, [[0, -3, 1], [-2.5, -10], [-1, -17], [0.5, -19.5, 1], [1, -22], [5, -28], [12, -32, 1], [13.5, -26], [12.5, -21, 1], [14, -18], [11, -10], [4.5, -2.5]], 0.5);
  paintShaded(ctx, vane, "#FFFDF6", "#EEE6D4", (c) => c.ellipse(-2, -8, 6, 9, 0, 0, Math.PI * 2), { stroke: "#B3A792", width: 2.2 });
  // A soft blue tip.
  ctx.save();
  ctx.beginPath();
  vane(ctx);
  ctx.clip();
  fillPath(ctx, (c) => c.ellipse(12, -31, 7, 6, 0.5, 0, Math.PI * 2), "#9CCFE0");
  ctx.restore();
  strokePath(ctx, (c) => {
    c.moveTo(-3.5, 6.5);
    c.quadraticCurveTo(3, -12, 12, -31);
  }, "#C9BEA8", 1.2);
  paintShaded(ctx, (c) => {
    c.moveTo(-4.4, 7.4);
    c.lineTo(-2.2, 2);
    c.lineTo(0.3, 3);
    c.closePath();
  }, "#3A3248", null, null, { width: 1.2 });
}

function boba(ctx: Ctx, pose: Pose): void {
  ctx.scale(1.12, 1.12);
  const cup = (c: Ctx) => {
    c.moveTo(-8.5, -10);
    c.lineTo(8.5, -10);
    c.lineTo(6.5, 11);
    c.quadraticCurveTo(0, 12.5, -6.5, 11);
    c.closePath();
  };
  // Straw first so the lid sits over its base; it runs up to the lips.
  const straw = (c: Ctx) => {
    c.moveTo(2, -6);
    c.lineTo(-2.2, -26.8);
  };
  ctx.save();
  ctx.lineCap = "round";
  strokePath(ctx, straw, "#B85B86", 5.8);
  strokePath(ctx, straw, "#F49AC1", 3);
  ctx.restore();
  if (pose.sip > 0.6) {
    // A pearl riding up the straw.
    const u = fract(pose.t * 0.9);
    fillPath(ctx, (c) => c.arc(2 - 4 * u, -8 - 17 * u, 1.3, 0, Math.PI * 2), "#3B2A2E");
  }
  paintShaded(ctx, cup, "#EADFD6", "#D9A97A", (c) => c.rect(-10, -4 + pose.sip * 2, 20, 18), { stroke: "#8B6E5D" });
  ctx.save();
  ctx.beginPath();
  cup(ctx);
  ctx.clip();
  for (const [x, y] of [[-4, 8], [0, 9.5], [4, 8], [-2, 5.5], [2.5, 6]] as const) fillPath(ctx, (c) => c.arc(x, y, 1.9, 0, Math.PI * 2), "#3B2A2E");
  fillPath(ctx, (c) => c.rect(-7, -9, 2.2, 18), alpha("#FFFFFF", 0.4));
  ctx.restore();
  // Dome lid.
  paintShaded(ctx, (c) => {
    c.moveTo(-9.5, -9.5);
    c.quadraticCurveTo(0, -19, 9.5, -9.5);
    c.closePath();
  }, alpha("#F7F4F0", 0.95), null, null, { stroke: "#8B6E5D", width: 2.4 });
  paintShaded(ctx, (c) => c.roundRect(-10, -11, 20, 3, 1.2), "#F7F4F0", null, null, { stroke: "#8B6E5D", width: 2 });
}

function teacup(ctx: Ctx, pose: Pose): void {
  // The cup sits to the hand's left; the hand holds its handle.
  ctx.translate(-9, -3);
  const cup = (c: Ctx) => {
    c.moveTo(-8, -5);
    c.lineTo(8, -5);
    c.quadraticCurveTo(8, 6, 0, 6.5);
    c.quadraticCurveTo(-8, 6, -8, -5);
    c.closePath();
  };
  paintShaded(ctx, (c) => c.ellipse(9, -0.5, 4.2, 3.6, 0, 0, Math.PI * 2), "#FFFDF8", null, null, { stroke: "#8E8AA0", width: 2.6 });
  paintShaded(ctx, cup, "#FFFDF8", "#E6E4EE", (c) => c.ellipse(4, 4, 8, 4, 0, 0, Math.PI * 2), { stroke: "#8E8AA0" });
  strokePath(ctx, (c) => {
    c.moveTo(-7.4, -2.2);
    c.lineTo(7.4, -2.2);
  }, "#5B83C6", 1.6);
  paintShaded(ctx, (c) => c.arc(-1.5, 2, 1.6, 0, Math.PI * 2), "#F08A9A", null, null, { stroke: false });
  if (pose.sip < 0.5) paintShaded(ctx, (c) => c.ellipse(0, -5, 7, 1.6, 0, 0, Math.PI * 2), "#C9893F", null, null, { stroke: "#8E8AA0", width: 1.4 });
}

function spyglass(ctx: Ctx, pose: Pose): void {
  const brass = "#E0AC45";
  const ext = pose.extend;
  // Local x runs along the barrel; the eyepiece sits at about -11 (the eye).
  const seg = (x0: number, x1: number, r: number, color: string) =>
    paintShaded(ctx, (c) => c.roundRect(x0, -r, x1 - x0, r * 2, 1.4), color, shade(color, -0.18), (c) => c.rect(x0, r * 0.25, x1 - x0, r), { width: OUTLINE * 0.8 });
  const l2 = 8 + 12 * ext;
  const l3 = 8 + 12 * ext;
  seg(-12, 7, 3.4, brass);
  seg(5, 5 + l2, 4.2, brass);
  seg(3 + l2, 3 + l2 + l3, 5, brass);
  // A leather grip, brass bands and the big lens.
  paintShaded(ctx, (c) => c.roundRect(-3, -3.7, 9, 7.4, 1.5), "#7A4A2E", null, null, { width: 2.2 });
  const end = 3 + l2 + l3;
  paintShaded(ctx, (c) => c.roundRect(end - 3, -6.2, 4.5, 12.4, 1.4), shade(brass, -0.08), null, null, { width: 2.2 });
  paintShaded(ctx, (c) => c.ellipse(end + 1.6, 0, 1.8, 5.2, 0, 0, Math.PI * 2), "#BFE6F7", null, null, { width: 1.6 });
  fillPath(ctx, (c) => c.ellipse(end + 1.6, -2, 0.8, 1.6, 0, 0, Math.PI * 2), "#FFFFFF");
}

/** Steam wisps above a teacup or a pot. */
export function drawSteam(ctx: Ctx, x: number, y: number, t: number, strength = 1, scale = 1): void {
  for (let i = 0; i < 3; i++) {
    const u = fract(t * 0.45 + i / 3);
    const a = Math.sin(u * Math.PI) * 0.55 * strength;
    if (a <= 0.02) continue;
    const yy = y - u * 20 * scale;
    const xx = x + (i - 1) * 3.5 * scale + Math.sin(u * 6 + i * 2) * 2.2 * scale;
    strokePath(ctx, (c) => {
      c.moveTo(xx, yy + 5 * scale);
      c.quadraticCurveTo(xx + 3 * scale, yy + 2.5 * scale, xx, yy);
      c.quadraticCurveTo(xx - 3 * scale, yy - 2.5 * scale, xx, yy - 5 * scale);
    }, alpha("#FFFFFF", a), 2 * scale);
  }
}
