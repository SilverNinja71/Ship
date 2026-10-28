// Figureheads for every FigureheadId. Each one is drawn in a local frame with
// its mount at the origin and +x pointing forward along layout.bow.angle.
// All of them are side-profile carvings, about 100-130 units long.

import type { FigureheadId, ShipDefinition } from "@ship/shared-types";
import { INK, alpha, circlePath, ellipsePath, line, outlineFor, paint, roundRectPath, shade, smoothClosedPath, sway, withTransform } from "../../ship-engine/draw.js";
import type { Ctx, FrameInfo, Point } from "../../ship-engine/types.js";
import { glow, isNight, paintIn } from "../kit.js";

type Drawer = (ctx: Ctx, frame: FrameInfo, ship: ShipDefinition) => void;

export function drawFigurehead(ctx: Ctx, id: FigureheadId, bow: Point & { angle: number }, frame: FrameInfo, ship: ShipDefinition, scale = 1): void {
  const draw = FIGUREHEADS[id];
  if (!draw) return;
  withTransform(ctx, { x: bow.x, y: bow.y, rotate: bow.angle, scale }, () => draw(ctx, frame, ship));
}

// ---------------------------------------------------------------------------
// Little shared pieces

function eye(ctx: Ctx, x: number, y: number, r: number, look = 0.3): void {
  paint(ctx, (c) => ellipsePath(c, x, y, r, r * 1.1), "#FFFFFF", { width: 2 });
  ctx.beginPath();
  circlePath(ctx, x + r * look, y + r * 0.1, r * 0.62);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.beginPath();
  circlePath(ctx, x + r * look - r * 0.22, y - r * 0.2, r * 0.22);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
}

function happyEye(ctx: Ctx, x: number, y: number, r: number, color = INK): void {
  ctx.beginPath();
  ctx.moveTo(x - r, y + r * 0.3);
  ctx.quadraticCurveTo(x, y - r * 0.9, x + r, y + r * 0.3);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.stroke();
}

