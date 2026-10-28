import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LookoutRewardEvent } from "@ship/shared-types";
import { EMPTY_INVENTORY } from "@ship/ship-theme-kit";
import { myAvatarState } from "./activityStore.js";
import { absentGhosts, ghostStateAt } from "./crewStore.js";
import { useEconomy } from "./economyStore.js";
import { useRecall } from "./recallStore.js";
import { resolveActiveShip } from "./shipCustomizer.js";
import { useVoyage } from "./voyageStore.js";

// The stores persist to localStorage, which Node doesn't have; they just warn and carry on.
vi.spyOn(console, "warn").mockImplementation(() => {});

const event = (id: string, doubloons = 50): LookoutRewardEvent => ({ id, kind: "steer-back", doubloons, site: "youtube.com", at: 0 });

beforeEach(() => {
  useEconomy.setState({ doubloons: 0, xp: 0, inventory: EMPTY_INVENTORY, paidRewardIds: [], ledger: [] });
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
