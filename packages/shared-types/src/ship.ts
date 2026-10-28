// What a ship and a sailor are made of. The registry of actual ships and
// parts lives in @ship/ship-theme-kit; these are only the shapes.

export type ShipCategory = "buccaneer" | "navy" | "mythic";

export type HullStyle =
  | "caravel"
  | "brig"
  | "galleon"
  | "kitchen-barge"
  | "submarine"
  | "battleship"
  | "dreadnought"
  | "ironclad"
  | "trireme"
  | "sky-galleon"
  | "solar-ark"
  | "carrier-barge";

export type SailStyle =
  | "square"
  | "lateen"
  | "tattered"
  | "feathered"
  | "solar"
  | "papel-picado"
  | "canvas-patched"
  | "none";

export type FigureheadId =
  | "none"
  | "ram"
  | "lion"
  | "pegasus"
  | "dragon"
  | "kraken"
  | "eagle"
  | "mermaid"
  | "sunburst"
  | "jaguar"
  | "gorgon"
  | "bear"
  | "swordfish";

export type FlagId =
  | "jolly-roger"
  | "straw-skull"
  | "crossed-quills"
  | "anchor"
  | "admiralty"
  | "constellation"
  | "sun"
  | "marigold"
  | "trident"
  | "laurel"
  | "pine"
  | "kaiju-claw";

export type DeskId =
  | "captains-desk"
  | "map-table"
  | "war-room"
  | "galley-counter"
  | "star-chart"
  | "coral-vanity"
  | "stump-bench"
  | "marble-plinth";

export type EnvironmentId =
  | "tropical-sea"
  | "navy-grey-sea"
  | "twilight-clouds"
  | "deep-reef"
  | "solar-sky"
  | "marigold-night"
  | "neon-mist"
  | "aegean-shallows"
  | "cedar-fjord";

export type ParticleKind =
  | "sea-spray"
  | "bubbles"
  | "stardust"
  | "cannon-smoke"
  | "solar-sparks"
  | "mikan-petals"
  | "marigold-petals"
  | "neon-motes"
  | "embers"
  | "pine-needles"
  | "olive-leaves"
  | "snow";

export type DeckFinish = "lawn" | "planks" | "steel" | "marble" | "coral" | "cedar" | "brass";

export type ShipExtra =
  | "cannons"
  | "lanterns"
  | "portholes"
  | "periscope"
  | "smokestacks"
  | "turrets"
  | "oars"
  | "wings"
  | "kitchen-chimney"
  | "fish-fins"
  | "leviathan"
  | "citrus-trees"
  | "astrolabe"
  | "stained-glass"
  | "woodstove"
  | "ivy"
  | "telescope"
  | "rivets"
  | "flight-deck"
  | "swing";

export interface ShipPalette {
  hull: string;
  hullDark: string;
  trim: string;
  deck: string;
  sail: string;
  sailShade: string;
  accent: string;
  /** Optional glow for lanterns, bioluminescence, sun sails. */
  glow?: string;
}

export interface ShipDefinition {
  id: string;
  name: string;
  category: ShipCategory;
  tagline: string;
  /** Doubloons to buy. 0 means it is a starter ship. */
  price: number;
  levelRequired: number;
  hull: HullStyle;
  mastCount: 0 | 1 | 2 | 3;
  defaultSails: SailStyle;
  defaultFigurehead: FigureheadId;
  defaultFlag: FlagId;
  defaultDesk: DeskId;
  deck: DeckFinish;
  environment: EnvironmentId;
  particles: ParticleKind[];
  palette: ShipPalette;
  extras: ShipExtra[];
}

export type PartKind = "sails" | "figurehead" | "flag" | "desk";
export type AvatarItemKind = "hair" | "hat" | "coat" | "accessory" | "tool";

/**
 * What the player owns. Free and starter items belong to everyone and are
 * never listed. Crew-quest figureheads land in `parts` like bought ones.
 */
export interface Inventory {
  ships: string[];
  /** `${PartKind}:${id}`, e.g. "sails:feathered". */
  parts: string[];
  /** `${AvatarItemKind}:${id}`, e.g. "hat:tricorn". */
  avatarItems: string[];
}

/** The player's chosen ship and the parts they swapped onto it. */
export interface ShipLoadout {
  shipId: string;
  sails: SailStyle;
  figurehead: FigureheadId;
  flag: FlagId;
  desk: DeskId;
}

export type SkinTone = "porcelain" | "peach" | "sand" | "honey" | "bronze" | "umber" | "ebony";
export type HairStyle = "messy" | "bob" | "long" | "ponytail" | "buzz" | "braids" | "curls" | "spiky" | "bun";
export type HatId =
  | "none"
  | "straw-hat"
  | "tricorn"
  | "captain-cap"
  | "bandana"
  | "marine-cap"
  | "aviator-cap"
  | "beanie"
  | "laurel-wreath"
  | "flower-crown";
export type CoatId = "pirate-coat" | "marine-uniform" | "striped-shirt" | "hoodie" | "flight-jacket" | "toga" | "flannel" | "vest";
export type AccessoryId = "none" | "aviator-goggles" | "eyepatch" | "scarf" | "earring" | "glasses" | "parrot";
export type StudyToolId = "quill-logbook" | "laptop" | "mech-keyboard" | "tablet";

export interface AvatarLoadout {
  name: string;
  skin: SkinTone;
  hair: HairStyle;
  hairColor: string;
  hat: HatId;
  coat: CoatId;
  coatColor: string;
  accessory: AccessoryId;
  tool: StudyToolId;
}

/** Animation states the avatar renderer must support. */
export type AvatarState = "SAILING_FOCUS" | "SHORE_LEAVE_BREAK" | "DRIFTING_IDLE";
