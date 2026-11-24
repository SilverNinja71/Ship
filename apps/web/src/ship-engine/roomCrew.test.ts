import { describe, expect, it } from "vitest";
import { ROOM_ACCESSORIES, ROOM_CHEERS, ROOM_COSTUMES, STICKER_IDS } from "@ship/shared-types";
import type { RoomState } from "@ship/shared-types";
import { DEFAULT_AVATAR, ENVIRONMENTS, SHIPS, defaultLoadout } from "@ship/ship-theme-kit";
import type { SceneMate } from "../lib/roomRules.js";
import { shipLayout } from "../ships/index.js";
import { getKawaiiTheme } from "./kawaiiThemes.js";
import { breakSpots, cheerWords, deskSpots, drawCheerBubble, drawMate, mateChore, mateTitle } from "./roomCrew.js";
import { renderDeck } from "./ShipRenderer.js";
import type { CrewOnDeck, Viewport } from "./ShipRenderer.js";
import { renderBreakScene, renderStudyDeskScene } from "./StudySceneRenderer.js";
import type { Ctx, FrameInfo } from "./types.js";
import { STILL_FRAME } from "./types.js";

// A fake 2D context that accepts every call and notes non-finite numbers and unbalanced save/restore.
function fakeContext() {
  const rec = { ctx: null as unknown as Ctx, bad: [] as string[], saves: 0, restores: 0 };
  const props: Record<string | symbol, unknown> = { globalAlpha: 1 };
  const gradient = { addColorStop: () => {} };
  rec.ctx = new Proxy(
    {},
    {
      get(_t, key) {
        if (key in props) return props[key];
        if (key === "createLinearGradient" || key === "createRadialGradient" || key === "createPattern") return () => gradient;
        if (key === "measureText") return (text: string) => ({ width: String(text).length * 7 });
        if (key === "getTransform") return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
        if (key === "getLineDash") return () => [];
        return (...args: unknown[]) => {
          if (key === "save") rec.saves++;
          if (key === "restore") rec.restores++;
          for (const a of args) if (typeof a === "number" && !Number.isFinite(a)) rec.bad.push(`${String(key)}(${args.join(",")})`);
        };
      },
      set(_t, key, value) {
        props[key] = value;
        if (typeof value === "number" && !Number.isFinite(value)) rec.bad.push(`${String(key)}=${value}`);
        return true;
      },
    },
  ) as Ctx;
  return rec;
}

const FRAMES: FrameInfo[] = [STILL_FRAME, { t: 3.7, dt: 0.016, reducedMotion: false, wind: 1 }, { t: 27.2, dt: 0.016, reducedMotion: true, wind: 0.3 }];
const STATES: RoomState[] = [0, 1, 2, 3];

function mate(i: number, over: Partial<SceneMate> = {}): SceneMate {
  return {
    key: `k${i}`.padEnd(64, "a"),
    label: `Cozy Dango ${i + 1}`,
    costume: ROOM_COSTUMES[i % ROOM_COSTUMES.length]!,
    accessory: ROOM_ACCESSORIES[i % ROOM_ACCESSORIES.length]!,
    skipper: i === 0,
    state: STATES[i % STATES.length]!,
    away: false,
    cheer: i % 2 === 0 ? i : null,
    ...over,
  };
}
const crew = (n: number) => Array.from({ length: n }, (_, i) => mate(i));

const WIDE: Viewport = { width: 1280, height: 800, dpr: 1, insetTop: 76, insetBottom: 96 };
const PHONE: Viewport = { width: 390, height: 844, dpr: 2, insetTop: 64, insetBottom: 250 };

