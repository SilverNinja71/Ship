// Keyboard shortcuts. They stay out of the way while typing in a field.

import { useEffect } from "react";
import { useSettings } from "../stores/settingsStore.js";
import { useUi } from "../stores/uiStore.js";
import type { PanelId } from "../stores/uiStore.js";
import { useVoyage } from "../stores/voyageStore.js";

export const PANEL_KEYS: Record<string, PanelId> = {
  h: "helm",
  l: "log",
  f: "flashcards",
  s: "shipwright",
  w: "wardrobe",
  c: "crew",
  g: "fleet",
  o: "lookout",
  ",": "settings",
};

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Space: start, pause or resume the voyage. */
export function toggleVoyage(): void {
  const v = useVoyage.getState();
  if (v.phase === "sailing") v.pause("manual");
  else if (v.phase === "drifting") v.resume();
  else if (v.phase === "docked") {
    const s = useSettings.getState();
    v.start({
      presetId: s.presetId,
      focusMinutes: s.presetId === "custom" ? s.customFocusMinutes : undefined,
      breakMinutes: s.presetId === "custom" ? s.customBreakMinutes : undefined,
    });
  }
}

export function useKeyboard(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const ui = useUi.getState();
      if (e.key === "Escape") {
        if (ui.panel) ui.openPanel(null);
        return;
      }
      // Panels have their own buttons and fields; only Escape reaches through.
      if (ui.panel) return;
      if (e.key === " ") {
        e.preventDefault();
        toggleVoyage();
      } else if (e.key === "q" || e.key === "Q") {
        const s = useSettings.getState();
        s.set({ view: s.view === "deck" ? "quarters" : "deck" });
      } else {
        const panel = PANEL_KEYS[e.key.toLowerCase()];
        if (panel) ui.openPanel(panel);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
