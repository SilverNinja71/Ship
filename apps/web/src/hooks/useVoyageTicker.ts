// Advances the voyage once a second (and right away when the tab comes back).

import { useEffect } from "react";
import { useVoyage } from "../stores/voyageStore.js";

export function useVoyageTicker(): void {
  useEffect(() => {
    const tick = () => useVoyage.getState().tick(Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
}