describe("drawMate", () => {
  it("draws every costume with every accessory, in every state and away, without throwing", () => {
    for (const costume of ROOM_COSTUMES) {
      for (const accessory of [...ROOM_ACCESSORIES, "from-a-newer-app"]) {
        for (const state of STATES) {
          for (const away of [false, true]) {
            for (const frame of FRAMES) {
              const rec = fakeContext();
              drawMate(rec.ctx, { x: 10, y: 20 }, mate(0, { costume, accessory, state, away }), frame, 1.2);
              drawMate(rec.ctx, { x: 10, y: 20 }, mate(0, { costume, accessory, state, away }), frame, 1.3, { chore: "swim", shadow: true });
              expect(rec.bad, `${costume} ${accessory} ${state} ${away}`).toEqual([]);
              expect(rec.saves).toBe(rec.restores);
            }
          }
        }
      }
    }
  });

  it("shows focusing, a break, a nap (paused or away) and nothing in port", () => {
    expect(mateChore(1, false)).toBe("fire-focus");
    expect(mateChore(2, false)).toBe("boba");
    expect(mateChore(3, false)).toBe("blanket-nap");
    expect(mateChore(1, true)).toBe("blanket-nap");
    expect(mateChore(0, false)).toBe("none");
  });

  it("titles a crewmate in plain words", () => {
    expect(mateTitle(mate(0, { state: 1 }))).toBe("Cozy Dango 1 (skipper) · Focusing. Open Study Rooms");
    expect(mateTitle(mate(1, { away: true }))).toBe("Cozy Dango 2 · Away. Open Study Rooms");
  });
});

describe("cheer bubbles", () => {
  it("words every cheer and sticker, and nothing else", () => {
    expect(cheerWords(0)).toEqual({ text: ROOM_CHEERS[0], sticker: false });
    expect(cheerWords(23)).toEqual({ text: ROOM_CHEERS[23], sticker: false });
    expect(cheerWords(24)).toEqual({ text: "100% Goal", sticker: true });
    expect(cheerWords(ROOM_CHEERS.length + STICKER_IDS.length - 1)).toEqual({ text: "Dango Trio", sticker: true });
    for (const say of [null, -1, 1.5, ROOM_CHEERS.length + STICKER_IDS.length]) expect(cheerWords(say)).toBeNull();
  });

  it("draws every say index, and draws nothing for none", () => {
    for (let say = 0; say < ROOM_CHEERS.length + STICKER_IDS.length; say++) {
      const rec = fakeContext();
      drawCheerBubble(rec.ctx, { x: 0, y: 0 }, say, 0.8);
      expect(rec.bad).toEqual([]);
      expect(rec.saves).toBe(rec.restores);
      expect(rec.saves).toBeGreaterThan(0);
    }
    const none = fakeContext();
    drawCheerBubble(none.ctx, { x: 0, y: 0 }, null);
    expect(none.saves).toBe(0);
  });
});

describe("scene spots", () => {
  it("gives up to 4 desk spots and 5 break spots, all different", () => {
    expect(deskSpots(0)).toEqual([]);
    expect(deskSpots(2)).toHaveLength(2);
    expect(deskSpots(9)).toHaveLength(4);
    expect(breakSpots(9)).toHaveLength(5);
    for (const spots of [deskSpots(4), breakSpots(5)]) {
      expect(new Set(spots.map((s) => `${s.x},${s.y}`)).size).toBe(spots.length);
    }
    expect(breakSpots(5).filter((s) => s.swim).every((s) => s.dryY !== undefined)).toBe(true);
  });
});

