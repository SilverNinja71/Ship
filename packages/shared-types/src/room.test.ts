import { describe, expect, it } from "vitest";
import { QUEST_BEASTS, beastsDefeatedBetween, questFromDamage } from "./crew.js";
import {
  NICK_ADJECTIVES,
  NICK_NOUNS,
  NICK_NUMBER_SKIP,
  ROOM_ACCESSORIES,
  ROOM_CHEERS,
  ROOM_CODE_ALPHABET,
  ROOM_COSTUMES,
  ROOM_LIMITS,
  ROOM_NAME_FIRST,
  ROOM_NAME_PLACE,
  ROOM_REPORT_REASONS,
  ROOM_SUBJECTS,
  STICKER_IDS,
} from "./room.js";

describe("questFromDamage", () => {
  // total, beast, hp left, beasts defeated
  const rows: [number, string, number, number][] = [
    [0, "procrastination-kraken", 120, 0],
    [119, "procrastination-kraken", 1, 0],
    [120, "doomscroll-leviathan", 200, 1],
    [320, "notification-siren", 300, 2],
    [620, "snooze-serpent", 420, 3],
    [1040, "procrastination-kraken", 120, 4],
    [1041, "procrastination-kraken", 119, 4],
  ];
  it.each(rows)("after %i minutes it's %s with %i hp, %i beaten", (total, beastId, hp, defeated) => {
    const quest = questFromDamage(total);
    expect(quest.beastId).toBe(beastId);
    expect(quest.hp).toBe(hp);
    expect(quest.defeated).toBe(defeated);
    expect(quest.maxHp).toBe(QUEST_BEASTS[quest.beastIndex]!.maxHp);
    expect(QUEST_BEASTS[quest.beastIndex]!.id).toBe(beastId);
  });

  it("lists each beaten beast's figurehead once, even past a whole cycle", () => {
    expect(questFromDamage(0).rewards).toEqual([]);
    expect(questFromDamage(320).rewards).toEqual(["kraken", "dragon"]);
    expect(questFromDamage(2500).rewards).toEqual(["kraken", "dragon", "mermaid", "swordfish"]);
  });

  it("gives the same answer however the total was added up", () => {
    const hits = [7, 25, 113, 50, 1, 333, 90, 12];
    const total = hits.reduce((a, b) => a + b, 0);
    let forward = 0;
    let backward = 0;
    for (const h of hits) forward += h;
    for (const h of [...hits].reverse()) backward += h;
    expect(questFromDamage(forward)).toEqual(questFromDamage(total));
    expect(questFromDamage(backward)).toEqual(questFromDamage(total));
    expect(questFromDamage(0.1 + 0.2 + 119.7).beastId).toBe("doomscroll-leviathan");
  });

  it("treats negative or broken totals as no damage", () => {
    for (const bad of [-5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(questFromDamage(bad)).toMatchObject({ beastId: "procrastination-kraken", hp: 120, defeated: 0, beastIndex: 0 });
    }
  });
});

describe("beastsDefeatedBetween", () => {
  it("lists the beasts a rise in damage beat, counted from the first Kraken", () => {
    expect(beastsDefeatedBetween(100, 330)).toEqual([
      { index: 0, beastId: "procrastination-kraken", reward: "kraken" },
      { index: 1, beastId: "doomscroll-leviathan", reward: "dragon" },
    ]);
  });

  it("keeps counting into the next cycle", () => {
    expect(beastsDefeatedBetween(1000, 1160)).toEqual([
      { index: 3, beastId: "snooze-serpent", reward: "swordfish" },
      { index: 4, beastId: "procrastination-kraken", reward: "kraken" },
    ]);
  });

  it("is empty when no beast fell, or the total didn't rise", () => {
    expect(beastsDefeatedBetween(0, 119)).toEqual([]);
    expect(beastsDefeatedBetween(330, 100)).toEqual([]);
    expect(beastsDefeatedBetween(120, 120)).toEqual([]);
  });

  it("never lists more than 100 at once", () => {
    expect(beastsDefeatedBetween(0, 1e12)).toHaveLength(100);
  });
});

describe("the room lists", () => {
  it("has 24 cheers and 12 stickers, so a say fits 0..35", () => {
    expect(ROOM_CHEERS).toHaveLength(24);
    expect(STICKER_IDS).toHaveLength(12);
  });

  it("keeps every list within what the rules accept", () => {
    for (const list of [NICK_ADJECTIVES, NICK_NOUNS, ROOM_NAME_FIRST, ROOM_NAME_PLACE]) {
      expect(list.length).toBeGreaterThan(0);
      expect(list.length).toBeLessThanOrEqual(ROOM_LIMITS.wordList);
    }
    expect(ROOM_SUBJECTS.length).toBeLessThanOrEqual(ROOM_LIMITS.subjects);
    expect(ROOM_COSTUMES).toHaveLength(ROOM_LIMITS.costumes);
    expect(ROOM_ACCESSORIES).toHaveLength(ROOM_LIMITS.accessories);
    expect(ROOM_REPORT_REASONS).toEqual(["spam", "unkind", "personal", "off"]);
  });

  it("has no repeated entries", () => {
    for (const list of [NICK_ADJECTIVES, NICK_NOUNS, ROOM_NAME_FIRST, ROOM_NAME_PLACE, ROOM_SUBJECTS, ROOM_CHEERS, STICKER_IDS]) {
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it("has no staff words or character names, so a nickname can't pass for either", () => {
    const banned = /\b(captain|skipper|admin|mod|official|banan|pip|mochi|lumi|pwedo)\b/i;
    for (const word of [...NICK_ADJECTIVES, ...NICK_NOUNS, ...ROOM_NAME_FIRST, ...ROOM_NAME_PLACE, ...ROOM_SUBJECTS]) {
      expect(word).not.toMatch(banned);
    }
  });

  it("skips the nickname numbers with other meanings", () => {
    expect(NICK_NUMBER_SKIP).toEqual([14, 18, 69, 88]);
    expect(NICK_NUMBER_SKIP.every((n) => n >= 1 && n <= ROOM_LIMITS.nickNumberMax)).toBe(true);
  });

  // The database stores indices into these lists, so they may only grow: an entry that moves or
  // disappears would change every saved nickname and room name. Update a snapshot only by adding.
  it("only grows", () => {
    const snapshot = (list: readonly string[]) => ({ length: list.length, first: list.slice(0, 5) });
    expect({
      adjectives: snapshot(NICK_ADJECTIVES),
      nouns: snapshot(NICK_NOUNS),
      nameFirst: snapshot(ROOM_NAME_FIRST),
      namePlace: snapshot(ROOM_NAME_PLACE),
      subjects: snapshot(ROOM_SUBJECTS),
      cheers: snapshot(ROOM_CHEERS),
      stickers: snapshot(STICKER_IDS),
      costumes: snapshot(ROOM_COSTUMES),
      accessories: snapshot(ROOM_ACCESSORIES),
    }).toEqual({
      adjectives: { length: 32, first: ["Cozy", "Sleepy", "Sparkly", "Brave", "Gentle"] },
      nouns: { length: 32, first: ["Dango", "Boba", "Muffin", "Pudding", "Teacup"] },
      nameFirst: { length: 32, first: ["Mellow", "Cozy", "Quiet", "Sunny", "Starry"] },
      namePlace: { length: 32, first: ["Lighthouse", "Teahouse", "Library", "Lagoon", "Greenhouse"] },
      subjects: { length: 24, first: ["Any subject", "Math", "Statistics", "Physics", "Chemistry"] },
      cheers: { length: 24, first: ["Let's go!", "You've got this!", "Nice work!", "Keep going!", "Almost there!"] },
      stickers: { length: 12, first: ["100-sign", "fire-focus", "boba-break", "teacup-nap", "plane-pwedo"] },
      costumes: { length: 5, first: ["pwedo", "teddy", "bunny", "frog", "banana"] },
      accessories: { length: 8, first: ["none", "cafe-apron", "woodland-sprout", "sunflower", "pumpkin-cap"] },
    });
  });
});

describe("room codes", () => {
  it("use 32 characters with no I, O, 0 or 1", () => {
    expect(ROOM_CODE_ALPHABET).toHaveLength(32);
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(32);
    for (const ch of "IO01") expect(ROOM_CODE_ALPHABET).not.toContain(ch);
    expect(ROOM_CODE_ALPHABET).toMatch(/^[A-HJ-NP-Z2-9]+$/);
  });
});
