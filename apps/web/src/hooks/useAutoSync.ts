// Automatically syncs Lodestar (calendar feed) and other configured fleet
// integrations on startup, periodically, and when returning to the tab.

import { useEffect } from "react";
import { useFleet } from "../stores/fleetStore.js";

const AUTO_SYNC_INTERVAL_MS = 15 * 60_000;
const FOCUS_DEBOUNCE_MS = 2 * 60_000;

export function useAutoSync(): void {
  useEffect(() => {
    let lastSyncAt = 0;

    const runSync = () => {
      const s = useFleet.getState();
      const hasAny =
        Boolean(s.calendarFeedUrl) ||
        Boolean(s.settings.todoist) ||
        Boolean(s.settings.canvas) ||
        Boolean(s.settings.googleDrive?.accessToken);
      if (!hasAny) return;
      const now = Date.now();
      if (now - lastSyncAt < FOCUS_DEBOUNCE_MS) return;
      lastSyncAt = now;
      void s.syncAll();
    };

    runSync();
    const timer = setInterval(runSync, AUTO_SYNC_INTERVAL_MS);
    const onFocus = () => runSync();
    const onVisible = () => {
      if (document.visibilityState === "visible") runSync();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}
