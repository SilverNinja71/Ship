// Parts the Shipwright sells: sails, figureheads, flags and desks.
// Prices assume ~75 doubloons per 25-minute voyage (see shared-types/voyage.ts),
// so a 200-doubloon part is about three voyages.

import { QUEST_BEASTS } from "@ship/shared-types";
import type { DeskId, FigureheadId, FlagId, HullStyle, PartKind, QuestBeastId, SailStyle } from "@ship/shared-types";

export type ItemSource =
  /** Everyone owns it from the start. */
  | "starter"
  | "shop"
  /** Can't be bought; a crew earns it by defeating a quest beast. */
  | "quest";

export interface CatalogItem<Id extends string = string> {
  id: Id;
  name: string;
  description: string;
  /** Doubloons. Always 0 for starter and quest items. */
  price: number;
  levelRequired: number;
  source: ItemSource;
}

export interface FigureheadItem extends CatalogItem<FigureheadId> {
  /** Set for quest figureheads: the beast that drops it. */
  questBeast?: QuestBeastId;
}

const starter = { price: 0, levelRequired: 1, source: "starter" } as const;
const shop = (price: number, levelRequired: number) => ({ price, levelRequired, source: "shop" }) as const;

export const SAILS: readonly CatalogItem<SailStyle>[] = [
  { id: "none", name: "Bare Masts", description: "No canvas at all. Engine ships always sail this way.", ...starter },
  { id: "square", name: "Square Sails", description: "Classic square-rigged canvas.", ...starter },
  { id: "canvas-patched", name: "Patched Canvas", description: "Mended a hundred times and proud of it.", ...shop(150, 1) },
  { id: "lateen", name: "Lateen Sails", description: "Triangular sails that cut close to the wind.", ...shop(200, 2) },
  { id: "tattered", name: "Tattered Sails", description: "Storm-torn and a little spooky.", ...shop(300, 3) },
  { id: "papel-picado", name: "Papel Picado Sails", description: "Cut-paper banners in every color.", ...shop(800, 9) },
  { id: "feathered", name: "Feathered Sails", description: "Soft white plumes that catch starlight.", ...shop(900, 10) },
  { id: "solar", name: "Solar Sails", description: "Fiery sheets that glow like a sunrise.", ...shop(1200, 13) },
];

const questFigurehead = (id: FigureheadId) => {
  const beast = QUEST_BEASTS.find((b) => b.reward === id)!;
  return { price: 0, levelRequired: 1, source: "quest" as const, questBeast: beast.id };
};

export const FIGUREHEADS: readonly FigureheadItem[] = [
  { id: "none", name: "No Figurehead", description: "A clean bow.", ...starter },
  { id: "ram", name: "Woolly Ram", description: "Curly horns and a stubborn grin.", ...starter },
  { id: "lion", name: "Golden Lion", description: "A sunburst mane on the bow.", ...shop(400, 3) },
  { id: "eagle", name: "Sea Eagle", description: "Wings swept back, eyes on the horizon.", ...shop(450, 4) },
  { id: "bear", name: "Timber Bear", description: "Carved from a single cedar log.", ...shop(500, 5) },
  { id: "gorgon", name: "Stone Gorgon", description: "Snakes for hair. Don't meet her gaze.", ...shop(700, 7) },
  { id: "jaguar", name: "Spirit Jaguar", description: "A neon-spotted folk-art jaguar.", ...shop(750, 8) },
  { id: "sunburst", name: "Sunburst", description: "A blazing brass sun.", ...shop(900, 10) },
  { id: "pegasus", name: "Pegasus", description: "A winged horse mid-gallop.", ...shop(1000, 11) },
  { id: "kraken", name: "Kraken", description: "Proof your crew beat the Procrastination Kraken.", ...questFigurehead("kraken") },
  { id: "dragon", name: "Sea Dragon", description: "Won from the Doomscroll Leviathan.", ...questFigurehead("dragon") },
  { id: "mermaid", name: "Mermaid", description: "Won from the Notification Siren.", ...questFigurehead("mermaid") },
  { id: "swordfish", name: "Swordfish", description: "Won from the Snooze Serpent.", ...questFigurehead("swordfish") },
];

export const FLAGS: readonly CatalogItem<FlagId>[] = [
  { id: "straw-skull", name: "Sun-Hat Skull", description: "A grinning skull in a wide sun hat over crossed quills.", ...starter },
  { id: "jolly-roger", name: "Jolly Roger", description: "The classic skull and crossbones.", ...shop(100, 1) },
  { id: "crossed-quills", name: "Crossed Quills", description: "For crews who study hard.", ...shop(100, 1) },
  { id: "anchor", name: "Anchor", description: "Steady and dependable.", ...shop(150, 2) },
  { id: "admiralty", name: "Admiralty Ensign", description: "Navy blue with a white cross.", ...shop(300, 4) },
  { id: "laurel", name: "Laurel Wreath", description: "Victory in green and gold.", ...shop(350, 6) },
  { id: "pine", name: "Pine Tree", description: "A lone pine on a snowy field.", ...shop(350, 6) },
  { id: "trident", name: "Trident", description: "Rule the waves.", ...shop(400, 8) },
  { id: "marigold", name: "Marigold", description: "A bright orange marigold on deep purple.", ...shop(450, 9) },
  { id: "constellation", name: "Constellation", description: "A winged horse traced in stars.", ...shop(500, 10) },
  { id: "sun", name: "Sun Disc", description: "Twelve rays of fire.", ...shop(600, 12) },
  { id: "kaiju-claw", name: "Kaiju Claw", description: "Three neon scratch marks.", ...shop(600, 12) },
];

export const DESKS: readonly CatalogItem<DeskId>[] = [
  { id: "captains-desk", name: "Captain's Desk", description: "Oak, brass handles and an ink stain or two.", ...starter },
  { id: "map-table", name: "Map Table", description: "Spread out the charts and plot your course.", ...shop(250, 2) },
  { id: "galley-counter", name: "Galley Counter", description: "Study between the soup pots.", ...shop(300, 3) },
  { id: "stump-bench", name: "Stump Bench", description: "A redwood stump, sanded smooth.", ...shop(350, 5) },
  { id: "war-room", name: "War-Room Table", description: "Pins, strings and a campaign plan.", ...shop(450, 6) },
  { id: "marble-plinth", name: "Marble Plinth", description: "Cool stone for cool thinking.", ...shop(500, 7) },
  { id: "coral-vanity", name: "Coral Vanity", description: "A glowing coral desk with a shell mirror.", ...shop(550, 8) },
  { id: "star-chart", name: "Star-Chart Desk", description: "A brass astrolabe and a sky of charts.", ...shop(700, 10) },
];

export const PART_CATALOGS = {
  sails: SAILS,
  figurehead: FIGUREHEADS,
  flag: FLAGS,
  desk: DESKS,
} as const satisfies Record<PartKind, readonly CatalogItem[]>;

/** Hulls with a bow to mount a figurehead on. Steel ships and the submarine have none. */
export const FIGUREHEAD_HULLS: ReadonlySet<HullStyle> = new Set<HullStyle>([
  "caravel",
  "brig",
  "galleon",
  "kitchen-barge",
  "trireme",
  "sky-galleon",
  "solar-ark",
  "carrier-barge",
]);

export function getPart(kind: PartKind, id: string): CatalogItem | undefined {
  return (PART_CATALOGS[kind] as readonly CatalogItem[]).find((p) => p.id === id);
}

/** The key a part is stored under in `Inventory.parts`. */
export function partKey(kind: PartKind, id: string): string {
  return `${kind}:${id}`;
}
