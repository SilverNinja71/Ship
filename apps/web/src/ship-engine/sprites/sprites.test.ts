import { afterEach, describe, expect, it } from "vitest";
import { AVATAR_LAYER_ORDER, SHIP_SPRITE, SPRITE_FOLDERS, citrusSpriteId, deskSpriteId, sailSpriteId } from "@ship/shared-types";
import type { AvatarLoadout, AvatarState, SpriteManifest, SpriteRef } from "@ship/shared-types";
import { DEFAULT_AVATAR, avatarSheetSpec, defaultLoadout, getShip, propsSheetSpec, shipSheetSpec } from "@ship/ship-theme-kit";
import { drawShip, shipLayout } from "../../ships/index.js";
import { drawStudyStation } from "../AvatarRenderer.js";
import { computePose } from "../avatar/pose.js";
import { drawCitrusTree } from "../props.js";
import type { Ctx, FrameInfo } from "../types.js";
import { STILL_FRAME } from "../types.js";
import { avatarSpritesReady, spriteFrameOf } from "./avatar.js";
import { drawBand } from "./paint.js";
import { sailScale } from "./ship.js";
import { SpriteStore, sprites } from "./store.js";
import type { Sprite, SpriteIO } from "./store.js";

// ---------------------------------------------------------------------------
// A fake 2D context that accepts everything and records which images get drawn.

interface FakeImage {
  name: string;
}

function fakeContext(): { ctx: Ctx; drawn: string[]; calls: string[] } {
  const drawn: string[] = [];
  const calls: string[] = [];
  const props: Record<string | symbol, unknown> = {};
  const gradient = { addColorStop: () => {} };
  const ctx = new Proxy(
    {},
    {
      get(_t, key) {
        if (key in props) return props[key];
        if (typeof key === "string" && key.startsWith("create")) return () => gradient;
        if (key === "measureText") return () => ({ width: 10 });
        if (key === "getTransform") return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
        if (key === "getLineDash") return () => [];
        return (...args: unknown[]) => {
          if (key === "drawImage") drawn.push((args[0] as FakeImage).name ?? "canvas");
          calls.push(String(key));
        };
      },
      set(_t, key, value) {
        props[key] = value;
        return true;
      },
    },
  ) as Ctx;
  return { ctx, drawn, calls };
}

const image = (name: string) => ({ name }) as unknown as CanvasImageSource;

/** A sheet where every sprite the spec asks for exists, at the spec's size. */
function fullSheet(folder: string, refs: { id: string; width: number; height: number; anchor: { x: number; y: number }; tintable?: boolean }[], kind: SpriteManifest["kind"], extra: Partial<SpriteManifest> = {}): void {
  const sprites_: SpriteRef[] = refs.map((r) => ({ id: r.id, file: `${r.id}.png`, width: r.width, height: r.height, anchorX: r.anchor.x, anchorY: r.anchor.y, ...(r.tintable ? { tintable: true } : {}) }));
  const manifest: SpriteManifest = { version: 1, kind, sprites: sprites_, ...extra };
  sprites.add(folder, manifest, new Map(sprites_.map((s) => [s.id, image(`${folder}/${s.id}`)])));
}

const woolly = getShip("woolly-wanderer")!;

afterEach(() => sprites.clear());

// ---------------------------------------------------------------------------

