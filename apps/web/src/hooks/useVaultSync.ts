// Keeps an open Obsidian vault in step: on load, when Ship's tab comes back
// into view (the sailor was probably just in Obsidian), every 2 minutes while
// visible, and a few seconds after something Ship writes into the vault changes.

import { useEffect } from "react";
import { usePlanner } from "../stores/plannerStore.js";
import { useFleet } from "../stores/fleetStore.js";
import { useRecall } from "../stores/recallStore.js";
import { useVault } from "../stores/vaultStore.js";

const EVERY_MS = 2 * 60_000;
const AFTER_CHANGE_MS = 5_000;
const MIN_GAP_MS = 10_000;

export function useVaultSync(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = 0;
    const sync = (force = false) => {
      const v = useVault.getState();
      if (v.mode !== "folder" || v.permission === "prompt" || v.permission === "denied") return;
      if (!force && Date.now() - last < MIN_GAP_MS) return;
      last = Date.now();
      void v.sync();
    };
    const soon = () => {
      // Changes Ship makes while syncing aren't news to the vault.
      if (useVault.getState().busy || useVault.getState().mode !== "folder") return;
      clearTimeout(timer);
      timer = setTimeout(() => sync(true), AFTER_CHANGE_MS);
    };

    // The first sync also finds out whether the browser still allows the folder.
    if (useVault.getState().mode === "folder") void useVault.getState().sync();
    const onShow = () => document.visibilityState === "visible" && sync();
    const onFocus = () => sync();
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onFocus);
    const every = setInterval(() => document.visibilityState === "visible" && sync(), EVERY_MS);
    const unsubs = [
      usePlanner.subscribe(soon),
      useRecall.subscribe((s, prev) => (s.decks !== prev.decks || s.cards !== prev.cards) && soon()),
      useFleet.subscribe((s, prev) => s.notes !== prev.notes && s.notes.some((n) => n.source === "clip" || n.source === "file") && soon()),
    ];
    return () => {
      clearTimeout(timer);
      clearInterval(every);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onFocus);
      for (const u of unsubs) u();
    };
  }, []);
}
