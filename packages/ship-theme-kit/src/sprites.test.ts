import { describe, expect, it } from "vitest";
import { AVATAR_LAYER_ORDER, SHIP_SPRITE, SPRITE_FOLDERS } from "@ship/shared-types";
import type { AvatarLoadout, SpriteManifest } from "@ship/shared-types";
import {
  DEFAULT_AVATAR,
  ENVIRONMENTS,
  HULL_SPRITE,
  SHIPS,
  avatarSheetSpec,
  avatarSpriteSlots,
  focusArmPose,
  missingAvatarSprites,
  propsSheetSpec,
  sheetProgress,
  sheetSpecFor,
  shipSheetSpec,
  spriteSheetSpecs,
  usableSprites,
  validateManifest,
} from "./index.js";

const hull = (id: string, extra: Partial<SpriteManifest["sprites"][number]> = {}) => ({
  id,
  file: `${id}.png`,
  width: HULL_SPRITE.width,
  height: HULL_SPRITE.height,
  anchorX: HULL_SPRITE.anchor.x,
  anchorY: HULL_SPRITE.anchor.y,
  ...extra,
});

const woolly = shipSheetSpec("woolly-wanderer");

describe("sprite sheet catalog", () => {
  it("has one sheet per ship and environment, plus the shared sheets, each in its own folder", () => {
    const specs = spriteSheetSpecs();
    const folders = specs.map((s) => s.folder);
    expect(new Set(folders).size).toBe(folders.length);
    expect(specs.filter((s) => s.kind === "ship")).toHaveLength(SHIPS.length);
    expect(specs.filter((s) => s.kind === "environment")).toHaveLength(Object.keys(ENVIRONMENTS).length);
    for (const kind of ["sails", "figureheads", "flags", "props", "avatar"] as const) {
      expect(specs.filter((s) => s.kind === kind)).toHaveLength(1);
    }
    expect(sheetSpecFor(SPRITE_FOLDERS.ship("woolly-wanderer"))?.title).toBe("Woolly Wanderer");
  });

  it("puts every anchor inside its image and keeps ids unique per sheet", () => {
    for (const spec of spriteSheetSpecs()) {
      const ids = spec.sprites.map((s) => s.id);
      expect(new Set(ids).size, spec.folder).toBe(ids.length);
      for (const r of spec.sprites) {
        expect(r.anchor.x, `${spec.folder}/${r.id}`).toBeGreaterThanOrEqual(0);
        expect(r.anchor.x).toBeLessThanOrEqual(r.width);
        expect(r.anchor.y).toBeGreaterThanOrEqual(0);
        expect(r.anchor.y).toBeLessThanOrEqual(r.height);
      }
    }
  });

  it("asks for the 1000 × 300 hulls and the citrus tree's three looks", () => {
    expect(woolly.sprites.find((s) => s.id === SHIP_SPRITE.hullFront)).toMatchObject({ width: 1000, height: 300 });
    const props = propsSheetSpec().sprites.map((s) => s.id);
    expect(props).toEqual(expect.arrayContaining(["citrus-normal", "citrus-blooming", "citrus-wilted"]));
    expect(avatarSheetSpec().sprites.every((s) => s.width === 256 && s.height === 256)).toBe(true);
  });
});

