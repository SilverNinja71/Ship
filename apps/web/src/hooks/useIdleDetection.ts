// Notices when the sailor walks away. With Ship visible and no input for the
// idle limit, the voyage drifts (pauses); any input brings it back.

import { useEffect } from "react";
import { useActivity } from "../stores/activityStore.js";
import { useSettings } from "../stores/settingsStore.js";
import { useUi } from "../stores/uiStore.js";
import { useVoyage } from "../stores/voyageStore.js";

const INPUT_EVENTS = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const;
const CHECK_MS = 5000;

export function useIdleDetection(): void {
  const idleMinutes = useSettings((s) => s.idleMinutes);

  useEffect(() => {
    let lastInput = Date.now();
    const activity = useActivity.getState;

    const onInput = () => {
      lastInput = Date.now();
      if (!activity().idle) return;
      activity().set({ idle: false });
      const voyage = useVoyage.getState();
      if (voyage.phase === "drifting" && voyage.pausedReason === "idle") {
        voyage.resume();
        useUi.getState().toast("Welcome back, captain. The voyage sails on.");
      }
    };

    const onVisibility = () => {
      activity().set({ hidden: document.hidden });
      // Coming back to the tab counts as being here.
      if (!document.hidden) onInput();
    };

    const check = () => {
      if (idleMinutes <= 0 || document.hidden || activity().idle) return;
      if (Date.now() - lastInput < idleMinutes * 60_000) return;
      activity().set({ idle: true });
      const voyage = useVoyage.getState();
      if (voyage.phase === "sailing") {
        voyage.pause("idle");
        useUi.getState().toast("You've drifted off. Move the mouse or press a key to sail on.", "warning");
      }
    };

    for (const e of INPUT_EVENTS) window.addEventListener(e, onInput, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    const timer = setInterval(check, CHECK_MS);
    return () => {
      for (const e of INPUT_EVENTS) window.removeEventListener(e, onInput);
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(timer);
    };
  }, [idleMinutes]);
}
