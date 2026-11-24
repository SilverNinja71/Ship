import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LookoutRewardEvent } from "@ship/shared-types";
import { EMPTY_INVENTORY } from "@ship/ship-theme-kit";
import { myAvatarState } from "./activityStore.js";
import { absentGhosts, ghostStateAt } from "./crewStore.js";
import { useEconomy } from "./economyStore.js";
import { useRecall } from "./recallStore.js";
import { useRooms } from "./roomStore.js";
import { resolveActiveShip } from "./shipCustomizer.js";
import { useUi } from "./uiStore.js";
import { useVoyage } from "./voyageStore.js";
import { DOCKED } from "../lib/voyageLogic.js";

// Node has no localStorage, and without one the stores skip persisting altogether. A memory stand-in, put in
// place before they load, lets them save as in a browser, so the tests can check what each one saves.
vi.hoisted(() => {
  const map = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
  };
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
});

const event = (id: string, doubloons = 50): LookoutRewardEvent => ({ id, kind: "steer-back", doubloons, site: "youtube.com", at: 0 });

beforeEach(() => {
  useEconomy.setState({ doubloons: 0, xp: 0, inventory: EMPTY_INVENTORY, paidRewardIds: [], ledger: [], roomEarnings: { day: "", doubloons: 0, xp: 0 } });
  useRecall.setState({ decks: [], cards: [], reviewLog: [], blurts: [] });
});

describe("economy", () => {
  it("pays each Lookout reward once, and acks every id it was sent", () => {
    const pay = useEconomy.getState().payLookoutRewards;
    expect(pay([event("a"), event("b")])).toEqual(["a", "b"]);
    expect(useEconomy.getState().doubloons).toBe(100);
    // The extension re-sends until acked; repeats are acked but not paid.
    expect(pay([event("a"), event("c", 0)])).toEqual(["a", "c"]);
    expect(useEconomy.getState().doubloons).toBe(100);
  });

  it("ignores negative or broken amounts", () => {
    useEconomy.getState().payLookoutRewards([event("x", -500), event("y", Number.NaN)]);
    expect(useEconomy.getState().doubloons).toBe(0);
  });

  it("buys ships only with the level and the doubloons", () => {
    useEconomy.setState({ doubloons: 5000, xp: 0 });
    expect(useEconomy.getState().buyShip("golden-mane")).toMatchObject({ ok: false, reason: "level" });
    useEconomy.setState({ xp: 1000 });
    expect(useEconomy.getState().buyShip("golden-mane")).toEqual({ ok: true, price: 1200 });
    expect(useEconomy.getState().doubloons).toBe(3800);
    expect(useEconomy.getState().inventory.ships).toContain("golden-mane");
  });

  it("grants quest figureheads once", () => {
    expect(useEconomy.getState().grantPart("figurehead", "kraken")).toBe(true);
    expect(useEconomy.getState().grantPart("figurehead", "kraken")).toBe(false);
  });
});

