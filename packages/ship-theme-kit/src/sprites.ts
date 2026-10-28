// The art Ship expects from the graphics AI, sheet by sheet, and the checks
// its deliveries must pass. Per-ship offsets (where the masts, helm and desk
// sit on a given hull drawing) travel with the art, in that ship's manifest.

import {
  AVATAR_ARM_POSES,
  AVATAR_EYES,
  AVATAR_HEAD_LAYERS,
  AVATAR_LAYER_ORDER,
  AVATAR_MOUTHS,
  AVATAR_SPRITE_ANCHOR,
  AVATAR_SPRITE_SIZE,
  ENVIRONMENT_LAYERS,
  PROP_SPRITE,
  SHIP_SPRITE,
  SPRITE_FOLDERS,
  citrusSpriteId,
  deskSpriteId,
  sailSpriteId,
} from "@ship/shared-types";
import type {
  AvatarArmPose,
  AvatarEyes,
  AvatarLoadout,
  AvatarMouth,
  AvatarSpriteLayer,
  CitrusLook,
  EnvironmentId,
  SailLook,
  SpriteManifest,
  SpriteSheetKind,
  SpriteShipLayout,
  StudyToolId,
} from "@ship/shared-types";
import { ACCESSORIES, COATS, HAIR_STYLES, HATS, STUDY_TOOLS, getSkinTone } from "./avatar.js";
import { ENVIRONMENTS } from "./environments.js";
import { DESKS, FIGUREHEADS, FLAGS, SAILS } from "./parts.js";
import { SHIPS } from "./ships.js";

export interface SpriteRequirement {
  id: string;
  /** Size in scene units (image pixels ÷ density). */
  width: number;
  height: number;
  /** Where the anchor belongs, in scene units from the image's top-left. */
  anchor: { x: number; y: number };
  /** Sprites in the same group are used all together or not at all. */
  group: string;
  /** Should be drawn in greys for the engine to color. */
  tintable?: boolean;
  /** For the art brief: what it is and where its anchor goes. */
  note: string;
}

export interface SpriteSheetSpec {
  folder: string;
  kind: SpriteSheetKind;
  title: string;
  sprites: SpriteRequirement[];
  /** Ship sheets may add their own pieces (a bowsprit, wings, a leviathan) through placements. */
  allowExtras: boolean;
}

// ---------------------------------------------------------------------------
// Sizes and anchors

const STATION = { width: AVATAR_SPRITE_SIZE, height: AVATAR_SPRITE_SIZE, anchor: AVATAR_SPRITE_ANCHOR };

export const HULL_SPRITE = { width: 1000, height: 300, anchor: { x: 500, y: 150 } } as const;
export const RIGGING_SPRITE = { width: 1200, height: 700, anchor: { x: 600, y: 700 } } as const;
export const SAIL_SPRITE = { width: 320, height: 320, anchor: { x: 160, y: 16 } } as const;
export const FIGUREHEAD_SPRITE = { width: 160, height: 160, anchor: { x: 24, y: 96 } } as const;
export const FLAG_SPRITE = { width: 120, height: 72, anchor: { x: 120, y: 0 } } as const;
export const CABIN_ROOM_SPRITE = { width: 1000, height: 640, anchor: { x: 0, y: 0 } } as const;
/** The Captain's Quarters porthole, in room units: the room art leaves this circle see-through. */
export const CABIN_PORTHOLE = { x: 790, y: 215, r: 108 } as const;

const req = (id: string, size: { width: number; height: number; anchor: { x: number; y: number } }, group: string, note: string, tintable?: boolean): SpriteRequirement => ({
  id,
  width: size.width,
  height: size.height,
  anchor: { x: size.anchor.x, y: size.anchor.y },
  group,
  note,
  ...(tintable ? { tintable } : {}),
});

const size = (width: number, height: number, x: number, y: number) => ({ width, height, anchor: { x, y } });

// ---------------------------------------------------------------------------
// The catalog of sheets

