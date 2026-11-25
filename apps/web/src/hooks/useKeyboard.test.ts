// The Space shortcut starts or pauses the timer, except on a focused button (the room banner's
// "Sail with them", the crew strip…), where Space is that button's own press.

import { afterEach, describe, expect, it, vi } from "vitest";
import { useUi } from "../stores/uiStore.js";
import { useVoyage } from "../stores/voyageStore.js";
import { DOCKED } from "../lib/voyageLogic.js";
import { onShortcutKey, spaceBelongsTo } from "./useKeyboard.js";

/** A stand-in for a focused element: `closest` finds it when it matches one of `roles`. */
const element = (matches: (selector: string) => boolean) => ({ closest: (selector: string) => (matches(selector) ? {} : null) });
const button = element((s) => s.split(",").map((x) => x.trim()).includes("button"));
const page = element(() => false);

const space = (target: unknown) => {
  const preventDefault = vi.fn();
  onShortcutKey({ key: " ", target: target as EventTarget, defaultPrevented: false, ctrlKey: false, metaKey: false, altKey: false, preventDefault });
  return preventDefault;
};

afterEach(() => {
  useVoyage.setState({ ...DOCKED, prepEndsAt: null });
  useUi.setState({ panel: null });
});

describe("the Space shortcut", () => {
  it("leaves Space to a focused button, so its own press happens and the timer doesn't start", () => {
    expect(spaceBelongsTo(button as unknown as EventTarget)).toBe(true);
    const prevented = space(button);
    expect(prevented).not.toHaveBeenCalled();
    expect(useVoyage.getState().phase).toBe("docked");
  });

  it("knows role=button, menu items and tick boxes too", () => {
    for (const role of ['[role="button"]', '[role="menuitem"]', '[role="checkbox"]', "a[href]"]) {
      expect(spaceBelongsTo(element((s) => s.includes(role)) as unknown as EventTarget)).toBe(true);
    }
  });

  it("starts the timer from the page itself", () => {
    const prevented = space(page);
    expect(prevented).toHaveBeenCalled();
    expect(useVoyage.getState().phase).toBe("sailing");
  });
});
