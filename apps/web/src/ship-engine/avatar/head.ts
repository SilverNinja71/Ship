// The head (in its own frame: origin at the head center, rx 35, ry 32), the
// visible ear, and the face. The face turns towards +x for the 3/4 view, so
// the left (-x) ear shows and the right eye sits a little narrower.

import { INK, alpha, mix, OUTLINE, radialGradient, shade } from "../draw.js";
import type { Ctx } from "../types.js";
import { curvyPath, fillPath, paintShaded, strokePath, withClip, type CurvePt } from "./kit.js";
import type { Look } from "./look.js";
import type { EyeKind, MouthKind, Pose } from "./pose.js";

export function headShape(turn: number): CurvePt[] {
  const j = turn * 0.45;
  return [
    [0, -32.5],
    [21, -29.5],
    [33, -17],
    [36.5, -1],
    [34.5 + j * 0.2, 13],
    [27 + j * 0.6, 24],
    [15 + j, 31],
    [3 + j, 33.5],
    [-10 + j, 32],
    [-23 + j * 0.5, 26],
    [-32, 15],
    [-36, 0],
    [-33, -17],
    [-21, -29.5],
  ];
}

export function headPath(c: Ctx, turn: number): void {
  curvyPath(c, headShape(turn), 0.55);
}

export const EAR = { x: -34, y: 6 };

/** The ear on the -x side, drawn before the head so the head overlaps its root. */
export function drawEar(ctx: Ctx, look: Look): void {
  paintShaded(
    ctx,
    (c) => curvyPath(c, [[-30, -3], [-38, -6], [-42.5, 2], [-40, 12], [-31, 13]], 0.6),
    look.skin,
    look.skinShade,
    (c) => curvyPath(c, [[-33, 0], [-38, -1], [-39.5, 4], [-37, 9], [-33, 9]], 0.6),
    { stroke: look.skinLine },
  );
}

export function drawHeadShape(ctx: Ctx, look: Look, pose: Pose, hairShadow: ((c: Ctx) => void) | null): void {
  paintShaded(ctx, (c) => headPath(c, pose.turn), look.skin, hairShadow ? look.skinShade : null, hairShadow, { stroke: look.skinLine });
}

const MOUTH = "#5B2737";
/** How much of a focused eye the lowered lid covers. */
const LID = 0.36;
const TONGUE = "#F07A8A";

export function drawFace(ctx: Ctx, look: Look, pose: Pose, hideEye: -1 | 0 | 1 = 0): void {
  const f = pose.turn;
  const ey = 6;
  const left = { x: f - 13.5, y: ey, rx: 5.3, ry: 6.9 };
  const right = { x: f + 12.5, y: ey, rx: 4.8, ry: 6.7 };

  // Screen light on the face from a laptop, monitor or tablet.
  if (pose.glow > 0) {
    withClip(ctx, (c) => headPath(c, f), () => {
      const g = radialGradient(ctx, f + 2, 30, 46, [
        [0, alpha("#CDEBFF", 0.32 * pose.glow)],
        [1, alpha("#CDEBFF", 0)],
      ]);
      fillPath(ctx, (c) => c.rect(-40, -40, 80, 80), g);
    });
  }

  // Rosy cheeks.
  const blushUp = pose.eyes === "happy" || pose.eyes === "squeeze" ? 1.5 : 0;
  fillPath(ctx, (c) => c.ellipse(left.x - 8, 15 - blushUp, 6.6, 3.9, 0, 0, Math.PI * 2), alpha(look.blush, 0.75));
  fillPath(ctx, (c) => c.ellipse(right.x + 8, 15 - blushUp, 5.4, 3.7, 0, 0, Math.PI * 2), alpha(look.blush, 0.75));

  if (hideEye !== -1) drawEye(ctx, look, pose, left.x, left.y, left.rx, left.ry, pose.eyes === "wink" ? "open" : pose.eyes, -1);
  if (hideEye !== 1) drawEye(ctx, look, pose, right.x, right.y, right.rx, right.ry, pose.eyes === "wink" ? "open" : pose.eyes, 1);
  if (pose.eyes === "wink" && hideEye !== -1) {
    // Wink drawn above as an override for the free eye.
  }

  // A hint of a nose.
  strokePath(ctx, (c) => {
    c.moveTo(f + 1.5, 11.5);
    c.quadraticCurveTo(f + 2.8, 12.6, f + 1.4, 13.4);
  }, alpha(shade(look.skin, -0.45), 0.7), 1.4);

  drawMouth(ctx, pose.mouth, f + 1, 18.5);
}

