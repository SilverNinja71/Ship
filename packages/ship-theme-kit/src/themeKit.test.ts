import { describe, expect, it } from "vitest";
import { QUEST_BEASTS } from "@ship/shared-types";
import type { HullStyle, Inventory, PartKind } from "@ship/shared-types";
import {
  AVATAR_CATALOGS,
  CABIN_DECOR,
  DEFAULT_AVATAR,
  EMPTY_INVENTORY,
  ENVIRONMENTS,
  FIGUREHEADS,
  PART_CATALOGS,
  SHIPS,
  STARTER_SHIP_ID,
  checkPartPurchase,
  checkShipPurchase,
  defaultLoadout,
  getShip,
  partFitsShip,
  partsForShip,
  validateAvatar,
  validateLoadout,
} from "./index.js";

const ALL_HULLS: HullStyle[] = [
  "caravel",
  "brig",
  "galleon",
  "kitchen-barge",
  "submarine",
  "battleship",
  "dreadnought",
  "ironclad",
  "trireme",
  "sky-galleon",
  "solar-ark",
  "carrier-barge",
];

const TRADEMARKED = /going merry|thousand sunny|baratie|polar tang|red force|\bnami\b/i;

describe("ships", () => {
  it("has the 16 ships from the plan, with unique ids", () => {
    expect(SHIPS).toHaveLength(16);
    expect(new Set(SHIPS.map((s) => s.id)).size).toBe(16);
    expect(SHIPS.filter((s) => s.category === "buccaneer")).toHaveLength(5);
    expect(SHIPS.filter((s) => s.category === "navy")).toHaveLength(4);
    expect(SHIPS.filter((s) => s.category === "mythic")).toHaveLength(7);
  });

  it("keeps the trademarked One Piece names out", () => {
    for (const s of SHIPS) expect(`${s.name} ${s.tagline}`).not.toMatch(TRADEMARKED);
  });

  it("uses every hull family at least once", () => {
    expect(new Set(SHIPS.map((s) => s.hull))).toEqual(new Set(ALL_HULLS));
  });

  it("has exactly one free starter ship", () => {
    const free = SHIPS.filter((s) => s.price === 0);
    expect(free.map((s) => s.id)).toEqual([STARTER_SHIP_ID]);
    expect(getShip(STARTER_SHIP_ID)?.levelRequired).toBe(1);
  });

  it("gives every ship default parts that exist and fit", () => {
    for (const ship of SHIPS) {
      const check = validateLoadout(defaultLoadout(ship));
      expect(check.issues, ship.id).toEqual([]);
    }
  });

  it("gives every ship a known environment, valid colors and a cabin decor item", () => {
    for (const ship of SHIPS) {
      expect(ENVIRONMENTS[ship.environment], ship.id).toBeDefined();
      for (const color of Object.values(ship.palette)) expect(color).toMatch(/^#[0-9A-F]{6}$/i);
      expect(CABIN_DECOR[ship.id], ship.id).toBeTruthy();
    }
  });

  it("prices ships so higher level gates cost at least as much as lower ones in the same category", () => {
    for (const category of ["buccaneer", "navy", "mythic"] as const) {
      const ships = SHIPS.filter((s) => s.category === category).sort((a, b) => a.levelRequired - b.levelRequired);
      for (let i = 1; i < ships.length; i++) {
        if (ships[i].levelRequired > ships[i - 1].levelRequired) {
          expect(ships[i].price, ships[i].id).toBeGreaterThanOrEqual(ships[i - 1].price);
        }
      }
    }
  });
});

describe("catalogs", () => {
  it("has unique ids and sane prices in every catalog", () => {
    const catalogs = [...Object.values(PART_CATALOGS), ...Object.values(AVATAR_CATALOGS)];
    for (const catalog of catalogs) {
      expect(new Set(catalog.map((i) => i.id)).size).toBe(catalog.length);
      for (const item of catalog) {
        if (item.source === "shop") expect(item.price).toBeGreaterThan(0);
        else expect(item.price).toBe(0);
        expect(item.levelRequired).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("makes every quest reward a quest-only figurehead", () => {
    for (const beast of QUEST_BEASTS) {
      const fh = FIGUREHEADS.find((f) => f.id === beast.reward);
      expect(fh?.source).toBe("quest");
      expect(fh?.questBeast).toBe(beast.id);
    }
  });

  it("builds the default avatar only from starter items", () => {
    expect(validateAvatar(DEFAULT_AVATAR, EMPTY_INVENTORY).ok).toBe(true);
  });
});

describe("validateLoadout", () => {
  const corsair = getShip("crimson-corsair")!;
  const sunfish = getShip("sunfish")!;

  it("rejects an unknown ship and falls back to the starter loadout", () => {
    const check = validateLoadout({ ...defaultLoadout(corsair), shipId: "flying-dutchman" });
    expect(check.ok).toBe(false);
    expect(check.issues[0]).toMatchObject({ part: "ship", reason: "unknown" });
    expect(check.loadout).toEqual(defaultLoadout(getShip(STARTER_SHIP_ID)!));
  });

  it("rejects a ship the player hasn't bought", () => {
    const check = validateLoadout(defaultLoadout(corsair), EMPTY_INVENTORY);
    expect(check.issues[0]).toMatchObject({ part: "ship", reason: "not-owned" });
  });

  it("lets a ship use its own default parts without buying them", () => {
    const inv: Inventory = { ...EMPTY_INVENTORY, ships: ["crimson-corsair"] };
    expect(validateLoadout(defaultLoadout(corsair), inv).ok).toBe(true);
  });

  it("does not lend one ship's default parts to another ship", () => {
    const inv: Inventory = { ...EMPTY_INVENTORY, ships: ["crimson-corsair"] };
    const starter = defaultLoadout(getShip(STARTER_SHIP_ID)!);
    const check = validateLoadout({ ...starter, figurehead: "eagle" }, inv);
    expect(check.issues).toEqual([expect.objectContaining({ part: "figurehead", reason: "not-owned" })]);
    expect(check.loadout.figurehead).toBe("ram");
  });

  it("keeps sails and figureheads off the submarine and repairs the loadout", () => {
    const check = validateLoadout({ ...defaultLoadout(sunfish), sails: "square", figurehead: "lion" });
    expect(check.issues.map((i) => [i.part, i.reason])).toEqual([
      ["sails", "incompatible"],
      ["figurehead", "incompatible"],
    ]);
    expect(check.loadout).toEqual(defaultLoadout(sunfish));
  });

  it("flags unknown part ids", () => {
    const check = validateLoadout({ ...defaultLoadout(corsair), flag: "rainbow" as never });
    expect(check.issues).toEqual([expect.objectContaining({ part: "flag", reason: "unknown" })]);
  });

  it("accepts bought parts and quest figureheads from the inventory", () => {
    const inv: Inventory = {
      ships: ["crimson-corsair"],
      parts: ["sails:feathered", "figurehead:kraken"],
      avatarItems: [],
    };
    const check = validateLoadout({ ...defaultLoadout(corsair), sails: "feathered", figurehead: "kraken" }, inv);
    expect(check.ok).toBe(true);
  });

  it("lists only parts that fit", () => {
    const kinds: PartKind[] = ["sails", "figurehead", "flag", "desk"];
    for (const ship of SHIPS) {
      for (const kind of kinds) {
        for (const part of partsForShip(ship, kind)) expect(partFitsShip(ship, kind, part.id)).toBe(true);
      }
    }
    expect(partsForShip(sunfish, "sails").map((p) => p.id)).toEqual(["none"]);
  });
});

describe("purchases", () => {
  const wallet = { doubloons: 1000, level: 3, inventory: EMPTY_INVENTORY };

  it("needs the level, then the doubloons", () => {
    expect(checkShipPurchase("crimson-corsair", wallet)).toMatchObject({ ok: false, reason: "level" });
    expect(checkShipPurchase("golden-mane", wallet)).toMatchObject({ ok: false, reason: "funds" });
    expect(checkShipPurchase("floating-galley", wallet)).toEqual({ ok: true, price: 900 });
  });

  it("won't sell what you own or what only quests give", () => {
    expect(checkShipPurchase(STARTER_SHIP_ID, wallet)).toMatchObject({ ok: false, reason: "owned" });
    expect(checkPartPurchase("figurehead", "kraken", wallet)).toMatchObject({ ok: false, reason: "not-for-sale" });
    expect(checkPartPurchase("sails", "square", wallet)).toMatchObject({ ok: false, reason: "owned" });
  });
});

describe("validateAvatar", () => {
  it("repairs bad names, colors and items", () => {
    const check = validateAvatar({ ...DEFAULT_AVATAR, name: "   ", hairColor: "red", hat: "crown" as never });
    expect(check.ok).toBe(false);
    expect(check.avatar.name).toBe(DEFAULT_AVATAR.name);
    expect(check.avatar.hairColor).toMatch(/^#/);
    expect(check.avatar.hat).toBe(DEFAULT_AVATAR.hat);
  });

  it("requires shop items to be owned", () => {
    const avatar = { ...DEFAULT_AVATAR, hat: "tricorn" as const };
    expect(validateAvatar(avatar, EMPTY_INVENTORY).ok).toBe(false);
    expect(validateAvatar(avatar, { ...EMPTY_INVENTORY, avatarItems: ["hat:tricorn"] }).ok).toBe(true);
  });
});
