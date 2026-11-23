// "Tiny Ink" visual style: Pwedo Pomo Studio hand-drawn stationery aesthetic.
// Strictly cream, white, tan, grey, and soft warm-grey ink (#A29C93),
// with ONLY the cute pastel costume minions providing gentle pops of color.

import type { AvatarLoadout, ShipDefinition } from "@ship/shared-types";
import type { EnvironmentTheme } from "@ship/ship-theme-kit";
import { alpha, mix, parseColor, rng } from "./draw.js";
import type { Ctx } from "./types.js";

export type PortThemeId = "classic" | "grapes" | "oranges" | "matcha" | "lavender";

export const PORT_THEMES: Record<PortThemeId, { label: string; pastel: string; accent: string }> = {
  classic: { label: "Classic Banana", pastel: "#FFF3A8", accent: "#E6DFCE" },
  grapes: { label: "Pastel Grapes", pastel: "#DFCEF5", accent: "#D5C0F0" },
  oranges: { label: "Pastel Oranges", pastel: "#FFD9B3", accent: "#FAD0A5" },
  matcha: { label: "Pastel Matcha", pastel: "#D1EAD4", accent: "#C2E3C6" },
  lavender: { label: "Pastel Lavender", pastel: "#E8DCF8", accent: "#DDD0F5" },
};

export const SKETCH_INK = "#A29C93";
const PAPER_LIGHT = "#FFFDF5";

/** Relative perceptual luminance (0..1) of a CSS color. */
export function luminance(color: string): number {
  const { r, g, b } = parseColor(color);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Maps any color to a warm black/grey/tan/white monochrome tone. */
export function toPaperTone(color: string, minT = 0.12, maxT = 0.96): string {
  const l = luminance(color);
  const t = minT + l * (maxT - minT);
  return mix(SKETCH_INK, PAPER_LIGHT, t);
}

/** Softly mutes a color; in strict 0-color Tiny Ink mode, ships use monochrome tan/grey. */
export function softColorPop(color: string): string {
  return mix(color, "#FFF9EE", 0.16);
}

/** Converts any environment into strict cream/tan/grey/white (0 color). */
export function toTinyInkEnv(env: EnvironmentTheme): EnvironmentTheme {
  if (env.night) {
    return {
      ...env,
      skyTop: "#2E2C2A",
      skyBottom: "#423F3C",
      sea: env.cloudSea ? ["#54514D", "#45423E", "#373532"] : ["#494642", "#3B3835", "#2E2C2A"],
      foam: "#FBF8EA",
      cloud: "#54514D",
      celestialColor: "#EBE7DA",
    };
  }
  return {
    ...env,
    skyTop: "#FBF8EA",
    skyBottom: "#F6F1E0",
    sea: env.cloudSea ? ["#FBF8EA", "#F0ECE0", "#E4DFD2"] : ["#ECE8DC", "#E0DBD0", "#D3CEC2"],
    foam: "#FFFFFF",
    cloud: "#FFFFFF",
    celestialColor: "#EFEAD8",
  };
}

/** Converts a ship's palette strictly to black, grey, tan, and white (0 color). */
export function toTinyInkShip(ship: ShipDefinition): ShipDefinition {
  const p = ship.palette;
  const hullL = luminance(p.hull);
  const hull = hullL < 0.28 ? mix("#C9C3B5", "#E8E3D5", hullL / 0.28) : "#F7F4EC";
  const hullDark = mix(hull, SKETCH_INK, 0.16);
  return {
    ...ship,
    palette: {
      hull,
      hullDark,
      deck: "#F4EFE4",
      trim: "#8E867B",
      sail: "#FFFFFF",
      sailShade: "#E8E4D8",
      accent: "#CFC9BA",
      glow: "#E8E2D0",
    },
  };
}

/** Converts an avatar to monochrome tan/grey/white. */
export function toTinyInkAvatar(avatar: AvatarLoadout): AvatarLoadout {
  return {
    ...avatar,
    skin: "porcelain",
    hairColor: toPaperTone(avatar.hairColor, 0.08, 0.72),
    coatColor: toPaperTone(avatar.coatColor, 0.14, 0.96),
  };
}

let paperPatternCanvas: HTMLCanvasElement | null = null;

function getPaperGrainCanvas(): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  if (paperPatternCanvas) return paperPatternCanvas;
  const size = 160;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d");
  if (!g) return null;
  const rand = rng(42);
  for (let i = 0; i < 240; i++) {
    const x = rand() * size;
    const y = rand() * size;
    g.fillStyle = rand() > 0.45 ? alpha(SKETCH_INK, 0.03 + rand() * 0.03) : "rgba(255,255,255,0.22)";
    g.fillRect(x, y, 1.2, 1.2);
  }
  g.strokeStyle = alpha(SKETCH_INK, 0.035);
  g.lineWidth = 0.8;
  for (let i = 0; i < 24; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const a = rand() * Math.PI * 2;
    const len = 4 + rand() * 8;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  paperPatternCanvas = c;
  return c;
}

/** Overlays a subtle cached sketchbook paper texture onto the canvas. */
export function drawPaperTexture(ctx: Ctx, width: number, height: number): void {
  const tile = getPaperGrainCanvas();
  if (!tile) return;
  const pat = ctx.createPattern(tile, "repeat");
  if (!pat) return;
  ctx.save();
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
