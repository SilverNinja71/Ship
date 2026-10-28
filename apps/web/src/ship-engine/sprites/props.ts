// Deck props and desks from sprites: the helm, the bell, the citrus tree,
// desks and the galley table. Each returns false when its art hasn't arrived.

import { PROP_SPRITE, SPRITE_FOLDERS, citrusSpriteId, deskSpriteId } from "@ship/shared-types";
import type { CitrusLook, DeskId } from "@ship/shared-types";
import type { Ctx, Point } from "../types.js";
import { drawSprite } from "./paint.js";
import { sprites } from "./store.js";

const prop = (id: string) => sprites.sprite(SPRITE_FOLDERS.props, id);

/** The wheel's hub sits this far above the deck. */
export const HELM_HUB = 74;

export function drawHelmSprite(ctx: Ctx, at: Point, angle: number): boolean {
  const stand = prop(PROP_SPRITE.helmStand);
  const wheel = prop(PROP_SPRITE.helmWheel);
  if (!stand || !wheel) return false;
  drawSprite(ctx, stand, at.x, at.y);
  drawSprite(ctx, wheel, at.x, at.y - HELM_HUB, { rotation: angle });
  return true;
}

/** The bell hangs from `at` and swings by `swing` radians. */
export function drawBellSprite(ctx: Ctx, at: Point, swing: number): boolean {
  const bell = prop(PROP_SPRITE.bell);
  if (!bell) return false;
  drawSprite(ctx, bell, at.x, at.y, { rotation: swing });
  return true;
}

export interface CitrusDraw {
  look: CitrusLook;
  /** Radians the tree leans (wind and harvest shake), around the pot's base. */
  lean: number;
  /** Fruit and blossom spots, relative to the trunk's base (50 units above the pot's base). */
  fruit: Point[];
  blossoms: Point[];
  /** How far wilted fruit sags. */
  droop: number;
}

/** The potted tree with its fruit and blossoms hung at the engine's spots, so the fruit count shows. */
export function drawCitrusSprite(ctx: Ctx, at: Point, o: CitrusDraw): boolean {
  const tree = prop(citrusSpriteId(o.look));
  const fruit = prop(PROP_SPRITE.citrusFruit);
  const blossom = prop(PROP_SPRITE.citrusBlossom);
  if (!tree || !fruit || !blossom) return false;
  ctx.save();
  ctx.translate(at.x, at.y);
  // The pot rocks less than the canopy would, so lean the whole sprite gently.
  ctx.rotate(o.lean * 0.5);
  drawSprite(ctx, tree, 0, 0);
  for (const p of o.blossoms) drawSprite(ctx, blossom, p.x, p.y - 50);
  for (const p of o.fruit) drawSprite(ctx, fruit, p.x, p.y - 50 + o.droop);
  ctx.restore();
  return true;
}

/** A desk in the station frame (floor under its middle at the origin). */
export function drawDeskSprite(ctx: Ctx, desk: DeskId): boolean {
  const s = prop(deskSpriteId(desk));
  if (!s) return false;
  drawSprite(ctx, s, 0, 0);
  return true;
}

/** The galley table in the seat frame (floor under its middle at the origin). */
export function drawGalleyTableSprite(ctx: Ctx): boolean {
  const s = prop(PROP_SPRITE.galleyTable);
  if (!s) return false;
  drawSprite(ctx, s, 0, 0);
  return true;
}