function stroke(ctx: Ctx, build: (c: Ctx) => void, color: string, width: number, outline = true): void {
  if (outline) {
    ctx.beginPath();
    build(ctx);
    ctx.strokeStyle = outlineFor(color);
    ctx.lineWidth = width + 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }
  ctx.beginPath();
  build(ctx);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

// ---------------------------------------------------------------------------

const ram: Drawer = (ctx) => {
  const wool = "#FFFDF5";
  const face = "#F1E0C8";
  const horn = "#E8B04B";
  // Woolly neck and chest.
  const puffs: [number, number, number][] = [
    [-4, 4, 16],
    [8, -12, 17],
    [20, 6, 15],
    [26, -22, 15],
    [36, -6, 14],
    [14, -30, 13],
  ];
  for (const [x, y, r] of puffs) paint(ctx, (c) => circlePath(c, x, y, r), wool, { width: 3 });
  // Face: a long, soft profile looking ahead.
  paintIn(
    ctx,
    (c) => {
      c.moveTo(36, -42);
      c.bezierCurveTo(54, -50, 74, -40, 90, -24);
      c.bezierCurveTo(98, -16, 94, -4, 82, -4);
      c.bezierCurveTo(68, -4, 52, 0, 42, -8);
      c.bezierCurveTo(32, -18, 28, -34, 36, -42);
      c.closePath();
    },
    face,
    () => {
      ctx.beginPath();
      ellipsePath(ctx, 74, -4, 26, 8);
      ctx.fillStyle = shade(face, -0.12);
      ctx.fill();
    },
    { width: 3.2 },
  );
  ctx.beginPath();
  ellipsePath(ctx, 89, -17, 4, 3, 0.5);
  ctx.fillStyle = shade(face, -0.55);
  ctx.fill();
  line(ctx, [{ x: 86, y: -9 }, { x: 80, y: -8 }], shade(face, -0.55), 2.2);
  happyEye(ctx, 64, -30, 6);
  paint(ctx, (c) => ellipsePath(c, 74, -16, 6, 3.5), alpha("#F49A7A", 0.6), { stroke: false });
  // Ear, drooping back.
  paint(ctx, (c) => ellipsePath(c, 42, -36, 13, 6, 0.5), shade(face, -0.06), { width: 2.6 });
  // A big curled horn.
  stroke(ctx, (c) => {
    c.moveTo(50, -44);
    c.bezierCurveTo(46, -66, 18, -66, 14, -46);
    c.bezierCurveTo(10, -28, 30, -20, 36, -32);
    c.bezierCurveTo(40, -40, 30, -46, 26, -40);
  }, horn, 10);
  ctx.beginPath();
  ctx.moveTo(44, -56);
  ctx.lineTo(40, -50);
  ctx.moveTo(32, -60);
  ctx.lineTo(31, -53);
  ctx.moveTo(20, -55);
  ctx.lineTo(24, -50);
  ctx.strokeStyle = shade(horn, -0.4);
  ctx.lineWidth = 1.8;
  ctx.stroke();
  // Forelock.
  for (const [x, y, r] of [
    [50, -46, 8],
    [60, -48, 7],
  ] as const)
    paint(ctx, (c) => circlePath(c, x, y, r), wool, { width: 2.6 });
};

const lion: Drawer = (ctx) => {
  const gold = "#F2B43C";
  const mane = "#E8743B";
  const maneDark = "#C2552A";
  const muzzle = "#FFE3A3";
  const cx = 58;
  const cy = -30;
  // A mane of rolling wave-curls framing the head from crown to chin.
  const curl = (a: number, r: number, s: number, color: string) => {
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    withTransform(ctx, { x, y, rotate: a + Math.PI / 2 }, () =>
      paint(ctx, (c) => {
        c.moveTo(-14 * s, 6 * s);
        c.bezierCurveTo(-16 * s, -14 * s, 10 * s, -22 * s, 16 * s, -6 * s);
        c.bezierCurveTo(20 * s, 6 * s, 6 * s, 10 * s, 2 * s, 2 * s);
        c.bezierCurveTo(0, -4 * s, 8 * s, -6 * s, 8 * s, 0);
        c.bezierCurveTo(8 * s, 8 * s, -2 * s, 14 * s, -14 * s, 6 * s);
        c.closePath();
      }, color, { width: 2.6 }),
    );
  };
  for (let k = 0; k < 9; k++) curl(-1.9 - k * 0.42, 42, 1.15, maneDark);
  for (let k = 0; k < 8; k++) curl(-1.7 - k * 0.42, 30, 1.05, mane);
  // Head in profile: round brow, broad muzzle.
  paintIn(
    ctx,
    (c) => {
      c.moveTo(38, -40);
      c.bezierCurveTo(44, -62, 76, -64, 86, -46);
      c.bezierCurveTo(92, -40, 100, -38, 102, -28);
      c.bezierCurveTo(104, -16, 96, -6, 84, -4);
      c.bezierCurveTo(70, -2, 56, -4, 46, -12);
      c.bezierCurveTo(36, -20, 34, -32, 38, -40);
      c.closePath();
    },
    gold,
    () => {
      ctx.beginPath();
      ellipsePath(ctx, 88, -18, 16, 12);
      ctx.fillStyle = muzzle;
      ctx.fill();
      ctx.beginPath();
      ellipsePath(ctx, 56, -14, 20, 8);
      ctx.fillStyle = shade(gold, -0.1);
      ctx.fill();
    },
    { width: 3.2 },
  );
  paint(ctx, (c) => ellipsePath(c, 48, -54, 8, 9, -0.3), gold, { width: 2.6 });
  paint(ctx, (c) => ellipsePath(c, 48, -53, 3.5, 4.5, -0.3), maneDark, { stroke: false });
  // Nose, a little "w" mouth and whisker dots.
  paint(ctx, (c) => {
    c.moveTo(94, -32);
    c.quadraticCurveTo(104, -32, 103, -25);
    c.quadraticCurveTo(97, -23, 93, -27);
    c.closePath();
  }, "#7A3B1E", { width: 2 });
  ctx.beginPath();
  ctx.moveTo(100, -22);
  ctx.quadraticCurveTo(96, -14, 90, -17);
  ctx.quadraticCurveTo(86, -12, 81, -16);
  ctx.strokeStyle = "#7A3B1E";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.fillStyle = shade(gold, -0.45);
  for (const [x, y] of [
    [86, -24],
    [90, -21],
    [84, -20],
  ])
    ctx.fillRect(x, y, 2, 2);
  eye(ctx, 74, -38, 5.5, 0.45);
  line(ctx, [{ x: 66, y: -47 }, { x: 80, y: -46 }], "#7A3B1E", 2.6);
};

const pegasus: Drawer = (ctx, frame) => {
  const white = "#FFFFFF";
  const shadeC = "#DCD3F5";
  const gold = "#E8C66A";
  const flap = 0.12 * sway(frame.t, 2.2, 0, frame.reducedMotion);
  // Wing, rising up and back from the shoulder.
  withTransform(ctx, { x: 26, y: -24, rotate: -0.3 + flap }, () => {
    for (let k = 0; k < 4; k++) {
      paint(ctx, (c) => {
        const len = 70 - k * 10;
        c.moveTo(0, 0);
        c.quadraticCurveTo(-len * 0.5, -len * 0.9 + k * 6, -len, -len * 0.7 + k * 14);
        c.quadraticCurveTo(-len * 0.4, -len * 0.25, 0, 10);
        c.closePath();
      }, k % 2 ? shadeC : white, { width: 2.6 });
    }
  });
  // Body, chest and galloping forelegs.
  paintIn(
    ctx,
    (c) => {
      c.moveTo(-10, -6);
      c.bezierCurveTo(4, -30, 40, -34, 52, -20);
      c.bezierCurveTo(60, -10, 56, 8, 44, 14);
      c.bezierCurveTo(26, 20, 0, 18, -10, 10);
      c.closePath();
    },
    white,
    () => {
      ctx.beginPath();
      ellipsePath(ctx, 20, 18, 40, 10);
      ctx.fillStyle = shadeC;
      ctx.fill();
    },
    { width: 3 },
  );
  for (const [x, y, a] of [
    [44, 8, -0.9],
    [34, 12, -0.4],
  ] as const) {
    stroke(ctx, (c) => {
      c.moveTo(x, y);
      c.quadraticCurveTo(x + 18 * Math.cos(a), y + 18 * Math.sin(a) + 14, x + 30, y + 6 * a);
    }, white, 9);
    paint(ctx, (c) => roundRectPath(c, x + 26, y + 6 * a - 5, 10, 9, 3), gold, { width: 2 });
  }
  // Neck and head.
  paintIn(
    ctx,
    (c) => {
      c.moveTo(34, -28);
      c.bezierCurveTo(40, -50, 52, -64, 66, -64);
      c.bezierCurveTo(78, -62, 90, -50, 94, -40);
      c.bezierCurveTo(96, -34, 90, -30, 84, -34);
      c.bezierCurveTo(76, -38, 68, -40, 64, -34);
      c.bezierCurveTo(60, -24, 56, -16, 50, -12);
      c.closePath();
    },
    white,
    () => {
      ctx.beginPath();
      ellipsePath(ctx, 56, -20, 10, 16);
      ctx.fillStyle = shadeC;
      ctx.fill();
    },
    { width: 3 },
  );
  happyEye(ctx, 72, -52, 4.5);
  ctx.beginPath();
  circlePath(ctx, 90, -38, 1.6);
  ctx.fillStyle = INK;
  ctx.fill();
  paint(ctx, (c) => ellipsePath(c, 62, -66, 4, 8, -0.3), white, { width: 2.2 });
  // Golden mane.
  for (let k = 0; k < 4; k++) {
    paint(ctx, (c) => {
      const x = 58 - k * 8;
      const y = -62 + k * 10;
      c.moveTo(x + 6, y);
      c.quadraticCurveTo(x - 10, y - 4, x - 16, y + 10);
      c.quadraticCurveTo(x - 4, y + 6, x, y + 10);
      c.closePath();
    }, gold, { width: 2.2 });
  }
};

const dragon: Drawer = (ctx, frame) => {
  const body = "#3FAE8C";
  const belly = "#CDEFB5";
  const fin = "#7FD8C0";
  const wag = 2 * sway(frame.t, 1.6, 0, frame.reducedMotion);
  // Neck rising from the stem.
  paintIn(
    ctx,
    (c) => {
      c.moveTo(-14, 10);
      c.bezierCurveTo(10, -10, 30, -30, 48, -44);
      c.lineTo(62, -30);
      c.bezierCurveTo(44, -12, 26, 10, 8, 20);
      c.closePath();
    },
    body,
    () => {
      ctx.beginPath();
      ctx.moveTo(8, 20);
      ctx.bezierCurveTo(26, 10, 44, -12, 62, -30);
      ctx.lineTo(56, -36);
      ctx.bezierCurveTo(40, -18, 22, 4, 2, 14);
      ctx.closePath();
      ctx.fillStyle = belly;
      ctx.fill();
    },
    { width: 3 },
  );
  // Crest of fins down the neck.
  for (let k = 0; k < 4; k++) {
    const x = 4 + k * 12;
    const y = 2 - k * 12;
    paint(ctx, (c) => {
      c.moveTo(x, y);
      c.quadraticCurveTo(x - 10, y - 18, x - 2, y - 22);
      c.quadraticCurveTo(x + 4, y - 12, x + 10, y - 8);
      c.closePath();
    }, fin, { width: 2.4 });
  }
  // Head.
  paintIn(
    ctx,
    (c) => {
      c.moveTo(40, -50);
      c.bezierCurveTo(52, -66, 74, -62, 82, -52);
      c.lineTo(110, -44);
      c.bezierCurveTo(116, -42, 116, -34, 108, -32);
      c.lineTo(84, -28);
      c.bezierCurveTo(92, -24, 92, -18, 84, -18);
      c.bezierCurveTo(70, -16, 56, -22, 50, -28);
      c.bezierCurveTo(40, -34, 36, -42, 40, -50);
      c.closePath();
    },
    body,
    () => {
      ctx.beginPath();
      ellipsePath(ctx, 80, -22, 18, 6);
      ctx.fillStyle = belly;
      ctx.fill();
    },
    { width: 3.2 },
  );
  ctx.fillStyle = "#FFFFFF";
  for (const x of [90, 98]) {
    ctx.beginPath();
    ctx.moveTo(x, -31);
    ctx.lineTo(x + 3, -25);
    ctx.lineTo(x + 6, -31);
    ctx.closePath();
    ctx.fill();
  }
  eye(ctx, 66, -50, 5.5, 0.35);
  // Swept-back horns and whiskers.
  stroke(ctx, (c) => {
    c.moveTo(52, -60);
    c.quadraticCurveTo(40, -74, 24, -76);
  }, "#F2E3B3", 5);
  stroke(ctx, (c) => {
    c.moveTo(62, -62);
    c.quadraticCurveTo(54, -80, 38, -86);
  }, "#F2E3B3", 5);
  ctx.beginPath();
  ctx.moveTo(104, -36);
  ctx.bezierCurveTo(112, -20 + wag, 96, -8, 108, 4 + wag);
  ctx.strokeStyle = shade(body, -0.35);
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.beginPath();
  circlePath(ctx, 108, -40, 1.8);
  ctx.fillStyle = INK;
  ctx.fill();
};

const kraken: Drawer = (ctx, frame) => {
  const purple = "#8B5BC7";
  const pale = "#D9C2F2";
  const curlT = 0.08 * sway(frame.t, 1.4, 0, frame.reducedMotion);
  const tentacle = (pts: Point[], w: number) => {
    stroke(ctx, (c) => {
      c.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length - 1; k += 2) c.quadraticCurveTo(pts[k].x, pts[k].y, pts[k + 1].x, pts[k + 1].y);
    }, purple, w);
  };
  tentacle([{ x: 20, y: 0 }, { x: 0, y: 24 }, { x: -24, y: 14 }, { x: -36, y: 4 }, { x: -28, y: -4 }], 10);
  tentacle([{ x: 30, y: 4 }, { x: 24, y: 34 }, { x: 4, y: 40 }, { x: -6, y: 36 }, { x: -2, y: 28 }], 9);
  withTransform(ctx, { x: 46, y: 2, rotate: curlT }, () => {
    tentacle([{ x: 0, y: 0 }, { x: 30, y: 16 }, { x: 54, y: 4 }, { x: 64, y: -10 }, { x: 52, y: -16 }], 9);
  });
  tentacle([{ x: 40, y: 6 }, { x: 52, y: 30 }, { x: 74, y: 30 }, { x: 84, y: 24 }, { x: 80, y: 16 }], 8);
  ctx.fillStyle = pale;
  for (const [x, y] of [
    [-10, 22],
    [-22, 16],
    [12, 36],
    [62, 30],
    [74, 30],
    [66, 18],
  ]) {
    ctx.beginPath();
    circlePath(ctx, x, y, 2.4);
    ctx.fill();
  }
  // The mantle.
  paintIn(
    ctx,
    (c) => smoothClosedPath(c, [
      { x: 10, y: -6 },
      { x: 8, y: -40 },
      { x: 34, y: -70 },
      { x: 64, y: -58 },
      { x: 66, y: -20 },
      { x: 50, y: 4 },
    ]),
    purple,
    () => {
      ctx.fillStyle = shade(purple, -0.16);
      ctx.beginPath();
      ellipsePath(ctx, 30, 6, 40, 16);
      ctx.fill();
      ctx.fillStyle = alpha(pale, 0.7);
      for (const [x, y, r] of [
        [30, -54, 4],
        [44, -44, 3],
        [22, -38, 3],
        [52, -60, 2.5],
      ]) {
        ctx.beginPath();
        circlePath(ctx, x, y, r);
        ctx.fill();
      }
    },
    { width: 3.2 },
  );
  eye(ctx, 50, -22, 9, 0.35);
  ctx.beginPath();
  ctx.moveTo(40, -36);
  ctx.quadraticCurveTo(50, -40, 60, -34);
  ctx.strokeStyle = shade(purple, -0.5);
  ctx.lineWidth = 2.4;
  ctx.stroke();
};

