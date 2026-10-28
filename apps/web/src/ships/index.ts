// The ship artwork: one HullDrawer per HullStyle family, plus sails,
// figureheads and flags from the loadout, and the Captain's Quarters decor.
// A ship whose hull sprites have arrived is drawn from them instead (see
// ship-engine/sprites/), with its manifest's layout laid over the built-in one.

import { SHIP_Z } from "@ship/shared-types";
import type { HullStyle, ShipDefinition, ShipLoadout } from "@ship/shared-types";
import { shipCanFitFigurehead, shipCanFitSails } from "@ship/ship-theme-kit";
import { drawCabinDecorSprite, drawShipSprites, shipSheet, withSpriteLayout } from "../ship-engine/sprites/ship.js";
import { sprites } from "../ship-engine/sprites/store.js";
import type { Ctx, FrameInfo, Point } from "../ship-engine/types.js";
import { battleship } from "./battleship.js";
import { brig } from "./brig.js";
import { caravel } from "./caravel.js";
import { carrierBarge } from "./carrierBarge.js";
import { dreadnought } from "./dreadnought.js";
import { galleon } from "./galleon.js";
import { ironclad } from "./ironclad.js";
import { kitchenBarge } from "./kitchenBarge.js";
import { skyGalleon } from "./skyGalleon.js";
import { solarArk } from "./solarArk.js";
import { submarine } from "./submarine.js";
import { trireme } from "./trireme.js";
import { drawCabinDecor as drawDecor } from "./decor.js";
import { drawFigurehead } from "./parts/figureheads.js";
import { drawFlag } from "./parts/flags.js";
import { drawSails } from "./parts/sails.js";
import type { HullDrawer, HullLayout } from "./types.js";

export * from "./types.js";

const HULLS: Record<HullStyle, HullDrawer> = {
  caravel,
  brig,
  galleon,
  "kitchen-barge": kitchenBarge,
  submarine,
  battleship,
  dreadnought,
  ironclad,
  trireme,
  "sky-galleon": skyGalleon,
  "solar-ark": solarArk,
  "carrier-barge": carrierBarge,
};

export function hullDrawer(ship: ShipDefinition): HullDrawer {
  return HULLS[ship.hull] ?? caravel;
}

const layouts = new WeakMap<ShipDefinition, { version: number; layout: HullLayout }>();

/** Where everything sits on this ship. Cached; it changes only when the ship's sprites arrive. Don't mutate it. */
export function shipLayout(ship: ShipDefinition): HullLayout {
  const hit = layouts.get(ship);
  if (hit?.version === sprites.version) return hit.layout;
  const layout = withSpriteLayout(ship, hullDrawer(ship).layout(ship));
  layouts.set(ship, { version: sprites.version, layout });
  return layout;
}

/**
 * Draws a whole ship at the origin of the current transform, in ship units.
 * Order: back → sails → deck → onDeck(layout) → front → figurehead → flag.
 * `onDeck` is where the engine draws props and sailors. Returns the layout.
 * Parts come from the loadout; sails and figureheads are skipped on ships
 * that can't carry them, whatever the loadout says.
 */
export function drawShip(ctx: Ctx, ship: ShipDefinition, loadout: ShipLoadout, frame: FrameInfo, onDeck?: (layout: HullLayout) => void): HullLayout {
  const hull = hullDrawer(ship);
  const layout = shipLayout(ship);
  const sheet = shipSheet(ship);
  if (sheet) {
    // The rigging art has its own yards, so bare masts need nothing drawn over them.
    const sails = shipCanFitSails(ship) && loadout.sails !== "none";
    drawShipSprites(ctx, sheet, [
      { zIndex: SHIP_Z.sails, draw: () => sails && layout.masts.forEach((_, i) => drawSails(ctx, loadout.sails, ship, layout, i, frame)) },
      { zIndex: SHIP_Z.onDeck, draw: () => onDeck?.(layout) },
      { zIndex: SHIP_Z.figurehead, draw: () => loadout.figurehead !== "none" && shipCanFitFigurehead(ship) && drawFigurehead(ctx, loadout.figurehead, layout.bow, frame, ship) },
      { zIndex: SHIP_Z.flag, draw: () => drawFlag(ctx, loadout.flag, layout.flag, frame, ship) },
    ]);
    return layout;
  }
  ctx.save();
  try {
    hull.drawBack(ctx, ship, layout, frame);
    if (shipCanFitSails(ship)) layout.masts.forEach((_, i) => drawSails(ctx, loadout.sails, ship, layout, i, frame));
    hull.drawDeck(ctx, ship, layout, frame);
  } finally {
    ctx.restore();
  }
  onDeck?.(layout);
  ctx.save();
  try {
    hull.drawFront(ctx, ship, layout, frame);
    if (loadout.figurehead !== "none" && shipCanFitFigurehead(ship)) drawFigurehead(ctx, loadout.figurehead, layout.bow, frame, ship);
    drawFlag(ctx, loadout.flag, layout.flag, frame, ship);
  } finally {
    ctx.restore();
  }
  return layout;
}

/** The ship's themed Captain's Quarters item (CABIN_DECOR), about 160 units tall, standing on `at`. */
export function drawCabinDecor(ctx: Ctx, shipId: string, at: Point, frame: FrameInfo): void {
  if (!drawCabinDecorSprite(ctx, shipId, at)) drawDecor(ctx, shipId, at, frame);
}
