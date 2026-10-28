// Resolves an AvatarLoadout into the colors every layer paints with, plus the
// sailor's fixed geometry. Units are station units: the floor under the desk
// is y = 0 and y grows downward, so everything on the sailor has negative y.

import type { AvatarLoadout } from "@ship/shared-types";
import { getSkinTone } from "@ship/ship-theme-kit";
import { mix, outlineFor, parseColor, shade } from "../draw.js";

/** Desk top: the far edge (against the sailor) and the near edge (towards the viewer). */
export const DESK_FAR = -74;
export const DESK_NEAR = -62;
/** Where hands and tools rest on the desk top. */
export const DESK_MID = (DESK_FAR + DESK_NEAR) / 2;
/** Half the desk's width. */
export const DESK_HALF = 72;

/** The head's rest center and radii. The head is drawn in its own frame around this. */
export const HEAD_Y = -133;
export const HEAD_RX = 35;
export const HEAD_RY = 32;
/** The base of the neck, where the torso frame starts. */
export const NECK_Y = -101;
/** Shoulder joints, in torso coordinates (relative to the neck base). */
export const SHOULDER = { x: 24, y: 7 };
/** Upper arm and forearm lengths: chibi arms are short. */
export const ARM_UPPER = 18;
export const ARM_LOWER = 17;
export const SLEEVE_W = 12;
export const HAND_R = 6.2;

export interface Look {
  loadout: AvatarLoadout;
  skin: string;
  skinShade: string;
  skinLine: string;
  blush: string;
  hair: string;
  hairShade: string;
  hairShine: string;
  hairLine: string;
  coat: string;
  coatShade: string;
  coatLine: string;
  /** A scarf color chosen to stand out against the coat. */
  scarf: string;
  eye: string;
}

const SCARF_COLORS = ["#E8B04B", "#D9534F", "#3C8D93", "#F2E6C9", "#7A5BB0"];

function distance(a: string, b: string): number {
  const x = parseColor(a);
  const y = parseColor(b);
  return Math.hypot(x.r - y.r, x.g - y.g, x.b - y.b);
}

const cache = new Map<string, Look>();

export function resolveLook(loadout: AvatarLoadout): Look {
  const key = `${loadout.skin}|${loadout.hairColor}|${loadout.coatColor}`;
  const hit = cache.get(key);
  if (hit) return { ...hit, loadout };
  const tone = getSkinTone(loadout.skin);
  const hair = loadout.hairColor;
  const coat = loadout.coatColor;
  // Dark hair gets a brighter shine so the highlight still reads.
  const hairLum = luminance(hair);
  const look: Look = {
    loadout,
    skin: tone.base,
    skinShade: tone.shade,
    skinLine: outlineFor(tone.base),
    blush: mix(tone.base, "#FF6F86", luminance(tone.base) > 0.45 ? 0.42 : 0.5),
    hair,
    hairShade: shade(hair, hairLum > 0.75 ? -0.16 : -0.22),
    hairShine: shade(hair, hairLum < 0.2 ? 0.22 : 0.3),
    hairLine: outlineFor(hair),
    coat,
    coatShade: shade(coat, luminance(coat) > 0.8 ? -0.12 : -0.2),
    coatLine: outlineFor(coat),
    scarf: SCARF_COLORS.reduce((best, c) => (distance(c, coat) > distance(best, coat) ? c : best), SCARF_COLORS[0]),
    eye: "#2E2440",
  };
  if (cache.size > 64) cache.clear();
  cache.set(key, look);
  return look;
}

/** Relative luminance 0..1, for picking contrasting details. */
export function luminance(color: string): number {
  const { r, g, b } = parseColor(color);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