const eagle: Drawer = (ctx) => {
  const brown = "#7A4A2B";
  const white = "#FFFFFF";
  const beak = "#F2C14E";
  // Wings swept back along the bow.
  for (let k = 0; k < 3; k++) {
    paint(ctx, (c) => {
      const y = -10 + k * 12;
      c.moveTo(44, y - 10);
      c.bezierCurveTo(20, y - 30 - k * 4, -16, y - 26, -38 + k * 8, y - 10 + k * 4);
      c.bezierCurveTo(-10, y - 4, 20, y + 4, 44, y + 6);
      c.closePath();
    }, k === 1 ? shade(brown, 0.15) : brown, { width: 2.8 });
  }
  ctx.strokeStyle = shade(brown, -0.45);
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (let k = 0; k < 4; k++) {
    ctx.moveTo(-26 + k * 14, -28 + k * 2);
    ctx.lineTo(-18 + k * 14, -16 + k * 2);
  }
  ctx.stroke();
  // Chest and head.
  paint(ctx, (c) => ellipsePath(c, 46, -10, 18, 22, -0.3), "#F4EEDC", { width: 3 });
  paintIn(
    ctx,
    (c) => {
      c.moveTo(42, -30);
      c.bezierCurveTo(46, -56, 76, -60, 84, -44);
      c.bezierCurveTo(88, -36, 84, -26, 74, -24);
      c.bezierCurveTo(64, -22, 50, -20, 42, -30);
      c.closePath();
    },
    white,
    () => {
      ctx.beginPath();
      ellipsePath(ctx, 56, -24, 16, 6);
      ctx.fillStyle = "#E6E8F0";
      ctx.fill();
    },
    { width: 3 },
  );
  paint(ctx, (c) => {
    c.moveTo(80, -44);
    c.bezierCurveTo(92, -46, 102, -40, 100, -28);
    c.quadraticCurveTo(98, -24, 94, -30);
    c.quadraticCurveTo(88, -32, 80, -30);
    c.closePath();
  }, beak, { width: 2.6 });
  eye(ctx, 70, -44, 4.5, 0.45);
  line(ctx, [{ x: 62, y: -50 }, { x: 76, y: -49 }], shade(brown, -0.2), 3);
};

