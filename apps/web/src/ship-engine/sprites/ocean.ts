// Sky, clouds and waves from an environment's sprites. The wave bands ride
// the same heights and speeds as the procedural wave layers, so the ship's
// bobbing still matches the water.

import { SPRITE_FOLDERS } from "@ship/shared-types";
import type { EnvironmentId } from "@ship/shared-types";
import type { Ctx } from "../types.js";
import { drawBand, drawCover } from "./paint.js";
import { sprites } from "./store.js";

const env = (id: EnvironmentId, layer: string) => sprites.sprite(SPRITE_FOLDERS.environment(id), layer);

export function drawSkySprite(ctx: Ctx, id: EnvironmentId, width: number, height: number): boolean {
  const s = env(id, "sky");
  if (!s) return false;
  drawCover(ctx, s, 0, 0, width, height);
  return true;
}

/** The cloud bank fills the sky above the sea and drifts left. `drift` is in pixels. */
export function drawCloudSprite(ctx: Ctx, id: EnvironmentId, width: number, seaY: number, drift: number): boolean {
  const s = env(id, "clouds");
  if (!s) return false;
  const scale = (seaY * 0.9) / (s.height / (s.density ?? 1));
  drawBand(ctx, s, { y: 0, scale, scroll: drift, width });
  return true;
}

/** Where one wave band sits this frame: its crest line's screen y and how far it has scrolled. */
export interface WaveBand {
  y: number;
  scroll: number;
}

const WAVES = ["waves-back", "waves-mid", "waves-front"] as const;

/**
 * Draws wave bands `from`..`to` (0 back, 1 middle, 2 front), each down to the
 * bottom of the screen. Only when all three exist, so a sea is never half art.
 */
export function drawWaveSprites(ctx: Ctx, id: EnvironmentId, bands: WaveBand[], from: number, to: number, unit: number, width: number, height: number): boolean {
  const all = WAVES.map((w) => env(id, w));
  if (all.some((s) => !s)) return false;
  for (let i = from; i <= to; i++) drawBand(ctx, all[i]!, { y: bands[i].y, scale: unit, scroll: bands[i].scroll, width, fillTo: height });
  return true;
}