describe("crewmates in the Ink & Paper scenes", () => {
  const theme = getKawaiiTheme(null);

  for (const n of [0, 1, 5]) {
    it(`renders the focus desk with ${n} crewmate${n === 1 ? "" : "s"}`, () => {
      for (const frame of FRAMES) {
        const rec = fakeContext();
        const regions = renderStudyDeskScene(rec.ctx, WIDE, frame, { theme, objective: "Cell biology", focusProgress: 0.5, crew: crew(n) });
        expect(rec.bad).toEqual([]);
        expect(rec.saves).toBe(rec.restores);
        // 4 behind the desk; a fifth is a "+1" tag.
        expect(regions.map((r) => r.id)).toEqual([...crew(Math.min(n, 4)).map((m) => `mate:${m.key}`), ...(n > 4 ? ["mate:more"] : [])]);
      }
    });

    it(`renders the break with ${n} crewmate${n === 1 ? "" : "s"}`, () => {
      for (const frame of FRAMES) {
        const rec = fakeContext();
        const regions = renderBreakScene(rec.ctx, WIDE, frame, { theme, crew: crew(n) });
        expect(rec.bad).toEqual([]);
        expect(rec.saves).toBe(rec.restores);
        expect(regions.map((r) => r.id)).toEqual(crew(n).map((m) => `mate:${m.key}`));
      }
    });
  }

  it("shows 2 crewmates and a +n tag on a narrow screen", () => {
    const desk = renderStudyDeskScene(fakeContext().ctx, PHONE, STILL_FRAME, { theme, objective: null, crew: crew(5) });
    expect(desk.map((r) => r.id)).toEqual([`mate:${mate(0).key}`, `mate:${mate(1).key}`, "mate:more"]);
    expect(desk[2]!.label).toBe("3 more in your study room. Open Study Rooms");
    const brk = renderBreakScene(fakeContext().ctx, PHONE, STILL_FRAME, { theme, crew: crew(5) });
    expect(brk).toHaveLength(3);
  });

  it("still draws the scenes with no crew given", () => {
    expect(renderStudyDeskScene(fakeContext().ctx, WIDE, STILL_FRAME, { theme, objective: null })).toEqual([]);
    expect(renderBreakScene(fakeContext().ctx, WIDE, STILL_FRAME, { theme })).toEqual([]);
  });
});

describe("crewmates at the deck's galley tables", () => {
  const ship = SHIPS.find((s) => s.id === "woolly-wanderer") ?? SHIPS[0]!;
  const layout = shipLayout(ship);
  const roomCrew = (n: number): CrewOnDeck[] =>
    crew(n).map((m) => ({ id: m.key, name: m.label, avatar: DEFAULT_AVATAR, state: "SAILING_FOCUS", ghost: false, costume: m.costume, accessory: m.accessory, roomState: m.state, away: m.away, cheer: m.cheer, skipper: m.skipper }));
  const localSailor: CrewOnDeck = { id: "peer-1", name: "Local friend", avatar: DEFAULT_AVATAR, state: "SAILING_FOCUS", ghost: false };

  for (const tinyInk of [true, false]) {
    it(`seats room crewmates first, then the local crew, in ${tinyInk ? "Ink & Paper" : "Full Color"}`, () => {
      for (const frame of FRAMES) {
        const rec = fakeContext();
        const out = renderDeck(
          rec.ctx,
          WIDE,
          frame,
          {
            ship,
            loadout: defaultLoadout(ship),
            env: ENVIRONMENTS[ship.environment],
            me: { avatar: DEFAULT_AVATAR, state: "SAILING_FOCUS" },
            crew: [...roomCrew(2), localSailor],
            tree: { state: "resting", fruit: 0, progress: 0, shake: 10 },
            helmAngle: 0,
            bellSwing: 0,
            tinyInk,
            kawaiiTheme: tinyInk ? getKawaiiTheme(null) : undefined,
          },
          layout,
        );
        expect(rec.bad).toEqual([]);
        expect(rec.saves).toBe(rec.restores);
        const ids = out.regions.map((r) => r.id);
        const seated = Math.min(3, layout.tables.length * 2);
        expect(ids.filter((id) => id.startsWith("mate:"))).toEqual(roomCrew(2).slice(0, seated).map((c) => `mate:${c.id}`));
        if (seated > 2) expect(ids).toContain("crew:peer-1");
        // The house crew stay where they were.
        if (tinyInk) expect(ids).toEqual(expect.arrayContaining(["minion:captain", "minion:banana", "minion:teddy", "minion:bunny", "minion:pigeon"]));
      }
    });
  }
});
