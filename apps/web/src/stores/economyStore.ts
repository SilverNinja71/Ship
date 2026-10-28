// Doubloons, XP and what the sailor owns.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { levelForXp } from "@ship/shared-types";
import type { AvatarItemKind, Inventory, LookoutRewardEvent, PartKind } from "@ship/shared-types";
import {
  EMPTY_INVENTORY,
  avatarItemKey,
  checkAvatarPurchase,
  checkPartPurchase,
  checkShipPurchase,
  getAvatarItem,
  getPart,
  getShip,
  partKey,
} from "@ship/ship-theme-kit";
import type { PurchaseCheck } from "@ship/ship-theme-kit";
import { newId } from "../lib/ids.js";
import { shipStorage, storageKey } from "../lib/storage.js";

export interface LedgerEntry {
  id: string;
  at: number;
  doubloons: number;
  xp: number;
  reason: string;
}

export interface EconomyState {
  doubloons: number;
  xp: number;
  inventory: Inventory;
  /** Lookout reward ids already paid, so a re-sent event never pays twice. */
  paidRewardIds: string[];
  ledger: LedgerEntry[];
  earn(doubloons: number, xp: number, reason: string): void;
  buyShip(shipId: string): PurchaseCheck;
  buyPart(kind: PartKind, id: string): PurchaseCheck;
  buyAvatarItem(kind: AvatarItemKind, id: string): PurchaseCheck;
  /** Quest rewards: added for free. Returns false if it was already owned. */
  grantPart(kind: PartKind, id: string): boolean;
  /** Pays each new Lookout event once; returns the ids now settled (new and already paid) for acking. */
  payLookoutRewards(events: readonly LookoutRewardEvent[]): string[];
}

const MAX_LEDGER = 200;
const MAX_PAID_IDS = 1000;

export const useEconomy = create<EconomyState>()(
  persist(
    (set, get) => {
      const record = (doubloons: number, xp: number, reason: string) =>
        [...get().ledger, { id: newId(), at: Date.now(), doubloons, xp, reason }].slice(-MAX_LEDGER);

      const spend = (check: PurchaseCheck, reason: string, add: (inv: Inventory) => Inventory): PurchaseCheck => {
        if (!check.ok) return check;
        set({ doubloons: get().doubloons - check.price, inventory: add(get().inventory), ledger: record(-check.price, 0, reason) });
        return check;
      };

      const wallet = () => ({ doubloons: get().doubloons, level: levelForXp(get().xp), inventory: get().inventory });

      return {
        doubloons: 0,
        xp: 0,
        inventory: EMPTY_INVENTORY,
        paidRewardIds: [],
        ledger: [],

        earn: (doubloons, xp, reason) => {
          if (doubloons === 0 && xp === 0) return;
          set({ doubloons: get().doubloons + doubloons, xp: get().xp + xp, ledger: record(doubloons, xp, reason) });
        },

        buyShip: (shipId) =>
          spend(checkShipPurchase(shipId, wallet()), `Bought the ${getShip(shipId)?.name ?? shipId}`, (inv) => ({
            ...inv,
            ships: [...inv.ships, shipId],
          })),

        buyPart: (kind, id) =>
          spend(checkPartPurchase(kind, id, wallet()), `Bought ${getPart(kind, id)?.name ?? id}`, (inv) => ({
            ...inv,
            parts: [...inv.parts, partKey(kind, id)],
          })),

        buyAvatarItem: (kind, id) =>
          spend(checkAvatarPurchase(kind, id, wallet()), `Bought ${getAvatarItem(kind, id)?.name ?? id}`, (inv) => ({
            ...inv,
            avatarItems: [...inv.avatarItems, avatarItemKey(kind, id)],
          })),

        grantPart: (kind, id) => {
          const key = partKey(kind, id);
          if (get().inventory.parts.includes(key)) return false;
          set({ inventory: { ...get().inventory, parts: [...get().inventory.parts, key] } });
          return true;
        },

        payLookoutRewards: (events) => {
          const paid = new Set(get().paidRewardIds);
          let doubloons = 0;
          const fresh: string[] = [];
          for (const e of events) {
            if (paid.has(e.id)) continue;
            paid.add(e.id);
            fresh.push(e.id);
            if (Number.isFinite(e.doubloons) && e.doubloons > 0) doubloons += Math.floor(e.doubloons);
          }
          if (fresh.length) {
            set({
              paidRewardIds: [...paid].slice(-MAX_PAID_IDS),
              doubloons: get().doubloons + doubloons,
              ledger: doubloons ? record(doubloons, 0, "The Lookout: steered back to the ship") : get().ledger,
            });
          }
          return events.map((e) => e.id);
        },
      };
    },
    {
      name: storageKey("economy"),
      storage: shipStorage,
      version: 1,
      partialize: ({ doubloons, xp, inventory, paidRewardIds, ledger }) => ({ doubloons, xp, inventory, paidRewardIds, ledger }),
    },
  ),
);

export const selectLevel = (s: Pick<EconomyState, "xp">) => levelForXp(s.xp);
