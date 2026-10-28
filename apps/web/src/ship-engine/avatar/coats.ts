// Eight coats in any coat color, drawn in the torso frame (origin at the base
// of the neck, y down). The torso continues below the desk top, where the
// desk hides it. Each coat also says how its sleeves look.

import type { CoatId } from "@ship/shared-types";
import { alpha, mix, shade } from "../draw.js";
import type { Ctx } from "../types.js";
import { curvyPath, fillPath, paintShaded, strokePath, withClip, type CurvePt } from "./kit.js";
import { luminance, type Look } from "./look.js";

export interface SleeveStyle {
  fill: string;
  line?: string;
  stripes?: readonly [string, number, number];
  cuff?: string;
  /** Wide turned-back cuffs (the pirate coat). */
  cuffWide?: boolean;
  /** Bare arms (the toga), with a short cap of cloth at the shoulder. */
  bare?: string;
}

const TORSO: CurvePt[] = [
  [-13, -2.5],
  [-24, 0.5],
  [-30.5, 8],
  [-32.5, 21],
  [-33.5, 40],
  [-33.5, 62],
  [33.5, 62],
  [33.5, 40],
  [32.5, 21],
  [30.5, 8],
  [24, 0.5],
  [13, -2.5],
];

export const torsoPath = (c: Ctx) => curvyPath(c, TORSO, 0.5);

const WHITE = "#F7F3EA";
const CREAM = "#F4EEDF";
const GOLD = "#E8B84A";

/** Body shading: the far side and a shadow under the chin. */
function torsoShade(c: Ctx, turn: number): void {
  c.ellipse(-36, 34, 15, 46, 0, 0, Math.PI * 2);
  c.moveTo(turn + 18, 2);
  c.ellipse(turn, 2, 18, 6.5, 0, 0, Math.PI * 2);
}

function base(ctx: Ctx, fill: string, turn: number, shadeColor?: string): void {
  paintShaded(ctx, torsoPath, fill, shadeColor ?? shade(fill, luminance(fill) > 0.8 ? -0.1 : -0.18), (c) => torsoShade(c, turn));
}

function neck(ctx: Ctx, look: Look): void {
  paintShaded(ctx, (c) => c.roundRect(-7, -12, 14, 15, 5), look.skinShade, null, null, { stroke: look.skinLine });
}

function buttons(ctx: Ctx, x: number, ys: number[], color: string, r = 1.9): void {
  for (const y of ys) paintShaded(ctx, (c) => c.arc(x, y, r, 0, Math.PI * 2), color, null, null, { width: 1.4 });
}