describe("SpriteStore", () => {
  const manifest = (sprites_: SpriteRef[]): SpriteManifest => ({ version: 1, kind: "props", sprites: sprites_ });
  const bell: SpriteRef = { id: "bell", file: "bell.png", width: 64, height: 64, anchorX: 32, anchorY: 0 };

  function fakeIO(files: Record<string, unknown>, badImages: string[] = []) {
    const fetched: string[] = [];
    const warnings: string[] = [];
    const io: SpriteIO = {
      async fetchJson(url) {
        fetched.push(url);
        if (!(url in files)) throw new Error("404");
        return files[url];
      },
      async loadImage(url) {
        fetched.push(url);
        if (badImages.includes(url)) throw new Error("broken");
        return image(url);
      },
      warn: (m) => warnings.push(m),
    };
    return { io, fetched, warnings };
  }

  it("loads a listed sheet on first request and bumps its version", async () => {
    const { io, fetched } = fakeIO({ "/a/index.json": { version: 1, sheets: ["props"] }, "/a/props/manifest.json": manifest([bell]) });
    const store = new SpriteStore("/a/", io);
    expect(store.sheet("props")).toBeUndefined();
    await store.start();
    expect(fetched).toEqual(["/a/index.json"]);
    expect(store.sheet("props")).toBeUndefined();
    await store.idle();
    expect(store.version).toBe(1);
    expect(store.sprite("props", "bell")).toMatchObject({ id: "bell", anchorY: 0, image: { name: "/a/props/bell.png" } });
    // Folders without art are never fetched.
    expect(store.sheet("flags")).toBeUndefined();
    await store.idle();
    expect(fetched).toEqual(["/a/index.json", "/a/props/manifest.json", "/a/props/bell.png"]);
  });

  it("drops sprites that fail validation or fail to load, and says why", async () => {
    const huge = { ...bell, id: "helm-stand", file: "helm.png" };
    const fruit: SpriteRef = { id: "citrus-fruit", file: "fruit.png", width: 28, height: 28, anchorX: 14, anchorY: 14 };
    const { io, warnings } = fakeIO(
      { "/index.json": { version: 1, sheets: ["props"] }, "/props/manifest.json": manifest([bell, huge, fruit]) },
      ["/props/fruit.png"],
    );
    const store = new SpriteStore("/", io);
    await store.preloadAll();
    const sheet = store.sheet("props")!;
    expect([...sheet.sprites.keys()]).toEqual(["bell"]);
    expect(warnings).toEqual(["Sprites props (helm-stand): Must be 64 × 80, not 64 × 64.", "Sprites props: couldn't load fruit.png."]);
  });

  it("gives up quietly on a missing index or a broken manifest, and doesn't retry", async () => {
    const none = fakeIO({});
    const empty = new SpriteStore("/", none.io);
    await empty.preloadAll();
    expect(none.fetched).toEqual(["/index.json"]);

    const broken = fakeIO({ "/index.json": { version: 1, sheets: ["flags"] }, "/flags/manifest.json": { version: 9 } });
    const store = new SpriteStore("/", broken.io);
    await store.preloadAll();
    expect(store.sheet("flags")).toBeUndefined();
    await store.idle();
    expect(broken.fetched.filter((u) => u.endsWith("manifest.json"))).toHaveLength(1);
    expect(broken.warnings[0]).toContain(`"version" must be 1.`);
  });
});

describe("sprite ships", () => {
  const frame: FrameInfo = { ...STILL_FRAME, wind: 1 };

  it("stays procedural until the hull layers and rigging have all arrived", () => {
    const spec = shipSheetSpec(woolly.id).sprites.filter((s) => s.id !== SHIP_SPRITE.rigging);
    fullSheet(SPRITE_FOLDERS.ship(woolly.id), spec, "ship");
    const { ctx, drawn } = fakeContext();
    drawShip(ctx, woolly, defaultLoadout(woolly), frame);
    expect(drawn).toEqual([]);
  });

  it("stacks hull, rigging, sails, sailors, hull front, figurehead and flag by zIndex", () => {
    fullSheet(SPRITE_FOLDERS.ship(woolly.id), shipSheetSpec(woolly.id).sprites, "ship", { layout: { desk: { x: -150, y: 0 } } });
    fullSheet(SPRITE_FOLDERS.figureheads, [{ id: "ram", width: 160, height: 160, anchor: { x: 24, y: 96 } }], "figureheads");
    fullSheet(SPRITE_FOLDERS.flags, [{ id: "straw-skull", width: 120, height: 72, anchor: { x: 120, y: 0 } }], "flags");
    const sail = { width: 320, height: 320, anchor: { x: 160, y: 16 } };
    fullSheet(SPRITE_FOLDERS.sails, [{ id: sailSpriteId("square", "billowing"), ...sail }, { id: sailSpriteId("square", "furled"), ...sail }], "sails");

    const { ctx, drawn } = fakeContext();
    const layout = drawShip(ctx, woolly, defaultLoadout(woolly), frame, (l) => drawn.push(`onDeck desk@${l.desk.x}`));
    const masts = layout.masts.map(() => "sails/square:billowing");
    expect(drawn).toEqual([
      "ships/woolly-wanderer/hull-back",
      "ships/woolly-wanderer/rigging",
      ...masts,
      "onDeck desk@-150",
      "ships/woolly-wanderer/hull-front",
      "figureheads/ram",
      ...Array(24).fill("flags/straw-skull"),
    ]);
    // The hull art's own layout replaces the built-in desk spot everywhere.
    expect(shipLayout(woolly).desk).toEqual({ x: -150, y: 0 });

    const docked = fakeContext();
    drawShip(docked.ctx, woolly, defaultLoadout(woolly), { ...STILL_FRAME, wind: 0.3 });
    expect(docked.drawn.filter((d) => d.startsWith("sails/"))).toEqual(layout.masts.map(() => "sails/square:furled"));
  });

  it("fits a sail set to its mast's canvas, whichever limit is tighter", () => {
    const s = { width: 320, height: 320, anchorY: 20 };
    expect(sailScale(s, { sailTop: -480, sailFoot: -180, halfWidth: 200 })).toBeCloseTo(1);
    expect(sailScale(s, { sailTop: -480, sailFoot: -180, halfWidth: 80 })).toBeCloseTo(0.5);
    expect(sailScale({ ...s, width: 640, height: 640, anchorY: 40, density: 2 }, { sailTop: -480, sailFoot: -180, halfWidth: 200 })).toBeCloseTo(1);
  });
});