const mermaid: Drawer = (ctx, frame) => {
  const tail = "#2FB5A3";
  const skin = "#F2C9A5";
  const hair = "#FF7F6B";
  const flick = 0.1 * sway(frame.t, 1.3, 0, frame.reducedMotion);
  // Tail curling under the bowsprit.
  paintIn(
    ctx,
    (c) => {
      c.moveTo(30, -10);
      c.bezierCurveTo(10, 10, -10, 20, -20, 34);
      c.lineTo(-10, 40);
      c.bezierCurveTo(6, 30, 30, 20, 46, 0);
      c.closePath();
    },
    tail,
    () => {
      ctx.strokeStyle = alpha(shade(tail, 0.4), 0.8);
      ctx.lineWidth = 1.6;
      for (let k = 0; k < 6; k++) {
        ctx.beginPath();
        ctx.arc(20 - k * 7, 6 + k * 5, 5, 0.2, Math.PI - 0.2);
        ctx.stroke();
      }
    },
    { width: 3 },
  );
  withTransform(ctx, { x: -16, y: 38, rotate: 0.4 + flick }, () => {
    paint(ctx, (c) => {
      c.moveTo(0, 0);
      c.bezierCurveTo(-10, -18, -30, -18, -32, -8);
      c.quadraticCurveTo(-16, -4, 0, 0);
      c.bezierCurveTo(-8, 14, -26, 22, -32, 14);
      c.quadraticCurveTo(-16, 6, 0, 0);
      c.closePath();
    }, shade(tail, 0.2), { width: 2.6 });
  });
  // Hair streaming back.
  paint(ctx, (c) => {
    c.moveTo(60, -58);
    c.bezierCurveTo(40, -66, 14, -52, -6, -36);
    c.bezierCurveTo(10, -38, 20, -34, 26, -30);
    c.bezierCurveTo(30, -40, 46, -42, 54, -38);
    c.closePath();
  }, hair, { width: 2.8 });
  // Torso leaning forward with arms reaching ahead.
  paint(ctx, (c) => {
    c.moveTo(28, -12);
    c.bezierCurveTo(30, -30, 46, -42, 60, -38);
    c.bezierCurveTo(64, -30, 52, -12, 44, -2);
    c.closePath();
  }, skin, { width: 3 });
  paint(ctx, (c) => ellipsePath(c, 50, -28, 7, 5, -0.5), "#F6E7D6", { width: 2 });
  paint(ctx, (c) => ellipsePath(c, 42, -18, 7, 5, -0.5), "#F6E7D6", { width: 2 });
  stroke(ctx, (c) => {
    c.moveTo(54, -36);
    c.quadraticCurveTo(76, -50, 100, -52);
  }, skin, 6);
  stroke(ctx, (c) => {
    c.moveTo(48, -30);
    c.quadraticCurveTo(70, -38, 94, -42);
  }, skin, 6);
  paint(ctx, (c) => circlePath(c, 64, -54, 11), skin, { width: 3 });
  paint(ctx, (c) => {
    c.moveTo(56, -64);
    c.bezierCurveTo(64, -72, 78, -66, 74, -56);
    c.quadraticCurveTo(66, -62, 56, -58);
    c.closePath();
  }, hair, { width: 2.4 });
  happyEye(ctx, 69, -54, 3.2);
  paint(ctx, (c) => circlePath(c, 52, -66, 4), "#FFD6E0", { width: 1.8 });
};

