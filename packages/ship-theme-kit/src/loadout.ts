// What may go on which ship, what the player owns, and what they can buy.

import type { AvatarItemKind, AvatarLoadout, Inventory, PartKind, ShipDefinition, ShipLoadout } from "@ship/shared-types";
import { AVATAR_CATALOGS, DEFAULT_AVATAR, HAIR_COLORS, COAT_COLORS, SKIN_TONES, avatarItemKey, getAvatarItem } from "./avatar.js";
import { FIGUREHEAD_HULLS, PART_CATALOGS, getPart, partKey } from "./parts.js";
import type { CatalogItem } from "./parts.js";
import { STARTER_SHIP_ID, getShip, shipOrStarter } from "./ships.js";

export const EMPTY_INVENTORY: Inventory = { ships: [], parts: [], avatarItems: [] };

export function defaultLoadout(ship: ShipDefinition): ShipLoadout {
  return {
    shipId: ship.id,
    sails: ship.defaultSails,
    figurehead: ship.defaultFigurehead,
    flag: ship.defaultFlag,
    desk: ship.defaultDesk,
  };
}

/** Engine ships and the submarine have nowhere to hang canvas. */
export function shipCanFitSails(ship: ShipDefinition): boolean {
  return ship.mastCount > 0 && ship.defaultSails !== "none";
}

export function shipCanFitFigurehead(ship: ShipDefinition): boolean {
  return FIGUREHEAD_HULLS.has(ship.hull);
}

/** Whether a part physically fits a ship, ignoring ownership. */
export function partFitsShip(ship: ShipDefinition, kind: PartKind, id: string): boolean {
  if (kind === "sails") return shipCanFitSails(ship) || id === "none";
  if (kind === "figurehead") return shipCanFitFigurehead(ship) || id === "none";
  return true;
}

/** Catalog items of one kind that fit a ship, for the Shipwright's lists. */
export function partsForShip(ship: ShipDefinition, kind: PartKind): CatalogItem[] {
  return (PART_CATALOGS[kind] as readonly CatalogItem[]).filter((p) => partFitsShip(ship, kind, p.id));
}

export function ownsShip(inventory: Inventory, shipId: string): boolean {
  const ship = getShip(shipId);
  if (!ship) return false;
  return ship.price === 0 || inventory.ships.includes(shipId);
}

/**
 * Starter parts belong to everyone, and a ship's own default parts come with
 * it (only on that ship). Everything else must be in the inventory.
 */
export function ownsPart(inventory: Inventory, kind: PartKind, id: string, onShip?: ShipDefinition): boolean {
  const part = getPart(kind, id);
  if (!part) return false;
  if (part.source === "starter") return true;
  if (onShip && defaultLoadout(onShip)[kind] === id) return true;
  return inventory.parts.includes(partKey(kind, id));
}

export function ownsAvatarItem(inventory: Inventory, kind: AvatarItemKind, id: string): boolean {
  const item = getAvatarItem(kind, id);
  if (!item) return false;
  return item.source === "starter" || inventory.avatarItems.includes(avatarItemKey(kind, id));
}

export type LoadoutIssueReason = "unknown" | "not-owned" | "incompatible";

export interface LoadoutIssue {
  part: "ship" | PartKind;
  id: string;
  reason: LoadoutIssueReason;
  message: string;
}

export interface LoadoutCheck {
  ok: boolean;
  issues: LoadoutIssue[];
  /** The loadout with every bad part swapped for the ship's default (or the starter ship if the ship itself is bad). */
  loadout: ShipLoadout;
}

const PART_KINDS: PartKind[] = ["sails", "figurehead", "flag", "desk"];

/**
 * Checks a loadout against the catalogs and, when an inventory is given,
 * against what the player owns. Level gates apply when buying, not when
 * equipping, so they aren't checked here.
 */
export function validateLoadout(loadout: ShipLoadout, inventory?: Inventory): LoadoutCheck {
  const issues: LoadoutIssue[] = [];
  const ship = getShip(loadout.shipId);

  if (!ship || (inventory && !ownsShip(inventory, ship.id))) {
    issues.push({
      part: "ship",
      id: loadout.shipId,
      reason: ship ? "not-owned" : "unknown",
      message: ship ? `You don't own the ${ship.name} yet.` : `There is no ship called "${loadout.shipId}".`,
    });
    return { ok: false, issues, loadout: defaultLoadout(shipOrStarter(STARTER_SHIP_ID)) };
  }

  const fixed = { ...loadout };
  const defaults = defaultLoadout(ship);
  for (const kind of PART_KINDS) {
    const id = loadout[kind];
    const part = getPart(kind, id);
    let issue: LoadoutIssue | null = null;
    if (!part) {
      issue = { part: kind, id, reason: "unknown", message: `There is no ${kind} called "${id}".` };
    } else if (!partFitsShip(ship, kind, id)) {
      issue = { part: kind, id, reason: "incompatible", message: `${part.name} doesn't fit the ${ship.name}.` };
    } else if (inventory && !ownsPart(inventory, kind, id, ship)) {
      issue = { part: kind, id, reason: "not-owned", message: `You don't own ${part.name} yet.` };
    }
    if (issue) {
      issues.push(issue);
      // PartKind names match ShipLoadout's fields, and the default always fits.
      (fixed as Record<PartKind, string>)[kind] = defaults[kind];
    }
  }
  return { ok: issues.length === 0, issues, loadout: fixed };
}

