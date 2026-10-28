import type { AvatarLoadout, AvatarState } from "@ship/shared-types";
import { ACCESSORIES, COATS, DEFAULT_AVATAR, DESKS, HAIR_STYLES, HATS, SKIN_TONES, STUDY_TOOLS } from "@ship/ship-theme-kit";
import { afterEach, describe, expect, it } from "vitest";
import { drawAvatarPreview, drawGalleyTable, drawStudyStation, GALLEY_SEAT_X, HEAD_TOP, STATION_HEIGHT } from "../AvatarRenderer.js";
import { STILL_FRAME, type Ctx, type FrameInfo } from "../types.js";
import { releaseLayers } from "./layer.js";
import { breakActivityAt, BREAK_SEGMENT, computePose } from "./pose.js";

/**
 * A fake 2D context: every method is accepted, a few return what real code
 * reads (gradients, transforms, text metrics). It records calls, checks that
 * every number passed is finite, and tracks save/restore nesting.
 */
function fakeCtx(width = 800, height = 600) {
  const calls: string[] = [];
  const bad: string[] = [];
  let depth = 0;
  let maxDepth = 0;
  const props: Record<string | symbol, unknown> = { canvas: { width, height }, globalAlpha: 1 };
  const gradient = { addColorStop: () => {} };
  const special: Record<string, (...a: unknown[]) => unknown> = {
    save: () => {
      depth++;
      maxDepth = Math.max(maxDepth, depth);
    },
    restore: () => {
      depth--;
      if (depth < 0) bad.push("restore without save");
    },
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => ({}),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    measureText: () => ({ width: 10 }),
    getLineDash: () => [],
  };
  const ctx = new Proxy(props, {
    get(target, key) {
      if (key in target) return target[key];
      if (typeof key === "symbol") return undefined;
      return (...args: unknown[]) => {
        calls.push(key);
        for (const a of args) if (typeof a === "number" && !Number.isFinite(a)) bad.push(`${key}(${args.join(",")})`);
        return special[key]?.(...args);
      };
    },
    set(target, key, value) {
      if (typeof value === "number" && !Number.isFinite(value)) bad.push(`${String(key)} = ${value}`);
      target[key] = value;
      return true;
    },
  }) as unknown as Ctx;
  return { ctx, calls, bad, depth: () => depth, maxDepth: () => maxDepth };
}

const STATES: AvatarState[] = ["SAILING_FOCUS", "SHORE_LEAVE_BREAK", "DRIFTING_IDLE"];
const TIMES = [0, 0.37, 3.3, 7.9, 13.1, 61.7, 1234.5];
const frameAt = (t: number, reducedMotion = false): FrameInfo => ({ t, dt: 1 / 60, reducedMotion, wind: 0.6 });

function drawAll(avatar: AvatarLoadout, desk = DESKS[0].id, opacity = 1) {
  const f = fakeCtx();
  for (const state of STATES) {
    for (const t of TIMES) {
      drawStudyStation(f.ctx, { avatar, state, desk, at: { x: 400, y: 500 }, opacity, seed: 7 }, frameAt(t));
      expect(f.depth()).toBe(0);
    }
  }
  drawStudyStation(f.ctx, { avatar, state: "SHORE_LEAVE_BREAK", desk, at: { x: 0, y: 0 }, scale: 2.5 }, STILL_FRAME);
  expect(f.bad).toEqual([]);
  expect(f.depth()).toBe(0);
  expect(f.calls.filter((c) => c === "fill").length).toBeGreaterThan(50);
  return f;
}