export function shipSheetSpec(shipId: string): SpriteSheetSpec {
  const ship = SHIPS.find((s) => s.id === shipId);
  return {
    folder: SPRITE_FOLDERS.ship(shipId),
    kind: "ship",
    title: ship?.name ?? shipId,
    allowExtras: true,
    sprites: [
      req(SHIP_SPRITE.hullBack, HULL_SPRITE, "hull", "Behind the sailors: the deck surface, far rail, raised-deck walls and cabins. Anchor: the main deck line at the ship's middle."),
      req(SHIP_SPRITE.rigging, RIGGING_SPRITE, "hull", "Masts, yards, crow's nest, stays and the flag pole, without sails. Anchor: deck level at the ship's middle."),
      req(SHIP_SPRITE.hullFront, HULL_SPRITE, "hull", "In front of the sailors' feet: the hull side, near rail, portholes, gun ports. Same frame as hull-back."),
      req(SHIP_SPRITE.cabinDecor, size(240, 240, 120, 236), "cabin-decor", "The ship's themed keepsake for the Captain's Quarters. Anchor: where it stands on the floor."),
      req(SHIP_SPRITE.cabinRoom, CABIN_ROOM_SPRITE, "cabin-room", "The Captain's Quarters backdrop: walls, bookshelf, rug, lantern. Leave the porthole circle see-through."),
    ],
  };
}

export function sailsSheetSpec(): SpriteSheetSpec {
  const looks: SailLook[] = ["billowing", "furled"];
  return {
    folder: SPRITE_FOLDERS.sails,
    kind: "sails",
    title: "Sails",
    allowExtras: false,
    sprites: SAILS.filter((s) => s.id !== "none").flatMap((s) =>
      looks.map((look) => req(sailSpriteId(s.id, look), SAIL_SPRITE, s.id, `${s.name}, ${look}: one mast's sails, hanging from the top yard. Anchor: where the mast crosses the top yard.`)),
    ),
  };
}

export function figureheadsSheetSpec(): SpriteSheetSpec {
  return {
    folder: SPRITE_FOLDERS.figureheads,
    kind: "figureheads",
    title: "Figureheads",
    allowExtras: false,
    sprites: FIGUREHEADS.filter((f) => f.id !== "none").map((f) => req(f.id, FIGUREHEAD_SPRITE, f.id, `${f.name}, facing right. Anchor: where it meets the bow.`)),
  };
}

export function flagsSheetSpec(): SpriteSheetSpec {
  return {
    folder: SPRITE_FOLDERS.flags,
    kind: "flags",
    title: "Flags",
    allowExtras: false,
    sprites: FLAGS.map((f) => req(f.id, FLAG_SPRITE, f.id, `${f.name}, flat (the engine waves it), streaming left from the pole. Anchor: the top corner at the pole.`)),
  };
}

export function propsSheetSpec(): SpriteSheetSpec {
  const citrus: CitrusLook[] = ["normal", "blooming", "wilted"];
  const tree = size(160, 240, 80, 236);
  return {
    folder: SPRITE_FOLDERS.props,
    kind: "props",
    title: "Deck props and desks",
    allowExtras: false,
    sprites: [
      req(PROP_SPRITE.helmStand, size(64, 80, 32, 80), "helm", "The helm's pedestal. Anchor: the middle of its foot on the deck."),
      req(PROP_SPRITE.helmWheel, size(104, 104, 52, 52), "helm", "The ship's wheel, which the engine turns. Anchor: the hub, 74 units above the deck."),
      req(PROP_SPRITE.bell, size(64, 64, 32, 0), "bell", "The ship's bell with its yoke, which the engine swings. Anchor: the hanging point."),
      ...citrus.map((look) => req(citrusSpriteId(look), tree, "citrus", `The potted citrus tree, ${look}, without fruit. Anchor: the middle of the pot's base.`)),
      req(PROP_SPRITE.citrusFruit, size(28, 28, 14, 14), "citrus", "One ripe citrus fruit with a leaf. Anchor: its middle."),
      req(PROP_SPRITE.citrusBlossom, size(20, 20, 10, 10), "citrus", "One white blossom. Anchor: its middle."),
      req(PROP_SPRITE.galleyTable, STATION, PROP_SPRITE.galleyTable, "A table for two crew, front view, in the station frame. Anchor: the floor under the table's middle."),
      ...DESKS.map((d) => req(deskSpriteId(d.id), STATION, deskSpriteId(d.id), `${d.name}, front view, in the station frame. Anchor: the floor under the desk's middle.`)),
    ],
  };
}