function drawEye(ctx: Ctx, look: Look, pose: Pose, x: number, y: number, rx: number, ry: number, kind: EyeKind, side: -1 | 1): void {
  const lash = INK;
  const gx = pose.look.x * 1.1;
  const gy = pose.look.y * 1.1;
  if (kind === "blink") {
    strokePath(ctx, (c) => {
      c.moveTo(x - rx, y + 1.5);
      c.quadraticCurveTo(x, y + 4, x + rx, y + 1.5);
    }, lash, 2.3);
    return;
  }
  if (kind === "happy") {
    strokePath(ctx, (c) => {
      c.moveTo(x - rx, y + 2.5);
      c.quadraticCurveTo(x, y - 4.5, x + rx, y + 2.5);
    }, lash, 2.4);
    return;
  }
  if (kind === "sleep") {
    strokePath(ctx, (c) => {
      c.moveTo(x - rx - 0.5, y + 1);
      c.quadraticCurveTo(x, y + 5.5, x + rx + 0.5, y + 1);
    }, lash, 2.3);
    // Lashes.
    strokePath(ctx, (c) => {
      c.moveTo(x - rx * 0.4, y + 3.8);
      c.lineTo(x - rx * 0.6, y + 6);
      c.moveTo(x + rx * 0.4, y + 3.8);
      c.lineTo(x + rx * 0.6, y + 6);
    }, lash, 1.3);
    return;
  }
  if (kind === "squeeze") {
    const s = -side;
    strokePath(ctx, (c) => {
      c.moveTo(x - rx * s, y - 3.5);
      c.lineTo(x + rx * 0.7 * s, y + 0.5);
      c.lineTo(x - rx * s, y + 4);
    }, lash, 2.4);
    return;
  }
  if (pose.eyes === "wink" && side === -1) {
    // The free eye squints while the other peers down the spyglass.
    strokePath(ctx, (c) => {
      c.moveTo(x - rx, y + 1);
      c.quadraticCurveTo(x, y - 2.5, x + rx, y + 1);
    }, lash, 2.4);
    strokePath(ctx, (c) => {
      c.moveTo(x - rx, y + 1);
      c.lineTo(x - rx - 2, y - 1);
    }, lash, 1.6);
    return;
  }

  // Open or focused: a tall dark oval with a tinted lower half and two highlights.
  const focus = kind === "focus";
  const cy = y + (focus ? 1.4 : 0) + gy * 0.6;
  const cx = x + gx * 0.7;
  const ery = focus ? ry * 0.8 : ry;
  const iris = look.eye;
  const tint = mix(iris, "#7D8FD9", 0.5);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ery, 0, 0, Math.PI * 2);
  ctx.fillStyle = iris;
  ctx.fill();
  ctx.clip();
  fillPath(ctx, (c) => c.ellipse(cx, cy + ery * 0.85, rx * 1.1, ery * 0.75, 0, 0, Math.PI * 2), tint);
  if (focus) {
    // A lowered lid: the top of the eye is covered by skin.
    fillPath(ctx, (c) => c.rect(cx - rx - 1, cy - ery - 1, rx * 2 + 2, ery * LID + 1), look.skin);
  }
  ctx.restore();
  // Upper lash line, thick, with a flick at the outer corner.
  const top = focus ? cy - ery + ery * LID : cy - ery * 0.55;
  strokePath(ctx, (c) => {
    if (focus) {
      c.moveTo(cx - rx - 0.6, top + 0.4);
      c.quadraticCurveTo(cx, top - 1.2, cx + rx + 0.6, top + 0.4);
    } else {
      c.ellipse(cx, cy, rx + 0.3, ery + 0.3, 0, Math.PI * 1.08, Math.PI * 1.92);
    }
  }, lash, 2.2);
  strokePath(ctx, (c) => {
    const ox = cx + side * (rx + 0.2);
    const oy = focus ? top + 0.4 : cy - ery * 0.35;
    c.moveTo(ox, oy);
    c.lineTo(ox + side * 2.2, oy - 1.6);
  }, lash, 1.7);
  // Highlights.
  const hx = -gx * 0.3;
  fillPath(ctx, (c) => c.arc(cx + rx * 0.3 + hx, cy - ery * (focus ? 0.05 : 0.33), rx * (focus ? 0.36 : 0.43), 0, Math.PI * 2), "#FFFFFF");
  fillPath(ctx, (c) => c.arc(cx - rx * 0.35 + hx, cy + ery * 0.42, rx * 0.2, 0, Math.PI * 2), alpha("#FFFFFF", 0.9));
}