describe("room rewards (earnOnce)", () => {
  afterEach(() => vi.useRealTimers());

  it("pays each id once, and only whole, positive amounts", () => {
    const earnOnce = useEconomy.getState().earnOnce;
    expect(earnOnce("room:K7MP2QXA:1:tidy:9", 5, 10, "Tidied the deck")).toEqual({ doubloons: 5, xp: 10 });
    expect(earnOnce("room:K7MP2QXA:1:tidy:9", 5, 10, "Tidied the deck")).toBeNull();
    expect(useEconomy.getState()).toMatchObject({ doubloons: 5, xp: 10 });
    expect(useEconomy.getState().paidRewardIds).toContain("room:K7MP2QXA:1:tidy:9");
    expect(useEconomy.getState().ledger.at(-1)).toMatchObject({ doubloons: 5, xp: 10, reason: "Tidied the deck" });
    expect(earnOnce("broken", -5, Number.NaN, "x")).toEqual({ doubloons: 0, xp: 0 });
    expect(useEconomy.getState()).toMatchObject({ doubloons: 5, xp: 10 });
    expect(useEconomy.getState().ledger).toHaveLength(1);
  });

  it("keeps room rewards inside today's chest, and opens a new one the next day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 24, 10, 0));
    const earnOnce = useEconomy.getState().earnOnce;
    const room = { roomCap: true };
    // The daily chest holds 60 doubloons and 150 XP.
    expect(earnOnce("a", 25, 60, "Beast", room)).toEqual({ doubloons: 25, xp: 60 });
    expect(earnOnce("b", 25, 60, "Beast", room)).toEqual({ doubloons: 25, xp: 60 });
    expect(earnOnce("c", 25, 60, "Beast", room)).toEqual({ doubloons: 10, xp: 30 });
    expect(useUi.getState().toasts.some((t) => t.text === "Today's room treasure chest is full. Studying still pays!")).toBe(true);
    expect(earnOnce("d", 20, 50, "Beast", room)).toEqual({ doubloons: 0, xp: 0 });
    // A capped reward still counts as paid, so it never pays later.
    expect(earnOnce("d", 20, 50, "Beast", room)).toBeNull();
    expect(useEconomy.getState()).toMatchObject({ doubloons: 60, xp: 150, roomEarnings: { day: "2026-11-24", doubloons: 60, xp: 150 } });
    // Rewards that aren't from rooms don't touch the chest.
    expect(earnOnce("plan", 5, 20, "Planned the day")).toEqual({ doubloons: 5, xp: 20 });
    expect(useEconomy.getState().roomEarnings).toEqual({ day: "2026-11-24", doubloons: 60, xp: 150 });

    vi.setSystemTime(new Date(2026, 10, 25, 9, 0));
    expect(earnOnce("e", 20, 50, "Beast", room)).toEqual({ doubloons: 20, xp: 50 });
    expect(useEconomy.getState().roomEarnings).toEqual({ day: "2026-11-25", doubloons: 20, xp: 50 });
    expect(useEconomy.getState()).toMatchObject({ doubloons: 85, xp: 220 });
  });

  it("saves the day's room earnings with the rest of the wallet", () => {
    const saved = useEconomy.persist.getOptions().partialize!(useEconomy.getState()) as Record<string, unknown>;
    expect(saved).toHaveProperty("roomEarnings");
  });
});

describe("study rooms store", () => {
  it("saves only the sailor's room preferences, never the live room", () => {
    const options = useRooms.persist.getOptions();
    expect(options.name).toBe("ship:rooms");
    const saved = options.partialize!(useRooms.getState()) as Record<string, unknown>;
    expect(Object.keys(saved).sort()).toEqual(
      ["current", "hidden", "hiddenRooms", "lastSailSeen", "muted", "myLook", "over13", "recent", "reported", "rulesOk"].sort(),
    );
  });
});

describe("customizer", () => {
  it("falls back to defaults for parts the sailor doesn't own", () => {
    const { ship, loadout } = resolveActiveShip({ activeShipId: "woolly-wanderer", loadouts: { "woolly-wanderer": { shipId: "woolly-wanderer", sails: "solar", figurehead: "ram", flag: "straw-skull", desk: "captains-desk" } } }, EMPTY_INVENTORY);
    expect(ship.id).toBe("woolly-wanderer");
    expect(loadout.sails).toBe("square");
  });

  it("won't sail a ship that hasn't been bought", () => {
    expect(resolveActiveShip({ activeShipId: "crimson-corsair", loadouts: {} }, EMPTY_INVENTORY).ship.id).toBe("woolly-wanderer");
  });
});

describe("recall", () => {
  it("reviews a card and logs it", () => {
    const deck = useRecall.getState().addDeck("Bio");
    const card = useRecall.getState().addCard(deck.id, "Q", "A")!;
    useRecall.getState().review(card.id, 4, 1000);
    const after = useRecall.getState().cards[0];
    expect(after.schedule.repetitions).toBe(1);
    expect(after.schedule.due).toBe(1000 + 86_400_000);
    expect(useRecall.getState().reviewLog).toEqual([{ cardId: card.id, at: 1000, rating: 4 }]);
  });

  it("merges imports by id instead of duplicating", () => {
    const deck = { id: "d", name: "D", subject: null, created: 0, source: "csv" as const };
    const card = { id: "k", deckId: "d", front: "f", back: "b", created: 0, schedule: { ease: 2.5, interval: 0, repetitions: 0, lapses: 0, due: 0, lastReviewed: null } };
    expect(useRecall.getState().importCards({ decks: [deck], cards: [card] })).toEqual({ decks: 1, cards: 1 });
    expect(useRecall.getState().importCards({ decks: [deck], cards: [{ ...card, back: "new" }] })).toEqual({ decks: 0, cards: 0 });
    expect(useRecall.getState().cards).toHaveLength(1);
    expect(useRecall.getState().cards[0].back).toBe("new");
  });
});

