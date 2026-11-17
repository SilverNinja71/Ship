import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR, ENVIRONMENTS, SHIPS } from "@ship/ship-theme-kit";
import { luminance, toPaperTone, toTinyInkAvatar, toTinyInkEnv, toTinyInkShip } from "./tinyInk.js";

describe("tinyInk theme transformer", () => {
  it("converts daytime environments to warm paper & ink with strict 0-color world", () => {
    const env = toTinyInkEnv(ENVIRONMENTS["tropical-sea"]);
    expect(env.skyTop).toBe("#FBF8EA");
    expect(env.cloud).toBe("#FFFFFF");
    expect(env.celestialColor).toBe("#EFEAD8");
    expect(env.sea).toEqual(["#ECE8DC", "#E0DBD0", "#D3CEC2"]);
  });

  it("converts night environments to charcoal ink night with soft cream moon", () => {
    const env = toTinyInkEnv(ENVIRONMENTS["marigold-night"]);
    expect(env.night).toBe(true);
    expect(env.skyTop).toBe("#2E2C2A");
    expect(env.celestialColor).toBe("#EBE7DA");
  });

  it("converts ships to strict monochrome paper & ink", () => {
    const ship = toTinyInkShip(SHIPS[0]);
    expect(ship.palette.sail).toBe("#FFFFFF");
    expect(ship.palette.deck).toBe("#F4EFE4");
    expect(ship.palette.trim).toBe("#8E867B");
    expect(ship.palette.glow).toBe("#E8E2D0");
    expect(ship.palette.accent).not.toBe(ship.palette.hull);
  });

  it("converts avatars to porcelain skin and monochrome clothes", () => {
    const av = toTinyInkAvatar(DEFAULT_AVATAR);
    expect(av.skin).toBe("porcelain");
    expect(luminance(av.coatColor)).toBeGreaterThanOrEqual(0);
    expect(toPaperTone("#000000")).not.toBe(toPaperTone("#FFFFFF"));
  });
});
