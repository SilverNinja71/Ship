// Doubloons, XP and what the sailor owns.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ROOM_LIMITS, levelForXp } from "@ship/shared-types";
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
import { dayKey } from "../lib/voyageLogic.js";
import { getKawaiiTheme } from "../ship-engine/kawaiiThemes.js";
import type { KawaiiThemeId } from "../ship-engine/kawaiiThemes.js";
import { useUi } from "./uiStore.js";

export interface LedgerEntry {
  id: string;
  at: number;
  doubloons: number;
  xp: number;
  reason: string;
}

/** What Study Rooms have paid on one local day, kept under ROOM_LIMITS.dailyRewards. */
export interface RoomEarnings {
  day: string;
  doubloons: number;
  xp: number;
}

export interface EconomyState {
  doubloons: number;
  xp: number;
  inventory: Inventory;
  /** Lookout reward ids already paid, so a re-sent event never pays twice. */
  paidRewardIds: string[];
  unlockedThemes: KawaiiThemeId[];
  ledger: LedgerEntry[];
  roomEarnings: RoomEarnings;
  earn(doubloons: number, xp: number, reason: string): void;
  buyShip(shipId: string): PurchaseCheck;
  buyPart(kind: PartKind, id: string): PurchaseCheck;
  buyAvatarItem(kind: AvatarItemKind, id: string): PurchaseCheck;
  buyTheme(themeId: KawaiiThemeId): { ok: true } | { ok: false; message: string };
  /** Quest rewards: added for free. Returns false if it was already owned. */
  grantPart(kind: PartKind, id: string): boolean;
  /** Pays each new Lookout event once; returns the ids now settled (new and already paid) for acking. */
  payLookoutRewards(events: readonly LookoutRewardEvent[]): string[];
  /**
   * Pays once per id (paidRewardIds, as payLookoutRewards does) and keeps room rewards inside
   * ROOM_LIMITS.dailyRewards for the local day. Returns what it paid, which is 0 and 0 once today's
   * room chest is full, or null when the id was already paid.
   */
  earnOnce(id: string, doubloons: number, xp: number, reason: string, opts?: { roomCap?: boolean }): { doubloons: number; xp: number } | null;
}

const MAX_LEDGER = 200;
const MAX_PAID_IDS = 1000;
const NO_ROOM_EARNINGS: RoomEarnings = { day: "", doubloons: 0, xp: 0 };

/** Whole, non-negative coins: a broken or negative amount pays nothing. */
const amount = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

// The "chest is full" toast shows once a day per page load, not once per capped reward.
let chestFullToastDay = "";

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
        unlockedThemes: ["matcha-cafe", "mossy-woodland"],
        ledger: [],
        roomEarnings: NO_ROOM_EARNINGS,

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

        buyTheme: (themeId) => {
          const theme = getKawaiiTheme(themeId);
          const unlocked = get().unlockedThemes;
          if (unlocked.includes(themeId) || theme.price === 0) {
            if (!unlocked.includes(themeId)) set({ unlockedThemes: [...unlocked, themeId] });
            return { ok: true };
          }
          if (get().doubloons < theme.price) {
            return { ok: false, message: `Need ${theme.price} doubloons to unlock ${theme.name}.` };
          }
          set({
            doubloons: get().doubloons - theme.price,
            unlockedThemes: [...unlocked, themeId],
            ledger: record(-theme.price, 0, `Unlocked ${theme.name} theme`),
          });
          return { ok: true };
        },

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

        earnOnce: (id, doubloons, xp, reason, opts) => {
          const s = get();
          if (!id || s.paidRewardIds.includes(id)) return null;
          let paid = { doubloons: amount(doubloons), xp: amount(xp) };
          let roomEarnings = s.roomEarnings;
          if (opts?.roomCap) {
            const today = dayKey(Date.now());
            // A missing or garbled tally (say, synced from an older device) counts as a fresh day instead of crashing.
            const valid = roomEarnings?.day === today && amount(roomEarnings.doubloons) === roomEarnings.doubloons && amount(roomEarnings.xp) === roomEarnings.xp;
            const sofar = valid ? roomEarnings : { day: today, doubloons: 0, xp: 0 };
            const cap = ROOM_LIMITS.dailyRewards;
            const capped = {
              doubloons: Math.min(paid.doubloons, Math.max(0, cap.doubloons - sofar.doubloons)),
              xp: Math.min(paid.xp, Math.max(0, cap.xp - sofar.xp)),
            };
            if ((capped.doubloons < paid.doubloons || capped.xp < paid.xp) && chestFullToastDay !== today) {
              chestFullToastDay = today;
              useUi.getState().toast("Today's room treasure chest is full. Studying still pays!", "info");
            }
            paid = capped;
            roomEarnings = { day: today, doubloons: sofar.doubloons + paid.doubloons, xp: sofar.xp + paid.xp };
          }
          // The id is settled even when the chest was full, so a later day (or another device) never pays it.
          set({
            paidRewardIds: [...s.paidRewardIds, id].slice(-MAX_PAID_IDS),
            doubloons: s.doubloons + paid.doubloons,
            xp: s.xp + paid.xp,
            roomEarnings,
            ledger: paid.doubloons || paid.xp ? record(paid.doubloons, paid.xp, reason) : s.ledger,
          });
          return paid;
        },
      };
    },
    {
      name: storageKey("economy"),
      storage: shipStorage,
      version: 1,
      partialize: ({ doubloons, xp, inventory, paidRewardIds, unlockedThemes, ledger, roomEarnings }) => ({ doubloons, xp, inventory, paidRewardIds, unlockedThemes, ledger, roomEarnings }),
    },
  ),
);

export const selectLevel = (s: Pick<EconomyState, "xp">) => levelForXp(s.xp);