describe("sprite props", () => {
  it("hangs one fruit sprite per ripe fruit on the tree", () => {
    const props = propsSheetSpec().sprites.filter((s) => s.group === "citrus");
    fullSheet(SPRITE_FOLDERS.props, props, "props");
    const { ctx, drawn } = fakeContext();
    drawCitrusTree(ctx, { x: 0, y: 0 }, { state: "resting", fruit: 3, progress: 0, shake: 9 }, STILL_FRAME);
    expect(drawn).toEqual([`props/${citrusSpriteId("normal")}`, "props/citrus-fruit", "props/citrus-fruit", "props/citrus-fruit"]);
  });
});

describe("sprite sailors", () => {
  const avatar: AvatarLoadout = { ...DEFAULT_AVATAR, accessory: "glasses" };

  it("maps the procedural pose to sprite variants", () => {
    const at = (state: AvatarState, t = 0) => spriteFrameOf(computePose(state, avatar.tool, t, 1, false), avatar.tool);
    expect(at("SAILING_FOCUS").arms).toBe("writing");
    expect(spriteFrameOf(computePose("SAILING_FOCUS", "laptop", 0, 1, true), "laptop").arms).toBe("typing");
    expect(at("DRIFTING_IDLE")).toEqual({ arms: "resting", eyes: "sleep", mouth: "sleep" });
    const breaks = new Set<string>();
    for (let t = 0; t < 40; t += 0.5) breaks.add(at("SHORE_LEAVE_BREAK", t).arms);
    expect([...breaks].sort()).toEqual(["relaxed", "sipping", "spyglass", "stretching"]);
  });

  it("switches a sailor to sprites only when their whole set is there", () => {
    const all = avatarSheetSpec().sprites;
    fullSheet(SPRITE_FOLDERS.avatar, all.filter((s) => s.id !== "mouth:sip"), "avatar");
    expect(avatarSpritesReady(avatar)).toBe(false);
    fullSheet(SPRITE_FOLDERS.avatar, all, "avatar");
    expect(avatarSpritesReady(avatar)).toBe(true);
  });

  it("stacks the layers in order, with the desk right after the coat", () => {
    fullSheet(SPRITE_FOLDERS.avatar, avatarSheetSpec().sprites, "avatar");
    fullSheet(SPRITE_FOLDERS.props, propsSheetSpec().sprites.filter((s) => s.id === deskSpriteId("captains-desk")), "props");
    const { ctx, drawn } = fakeContext();
    drawStudyStation(ctx, { avatar, state: "SAILING_FOCUS", desk: "captains-desk", at: { x: 0, y: 0 } }, { ...STILL_FRAME, t: 0.3 });
    const layers = drawn.map((d) => d.replace(/^avatars\//, "").replace(/^props\/desk:.*/, "desk").split(":")[0]);
    const expected = AVATAR_LAYER_ORDER.flatMap((l) => (l === "coat" ? ["coat", "desk"] : [l]));
    expect(layers).toEqual(expected);
    expect(drawn).toContain("avatars/eyes:focus");
    expect(drawn).toContain("avatars/arms:writing");
  });
});

describe("drawBand", () => {
  it("tiles across the width and stretches the bottom row down", () => {
    const { ctx, drawn } = fakeContext();
    const s: Sprite = { id: "waves-mid", file: "w.png", width: 100, height: 50, anchorX: 0, anchorY: 10, image: image("wave") };
    drawBand(ctx, s, { y: 200, scale: 1, scroll: 30, width: 250, fillTo: 400 });
    // Tiles start at -30, 70, 170: three tiles, each with a stretched strip below.
    expect(drawn).toEqual(Array(6).fill("wave"));
  });
});
