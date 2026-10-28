// The reward queue. Events wait here until the web app pays them and acks
// their ids, so a reward survives a closed Ship tab or a sleeping worker.

import { STEER_BACK_BONUS, type LookoutRewardEvent, type LookoutRewardKind } from "@ship/shared-types";
import { REWARD_QUEUE_MAX, STEER_BACK_COOLDOWN_MS } from "./constants.js";

/** Time-ordered and random, so ids stay unique across worker restarts. */
export function newRewardId(now: number, random: () => string): string {
  return `lookout-${now.toString(36)}-${random()}`;
}

export function makeReward(kind: LookoutRewardKind, site: string, doubloons: number, now: number, id: string): LookoutRewardEvent {
  return { id, kind, doubloons, site, at: now };
}

export function isRewardEvent(v: unknown): v is LookoutRewardEvent {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    (e.kind === "steer-back" || e.kind === "gate-passed" || e.kind === "blocked") &&
    typeof e.doubloons === "number" &&
    typeof e.site === "string" &&
    typeof e.at === "number"
  );
}

export function enqueueReward(queue: readonly LookoutRewardEvent[], event: LookoutRewardEvent, max = REWARD_QUEUE_MAX): LookoutRewardEvent[] {
  if (queue.some((e) => e.id === event.id)) return [...queue];
  const next = [...queue, event];
  // When full, drop the oldest stats-only event before touching anything that pays.
  while (next.length > max) {
    const free = next.findIndex((e) => e.doubloons === 0);
    next.splice(free >= 0 ? free : 0, 1);
  }
  return next;
}

/** Everything not yet acked, oldest first. Claiming doesn't remove anything; only an ack does. */
export function claimRewards(queue: readonly LookoutRewardEvent[]): LookoutRewardEvent[] {
  return [...queue].sort((a, b) => a.at - b.at);
}

export function ackRewards(queue: readonly LookoutRewardEvent[], ids: readonly string[]): LookoutRewardEvent[] {
  const paid = new Set(ids);
  return queue.filter((e) => !paid.has(e.id));
}

export function pendingDoubloons(queue: readonly LookoutRewardEvent[]): number {
  return queue.reduce((sum, e) => sum + e.doubloons, 0);
}

/** The full bonus, unless one was already paid inside the cooldown window. */
export function steerBackPayout(lastPaidAt: number | null, now: number): number {
  return lastPaidAt === null || now - lastPaidAt >= STEER_BACK_COOLDOWN_MS ? STEER_BACK_BONUS : 0;
}