describe("voyage store", () => {
  it("pays minutes as they're sailed and the bonus on completion", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    useVoyage.getState().start({ presetId: "custom", focusMinutes: 3, breakMinutes: 1 });
    useVoyage.getState().tick(90_000);
    expect(useEconomy.getState().doubloons).toBe(2);
    useVoyage.getState().tick(180_000);
    expect(useVoyage.getState().phase).toBe("shore-leave");
    // 3 minutes × 2 + the 25 completion bonus.
    expect(useEconomy.getState().doubloons).toBe(31);
    expect(useVoyage.getState().records.at(-1)).toMatchObject({ completed: true, focusedMinutes: 3 });
    useVoyage.getState().tick(240_000);
    expect(useVoyage.getState().phase).toBe("docked");
    vi.useRealTimers();
  });

  describe("a crew's shared prep (prepUntil)", () => {
    const now = 1_000_000;
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(now);
      useVoyage.setState({ ...DOCKED, prepEndsAt: null, cyclesCompleted: 0 });
    });
    afterEach(() => {
      useVoyage.setState({ ...DOCKED, prepEndsAt: null, cyclesCompleted: 0 });
      vi.useRealTimers();
    });

    it("ends prep at the given time", () => {
      useVoyage.getState().start({ presetId: "custom", focusMinutes: 5, breakMinutes: 1, cycles: 2, prep: true, prepUntil: now + 20_000 });
      expect(useVoyage.getState()).toMatchObject({ phase: "docked", prepEndsAt: now + 20_000, cyclesTotal: 2 });
      useVoyage.getState().tick(now + 19_999);
      expect(useVoyage.getState().phase).toBe("docked");
      useVoyage.getState().tick(now + 20_000);
      expect(useVoyage.getState()).toMatchObject({ phase: "sailing", prepEndsAt: null, focusMinutes: 5 });
    });

    it("starts at once when the time has already passed", () => {
      useVoyage.getState().start({ presetId: "custom", focusMinutes: 5, breakMinutes: 1, prep: true, prepUntil: now - 1000 });
      expect(useVoyage.getState()).toMatchObject({ phase: "sailing", prepEndsAt: null });
      useVoyage.setState({ ...DOCKED, prepEndsAt: null });
      useVoyage.getState().start({ presetId: "custom", focusMinutes: 5, breakMinutes: 1, prep: true, prepUntil: now });
      expect(useVoyage.getState()).toMatchObject({ phase: "sailing", prepEndsAt: null });
    });

    it("never preps for more than 5 minutes, and keeps the usual minute without a time", () => {
      useVoyage.getState().start({ presetId: "coastal", prep: true, prepUntil: now + 3_600_000 });
      expect(useVoyage.getState().prepEndsAt).toBe(now + 300_000);
      useVoyage.getState().cancelPrep();
      useVoyage.getState().start({ presetId: "coastal", prep: true });
      expect(useVoyage.getState().prepEndsAt).toBe(now + 60_000);
    });
  });

  it("wilts the tree when a voyage is abandoned", () => {
    useVoyage.getState().start({ presetId: "coastal" });
    useVoyage.getState().abandon();
    expect(useVoyage.getState().tree.state).toBe("wilted");
    expect(useVoyage.getState().phase).toBe("docked");
  });
});

describe("avatar state and ghosts", () => {
  it("drifts when idle or hidden mid-voyage, rests when docked", () => {
    expect(myAvatarState("sailing", false, false)).toBe("SAILING_FOCUS");
    expect(myAvatarState("sailing", false, true)).toBe("DRIFTING_IDLE");
    expect(myAvatarState("drifting", false, false)).toBe("DRIFTING_IDLE");
    expect(myAvatarState("docked", false, false)).toBe("SHORE_LEAVE_BREAK");
  });

  it("replays a ghost's session on a loop, only while that friend is away", () => {
    const ghost = { id: "ghost:mira", name: "Mira", avatar: {} as never, shipId: "x", recordedAt: 0, segments: [{ state: "SAILING_FOCUS" as const, seconds: 10 }, { state: "SHORE_LEAVE_BREAK" as const, seconds: 5 }] };
    expect(ghostStateAt(ghost, 3)).toBe("SAILING_FOCUS");
    expect(ghostStateAt(ghost, 12)).toBe("SHORE_LEAVE_BREAK");
    expect(ghostStateAt(ghost, 16)).toBe("SAILING_FOCUS");
    expect(absentGhosts([ghost], [{ name: "mira" } as never])).toEqual([]);
    expect(absentGhosts([ghost], [])).toEqual([ghost]);
  });
});