describe("study station", () => {
  it.each(HAIR_STYLES.map((h) => h.id))("draws hair %s with and without a hat", (hair) => {
    drawAll({ ...DEFAULT_AVATAR, hair, hat: "none" });
    drawAll({ ...DEFAULT_AVATAR, hair, hat: "tricorn" });
  });
  it.each(HATS.map((h) => h.id))("draws hat %s", (hat) => {
    drawAll({ ...DEFAULT_AVATAR, hat, accessory: "aviator-goggles" });
  });
  it.each(COATS.map((c) => c.id))("draws coat %s", (coat) => {
    drawAll({ ...DEFAULT_AVATAR, coat, coatColor: "#6B4C9A", accessory: "scarf" });
  });
  it.each(ACCESSORIES.map((a) => a.id))("draws accessory %s", (accessory) => {
    drawAll({ ...DEFAULT_AVATAR, accessory });
  });
  it.each(STUDY_TOOLS.map((t) => t.id))("draws tool %s", (tool) => {
    drawAll({ ...DEFAULT_AVATAR, tool });
  });
  it.each(DESKS.map((d) => d.id))("draws desk %s", (desk) => {
    drawAll(DEFAULT_AVATAR, desk);
  });
  it.each(SKIN_TONES.map((s) => s.id))("draws skin %s", (skin) => {
    drawAll({ ...DEFAULT_AVATAR, skin });
  });

  it("survives a loadout with unknown ids and colors (old saves)", () => {
    const junk = { ...DEFAULT_AVATAR, hair: "mohawk", hat: "crown", coat: "cape", accessory: "monocle", tool: "abacus", skin: "green", hairColor: "blue", coatColor: undefined } as unknown as AvatarLoadout;
    drawAll(junk, "throne" as never);
  });

  it("is deterministic for the same inputs", () => {
    const a = fakeCtx();
    const b = fakeCtx();
    for (const f of [a, b]) drawStudyStation(f.ctx, { avatar: DEFAULT_AVATAR, state: "SHORE_LEAVE_BREAK", desk: "coral-vanity", at: { x: 0, y: 0 } }, frameAt(5.25));
    expect(a.calls).toEqual(b.calls);
  });

  it("respects reduced motion and the still frame", () => {
    const f = fakeCtx();
    for (const state of STATES) {
      drawStudyStation(f.ctx, { avatar: DEFAULT_AVATAR, state, desk: "star-chart", at: { x: 0, y: 0 } }, STILL_FRAME);
      drawStudyStation(f.ctx, { avatar: DEFAULT_AVATAR, state, desk: "star-chart", at: { x: 0, y: 0 } }, frameAt(42, true));
    }
    expect(f.bad).toEqual([]);
    expect(f.depth()).toBe(0);
  });
});

describe("opacity", () => {
  const g = globalThis as { OffscreenCanvas?: unknown };
  const original = g.OffscreenCanvas;
  afterEach(() => {
    g.OffscreenCanvas = original;
    releaseLayers();
  });

  it("draws a ghost as one piece through an offscreen layer", () => {
    const layers: ReturnType<typeof fakeCtx>[] = [];
    g.OffscreenCanvas = class {
      width: number;
      height: number;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
      }
      getContext() {
        const f = fakeCtx(this.width, this.height);
        layers.push(f);
        return f.ctx;
      }
    };
    const main = fakeCtx();
    drawStudyStation(main.ctx, { avatar: DEFAULT_AVATAR, state: "SAILING_FOCUS", desk: "captains-desk", at: { x: 400, y: 500 }, opacity: 0.45 }, frameAt(1));
    // The main canvas only receives the finished layer.
    expect(main.calls.filter((c) => c === "drawImage")).toHaveLength(1);
    expect(main.calls).not.toContain("fill");
    expect(layers).toHaveLength(1);
    expect(layers[0].calls.filter((c) => c === "fill").length).toBeGreaterThan(50);
    expect(layers[0].depth()).toBe(0);

    // The layer is reused on the next frame rather than reallocated.
    drawStudyStation(main.ctx, { avatar: DEFAULT_AVATAR, state: "SAILING_FOCUS", desk: "captains-desk", at: { x: 400, y: 500 }, opacity: 0.45 }, frameAt(2));
    expect(layers).toHaveLength(1);
    expect(main.depth()).toBe(0);
  });

  it("falls back to plain alpha when there is no offscreen canvas", () => {
    g.OffscreenCanvas = undefined;
    const main = fakeCtx();
    drawStudyStation(main.ctx, { avatar: DEFAULT_AVATAR, state: "DRIFTING_IDLE", desk: "marble-plinth", at: { x: 0, y: 0 }, opacity: 0.45 }, frameAt(1));
    expect(main.calls).toContain("fill");
    expect(main.bad).toEqual([]);
    expect(main.depth()).toBe(0);
  });

  it("draws nothing at opacity 0", () => {
    const main = fakeCtx();
    drawStudyStation(main.ctx, { avatar: DEFAULT_AVATAR, state: "SAILING_FOCUS", desk: "captains-desk", at: { x: 0, y: 0 }, opacity: 0 }, frameAt(1));
    expect(main.calls).not.toContain("fill");
  });
});