export function avatarSheetSpec(): SpriteSheetSpec {
  const layer = (id: string, note: string, tintable?: boolean) => req(id, STATION, id, note, tintable);
  return {
    folder: SPRITE_FOLDERS.avatar,
    kind: "avatar",
    title: "Chibi sailor layers",
    allowExtras: false,
    sprites: [
      ...HAIR_STYLES.map((h) => layer(`hair-back:${h.id}`, `${h.name} hair behind the head (optional for short styles).`, true)),
      layer("body", "Neck and seated torso in skin tone (a coat goes over it).", true),
      ...COATS.map((c) => layer(`coat:${c.id}`, `${c.name} on the seated torso.`, true)),
      ...STUDY_TOOLS.map((t) => layer(`tool:${t.id}`, `${t.name} lying on the desk top.`)),
      layer("head", "Head and ears in skin tone, no face.", true),
      ...AVATAR_EYES.map((e) => layer(`eyes:${e}`, `Eyes: ${e}.`)),
      ...AVATAR_MOUTHS.map((m) => layer(`mouth:${m}`, `Mouth: ${m}.`)),
      ...HAIR_STYLES.map((h) => layer(`hair-front:${h.id}`, `${h.name} hair over the forehead.`, true)),
      ...HATS.filter((h) => h.id !== "none").map((h) => layer(`hat:${h.id}`, `${h.name}.`)),
      ...ACCESSORIES.filter((a) => a.id !== "none").map((a) => layer(`accessory:${a.id}`, `${a.name}.`)),
      ...AVATAR_ARM_POSES.map((p) => layer(`arms:${p}`, `Sleeves for the ${p} pose (any held cup or spyglass included).`, true)),
      ...AVATAR_ARM_POSES.map((p) => layer(`hands:${p}`, `Hands for the ${p} pose, in skin tone.`, true)),
    ],
  };
}

export function environmentSheetSpec(env: EnvironmentId): SpriteSheetSpec {
  const notes: Record<(typeof ENVIRONMENT_LAYERS)[number], string> = {
    sky: "The sky, stretched to fill the screen. Anchor: the top-left corner.",
    clouds: "A cloud bank that tiles sideways, over the sky. Anchor: the top-left corner.",
    "waves-back": "The far wave band, tiling sideways. Anchor: the left end of its crest line.",
    "waves-mid": "The middle wave band, just behind the ship. Anchor: the left end of its crest line.",
    "waves-front": "The near wave band, over the hull's waterline. Anchor: the left end of its crest line.",
  };
  const sizes = {
    sky: size(1920, 1080, 0, 0),
    clouds: size(2048, 512, 0, 0),
    "waves-back": size(2048, 512, 0, 96),
    "waves-mid": size(2048, 512, 0, 96),
    "waves-front": size(2048, 512, 0, 96),
  };
  return {
    folder: SPRITE_FOLDERS.environment(env),
    kind: "environment",
    title: ENVIRONMENTS[env]?.name ?? env,
    allowExtras: false,
    sprites: ENVIRONMENT_LAYERS.map((l) => req(l, sizes[l], l.startsWith("waves") ? "waves" : l, notes[l])),
  };
}

/** Every sheet Ship knows about. */
export function spriteSheetSpecs(): SpriteSheetSpec[] {
  return [
    ...SHIPS.map((s) => shipSheetSpec(s.id)),
    sailsSheetSpec(),
    figureheadsSheetSpec(),
    flagsSheetSpec(),
    propsSheetSpec(),
    avatarSheetSpec(),
    ...(Object.keys(ENVIRONMENTS) as EnvironmentId[]).map(environmentSheetSpec),
  ];
}

export function sheetSpecFor(folder: string): SpriteSheetSpec | undefined {
  return spriteSheetSpecs().find((s) => s.folder === folder);
}

// ---------------------------------------------------------------------------
// Checking a manifest

export interface SpriteProblem {
  level: "error" | "warning";
  /** The sprite id, when the problem is about one sprite. */
  sprite?: string;
  message: string;
}

