// The crew quest: a room's focus minutes wear down the current beast. States
// are never mutated, so a QuestState already sent to clients stays as sent.

import type { QuestBeast, QuestBeastId, QuestState } from "@ship/shared-types";
import { QUEST_BEASTS } from "@ship/shared-types";

export interface QuestHit {
  quest: QuestState;
  /** Damage actually dealt (never more than the hp the beast had left). */
  damage: number;
  defeatedBeast: QuestBeastId | null;
}

function freshBeast(beast: QuestBeast, defeated: number, rewards: QuestState["rewards"]): QuestState {
  return { beastId: beast.id, hp: beast.maxHp, maxHp: beast.maxHp, defeated, rewards };
}

/** A new room starts on the first beast. */
export function newQuest(): QuestState {
  return freshBeast(QUEST_BEASTS[0]!, 0, []);
}

// Fractional minutes are allowed, so keep float noise (119.99999999) out of hp.
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Deals damage to the current beast. At 0 hp the room earns the beast's
 * figurehead (once), and the next beast in the cycle appears at full hp.
 * Damage past 0 hp is lost: one hit defeats at most one beast.
 */
export function damageQuest(quest: QuestState, damage: number): QuestHit {
  const dealt = round(Math.min(Math.max(damage, 0), quest.hp));
  const hp = round(quest.hp - dealt);
  if (hp > 0) return { quest: { ...quest, hp }, damage: dealt, defeatedBeast: null };

  const index = Math.max(0, QUEST_BEASTS.findIndex((beast) => beast.id === quest.beastId));
  const beast = QUEST_BEASTS[index]!;
  const next = QUEST_BEASTS[(index + 1) % QUEST_BEASTS.length]!;
  const rewards = quest.rewards.includes(beast.reward) ? quest.rewards : [...quest.rewards, beast.reward];
  return { quest: freshBeast(next, quest.defeated + 1, rewards), damage: dealt, defeatedBeast: beast.id };
}
