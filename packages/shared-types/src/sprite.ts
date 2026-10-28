// Sprites: the graphics AI's images, and where the engine puts them.
//
// Art lives in apps/web/public/assets/, one folder per sheet, each with a
// manifest.json next to its images. Image coordinates are pixels from the
// image's top-left corner. Scene coordinates are ship units (deck at y = 0,
// y grows downward), station units for sailors (the floor under the desk at
// y = 0), or room units in the Captain's Quarters. At density 1 one image
// pixel is one scene unit.

import type { AvatarState, DeskId, EnvironmentId, FigureheadId, FlagId, SailStyle } from "./ship.js";

/** One image, as listed in its folder's manifest. */
export interface SpriteRef {
  /** Unique within its manifest, e.g. "hull-front" or "hat:tricorn". */
  id: string;
  /** Path relative to the manifest's folder, e.g. "hull-front.png". */
  file: string;
  /** Image size in pixels. */
  width: number;
  height: number;
  /** The image pixel pinned to the placement point (e.g. a hull's deck line at its middle). */
  anchorX: number;
  anchorY: number;
  /** Image pixels per scene unit. Default 1; 2 for art delivered at double size (sharper when zoomed). */
  density?: number;
  /**
   * Drawn in greys so the engine can color it (skin, hair and coat colors).
   * Mid-grey (#808080) becomes the chosen color; lighter and darker greys
   * become its highlights and shadows, and black outlines stay black.
   */
  tintable?: boolean;
}

/** Where a sprite goes in the scene. */
export interface SpritePlacement {
  /** A SpriteRef id from the same manifest. */
  sprite: string;
  /** Scene units (ship units on deck). */
  x: number;
  y: number;
  /** Higher draws later (on top). See SHIP_Z. */
  zIndex: number;
  /** Extra scale on top of the sprite's density. Default 1. */
  scale?: number;
  /** Radians, around the anchor. Default 0. */
  rotation?: number;
}

export type SpriteSheetKind = "ship" | "sails" | "figureheads" | "flags" | "props" | "avatar" | "environment";

/** `manifest.json` in each asset folder. */
export interface SpriteManifest {
  version: 1;
  kind: SpriteSheetKind;
  sprites: SpriteRef[];
  /**
   * Ship sheets only: where each piece sits. Without it the hull layers and
   * rigging go at the origin (see SHIP_DEFAULT_PLACEMENTS).
   */
  placements?: SpritePlacement[];
  /**
   * Ship sheets only: where things sit on this hull art, overriding the
   * built-in layout (masts, helm, desk, tables...). Every field is optional.
   */
  layout?: Partial<SpriteShipLayout>;
}

/** `index.json` at the root of the assets folder: every folder that has a manifest. */
export interface SpriteIndex {
  version: 1;
  /** Folder paths relative to the assets root, e.g. "ships/woolly-wanderer". */
  sheets: string[];
}

export interface SpritePoint {
  x: number;
  y: number;
}

/** The parts of a ship layout a hull sprite can move (mirrors HullLayout in apps/web/src/ships/types.ts). */
export interface SpriteShipLayout {
  waterline: number;
  keel: number;
  deck: { from: number; to: number };
  masts: { x: number; base: number; top: number }[];
  bow: SpritePoint & { angle: number };
  flag: SpritePoint;
  helm: SpritePoint;
  citrusTree: SpritePoint;
  bell: SpritePoint;
  desk: SpritePoint;
  tables: SpritePoint[];
  smoke: SpritePoint[];
  orchard: SpritePoint[];
  surfaces: { from: number; to: number; y: number }[];
  bounds: { left: number; top: number; right: number; bottom: number };
}

// ---------------------------------------------------------------------------
// Folders

export const SPRITE_INDEX_FILE = "index.json";
export const SPRITE_MANIFEST_FILE = "manifest.json";

/** Where each sheet lives under the assets root. */
export const SPRITE_FOLDERS = {
  ship: (shipId: string) => `ships/${shipId}`,
  sails: "sails",
  figureheads: "figureheads",
  flags: "flags",
  props: "props",
  avatar: "avatars",
  environment: (env: EnvironmentId) => `environment/${env}`,
} as const;

// ---------------------------------------------------------------------------
// Ships: ships/<shipId>/

/**
 * A hull comes as two layers so sailors can stand "inside" it: the back layer
 * (deck surface, far rail, cabin walls) and the front layer (hull side and
 * near rail, drawn over the sailors' feet). Rigging is the masts, yards,
 * crow's nest and ropes, without sails (the loadout picks those).
 */
export const SHIP_SPRITE = {
  hullBack: "hull-back",
  rigging: "rigging",
  hullFront: "hull-front",
  /** Optional: the ship's themed Captain's Quarters item (CABIN_DECOR). */
  cabinDecor: "cabin-decor",
  /** Optional: the Captain's Quarters backdrop, with a see-through porthole. */
  cabinRoom: "cabin-room",
} as const;

/** Drawing order on a ship. Placements may use any number; these are where the engine's own parts go. */
export const SHIP_Z = {
  behind: 0,
  hullBack: 10,
  rigging: 20,
  sails: 30,
  /** Deck details that must cover the foot of the sails. */
  deck: 40,
  /** Props and sailors. */
  onDeck: 50,
  hullFront: 60,
  figurehead: 70,
  flag: 80,
} as const;

