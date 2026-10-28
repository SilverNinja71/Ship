// Ships from sprites. A ship's hull layers and rigging come from its own
// folder; sails, figureheads and flags come from the shared part sheets.
// Each part switches to its sprite as soon as that sprite exists, and keeps
// the procedural art until then.

import { SHIP_DEFAULT_PLACEMENTS, SHIP_SPRITE, SPRITE_FOLDERS, sailSpriteId } from "@ship/shared-types";
import type { FigureheadId, FlagId, SailStyle, ShipDefinition, SpritePlacement } from "@ship/shared-types";
import type { HullLayout, MastSpot } from "../../ships/types.js";
import type { Ctx, FrameInfo, Point } from "../types.js";
import { drawSprite, drawWaving } from "./paint.js";
import { sprites } from "./store.js";
import type { SpriteSheet } from "./store.js";

const HULL_PARTS = [SHIP_SPRITE.hullBack, SHIP_SPRITE.rigging, SHIP_SPRITE.hullFront];

/** The ship's own sheet, once its hull layers and rigging have all arrived. */
export function shipSheet(ship: ShipDefinition): SpriteSheet | undefined {
  const sheet = sprites.sheet(SPRITE_FOLDERS.ship(ship.id));
  return sheet && HULL_PARTS.every((id) => sheet.sprites.has(id)) ? sheet : undefined;
}

/** The built-in layout, with the spots the hull art moved (masts, desk, helm...) laid over it. */
export function withSpriteLayout(ship: ShipDefinition, base: HullLayout): HullLayout {
  const over = shipSheet(ship)?.manifest.layout;
  return over ? { ...base, ...over } : base;
}

/** Something the engine draws between the ship's own sprites (sails, sailors, figurehead, flag). */
export interface ShipLayer {
  zIndex: number;
  draw: () => void;
}

/**
 * Draws a sprite ship: its placements and the engine's layers, lowest zIndex
 * first. On a tie the manifest's sprites go first.
 */
export function drawShipSprites(ctx: Ctx, sheet: SpriteSheet, layers: ShipLayer[]): void {
  const placements: readonly SpritePlacement[] = sheet.manifest.placements ?? SHIP_DEFAULT_PLACEMENTS;
  const items = [
    ...placements.map((p) => ({ zIndex: p.zIndex, draw: () => drawPlacement(ctx, sheet, p) })),
    ...layers,
  ];
  // Array.prototype.sort is stable, so ties keep this order.
  items.sort((a, b) => a.zIndex - b.zIndex);
  for (const item of items) {
    ctx.save();
    try {
      item.draw();
    } finally {
      ctx.restore();
    }
  }
}

function drawPlacement(ctx: Ctx, sheet: SpriteSheet, p: SpritePlacement): void {
  const s = sheet.sprites.get(p.sprite);
  if (s) drawSprite(ctx, s, p.x, p.y, { scale: p.scale, rotation: p.rotation });
}

// ---------------------------------------------------------------------------
// Parts

/** Below this wind the sails are furled (docked); above it they billow (under way). */
export const FURL_BELOW = 0.45;

/** The canvas a mast's sails must fit in (see rigFor in ships/kit.ts). */
export interface SailBox {
  sailTop: number;
  sailFoot: number;
  halfWidth: number;
}

/** One mast's sails, fitted to its canvas. False when the style has no sprites yet. */
export function drawSailSprite(ctx: Ctx, style: SailStyle, mast: MastSpot, box: SailBox, frame: FrameInfo): boolean {
  const sheet = sprites.sheet(SPRITE_FOLDERS.sails);
  const billow = sheet?.sprites.get(sailSpriteId(style, "billowing"));
  const furled = sheet?.sprites.get(sailSpriteId(style, "furled"));
  if (!billow || !furled) return false;
  // The billowing set fills the canvas; the furled set shares its scale so the two line up.
  const scale = sailScale(billow, box);
  const under = frame.wind >= FURL_BELOW;
  const breathe = under ? 1 + 0.03 * frame.wind * Math.sin(frame.t * (frame.reducedMotion ? 0.15 : 1.6) + mast.x * 0.01) : 1;
  ctx.save();
  ctx.translate(mast.x, box.sailTop);
  ctx.scale(breathe, 1);
  drawSprite(ctx, under ? billow : furled, 0, 0, { scale });
  ctx.restore();
  return true;
}

/** The scale that fits a sail set (measured in scene units, so density is already out) into a mast's canvas. */
export function sailScale(s: { width: number; height: number; anchorY: number; density?: number }, box: SailBox): number {
  const d = s.density ?? 1;
  const below = (s.height - s.anchorY) / d;
  return Math.min((box.sailFoot - box.sailTop) / Math.max(1, below), (box.halfWidth * 2) / (s.width / d));
}

export function drawFigureheadSprite(ctx: Ctx, id: FigureheadId, bow: Point & { angle: number }, scale = 1): boolean {
  const s = id === "none" ? undefined : sprites.sprite(SPRITE_FOLDERS.figureheads, id);
  if (!s) return false;
  drawSprite(ctx, s, bow.x, bow.y, { rotation: bow.angle, scale });
  return true;
}

/** How far the cloth at u (0 at the pole .. 1 at the free end) is shifted down. Shared with the procedural flags. */
export function flagWave(frame: FrameInfo): (u: number) => number {
  const w = frame.wind;
  const speed = (3 + 4 * w) * (frame.reducedMotion ? 0.08 : 1);
  const amp = 3 + 7 * w;
  return (u) => amp * u * Math.sin(u * 2.4 * Math.PI - frame.t * speed) + (1 - w) * 12 * u * u;
}

/** A flag hoisted at `pole`, streaming left. */
export function drawFlagSprite(ctx: Ctx, id: FlagId, pole: Point, frame: FrameInfo): boolean {
  const s = sprites.sprite(SPRITE_FOLDERS.flags, id);
  if (!s) return false;
  drawWaving(ctx, s, pole.x, pole.y + 4, flagWave(frame));
  return true;
}

/** The ship's Captain's Quarters keepsake, standing on `at`. */
export function drawCabinDecorSprite(ctx: Ctx, shipId: string, at: Point): boolean {
  const s = sprites.sprite(SPRITE_FOLDERS.ship(shipId), SHIP_SPRITE.cabinDecor);
  if (!s) return false;
  drawSprite(ctx, s, at.x, at.y);
  return true;
}