const KINDS: ReadonlySet<string> = new Set<SpriteSheetKind>(["ship", "sails", "figureheads", "flags", "props", "avatar", "environment"]);
const IMAGE_FILE = /^[A-Za-z0-9_\-./]+\.(png|webp|svg)$/;
const AVATAR_PREFIXES: ReadonlySet<string> = new Set(AVATAR_LAYER_ORDER);

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Checks a parsed manifest.json. Errors make the engine skip that sprite (or
 * the whole sheet); warnings are worth fixing but harmless. A sheet missing
 * some sprites is fine: see sheetProgress for what is still to come.
 */
export function validateManifest(manifest: unknown, spec?: SpriteSheetSpec): SpriteProblem[] {
  const problems: SpriteProblem[] = [];
  const error = (message: string, sprite?: string) => problems.push({ level: "error", message, ...(sprite ? { sprite } : {}) });
  const warn = (message: string, sprite?: string) => problems.push({ level: "warning", message, ...(sprite ? { sprite } : {}) });

  if (!isObject(manifest)) {
    error("The manifest must be a JSON object.");
    return problems;
  }
  if (manifest.version !== 1) error(`"version" must be 1.`);
  if (typeof manifest.kind !== "string" || !KINDS.has(manifest.kind)) error(`"kind" must be one of ${[...KINDS].join(", ")}.`);
  else if (spec && manifest.kind !== spec.kind) error(`"kind" is "${manifest.kind}", but ${spec.folder} holds "${spec.kind}" sprites.`);
  if (!Array.isArray(manifest.sprites)) {
    error(`"sprites" must be a list.`);
    return problems;
  }

  const wanted = new Map((spec?.sprites ?? []).map((r) => [r.id, r]));
  const seen = new Set<string>();
  for (const raw of manifest.sprites as unknown[]) {
    if (!isObject(raw) || typeof raw.id !== "string" || raw.id === "") {
      error("Every sprite needs a text id.");
      continue;
    }
    const id = raw.id;
    if (seen.has(id)) error(`The id "${id}" is listed twice.`, id);
    seen.add(id);
    if (typeof raw.file !== "string" || !IMAGE_FILE.test(raw.file) || raw.file.split("/").includes("..") || raw.file.startsWith("/")) {
      error(`"file" must be a .png, .webp or .svg path inside this folder.`, id);
    }
    const density = raw.density === undefined ? 1 : raw.density;
    if (!finite(density) || density <= 0) error(`"density" must be a positive number.`, id);
    const { width, height, anchorX, anchorY } = raw;
    if (!finite(width) || !finite(height) || width <= 0 || height <= 0 || !Number.isInteger(width) || !Number.isInteger(height)) {
      error(`"width" and "height" must be whole numbers of pixels.`, id);
      continue;
    }
    if (!finite(anchorX) || !finite(anchorY) || anchorX < 0 || anchorY < 0 || anchorX > width || anchorY > height) {
      error(`The anchor (${String(anchorX)}, ${String(anchorY)}) must lie inside the ${width} × ${height} image.`, id);
    }
    if (raw.tintable !== undefined && typeof raw.tintable !== "boolean") error(`"tintable" must be true or false.`, id);

    const want = wanted.get(id);
    if (want && finite(density) && density > 0) {
      const w = width / density;
      const h = height / density;
      if (Math.abs(w - want.width) > 0.01 || Math.abs(h - want.height) > 0.01) {
        error(`Must be ${want.width} × ${want.height}${density !== 1 ? ` at density 1 (${want.width * density} × ${want.height * density} at density ${density})` : ""}, not ${width} × ${height}.`, id);
      }
      if (want.tintable && raw.tintable !== true) warn(`Usually drawn in greys with "tintable": true, so the sailor's colors apply.`, id);
    } else if (spec && !want && !spec.allowExtras && !(spec.kind === "avatar" && avatarVariantAllowed(id))) {
      warn(`Ship doesn't use a sprite called "${id}".`, id);
    }
  }

  if (manifest.placements !== undefined) {
    if (manifest.kind !== "ship") error(`Only ship sheets have "placements".`);
    else if (!Array.isArray(manifest.placements)) error(`"placements" must be a list.`);
    else {
      for (const p of manifest.placements as unknown[]) {
        if (!isObject(p) || typeof p.sprite !== "string" || !seen.has(p.sprite)) {
          error(`Every placement must name a sprite listed in this manifest.`);
          continue;
        }
        if (!finite(p.x) || !finite(p.y) || !finite(p.zIndex)) error(`A placement needs numbers for x, y and zIndex.`, p.sprite);
        if (p.scale !== undefined && (!finite(p.scale) || p.scale <= 0)) error(`"scale" must be a positive number.`, p.sprite);
        if (p.rotation !== undefined && !finite(p.rotation)) error(`"rotation" must be a number (radians).`, p.sprite);
      }
    }
  }
  if (manifest.layout !== undefined) {
    if (manifest.kind !== "ship") error(`Only ship sheets have a "layout".`);
    else if (!isObject(manifest.layout)) error(`"layout" must be an object.`);
    else {
      for (const [key, value] of Object.entries(manifest.layout)) {
        const shape = Object.hasOwn(LAYOUT_SHAPES, key) ? LAYOUT_SHAPES[key as keyof SpriteShipLayout] : undefined;
        if (!shape) warn(`Ship doesn't use a layout spot called "${key}".`);
        else if (!shape.check(value)) error(`"layout.${key}" must be ${shape.text}.`);
      }
    }
  }
  return problems;
}

