// A busy room button keeps the keyboard focus: aria-disabled and a guard, never `disabled`
// (which drops the focus to the page, so a screen reader loses its place).

import { describe, expect, it, vi } from "vitest";
import { HELD, heldButton } from "./roomStyle.js";

describe("held buttons", () => {
  it("say they're unavailable and do nothing while held, without `disabled`", () => {
    const run = vi.fn();
    const preventDefault = vi.fn();
    const held = heldButton(true, run);
    expect(held).toMatchObject({ "aria-disabled": true });
    expect(held).not.toHaveProperty("disabled");
    held.onClick({ preventDefault });
    expect(run).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalled();
    expect(HELD).toContain("aria-disabled:opacity-50");
  });

  it("run their action once free", () => {
    const run = vi.fn();
    const free = heldButton(false, run);
    expect(free).not.toHaveProperty("aria-disabled");
    free.onClick({ preventDefault: () => undefined });
    expect(run).toHaveBeenCalledTimes(1);
  });
});
