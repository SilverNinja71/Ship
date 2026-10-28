// The ship artwork: one HullDrawer per HullStyle family, plus sails,
// figureheads and flags from the loadout, and the Captain's Quarters decor.

import type { HullStyle, ShipDefinition, ShipLoadout } from "@ship/shared-types";
import { shipCanFitFigurehead, shipCanFitSails } from "@ship/ship-theme-kit";
import type { Ctx, FrameInfo, Point } from "../ship-engine/types.js";
import { caravel } from "./caravel.js";
import { drawCabinDecor as drawDecor } from "./decor.js";
import { drawFigurehead } from "./parts/figureheads.js";
import { drawFlag } from "./parts/flags.js";
import { drawSails } from "./parts/sails.js";
import type { HullDrawer, HullLayout } from "./types.js";

export * from "./types.js";

const HULLS: Record<HullStyle, HullDrawer> = {
  caravel,
  brig: caravel,
  galleon: caravel,
  "kitchen-barge": caravel,
  submarine: caravel,
  battleship: caravel,
  dreadnought: caravel,
  ironclad: caravel,
  trireme: caravel,
  "sky-galleon": caravel,
  "solar-ark": caravel,
  "carrier-barge": caravel,
};

export function hullDrawer(ship: ShipDefinition): HullDrawer {
  return HULLS[ship.hull] ?? caravel;
}

export function shipLayout(ship: ShipDefinition): HullLayout {
  return hullDrawer(ship).layout(ship);
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
  const layout = hull.layout(ship);
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
  drawDecor(ctx, shipId, at, frame);
}