const sunburst: Drawer = (ctx, frame, ship) => {
  const gold = "#F2C14E";
  paint(ctx, (c) => roundRectPath(c, -10, -12, 44, 16, 6), "#B8742A", { width: 3 });
  const cx = 60;
  const cy = -30;
  const spin = frame.reducedMotion ? 0 : frame.t * 0.15;
  if (isNight(ship)) glow(ctx, cx, cy, 80, "#FFD166", 0.6);
  for (let k = 0; k < 12; k++) {
    const a = spin + (k / 12) * Math.PI * 2;
    const r0 = 28;
    const r1 = k % 2 ? 46 : 54;
    paint(ctx, (c) => {
      c.moveTo(cx + Math.cos(a - 0.2) * r0, cy + Math.sin(a - 0.2) * r0);
      c.quadraticCurveTo(cx + Math.cos(a - 0.08) * (r1 * 0.8), cy + Math.sin(a - 0.08) * (r1 * 0.8), cx + Math.cos(a + 0.06) * r1, cy + Math.sin(a + 0.06) * r1);
      c.quadraticCurveTo(cx + Math.cos(a + 0.12) * (r1 * 0.7), cy + Math.sin(a + 0.12) * (r1 * 0.7), cx + Math.cos(a + 0.2) * r0, cy + Math.sin(a + 0.2) * r0);
      c.closePath();
    }, k % 2 ? "#E5532D" : "#FFB347", { width: 2.4 });
  }
  paintIn(
    ctx,
    (c) => circlePath(c, cx, cy, 30),
    gold,
    () => {
      ctx.beginPath();
      ellipsePath(ctx, cx + 6, cy + 14, 30, 16);
      ctx.fillStyle = shade(gold, -0.12);
      ctx.fill();
      ctx.beginPath();
      ellipsePath(ctx, cx - 10, cy - 14, 10, 6, -0.5);
      ctx.fillStyle = alpha("#FFFFFF", 0.45);
      ctx.fill();
    },
    { width: 3.2 },
  );
  happyEye(ctx, cx - 10, cy - 2, 5, "#7C4A18");
  happyEye(ctx, cx + 10, cy - 2, 5, "#7C4A18");
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy + 10);
  ctx.quadraticCurveTo(cx, cy + 16, cx + 8, cy + 10);
  ctx.strokeStyle = "#7C4A18";
  ctx.lineWidth = 2.6;
  ctx.stroke();
};

