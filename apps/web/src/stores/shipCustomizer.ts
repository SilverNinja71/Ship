// Which ship the sailor commands, the parts on each ship, and their outfit.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AvatarLoadout, Inventory, PartKind, ShipDefinition, ShipLoadout } from "@ship/shared-types";
import { DEFAULT_AVATAR, STARTER_SHIP_ID, defaultLoadout, shipOrStarter, validateAvatar, validateLoadout } from "@ship/ship-theme-kit";
import { shipStorage, storageKey } from "../lib/storage.js";

export interface CustomizerState {
  activeShipId: string;
  /** Parts per ship, so switching ships keeps each one's look. */
  loadouts: Record<string, ShipLoadout>;
  avatar: AvatarLoadout;
  setActiveShip(shipId: string): void;
  equip(kind: PartKind, id: string): void;
  setAvatar(patch: Partial<AvatarLoadout>): void;
}

export const useCustomizer = create<CustomizerState>()(
  persist(
    (set, get) => ({
      activeShipId: STARTER_SHIP_ID,
      loadouts: {},
      avatar: DEFAULT_AVATAR,
      setActiveShip: (shipId) => set({ activeShipId: shipOrStarter(shipId).id }),
      equip: (kind, id) => {
        const ship = shipOrStarter(get().activeShipId);
        const current = get().loadouts[ship.id] ?? defaultLoadout(ship);
        set({ loadouts: { ...get().loadouts, [ship.id]: { ...current, [kind]: id } } });
      },
      setAvatar: (patch) => set({ avatar: { ...get().avatar, ...patch } }),
    }),
    { name: storageKey("customizer"), storage: shipStorage, version: 1 },
  ),
);

export interface ActiveShip {
  ship: ShipDefinition;
  loadout: ShipLoadout;
}

/**
 * The ship and loadout to draw, after checking them against what the sailor
 * owns: anything not owned (or no longer fitting) falls back to the defaults.
 */
export function resolveActiveShip(state: Pick<CustomizerState, "activeShipId" | "loadouts">, inventory: Inventory): ActiveShip {
  const ship = shipOrStarter(state.activeShipId);
  const wanted = state.loadouts[ship.id] ?? defaultLoadout(ship);
  const { loadout } = validateLoadout(wanted, inventory);
  return { ship: shipOrStarter(loadout.shipId), loadout };
}

export function resolveAvatar(avatar: AvatarLoadout, inventory: Inventory): AvatarLoadout {
  return validateAvatar(avatar, inventory).avatar;
}