/** Variant ids the avatar spec doesn't list but the engine looks for ("body:peach", "arms:writing:toga"). */
function avatarVariantAllowed(id: string): boolean {
  return AVATAR_PREFIXES.has(id.split(":")[0]);
}

/** An object with exactly these numeric fields. */
const fields = (...keys: string[]) => (v: unknown) => isObject(v) && keys.every((k) => finite(v[k]));
const listOf = (item: (v: unknown) => boolean) => (v: unknown) => Array.isArray(v) && v.every(item);
const point = fields("x", "y");

/** What each `layout` key must look like (mirrors HullLayout in the web app). */
const LAYOUT_SHAPES: Record<keyof SpriteShipLayout, { check: (v: unknown) => boolean; text: string }> = {
  waterline: { check: finite, text: "a number" },
  keel: { check: finite, text: "a number" },
  deck: { check: fields("from", "to"), text: "{ from, to }" },
  masts: { check: listOf(fields("x", "base", "top")), text: "a list of { x, base, top }" },
  bow: { check: fields("x", "y", "angle"), text: "{ x, y, angle }" },
  flag: { check: point, text: "{ x, y }" },
  helm: { check: point, text: "{ x, y }" },
  citrusTree: { check: point, text: "{ x, y }" },
  bell: { check: point, text: "{ x, y }" },
  desk: { check: point, text: "{ x, y }" },
  tables: { check: listOf(point), text: "a list of { x, y }" },
  smoke: { check: listOf(point), text: "a list of { x, y }" },
  orchard: { check: listOf(point), text: "a list of { x, y }" },
  surfaces: { check: listOf(fields("from", "to", "y")), text: "a list of { from, to, y }" },
  bounds: { check: fields("left", "top", "right", "bottom"), text: "{ left, top, right, bottom }" },
};

/** The sprites a manifest lists that pass validation, by id. */
export function usableSprites(manifest: SpriteManifest, spec?: SpriteSheetSpec): SpriteManifest["sprites"] {
  const problems = validateManifest(manifest, spec);
  if (problems.some((p) => p.level === "error" && !p.sprite)) return [];
  const bad = new Set(problems.filter((p) => p.level === "error" && p.sprite).map((p) => p.sprite));
  return manifest.sprites.filter((s) => !bad.has(s.id));
}

export interface GroupProgress {
  group: string;
  /** How many sprites the group needs. */
  size: number;
  /** Required ids not delivered yet. Empty means the group is complete and the engine uses it. */
  missing: string[];
}

/** For each part group in a sheet, which of its sprites are still missing. */
export function sheetProgress(spec: SpriteSheetSpec, have: ReadonlySet<string>): GroupProgress[] {
  const groups = new Map<string, GroupProgress>();
  for (const r of spec.sprites) {
    // Back hair is optional.
    if (r.id.startsWith("hair-back:")) continue;
    const g = groups.get(r.group) ?? { group: r.group, size: 0, missing: [] };
    g.size++;
    if (!have.has(r.id)) g.missing.push(r.id);
    groups.set(r.group, g);
  }
  return [...groups.values()];
}