const jaguar: Drawer = (ctx) => {
  const base = "#FFB84D";
  const pink = "#FF4FA3";
  const teal = "#3DF2C2";
  const purple = "#7A3E9D";
  // Forepaws stretched ahead.
  for (const y of [6, 16]) {
    paint(ctx, (c) => roundRectPath(c, 30, y - 6, 62, 12, 6), y === 6 ? base : shade(base, -0.1), { width: 2.8 });
    paint(ctx, (c) => circlePath(c, 92, y, 7), base, { width: 2.6 });
  }
  // Body / neck.
  paintIn(
    ctx,
    (c) => {
      c.moveTo(-14, 14);
      c.bezierCurveTo(-6, -20, 30, -40, 54, -36);
      c.lineTo(52, 2);
      c.bezierCurveTo(30, 16, 6, 20, -14, 14);
      c.closePath();
    },
    base,
    () => {
      ctx.strokeStyle = pink;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      for (let x = -10; x < 50; x += 10) {
        ctx.moveTo(x, 10);
        ctx.lineTo(x + 5, 4);
        ctx.lineTo(x + 10, 10);
      }
      ctx.stroke();
      for (const [x, y] of [
        [10, -10],
        [26, -22],
        [30, -4],
        [44, -18],
      ]) {
        ctx.beginPath();
        circlePath(ctx, x, y, 5);
        ctx.fillStyle = teal;
        ctx.fill();
        ctx.beginPath();
        circlePath(ctx, x, y, 2.2);
        ctx.fillStyle = purple;
        ctx.fill();
      }
    },
    { width: 3 },
  );
  // Head.
  paintIn(
    ctx,
    (c) => {
      c.moveTo(42, -40);
      c.bezierCurveTo(56, -60, 84, -56, 92, -40);
      c.bezierCurveTo(100, -36, 102, -24, 94, -20);
      c.bezierCurveTo(82, -12, 60, -12, 48, -18);
      c.bezierCurveTo(38, -24, 36, -34, 42, -40);
      c.closePath();
    },
    base,
    () => {
      ctx.beginPath();
      ellipsePath(ctx, 86, -20, 16, 8);
      ctx.fillStyle = "#FFF0C9";
      ctx.fill();
      for (const [x, y] of [
        [56, -46],
        [62, -30],
        [50, -32],
      ]) {
        ctx.beginPath();
        circlePath(ctx, x, y, 3.6);
        ctx.fillStyle = pink;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(66, -54);
      ctx.lineTo(70, -46);
      ctx.lineTo(76, -52);
      ctx.strokeStyle = teal;
      ctx.lineWidth = 2.4;
      ctx.stroke();
    },
    { width: 3.2 },
  );
  paint(ctx, (c) => {
    c.moveTo(50, -44);
    c.lineTo(52, -62);
    c.lineTo(64, -50);
    c.closePath();
  }, base, { width: 2.6 });
  paint(ctx, (c) => {
    c.moveTo(95, -32);
    c.quadraticCurveTo(102, -30, 100, -25);
    c.quadraticCurveTo(95, -25, 93, -28);
    c.closePath();
  }, pink, { width: 2 });
  ctx.beginPath();
  ctx.moveTo(98, -22);
  ctx.quadraticCurveTo(90, -14, 80, -18);
  ctx.strokeStyle = shade(base, -0.6);
  ctx.lineWidth = 2.2;
  ctx.stroke();
  eye(ctx, 76, -40, 5, 0.4);
  ctx.strokeStyle = teal;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (const dy of [-4, 0, 4]) {
    ctx.moveTo(88, -22 + dy);
    ctx.lineTo(108, -26 + dy * 1.6);
  }
  ctx.stroke();
};

const gorgon: Drawer = (ctx, frame) => {
  const stone = "#DCD6C8";
  const snake = "#A7B59A";
  const rm = frame.reducedMotion;
  // Snake locks, each with a tiny head.
  const snakes: [number, number, number, number][] = [
    [40, -60, -0.9, 0],
    [30, -50, -1.6, 1],
    [52, -66, -0.3, 2],
    [26, -36, -2.2, 3],
    [62, -62, 0.4, 4],
  ];
  for (const [x, y, a, k] of snakes) {
    const wig = 0.15 * sway(frame.t, 1.8, k * 1.3, rm);
    withTransform(ctx, { x, y, rotate: a + wig }, () => {
      stroke(ctx, (c) => {
        c.moveTo(0, 0);
        c.bezierCurveTo(8, -10, 16, 6, 26, -2);
      }, snake, 6);
      paint(ctx, (c) => ellipsePath(c, 29, -3, 6, 4.2), snake, { width: 2.2 });
      ctx.beginPath();
      circlePath(ctx, 31, -4.5, 1.3);
      ctx.fillStyle = INK;
      ctx.fill();
    });
  }
  // Neck and a draped stone shawl.
  paint(ctx, (c) => roundRectPath(c, 36, -22, 22, 30, 8), shade(stone, -0.08), { width: 3 });
  paint(ctx, (c) => {
    c.moveTo(-10, 12);
    c.bezierCurveTo(4, -2, 26, -8, 40, -2);
    c.bezierCurveTo(52, 2, 62, 4, 66, 12);
    c.bezierCurveTo(44, 22, 12, 24, -10, 12);
    c.closePath();
  }, shade(stone, -0.14), { width: 3 });
  ctx.beginPath();
  ctx.moveTo(8, 10);
  ctx.quadraticCurveTo(30, 2, 52, 10);
  ctx.strokeStyle = alpha(shade(stone, -0.5), 0.5);
  ctx.lineWidth = 1.6;
  ctx.stroke();
  // Face in serene profile.
  paintIn(
    ctx,
    (c) => {
      c.moveTo(34, -52);
      c.bezierCurveTo(48, -66, 72, -60, 76, -46);
      c.lineTo(84, -36);
      c.quadraticCurveTo(78, -32, 78, -28);
      c.quadraticCurveTo(82, -22, 76, -18);
      c.bezierCurveTo(70, -6, 54, -4, 46, -12);
      c.bezierCurveTo(34, -22, 28, -40, 34, -52);
      c.closePath();
    },
    stone,
    () => {
      ctx.beginPath();
      ellipsePath(ctx, 42, -28, 14, 24);
      ctx.fillStyle = shade(stone, -0.1);
      ctx.fill();
      ctx.strokeStyle = alpha("#9AA2A8", 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(50, -60);
      ctx.bezierCurveTo(56, -50, 50, -40, 60, -30);
      ctx.stroke();
    },
    { width: 3.2 },
  );
  happyEye(ctx, 64, -42, 5, shade(stone, -0.6));
  ctx.beginPath();
  ctx.moveTo(70, -22);
  ctx.quadraticCurveTo(74, -20, 76, -22);
  ctx.strokeStyle = shade(stone, -0.6);
  ctx.lineWidth = 2;
  ctx.stroke();
};

const bear: Drawer = (ctx) => {
  const wood = "#A0522D";
  const light = "#C98A5A";
  // Paws gripping the stem.
  for (const y of [4, 18]) paint(ctx, (c) => roundRectPath(c, 30, y - 7, 40, 14, 7), y === 4 ? wood : shade(wood, -0.1), { width: 2.8 });
  paintIn(
    ctx,
    (c) => {
      c.moveTo(-12, 16);
      c.bezierCurveTo(-8, -18, 24, -34, 46, -30);
      c.lineTo(46, 8);
      c.bezierCurveTo(26, 20, 4, 22, -12, 16);
      c.closePath();
    },
    wood,
    () => {
      ctx.strokeStyle = alpha(shade(wood, -0.4), 0.6);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        ctx.moveTo(-8, 10 - k * 8);
        ctx.bezierCurveTo(10, 4 - k * 9, 24, -6 - k * 6, 44, -10 - k * 5);
      }
      ctx.stroke();
    },
    { width: 3 },
  );
  // Head: round, with a long friendly snout.
  paintIn(
    ctx,
    (c) => {
      c.moveTo(30, -36);
      c.bezierCurveTo(36, -62, 70, -66, 78, -46);
      c.bezierCurveTo(90, -44, 100, -36, 98, -26);
      c.bezierCurveTo(96, -16, 80, -14, 66, -16);
      c.bezierCurveTo(48, -14, 30, -18, 30, -36);
      c.closePath();
    },
    wood,
    () => {
      ctx.beginPath();
      ellipsePath(ctx, 86, -26, 14, 9);
      ctx.fillStyle = light;
      ctx.fill();
      ctx.strokeStyle = alpha(shade(wood, -0.4), 0.5);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(52, -36, 12, 0.5, 2.6);
      ctx.arc(52, -36, 18, 0.6, 2.4);
      ctx.stroke();
    },
    { width: 3.2 },
  );
  paint(ctx, (c) => circlePath(c, 40, -54, 9), wood, { width: 2.8 });
  paint(ctx, (c) => circlePath(c, 40, -54, 4.5), light, { stroke: false });
  paint(ctx, (c) => ellipsePath(c, 98, -30, 5, 4), "#3B2412", { width: 2 });
  ctx.beginPath();
  ctx.moveTo(96, -22);
  ctx.quadraticCurveTo(90, -17, 82, -20);
  ctx.strokeStyle = "#3B2412";
  ctx.lineWidth = 2.2;
  ctx.stroke();
  eye(ctx, 66, -44, 4.2, 0.4);
};

const swordfish: Drawer = (ctx, frame) => {
  const blue = "#2E6FB0";
  const silver = "#CFE3F0";
  const fin = "#5B8FD1";
  const flick = 0.12 * sway(frame.t, 2, 0, frame.reducedMotion);
  withTransform(ctx, { x: -6, y: 10, rotate: 0.5 + flick }, () => {
    paint(ctx, (c) => {
      c.moveTo(0, 0);
      c.lineTo(-26, -20);
      c.quadraticCurveTo(-16, 0, -26, 20);
      c.closePath();
    }, fin, { width: 2.6 });
  });
  // Tall sail fin.
  paint(ctx, (c) => {
    c.moveTo(18, -16);
    c.bezierCurveTo(22, -60, 44, -70, 62, -52);
    c.quadraticCurveTo(52, -40, 56, -26);
    c.closePath();
  }, fin, { width: 2.8 });
  ctx.strokeStyle = alpha(shade(fin, -0.4), 0.7);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let k = 0; k < 4; k++) {
    ctx.moveTo(24 + k * 9, -18 - k * 2);
    ctx.lineTo(28 + k * 9, -52 + k * 4);
  }
  ctx.stroke();
  // Body leaping forward.
  paintIn(
    ctx,
    (c) => {
      c.moveTo(-6, 10);
      c.bezierCurveTo(14, -18, 50, -34, 86, -32);
      c.bezierCurveTo(96, -30, 98, -20, 88, -16);
      c.bezierCurveTo(56, -4, 22, 8, -6, 16);
      c.closePath();
    },
    blue,
    () => {
      ctx.beginPath();
      ctx.moveTo(-6, 16);
      ctx.bezierCurveTo(22, 8, 56, -4, 88, -16);
      ctx.lineTo(90, -22);
      ctx.bezierCurveTo(56, -10, 20, 0, -6, 10);
      ctx.closePath();
      ctx.fillStyle = silver;
      ctx.fill();
    },
    { width: 3 },
  );
  // The long bill.
  paint(ctx, (c) => {
    c.moveTo(90, -30);
    c.lineTo(150, -40);
    c.lineTo(90, -22);
    c.closePath();
  }, shade(blue, -0.1), { width: 2.6 });
  paint(ctx, (c) => {
    c.moveTo(56, -14);
    c.quadraticCurveTo(48, 4, 36, 8);
    c.quadraticCurveTo(46, -6, 44, -12);
    c.closePath();
  }, fin, { width: 2.2 });
  eye(ctx, 78, -26, 4.2, 0.4);
};

const FIGUREHEADS: Record<FigureheadId, Drawer | null> = {
  none: null,
  ram,
  lion,
  pegasus,
  dragon,
  kraken,
  eagle,
  mermaid,
  sunburst,
  jaguar,
  gorgon,
  bear,
  swordfish,
};

