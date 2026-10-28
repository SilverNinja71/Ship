// Keeps the crew room in step with this sailor: presence (state, outfit,
// ship, today's minutes) and focus minutes, which hurt the quest beast.

import { useEffect } from "react";
import type { AvatarState, CrewMemberPatch } from "@ship/shared-types";
import { minutesOnDay } from "../lib/voyageLogic.js";
import { myAvatarState, useActivity } from "../stores/activityStore.js";
import { sendFocusTick, sendPresence, useCrew } from "../stores/crewStore.js";
import type { JoinInfo } from "../stores/crewStore.js";
import { useEconomy } from "../stores/economyStore.js";
import { resolveActiveShip, resolveAvatar, useCustomizer } from "../stores/shipCustomizer.js";
import { onFocusMinutes, useVoyage } from "../stores/voyageStore.js";

export function currentAvatarState(): AvatarState {
  const { idle, hidden } = useActivity.getState();
  return myAvatarState(useVoyage.getState().phase, idle, hidden);
}

/** Today's focus minutes, including the voyage in progress. */
export function focusMinutesToday(now = Date.now()): number {
  const v = useVoyage.getState();
  const inProgress = v.phase === "sailing" || v.phase === "drifting" ? v.paidMinutes : 0;
  return minutesOnDay(v.records, now) + inProgress;
}

/** What this sailor looks like to the crew right now. */
export function myCrewInfo(audio = false, video = false): JoinInfo {
  const inventory = useEconomy.getState().inventory;
  const custom = useCustomizer.getState();
  const avatar = resolveAvatar(custom.avatar, inventory);
  return {
    name: avatar.name,
    avatar,
    shipId: resolveActiveShip(custom, inventory).ship.id,
    state: currentAvatarState(),
    focusMinutesToday: focusMinutesToday(),
    audio,
    video,
  };
}

export function useCrewSync(): void {
  useEffect(() => {
    const unMinutes = onFocusMinutes((minutes) => {
      if (useCrew.getState().status === "online") sendFocusTick(minutes);
    });

    let last = myCrewInfo();
    const push = () => {
      if (useCrew.getState().status !== "online") return;
      const now = myCrewInfo();
      const patch: CrewMemberPatch = {};
      if (now.state !== last.state) patch.state = now.state;
      if (now.name !== last.name) patch.name = now.name;
      if (now.shipId !== last.shipId) patch.shipId = now.shipId;
      if (now.focusMinutesToday !== last.focusMinutesToday) patch.focusMinutesToday = now.focusMinutesToday;
      if (JSON.stringify(now.avatar) !== JSON.stringify(last.avatar)) patch.avatar = now.avatar;
      last = { ...now, audio: last.audio, video: last.video };
      if (Object.keys(patch).length) sendPresence(patch);
    };

    const unsubs = [
      useVoyage.subscribe(push),
      useActivity.subscribe(push),
      useCustomizer.subscribe(push),
      // Rejoining (or a reconnect) re-sends everything, so start the diff fresh.
      useCrew.subscribe((s, prev) => {
        if (s.status === "online" && prev.status !== "online") last = myCrewInfo();
      }),
    ];
    return () => {
      unMinutes();
      unsubs.forEach((u) => u());
    };
  }, []);
}