describe("validateManifest", () => {
  const good: SpriteManifest = {
    version: 1,
    kind: "ship",
    sprites: [hull("hull-back"), hull("hull-front"), { id: "bowsprit", file: "bowsprit.png", width: 200, height: 80, anchorX: 0, anchorY: 40 }],
    placements: [
      { sprite: "hull-back", x: 0, y: 0, zIndex: 10 },
      { sprite: "bowsprit", x: 470, y: -20, zIndex: 65 },
      { sprite: "hull-front", x: 0, y: 0, zIndex: 60 },
    ],
    layout: { desk: { x: -120, y: 0 }, masts: [{ x: 40, base: 0, top: -480 }] },
  };

  it("accepts a well-formed ship sheet with extras", () => {
    expect(validateManifest(good, woolly)).toEqual([]);
  });

  it("rejects malformed manifests outright", () => {
    expect(validateManifest(null)[0].level).toBe("error");
    expect(validateManifest({ version: 2, kind: "boat", sprites: [] }).map((p) => p.message)).toEqual([
      `"version" must be 1.`,
      expect.stringContaining(`"kind" must be one of`),
    ]);
    expect(validateManifest({ ...good, kind: "flags" }, woolly)[0].message).toContain("holds \"ship\" sprites");
  });

  it("flags bad sprites one by one", () => {
    const problems = validateManifest(
      {
        version: 1,
        kind: "ship",
        sprites: [
          hull("hull-back", { width: 900 }),
          hull("hull-front", { file: "../secrets.png" }),
          hull("rigging", { anchorX: -5, width: 1200, height: 700 }),
          hull("hull-front"),
        ],
      },
      woolly,
    );
    expect(problems).toEqual([
      { level: "error", sprite: "hull-back", message: "Must be 1000 × 300, not 900 × 300." },
      { level: "error", sprite: "hull-front", message: expect.stringContaining(`"file" must be`) },
      { level: "error", sprite: "rigging", message: expect.stringContaining("must lie inside") },
      { level: "error", sprite: "hull-front", message: `The id "hull-front" is listed twice.` },
    ]);
  });

  it("measures sizes in scene units, so double-size art passes", () => {
    const hiRes = hull("hull-back", { width: 2000, height: 600, anchorX: 1000, anchorY: 300, density: 2 });
    expect(validateManifest({ version: 1, kind: "ship", sprites: [hiRes] }, woolly)).toEqual([]);
    expect(validateManifest({ version: 1, kind: "ship", sprites: [{ ...hiRes, density: 1.5 }] }, woolly)[0].message).toContain(
      "1500 × 450 at density 1.5",
    );
  });

  it("checks placements and layout, which only ship sheets may have", () => {
    const bad = { ...good, placements: [{ sprite: "mainsail", x: 0, y: 0, zIndex: 1 }], layout: { desk: { x: "left" }, masts: 5, tables: [{ x: 1, y: 2 }], crane: 3 } };
    expect(validateManifest(bad, woolly).map((p) => p.message)).toEqual([
      "Every placement must name a sprite listed in this manifest.",
      `"layout.desk" must be { x, y }.`,
      `"layout.masts" must be a list of { x, base, top }.`,
      `Ship doesn't use a layout spot called "crane".`,
    ]);
    const flags = { version: 1, kind: "flags", sprites: [], placements: [] };
    expect(validateManifest(flags)[0].message).toBe(`Only ship sheets have "placements".`);
  });

  it("warns about ids the engine won't look for, but allows avatar variants", () => {
    const props = { version: 1, kind: "props", sprites: [{ id: "anchor", file: "anchor.png", width: 10, height: 10, anchorX: 5, anchorY: 5 }] };
    expect(validateManifest(props, propsSheetSpec())).toEqual([{ level: "warning", sprite: "anchor", message: `Ship doesn't use a sprite called "anchor".` }]);
    const avatar = {
      version: 1,
      kind: "avatar",
      sprites: [
        { id: "body:peach", file: "body-peach.png", width: 256, height: 256, anchorX: 128, anchorY: 246 },
        { id: "hair-front:messy", file: "hair.png", width: 256, height: 256, anchorX: 128, anchorY: 246 },
      ],
    };
    expect(validateManifest(avatar, avatarSheetSpec())).toEqual([
      { level: "warning", sprite: "hair-front:messy", message: expect.stringContaining(`"tintable": true`) },
    ]);
  });

  it("usableSprites drops only the sprites with errors", () => {
    const manifest = { version: 1, kind: "ship", sprites: [hull("hull-back"), hull("hull-front", { height: 10 })] } as SpriteManifest;
    expect(usableSprites(manifest, woolly).map((s) => s.id)).toEqual(["hull-back"]);
    expect(usableSprites({ ...manifest, version: 3 } as unknown as SpriteManifest, woolly)).toEqual([]);
  });
});

describe("sheetProgress", () => {
  it("lists what each part group still needs", () => {
    const progress = sheetProgress(woolly, new Set(["hull-back", "rigging", "cabin-decor"]));
    expect(progress).toEqual([
      { group: "hull", size: 3, missing: ["hull-front"] },
      { group: "cabin-decor", size: 1, missing: [] },
      { group: "cabin-room", size: 1, missing: ["cabin-room"] },
    ]);
  });
});

describe("avatar sprite slots", () => {
  const avatar: AvatarLoadout = { ...DEFAULT_AVATAR, hat: "none", accessory: "glasses", tool: "laptop" };

  it("stacks the layers in order, with tints from the loadout", () => {
    const slots = avatarSpriteSlots(avatar, { arms: "typing", eyes: "focus", mouth: "flat" });
    expect(slots.map((s) => s.layer)).toEqual(AVATAR_LAYER_ORDER.filter((l) => l !== "hat"));
    const by = Object.fromEntries(slots.map((s) => [s.layer, s]));
    expect(by.body.ids).toEqual(["body:peach", "body"]);
    expect(by.body.tint).toBe("#F1C7A5");
    expect(by["hair-front"].tint).toBe(avatar.hairColor);
    expect(by.arms).toMatchObject({ ids: ["arms:typing:striped-shirt", "arms:typing"], tint: avatar.coatColor });
    expect(by.eyes).toMatchObject({ ids: ["eyes:focus"], head: true });
    expect(by.accessory.ids).toEqual(["accessory:glasses"]);
    expect(by["hair-back"].optional).toBe(true);
  });

  it("picks the focus pose from the study tool", () => {
    expect(focusArmPose("quill-logbook")).toBe("writing");
    expect(focusArmPose("tablet")).toBe("writing");
    expect(focusArmPose("mech-keyboard")).toBe("typing");
  });

  it("reports a sailor complete only when every pose and face is there", () => {
    const all = new Set(avatarSheetSpec().sprites.map((s) => s.id));
    expect(missingAvatarSprites(avatar, (id) => all.has(id))).toEqual([]);
    // Per-skin bodies stand in for the tintable one; back hair is optional.
    const noBody = (id: string) => all.has(id) && id !== "body" && !id.startsWith("hair-back:");
    expect(missingAvatarSprites(avatar, noBody)).toEqual(["body"]);
    expect(missingAvatarSprites(avatar, (id) => noBody(id) || id === "body:peach")).toEqual([]);
    const missing = missingAvatarSprites(avatar, (id) => all.has(id) && id !== "arms:spyglass" && id !== "mouth:sip");
    expect(missing).toEqual(["arms:spyglass", "mouth:sip"]);
    // A laptop sailor never writes, so a missing writing pose doesn't matter.
    expect(missingAvatarSprites(avatar, (id) => all.has(id) && !id.endsWith(":writing"))).toEqual([]);
  });
});