export interface AvatarCheck {
  ok: boolean;
  issues: { part: AvatarItemKind | "skin" | "name" | "color"; id: string; message: string }[];
  avatar: AvatarLoadout;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
export const MAX_SAILOR_NAME = 24;

export function validateAvatar(avatar: AvatarLoadout, inventory?: Inventory): AvatarCheck {
  const issues: AvatarCheck["issues"] = [];
  const fixed = { ...avatar };

  const name = avatar.name.trim().slice(0, MAX_SAILOR_NAME);
  if (!name) issues.push({ part: "name", id: avatar.name, message: "Your sailor needs a name." });
  fixed.name = name || DEFAULT_AVATAR.name;

  if (!SKIN_TONES.some((s) => s.id === avatar.skin)) {
    issues.push({ part: "skin", id: avatar.skin, message: `Unknown skin tone "${avatar.skin}".` });
    fixed.skin = DEFAULT_AVATAR.skin;
  }
  // Any hex color works; the swatches are only suggestions.
  if (!HEX_COLOR.test(avatar.hairColor)) {
    issues.push({ part: "color", id: avatar.hairColor, message: "Hair color must look like #a1b2c3." });
    fixed.hairColor = HAIR_COLORS[0];
  }
  if (!HEX_COLOR.test(avatar.coatColor)) {
    issues.push({ part: "color", id: avatar.coatColor, message: "Coat color must look like #a1b2c3." });
    fixed.coatColor = COAT_COLORS[0];
  }

  for (const kind of Object.keys(AVATAR_CATALOGS) as AvatarItemKind[]) {
    const id = avatar[kind];
    const item = getAvatarItem(kind, id);
    if (!item) {
      issues.push({ part: kind, id, message: `There is no ${kind} called "${id}".` });
    } else if (inventory && !ownsAvatarItem(inventory, kind, id)) {
      issues.push({ part: kind, id, message: `You don't own ${item.name} yet.` });
    } else {
      continue;
    }
    (fixed as Record<AvatarItemKind, string>)[kind] = DEFAULT_AVATAR[kind];
  }
  return { ok: issues.length === 0, issues, avatar: fixed };
}

export interface Wallet {
  doubloons: number;
  level: number;
  inventory: Inventory;
}

export type PurchaseCheck =
  | { ok: true; price: number }
  | { ok: false; reason: "owned" | "level" | "funds" | "not-for-sale"; message: string };

/** Ships and parts share the same rules: not owned, level reached, enough doubloons, and actually for sale. */
export function checkPurchase(
  item: Pick<CatalogItem, "name" | "price" | "levelRequired"> & { source?: CatalogItem["source"] },
  owned: boolean,
  wallet: Pick<Wallet, "doubloons" | "level">,
): PurchaseCheck {
  if (owned) return { ok: false, reason: "owned", message: `You already own ${item.name}.` };
  if (item.source === "quest") {
    return { ok: false, reason: "not-for-sale", message: `${item.name} can only be won on a crew quest.` };
  }
  if (wallet.level < item.levelRequired) {
    return { ok: false, reason: "level", message: `Reach level ${item.levelRequired} to unlock ${item.name}.` };
  }
  if (wallet.doubloons < item.price) {
    const short = item.price - wallet.doubloons;
    return { ok: false, reason: "funds", message: `${item.name} costs ${item.price} doubloons. You need ${short} more.` };
  }
  return { ok: true, price: item.price };
}

export function checkShipPurchase(shipId: string, wallet: Wallet): PurchaseCheck {
  const ship = getShip(shipId);
  if (!ship) return { ok: false, reason: "not-for-sale", message: `There is no ship called "${shipId}".` };
  return checkPurchase(ship, ownsShip(wallet.inventory, shipId), wallet);
}

export function checkPartPurchase(kind: PartKind, id: string, wallet: Wallet): PurchaseCheck {
  const part = getPart(kind, id);
  if (!part) return { ok: false, reason: "not-for-sale", message: `There is no ${kind} called "${id}".` };
  return checkPurchase(part, ownsPart(wallet.inventory, kind, id), wallet);
}

export function checkAvatarPurchase(kind: AvatarItemKind, id: string, wallet: Wallet): PurchaseCheck {
  const item = getAvatarItem(kind, id);
  if (!item) return { ok: false, reason: "not-for-sale", message: `There is no ${kind} called "${id}".` };
  return checkPurchase(item, ownsAvatarItem(wallet.inventory, kind, id), wallet);
}