// ---------------------------------------------------------------------------
// Sailors: which layers a loadout needs

/** What the sailor is doing in one frame, as sprite variants. */
export interface AvatarSpriteFrame {
  arms: AvatarArmPose;
  eyes: AvatarEyes;
  mouth: AvatarMouth;
}

export interface AvatarSpriteSlot {
  layer: AvatarSpriteLayer;
  /** Sprite ids to try, best first. */
  ids: string[];
  /** The color a tintable sprite takes. */
  tint?: string;
  /** Skipped quietly when no sprite exists (not every hair style has back hair). */
  optional?: boolean;
  /** Tilts and nods with the head. */
  head: boolean;
}

/** The focus pose a study tool uses. */
export function focusArmPose(tool: StudyToolId): AvatarArmPose {
  return tool === "laptop" || tool === "mech-keyboard" ? "typing" : "writing";
}

/** The layers for one frame of a sailor, bottom to top (the desk goes after "coat"). */
export function avatarSpriteSlots(avatar: AvatarLoadout, frame: AvatarSpriteFrame): AvatarSpriteSlot[] {
  const skin = getSkinTone(avatar.skin);
  const ids: Record<AvatarSpriteLayer, string[] | null> = {
    "hair-back": [`hair-back:${avatar.hair}`],
    body: [`body:${avatar.skin}`, "body"],
    coat: [`coat:${avatar.coat}`],
    tool: [`tool:${avatar.tool}`],
    head: [`head:${avatar.skin}`, "head"],
    eyes: [`eyes:${frame.eyes}`],
    mouth: [`mouth:${frame.mouth}`],
    "hair-front": [`hair-front:${avatar.hair}`],
    hat: avatar.hat === "none" ? null : [`hat:${avatar.hat}`],
    accessory: avatar.accessory === "none" ? null : [`accessory:${avatar.accessory}`],
    arms: [`arms:${frame.arms}:${avatar.coat}`, `arms:${frame.arms}`],
    hands: [`hands:${frame.arms}:${avatar.skin}`, `hands:${frame.arms}`],
  };
  const tints: Partial<Record<AvatarSpriteLayer, string>> = {
    "hair-back": avatar.hairColor,
    body: skin.base,
    coat: avatar.coatColor,
    head: skin.base,
    "hair-front": avatar.hairColor,
    arms: avatar.coatColor,
    hands: skin.base,
  };
  const slots: AvatarSpriteSlot[] = [];
  for (const layer of AVATAR_LAYER_ORDER) {
    const list = ids[layer];
    if (!list) continue;
    const tint = tints[layer];
    slots.push({ layer, ids: list, head: AVATAR_HEAD_LAYERS.has(layer), ...(tint ? { tint } : {}), ...(layer === "hair-back" ? { optional: true } : {}) });
  }
  return slots;
}

/** Every frame a loadout can show: its focus pose, the break poses, sleep, and every face. */
function framesFor(avatar: AvatarLoadout): AvatarSpriteFrame[] {
  const poses: AvatarArmPose[] = AVATAR_ARM_POSES.filter((p) => p !== "writing" && p !== "typing");
  poses.push(focusArmPose(avatar.tool));
  const frames: AvatarSpriteFrame[] = poses.map((arms) => ({ arms, eyes: "open", mouth: "smile" }));
  for (const eyes of AVATAR_EYES) frames.push({ arms: "relaxed", eyes, mouth: "smile" });
  for (const mouth of AVATAR_MOUTHS) frames.push({ arms: "relaxed", eyes: "open", mouth });
  return frames;
}

/**
 * The sprites this sailor still lacks (the generic id for each slot). The engine
 * draws a sailor from sprites only once this is empty, so a half-delivered set
 * never mixes with the procedural art.
 */
export function missingAvatarSprites(avatar: AvatarLoadout, has: (id: string) => boolean): string[] {
  const missing = new Set<string>();
  for (const frame of framesFor(avatar)) {
    for (const slot of avatarSpriteSlots(avatar, frame)) {
      if (!slot.optional && !slot.ids.some(has)) missing.add(slot.ids[slot.ids.length - 1]);
    }
  }
  return [...missing];
}
