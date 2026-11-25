// Keyboard shortcuts. They stay out of the way while typing in a field.

import { useEffect } from "react";
import { useSettings } from "../stores/settingsStore.js";
import { useUi } from "../stores/uiStore.js";
import type { PanelId } from "../stores/uiStore.js";
import { useVoyage } from "../stores/voyageStore.js";

export const PANEL_KEYS: Record<string, PanelId> = {
  h: "helm",
  p: "planner",
  l: "log",
  n: "notes",
  b: "bay",
  f: "flashcards",
  s: "shipwright",
  w: "wardrobe",
  c: "crew",
  r: "rooms",
  g: "fleet",
  o: "lookout",
  ",": "settings",
};

function isTyping(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Controls that Space presses by themselves (a button, link, tick box, tab, menu item…). */
const SPACE_CONTROLS = 'button, a[href], summary, input, select, textarea, [role="button"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="radio"], [role="checkbox"], [role="switch"], [role="tab"], [role="option"]';

/**
 * Whether Space on this element is the element's own: a focused button (the room banner's "Sail
 * with them", the crew strip…) must get its own click, never start or pause the timer instead.
 */
export function spaceBelongsTo(target: EventTarget | null): boolean {
  const el = target as { closest?: (selector: string) => unknown } | null;
  return typeof el?.closest === "function" && el.closest(SPACE_CONTROLS) !== null;
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

/** The app's keyboard shortcuts, for one keydown on the window. */
export function onShortcutKey(e: Pick<KeyboardEvent, "key" | "target" | "defaultPrevented" | "ctrlKey" | "metaKey" | "altKey" | "preventDefault">): void {
  // A dialog or popover over the panel (the rules, the tutorial, a menu) has already used this key.
  if (e.defaultPrevented) return;
  if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
  const ui = useUi.getState();
  if (e.key === "Escape") {
    if (ui.panel) ui.openPanel(null);
    return;
  }
  // Panels have their own buttons and fields; only Escape reaches through.
  if (ui.panel) return;
  if (e.key === " ") {
    // Space on a focused button is that button's own press (the browser's), not the timer's.
    if (spaceBelongsTo(e.target)) return;
    e.preventDefault();
    toggleVoyage();
  } else if (e.key === "q" || e.key === "Q") {
    const s = useSettings.getState();
    s.set({ view: s.view === "deck" ? "quarters" : "deck" });
  } else {
    const panel = PANEL_KEYS[e.key.toLowerCase()];
    if (panel) ui.openPanel(panel);
  }
}

export function useKeyboard(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => onShortcutKey(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