describe("galley table and previews", () => {
  it("draws two seats, an empty seat and a ghost", () => {
    const f = fakeCtx();
    const crew = HAIR_STYLES.map((h, i) => ({ ...DEFAULT_AVATAR, name: h.id, hair: h.id, tool: STUDY_TOOLS[i % 4].id, accessory: ACCESSORIES[i % 7].id }));
    for (const t of TIMES) {
      drawGalleyTable(f.ctx, { x: 100, y: 300 }, [{ avatar: crew[0], state: "SAILING_FOCUS" }, { avatar: crew[3], state: "SHORE_LEAVE_BREAK", opacity: 0.45 }], frameAt(t));
      drawGalleyTable(f.ctx, { x: 100, y: 300 }, [null, { avatar: crew[5], state: "DRIFTING_IDLE", seed: 3 }], frameAt(t), 2);
      drawGalleyTable(f.ctx, { x: 100, y: 300 }, [null, null], frameAt(t));
    }
    expect(f.bad).toEqual([]);
    expect(f.depth()).toBe(0);
  });

  it("draws previews at several sizes in every state", () => {
    const f = fakeCtx();
    for (const size of [24, 48, 64, 128])
      for (const state of STATES) drawAvatarPreview(f.ctx, { ...DEFAULT_AVATAR, tool: "mech-keyboard", accessory: "parrot" }, state, 50, 50, size, frameAt(2.2));
    expect(f.bad).toEqual([]);
    expect(f.depth()).toBe(0);
  });

  it("exports sensible layout constants", () => {
    expect(GALLEY_SEAT_X).toBeGreaterThan(30);
    expect(HEAD_TOP).toBeLessThan(-150);
    expect(HEAD_TOP).toBeGreaterThan(-STATION_HEIGHT);
  });
});

describe("pose", () => {
  it("cycles through all three break activities, in an order that depends on the seed", () => {
    const orders = new Set<string>();
    for (let seed = 0; seed < 24; seed++) {
      const seen: string[] = [];
      for (let k = 0; k < 3; k++) seen.push(breakActivityAt(k * BREAK_SEGMENT, seed).activity);
      expect(new Set(seen).size).toBe(3);
      orders.add(seen.join(","));
    }
    expect(orders.size).toBeGreaterThan(3);
  });

  it("alternates boba and tea between cycles", () => {
    const a = breakActivityAt(0, 5).drink;
    const b = breakActivityAt(3 * BREAK_SEGMENT, 5).drink;
    expect(a).not.toBe(b);
  });

  it("shows the first activity in full swing on a frozen frame", () => {
    for (const seed of [1, 2, 3, 99]) expect(computePose("SHORE_LEAVE_BREAK", "laptop", 0, seed, true).amount).toBeGreaterThan(0.95);
  });

  it("only dozes with Zzz in the idle state", () => {
    expect(computePose("DRIFTING_IDLE", "quill-logbook", 3, 1, false).zzz).not.toBeNull();
    expect(computePose("SAILING_FOCUS", "quill-logbook", 3, 1, false).zzz).toBeNull();
    expect(computePose("SHORE_LEAVE_BREAK", "quill-logbook", 3, 1, false).zzz).toBeNull();
  });

  it("keeps hands within reach of the desk and the face", () => {
    for (const state of STATES)
      for (const tool of STUDY_TOOLS)
        for (let t = 0; t < 40; t += 0.71) {
          const p = computePose(state, tool.id, t, 11, false);
          for (const arm of p.arms) {
            expect(Math.abs(arm.hand.x)).toBeLessThan(60);
            expect(arm.hand.y).toBeGreaterThan(-200);
            expect(arm.hand.y).toBeLessThan(-50);
          }
        }
  });

  it("moves while focused but holds still with reduced motion", () => {
    const a = computePose("SAILING_FOCUS", "quill-logbook", 1, 4, false).arms[1].hand;
    const b = computePose("SAILING_FOCUS", "quill-logbook", 1.4, 4, false).arms[1].hand;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(1);
    const c = computePose("SAILING_FOCUS", "quill-logbook", 1, 4, true).arms[1].hand;
    const d = computePose("SAILING_FOCUS", "quill-logbook", 1.4, 4, true).arms[1].hand;
    expect(Math.hypot(c.x - d.x, c.y - d.y)).toBeLessThan(1);
  });
});