function drawMouth(ctx: Ctx, kind: MouthKind, x: number, y: number): void {
  const w = 1.8;
  switch (kind) {
    case "smile":
      strokePath(ctx, (c) => {
        c.moveTo(x - 3.2, y - 0.6);
        c.quadraticCurveTo(x, y + 2.6, x + 3.2, y - 0.6);
      }, MOUTH, w);
      return;
    case "cat":
      strokePath(ctx, (c) => {
        c.moveTo(x - 3.6, y - 0.6);
        c.quadraticCurveTo(x - 1.8, y + 2, x, y);
        c.quadraticCurveTo(x + 1.8, y + 2, x + 3.6, y - 0.6);
      }, MOUTH, w);
      return;
    case "flat":
      strokePath(ctx, (c) => {
        c.moveTo(x - 2.4, y + 0.4);
        c.quadraticCurveTo(x, y + 1.2, x + 2.4, y + 0.2);
      }, MOUTH, w);
      return;
    case "tongue":
      fillPath(ctx, (c) => c.ellipse(x + 2.4, y + 1.6, 1.7, 1.9, 0.3, 0, Math.PI * 2), TONGUE);
      strokePath(ctx, (c) => {
        c.moveTo(x - 2.6, y + 0.3);
        c.quadraticCurveTo(x, y + 1.3, x + 3, y);
      }, MOUTH, w);
      return;
    case "o":
    case "sip":
      paintShaded(ctx, (c) => c.ellipse(x, y + 0.6, kind === "sip" ? 1.7 : 2.2, kind === "sip" ? 1.9 : 2.6, 0, 0, Math.PI * 2), MOUTH, null, null, { stroke: false });
      return;
    case "sleep":
      paintShaded(ctx, (c) => c.ellipse(x - 0.5, y + 0.8, 1.7, 1.3, 0, 0, Math.PI * 2), MOUTH, null, null, { stroke: false });
      return;
    case "yawn":
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(x, y + 2.2, 4.2, 5.4, 0, 0, Math.PI * 2);
      ctx.fillStyle = MOUTH;
      ctx.fill();
      ctx.clip();
      fillPath(ctx, (c) => c.ellipse(x, y + 7, 3.6, 3, 0, 0, Math.PI * 2), TONGUE);
      ctx.restore();
      return;
    case "grin":
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x - 4.6, y - 1);
      ctx.quadraticCurveTo(x, y + 0.2, x + 4.6, y - 1);
      ctx.quadraticCurveTo(x + 3.6, y + 5.2, x, y + 5.2);
      ctx.quadraticCurveTo(x - 3.6, y + 5.2, x - 4.6, y - 1);
      ctx.closePath();
      ctx.fillStyle = MOUTH;
      ctx.fill();
      ctx.clip();
      fillPath(ctx, (c) => c.ellipse(x, y + 5.6, 3.2, 2.4, 0, 0, Math.PI * 2), TONGUE);
      ctx.restore();
      return;
  }
}

/** A thin outline weight for small details. */
export const FINE = OUTLINE * 0.55;
