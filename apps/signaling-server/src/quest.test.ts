import { describe, expect, it } from "vitest";
import { QUEST_BEASTS } from "@ship/shared-types";
import { damageQuest, newQuest } from "./quest.js";

describe("quest", () => {
  it("starts on the first beast at full hp", () => {
    expect(newQuest()).toEqual({ beastId: "procrastination-kraken", hp: 120, maxHp: 120, defeated: 0, rewards: [] });
  });

  it("deals damage without mutating the old state", () => {
    const quest = newQuest();
    const hit = damageQuest(quest, 25);
    expect(hit).toEqual({ quest: { ...quest, hp: 95 }, damage: 25, defeatedBeast: null });
    expect(quest.hp).toBe(120);
  });

  it("keeps float noise out of hp", () => {
    let quest = newQuest();
    for (let i = 0; i < 3; i++) quest = damageQuest(quest, 0.1).quest;
    expect(quest.hp).toBe(119.7);
  });

  it("defeats the beast at 0 hp, earns its figurehead and brings on the next beast", () => {
    const hit = damageQuest({ ...newQuest(), hp: 5 }, 40);
    expect(hit.damage).toBe(5); // overkill is lost
    expect(hit.defeatedBeast).toBe("procrastination-kraken");
    expect(hit.quest).toEqual({ beastId: "doomscroll-leviathan", hp: 200, maxHp: 200, defeated: 1, rewards: ["kraken"] });
  });

  it("cycles back to the first beast and never lists a reward twice", () => {
    let quest = newQuest();
    const defeated: string[] = [];
    for (let i = 0; i < QUEST_BEASTS.length + 1; i++) {
      const hit = damageQuest(quest, quest.hp);
      defeated.push(hit.defeatedBeast!);
      quest = hit.quest;
    }
    expect(defeated).toEqual([...QUEST_BEASTS.map((beast) => beast.id), "procrastination-kraken"]);
    expect(quest.beastId).toBe("doomscroll-leviathan");
    expect(quest.defeated).toBe(5);
    expect(quest.rewards).toEqual(["kraken", "dragon", "mermaid", "swordfish"]);
  });
});