/** Where the three required ship pieces go when a manifest lists no placements. */
export const SHIP_DEFAULT_PLACEMENTS: readonly SpritePlacement[] = [
  { sprite: SHIP_SPRITE.hullBack, x: 0, y: 0, zIndex: SHIP_Z.hullBack },
  { sprite: SHIP_SPRITE.rigging, x: 0, y: 0, zIndex: SHIP_Z.rigging },
  { sprite: SHIP_SPRITE.hullFront, x: 0, y: 0, zIndex: SHIP_Z.hullFront },
];

// ---------------------------------------------------------------------------
// Parts shared by every ship: sails/, figureheads/, flags/

/** Sails are furled while docked and billow under way. */
export type SailLook = "billowing" | "furled";

/** e.g. "square:billowing". One mast's set of sails; the engine fits it to each mast. */
export function sailSpriteId(style: SailStyle, look: SailLook): string {
  return `${style}:${look}`;
}

/** Figureheads and flags are keyed by their part id ("ram", "straw-skull"). */
export type FigureheadSpriteId = Exclude<FigureheadId, "none">;
export type FlagSpriteId = FlagId;

// ---------------------------------------------------------------------------
// Deck props: props/

export const PROP_SPRITE = {
  helmStand: "helm-stand",
  /** Turns around its anchor (the hub). */
  helmWheel: "helm-wheel",
  /** Swings around its anchor (where it hangs). */
  bell: "bell",
  /** Hung on the tree by the engine at fixed spots, so the count shows. */
  citrusFruit: "citrus-fruit",
  citrusBlossom: "citrus-blossom",
  /** A table for two crew, drawn in the station frame (see AVATAR_SPRITE_ANCHOR). */
  galleyTable: "galley-table",
} as const;

/** The citrus tree's three looks. */
export type CitrusLook = "normal" | "blooming" | "wilted";
export function citrusSpriteId(look: CitrusLook): string {
  return `citrus-${look}`;
}

/** Desks are drawn in the station frame, like the sailor's layers. */
export function deskSpriteId(desk: DeskId): string {
  return `desk:${desk}`;
}

// ---------------------------------------------------------------------------
// Sailors: avatars/

/**
 * A chibi sailor is a stack of square layers that all share one anchor: the
 * floor under the middle of the desk (the "station frame"). Each sprite id is
 * a layer name plus a variant ("hat:tricorn", "eyes:focus", "arms:typing").
 */
export type AvatarSpriteLayer =
  | "hair-back"
  | "body"
  | "coat"
  | "tool"
  | "head"
  | "eyes"
  | "mouth"
  | "hair-front"
  | "hat"
  | "accessory"
  | "arms"
  | "hands";

/**
 * Bottom to top. The desk goes between "coat" and "tool". Arms come last so a
 * cup or spyglass can cover the face, and folded arms cover a sleeping head.
 */
export const AVATAR_LAYER_ORDER: readonly AvatarSpriteLayer[] = [
  "hair-back",
  "body",
  "coat",
  "tool",
  "head",
  "eyes",
  "mouth",
  "hair-front",
  "hat",
  "accessory",
  "arms",
  "hands",
];

/** Layers that tilt and nod with the head. */
export const AVATAR_HEAD_LAYERS: ReadonlySet<AvatarSpriteLayer> = new Set(["hair-back", "head", "eyes", "mouth", "hair-front", "hat"]);

/** Arms are posed per activity; the engine picks one from the avatar state and time. */
export type AvatarArmPose = "writing" | "typing" | "relaxed" | "sipping" | "stretching" | "spyglass" | "resting";
export const AVATAR_ARM_POSES: readonly AvatarArmPose[] = ["writing", "typing", "relaxed", "sipping", "stretching", "spyglass", "resting"];

/** Which arm poses each state can show ("relaxed" is the in-between of a break activity). */
export const AVATAR_STATE_POSES: Record<AvatarState, readonly AvatarArmPose[]> = {
  SAILING_FOCUS: ["writing", "typing"],
  SHORE_LEAVE_BREAK: ["relaxed", "sipping", "stretching", "spyglass"],
  DRIFTING_IDLE: ["resting"],
};

export type AvatarEyes = "open" | "focus" | "blink" | "happy" | "sleep";
export const AVATAR_EYES: readonly AvatarEyes[] = ["open", "focus", "blink", "happy", "sleep"];
export type AvatarMouth = "smile" | "flat" | "open" | "sip" | "sleep";
export const AVATAR_MOUTHS: readonly AvatarMouth[] = ["smile", "flat", "open", "sip", "sleep"];

/** The size every avatar layer (and desk) is drawn at, in station units, and the shared anchor. */
export const AVATAR_SPRITE_SIZE = 256;
export const AVATAR_SPRITE_ANCHOR = { x: 128, y: 246 } as const;

// ---------------------------------------------------------------------------
// Environments: environment/<envId>/

/**
 * A sky backdrop (stretched to fill the screen), a cloud bank and three wave
 * bands. Clouds and waves tile sideways; a wave band's anchor row sits on the
 * sea surface and its bottom row is stretched down to the bottom of the screen.
 */
export type EnvironmentSpriteLayer = "sky" | "clouds" | "waves-back" | "waves-mid" | "waves-front";
export const ENVIRONMENT_LAYERS: readonly EnvironmentSpriteLayer[] = ["sky", "clouds", "waves-back", "waves-mid", "waves-front"];
