// The contract between the scene engine and the ship artwork.
//
// Ship local units: x runs from -500 (stern, left) to +500 (bow, right) and the
// ship sails to the right. The main deck surface is y = 0 and y grows downward:
// the keel sits near +140 and the tallest mast tops near -560. The camera looks
// from slightly above, so a deck is drawn as a thin band from y = -DECK_DEPTH
// (its far edge) to its surface y (its near edge) that props and sailors stand on.

import type { ShipDefinition } from "@ship/shared-types";
import type { Ctx, FrameInfo, Point } from "../ship-engine/types.js";

export const SHIP_LENGTH = 1000;
export const DECK_DEPTH = 24;

export interface MastSpot {
  x: number;
  /** y where the mast meets its deck. */
  base: number;
  /** y of the mast top (about -560 for the tallest). */
  top: number;
}

export interface HullLayout {
  /** x range of the main deck band. */
  deck: { from: number; to: number };
  /** y where the calm sea meets the hull. The ocean is drawn so its surface sits here. */
  waterline: number;
  keel: number;
  /** One per `ship.mastCount`, stern to bow. Engine ships keep a signal mast here too. */
  masts: MastSpot[];
  /** Figurehead anchor on the bow, and the way it faces (radians, 0 = right). */
  bow: Point & { angle: number };
  /** Top of the pole the flag hangs from: the main mast, or a stern staff on mastless ships. */
  flag: Point;
  /** Where interactive props stand. y is the surface they stand on (0, or a raised deck). */
  helm: Point;
  citrusTree: Point;
  /** Where the ship's bell hangs from (its top point). */
  bell: Point;
  /** The player's study station: the floor point under the middle of the desk. */
  desk: Point;
  /** Up to 4 galley tables for crew, two seats each. x is the table's center. */
  tables: Point[];
  /** Tops of chimneys, smokestacks and stovepipes, where smoke and embers rise from. */
  smoke: Point[];
  /** Extra citrus trees (the Merfolk Coral Caravel's deck orchard). Empty for most ships. */
  orchard: Point[];
  /**
   * Optional: every walkable deck surface, stern to bow, including raised decks
   * (stern castles, bridges, roofs). Each station's y is one of these surfaces.
   */
  surfaces?: DeckSurface[];
  /**
   * Optional: a box around everything drawShip draws (bowsprit, flag, wings,
   * a leviathan...), for fitting the ship to the viewport. Waves not included.
   */
  bounds?: { left: number; top: number; right: number; bottom: number };
}

export interface DeckSurface {
  /** x range of the surface. */
  from: number;
  to: number;
  /** Its surface y (the near edge of its deck band). */
  y: number;
}

/** One per HullStyle family, in its own file under src/ships/. */
export interface HullDrawer {
  layout(ship: ShipDefinition): HullLayout;
  /** Everything behind the deck band: far bulwark, raised-deck walls, superstructure, mast poles. */
  drawBack(ctx: Ctx, ship: ShipDefinition, layout: HullLayout, frame: FrameInfo): void;
  /** The deck band itself, in the ship's deck finish (lawn, planks, steel...). */
  drawDeck(ctx: Ctx, ship: ShipDefinition, layout: HullLayout, frame: FrameInfo): void;
  /** Everything in front of what stands on deck: hull side, near rail, gun ports, portholes, oars... */
  drawFront(ctx: Ctx, ship: ShipDefinition, layout: HullLayout, frame: FrameInfo): void;
}