/** Draws the torso for a coat and returns its sleeve style. */
export function drawTorso(ctx: Ctx, look: Look, coat: CoatId, turn: number): SleeveStyle {
  const col = look.coat;
  const cx = turn * 0.6;
  neck(ctx, look);
  switch (coat) {
    case "striped-shirt": {
      base(ctx, WHITE, turn);
      withClip(ctx, torsoPath, () => {
        for (let y = 7; y < 64; y += 7.5) fillPath(ctx, (c) => c.rect(-40, y, 80, 3.4), col);
        fillPath(ctx, (c) => torsoShade(c, turn), alpha(shade(col, -0.4), 0.16));
      });
      strokePath(ctx, torsoPath, mix(look.coatLine, "#6B6070", 0.4));
      // A wide boat neck.
      paintShaded(ctx, (c) => c.ellipse(cx, -1.5, 13, 4.2, 0, 0, Math.PI), look.skinShade, null, null, { stroke: look.skinLine, width: 2.2 });
      return { fill: WHITE, stripes: [col, 3.4, 4.1], line: mix(look.coatLine, "#6B6070", 0.4) };
    }
    case "hoodie": {
      // The hood bunched behind the neck.
      paintShaded(ctx, (c) => curvyPath(c, [[-25, 4], [-23, -7], [-10, -11], [10, -11], [23, -7], [25, 4], [12, 1], [-12, 1]], 0.5), look.coatShade, null, null, { stroke: look.coatLine });
      base(ctx, col, turn);
      // Hood opening around the neck.
      paintShaded(ctx, (c) => curvyPath(c, [[-17, -1], [cx, 9], [17, -1], [cx, 1.5]], 0.5), shade(col, -0.32), null, null, { stroke: look.coatLine, width: 2.6 });
      for (const s of [-1, 1]) {
        strokePath(ctx, (c) => {
          c.moveTo(cx + s * 6, 5);
          c.quadraticCurveTo(cx + s * 7.5, 14, cx + s * 6.5, 24);
        }, "#FBF6EC", 2);
        paintShaded(ctx, (c) => c.roundRect(cx + s * 6.5 - 1.6, 23, 3.2, 4.5, 1.2), "#C9C2B4", null, null, { width: 1.2 });
      }
      return { fill: col, cuff: shade(col, -0.16), line: look.coatLine };
    }
    case "vest": {
      base(ctx, WHITE, turn);
      const vest = (s: -1 | 1) => (c: Ctx) =>
        curvyPath(c, [[s * 11, -2], [s * 24, 0.5], [s * 30.5, 8], [s * 31, 26], [s * 33, 62], [cx + s * 1.5, 62], [cx + s * 1.5, 26, 1], [s * 9.5, 1, 1]].map((p) => (p[2] === 1 ? ([p[0], p[1], 1] as const) : ([p[0], p[1]] as const))), 0.4);
      paintShaded(ctx, vest(-1), col, look.coatShade, (c) => c.ellipse(-36, 34, 15, 46, 0, 0, Math.PI * 2));
      paintShaded(ctx, vest(1), col, look.coatShade, (c) => c.ellipse(turn, 2, 18, 6, 0, 0, Math.PI * 2));
      buttons(ctx, cx + 4.5, [30, 38, 46], GOLD);
      // A little cravat.
      paintShaded(ctx, (c) => curvyPath(c, [[cx, 2], [cx - 6, -1, 1], [cx - 5.5, 6, 1]], 0.3), "#2E4A86", null, null, { width: 2 });
      paintShaded(ctx, (c) => curvyPath(c, [[cx, 2], [cx + 6, -1, 1], [cx + 5.5, 6, 1]], 0.3), "#2E4A86", null, null, { width: 2 });
      paintShaded(ctx, (c) => c.arc(cx, 2.4, 2.2, 0, Math.PI * 2), "#3A5A9A", null, null, { width: 1.6 });
      return { fill: WHITE, cuff: shade(WHITE, -0.08), line: mix(look.coatLine, "#6B6070", 0.5) };
    }
    case "flannel": {
      base(ctx, col, turn);
      withClip(ctx, torsoPath, () => {
        const dark = alpha(shade(col, -0.45), 0.32);
        const light = alpha(shade(col, 0.5), 0.35);
        for (let x = -36; x < 40; x += 13) fillPath(ctx, (c) => c.rect(x, -5, 5.5, 70), dark);
        for (let y = 2; y < 64; y += 13) fillPath(ctx, (c) => c.rect(-40, y, 80, 5.5), dark);
        for (let x = -30; x < 40; x += 13) fillPath(ctx, (c) => c.rect(x, -5, 1.2, 70), light);
      });
      strokePath(ctx, torsoPath, look.coatLine);
      // White tee at the open collar, the collar points, and a button placket.
      paintShaded(ctx, (c) => curvyPath(c, [[cx - 8, -1.5], [cx, 9, 1], [cx + 8, -1.5]], 0.4), WHITE, null, null, { width: 2.4 });
      for (const s of [-1, 1] as const) paintShaded(ctx, (c) => curvyPath(c, [[cx + s * 4, -3], [cx + s * 15, -2], [cx + s * 9, 9, 1], [cx + s * 1.5, 10, 1]], 0.3), shade(col, 0.08), null, null, { stroke: look.coatLine, width: 2.6 });
      strokePath(ctx, (c) => {
        c.moveTo(cx + 0.5, 10);
        c.lineTo(cx + 0.5, 62);
      }, alpha(look.coatLine, 0.7), 1.5);
      buttons(ctx, cx + 3, [17, 27, 37], "#F3EAD8", 1.6);
      return { fill: col, stripes: [alpha(shade(col, -0.45), 0.4), 4.5, 7.5], cuff: shade(col, -0.12), line: look.coatLine };
    }
    case "pirate-coat": {
      base(ctx, col, turn);
      // The white shirt and its ruffled jabot inside the open coat.
      const shirt = (c: Ctx) => curvyPath(c, [[cx - 10, -2], [cx + 10, -2], [cx + 8, 40], [cx, 62], [cx - 8, 40]], 0.4);
      paintShaded(ctx, shirt, WHITE, null, null, { width: 2.6 });
      const ruffle: CurvePt[] = [[cx - 2, 0]];
      for (let i = 0; i < 5; i++) {
        ruffle.push([cx - 7 - (i % 2), 4 + i * 4.5]);
        ruffle.push([cx - 3, 6 + i * 4.5, 1]);
      }
      for (let i = 4; i >= 0; i--) {
        ruffle.push([cx + 3, 6 + i * 4.5, 1]);
        ruffle.push([cx + 7 + (i % 2), 4 + i * 4.5]);
      }
      ruffle.push([cx + 2, 0]);
      paintShaded(ctx, (c) => curvyPath(c, ruffle, 0.5), "#FFFDF7", null, null, { width: 2, stroke: "#9B95A0" });
      // Gold trim down both front edges of the coat.
      for (const s of [-1, 1]) {
        strokePath(ctx, (c) => {
          c.moveTo(cx + s * 10, -2);
          c.quadraticCurveTo(cx + s * 10.5, 30, cx + s * 9, 62);
        }, GOLD, 2.6);
        buttons(ctx, cx + s * 15, [16, 27, 38], GOLD, 2.1);
      }
      return { fill: col, cuff: GOLD, cuffWide: true, line: look.coatLine };
    }
    case "marine-uniform": {
      base(ctx, WHITE, turn);
      // The square sailor collar with two white stripes.
      const collar = (c: Ctx) => curvyPath(c, [[-25, 0.5, 1], [-12, -2.5], [12, -2.5], [25, 0.5, 1], [31, 10, 1], [cx + 1, 25, 1], [-30, 10, 1]], 0.4);
      paintShaded(ctx, collar, col, look.coatShade, (c) => c.ellipse(-30, 10, 10, 10, 0, 0, Math.PI * 2), { stroke: look.coatLine });
      withClip(ctx, collar, () => {
        for (const off of [3.2, 6]) {
          strokePath(ctx, (c) => {
            c.moveTo(-30 + off * 0.6, 10 - off * 0.5);
            c.lineTo(cx + 1, 25 - off * 1.2);
            c.lineTo(31 - off * 0.6, 10 - off * 0.5);
          }, WHITE, 1.3);
        }
      });
      // Neck opening and the red neckerchief knot.
      paintShaded(ctx, (c) => curvyPath(c, [[cx - 10, -2], [cx, 12, 1], [cx + 10, -2]], 0.4), look.skinShade, null, null, { stroke: look.skinLine, width: 2.2 });
      paintShaded(ctx, (c) => curvyPath(c, [[cx - 4, 18], [cx - 7, 31, 1], [cx - 1, 27]], 0.4), "#D6463F", null, null, { width: 2.2 });
      paintShaded(ctx, (c) => curvyPath(c, [[cx + 4, 18], [cx + 7.5, 31, 1], [cx + 1, 27]], 0.4), "#C23D37", null, null, { width: 2.2 });
      paintShaded(ctx, (c) => c.ellipse(cx, 18.5, 4.6, 3.6, 0, 0, Math.PI * 2), "#D6463F", null, null, { width: 2.2 });
      return { fill: WHITE, cuff: col, line: mix(look.coatLine, "#6B6070", 0.5) };
    }
    case "toga": {
      base(ctx, CREAM, turn);
      // A broad drape from the left shoulder across to the right hip.
      const drape = (c: Ctx) => curvyPath(c, [[-25, -0.5], [-10, -2.5], [-2, 8], [14, 26], [33.5, 40], [33.5, 62], [12, 62], [-12, 30], [-32.5, 18], [-31, 5]], 0.45);
      paintShaded(ctx, drape, col, look.coatShade, (c) => c.ellipse(-30, 20, 14, 30, 0, 0, Math.PI * 2), { stroke: look.coatLine });
      withClip(ctx, drape, () => {
        for (const [a, b] of [[-14, 6], [-6, 18], [4, 30]] as const) {
          strokePath(ctx, (c) => {
            c.moveTo(a - 12, b);
            c.quadraticCurveTo(a + 8, b + 4, a + 26, b + 18);
          }, alpha(shade(col, -0.35), 0.6), 1.5);
        }
      });
      paintShaded(ctx, (c) => c.arc(-19, 4, 4, 0, Math.PI * 2), GOLD, null, null, { width: 2 });
      paintShaded(ctx, (c) => c.arc(-19, 4, 1.6, 0, Math.PI * 2), "#C2453E", null, null, { stroke: false });
      return { fill: look.skin, bare: CREAM, line: look.skinLine };
    }
    case "flight-jacket": {
      base(ctx, col, turn);
      strokePath(ctx, (c) => {
        c.moveTo(cx + 1, 8);
        c.lineTo(cx + 1, 62);
      }, "#B8BCC6", 2.2);
      paintShaded(ctx, (c) => c.roundRect(cx - 0.4, 12, 3, 6, 1), "#D9DCE3", null, null, { width: 1.2 });
      // A round wings patch on the chest.
      paintShaded(ctx, (c) => c.arc(cx - 15, 22, 5.6, 0, Math.PI * 2), "#2E4A86", null, null, { width: 2 });
      strokePath(ctx, (c) => {
        c.moveTo(cx - 19.5, 21);
        c.quadraticCurveTo(cx - 15, 23.5, cx - 10.5, 21);
      }, GOLD, 1.5);
      // The shearling collar, over both shoulders.
      const fluff: CurvePt[] = [];
      const n = 14;
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const x = -27 + 54 * u;
        const y = 5 + Math.sin(u * Math.PI) * 7 - Math.abs(u - 0.5) * 6;
        fluff.push(i % 2 ? [x, y + 2.6] : [x, y, 1]);
      }
      const collar: CurvePt[] = [[-25, -0.5], [-12, -4], [12, -4], [25, -0.5], ...fluff.reverse()];
      paintShaded(ctx, (c) => curvyPath(c, collar, 0.5), "#F3E3C6", "#E1CCA8", (c) => c.ellipse(turn, -1, 16, 6, 0, 0, Math.PI * 2), { stroke: "#A98F68" });
      return { fill: col, cuff: shade(col, -0.25), line: look.coatLine };
    }
  }
}
