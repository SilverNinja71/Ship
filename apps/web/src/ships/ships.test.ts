import { describe, expect, it } from "vitest";
import type { FlagId, ShipDefinition, ShipLoadout } from "@ship/shared-types";
import { CABIN_DECOR, SHIPS, defaultLoadout, partsForShip } from "@ship/ship-theme-kit";
import type { Ctx, FrameInfo, Point } from "../ship-engine/types.js";
import { STILL_FRAME } from "../ship-engine/types.js";
import { drawCabinDecor, drawShip, shipLayout } from "./index.js";
import type { HullLayout } from "./index.js";
import { FOOTPRINT } from "./kit.js";

// ---------------------------------------------------------------------------
// A fake 2D context: accepts every method and property, and records calls.

interface Recorder {
  ctx: Ctx;
  calls: string[];
  bad: string[];
  saves: number;
  restores: number;
}

function fakeContext(record = false): Recorder {
  const rec: Recorder = { ctx: null as unknown as Ctx, calls: [], bad: [], saves: 0, restores: 0 };
  const gradient = { addColorStop: () => {} };
  const props: Record<string | symbol, unknown> = {};
  const handler: ProxyHandler<object> = {
    get(_t, key) {
      if (key in props) return props[key];
      if (key === "createLinearGradient" || key === "createRadialGradient" || key === "createConicGradient" || key === "createPattern") return () => gradient;
      if (key === "measureText") return () => ({ width: 10 });
      if (key === "getTransform") return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      if (key === "getLineDash") return () => [];
      return (...args: unknown[]) => {
        if (key === "save") rec.saves++;
        if (key === "restore") rec.restores++;
        for (const a of args) if (typeof a === "number" && !Number.isFinite(a)) rec.bad.push(`${String(key)}(${args.join(",")})`);
        if (record) rec.calls.push(`${String(key)}(${args.map((a) => (typeof a === "number" ? a.toFixed(3) : typeof a)).join(",")})`);
      };
    },
    set(_t, key, value) {
      props[key] = value;
      if (typeof value === "number" && !Number.isFinite(value)) rec.bad.push(`${String(key)}=${value}`);
      if (record) rec.calls.push(`${String(key)}=${typeof value === "number" ? value.toFixed(3) : String(value)}`);
      return true;
    },
  };
  rec.ctx = new Proxy({}, handler) as Ctx;
  return rec;
}

const frames: FrameInfo[] = [
  STILL_FRAME,
  { t: 1.7, dt: 0.016, reducedMotion: false, wind: 1 },
  { t: 13.3, dt: 0.016, reducedMotion: false, wind: 0 },
  { t: 42.05, dt: 0.016, reducedMotion: true, wind: 0.4 },
];

/** Every loadout worth drawing for a ship: each fitting sail, figurehead and flag, over the defaults. */
function loadoutsFor(ship: ShipDefinition): ShipLoadout[] {
  const base = defaultLoadout(ship);
  const out: ShipLoadout[] = [base];
  for (const s of partsForShip(ship, "sails")) out.push({ ...base, sails: s.id as ShipLoadout["sails"] });
  for (const f of partsForShip(ship, "figurehead")) out.push({ ...base, figurehead: f.id as ShipLoadout["figurehead"] });
  for (const f of partsForShip(ship, "flag")) out.push({ ...base, flag: f.id as FlagId });
  return out;
}

describe("drawShip", () => {
  for (const ship of SHIPS) {
    it(`draws ${ship.id} with every part that fits, at several times, without throwing`, () => {
      for (const loadout of loadoutsFor(ship)) {
        for (const frame of frames) {
          const rec = fakeContext();
          let decks = 0;
          const layout = drawShip(rec.ctx, ship, loadout, frame, () => decks++);
          expect(decks).toBe(1);
          expect(layout.masts.length).toBe(ship.mastCount);
          expect(rec.bad, `non-finite numbers for ${ship.id} ${JSON.stringify(loadout)}`).toEqual([]);
          expect(rec.saves).toBe(rec.restores);
        }
      }
    });
  }

  it("is a pure function of the frame: the same frame draws the same calls", () => {
    for (const ship of SHIPS) {
      const frame = { t: 3.21, dt: 0.016, reducedMotion: false, wind: 0.7 };
      const a = fakeContext(true);
      const b = fakeContext(true);
      drawShip(a.ctx, ship, defaultLoadout(ship), frame);
      drawShip(b.ctx, ship, defaultLoadout(ship), frame);
      expect(a.calls.length).toBeGreaterThan(100);
      expect(a.calls).toEqual(b.calls);
    }
  });

  it("returns the same layout as shipLayout", () => {
    for (const ship of SHIPS) expect(drawShip(fakeContext().ctx, ship, defaultLoadout(ship), STILL_FRAME)).toEqual(shipLayout(ship));
  });
});

describe("drawCabinDecor", () => {
  it("draws every ship's decor item", () => {
    expect(Object.keys(CABIN_DECOR).sort()).toEqual(SHIPS.map((s) => s.id).sort());
    for (const ship of SHIPS) {
      for (const frame of frames) {
        const rec = fakeContext();
        drawCabinDecor(rec.ctx, ship.id, { x: 0, y: 0 }, frame);
        expect(rec.bad).toEqual([]);
        expect(rec.saves).toBe(rec.restores);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Layout invariants: the engine places props and sailors at these points.

interface Box {
  name: string;
  from: number;
  to: number;
  top: number;
  bottom: number;
}

/** How wide and tall each thing the engine draws is (sailors reach ~190 above their surface). */
const HEIGHT = { helm: 110, tree: 160, desk: 190, table: 190 };

function stationBoxes(l: HullLayout): Box[] {
  const box = (name: string, p: Point, w: number, h: number): Box => ({ name, from: p.x - w / 2, to: p.x + w / 2, top: p.y - h, bottom: p.y });
  return [
    box("helm", l.helm, FOOTPRINT.helm, HEIGHT.helm),
    box("tree", l.citrusTree, FOOTPRINT.tree, HEIGHT.tree),
    box("desk", l.desk, FOOTPRINT.desk, HEIGHT.desk),
    ...l.tables.map((t, i) => box(`table${i}`, t, FOOTPRINT.table, HEIGHT.table)),
    ...l.orchard.map((o, i) => box(`orchard${i}`, o, FOOTPRINT.orchard, HEIGHT.tree)),
  ];
}

const overlapX = (a: Box, b: Box) => a.from < b.to && b.from < a.to;
const overlap = (a: Box, b: Box) => overlapX(a, b) && a.top < b.bottom && b.top < a.bottom;

describe("shipLayout", () => {
  for (const ship of SHIPS) {
    describe(ship.id, () => {
      const l = shipLayout(ship);

      it("has one mast per mastCount, stern to bow, the tallest near -560", () => {
        expect(l.masts.length).toBe(ship.mastCount);
        for (let i = 1; i < l.masts.length; i++) expect(l.masts[i].x).toBeGreaterThan(l.masts[i - 1].x);
        for (const m of l.masts) expect(m.top).toBeLessThan(m.base);
        if (l.masts.length) {
          const tallest = Math.min(...l.masts.map((m) => m.top));
          expect(tallest).toBeGreaterThanOrEqual(-580);
          expect(tallest).toBeLessThanOrEqual(-500);
          // The flag flies from the top of the tallest mast.
          const flagMast = l.masts.find((m) => m.top === tallest)!;
          expect(l.flag).toEqual({ x: flagMast.x, y: flagMast.top });
        } else {
          expect(l.flag.y).toBeLessThan(-150);
        }
      });

      it("keeps the deck, waterline and keel sensible", () => {
        expect(l.deck.from).toBeLessThan(l.deck.to);
        expect(l.deck.from).toBeGreaterThanOrEqual(-500);
        expect(l.deck.to).toBeLessThanOrEqual(500);
        expect(l.waterline).toBeGreaterThan(0);
        expect(l.keel).toBeGreaterThan(l.waterline);
        expect(Number.isFinite(l.bow.angle)).toBe(true);
      });

      it("offers 2 to 4 galley tables, and an orchard only with the citrus-trees extra", () => {
        expect(l.tables.length).toBeGreaterThanOrEqual(2);
        expect(l.tables.length).toBeLessThanOrEqual(4);
        expect(l.orchard.length > 0).toBe(ship.extras.includes("citrus-trees"));
      });

      it("stands every station on a walkable surface, fully inside it", () => {
        expect(l.surfaces?.length).toBeGreaterThan(0);
        for (const b of stationBoxes(l)) {
          const s = l.surfaces!.find((s) => s.y === b.bottom && s.from <= b.from + 0.5 && b.to <= s.to + 0.5);
          expect(s, `${b.name} [${b.from}, ${b.to}] @ ${b.bottom}`).toBeDefined();
        }
      });

      it("never lets two stations overlap along the deck", () => {
        const boxes = stationBoxes(l);
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            expect(overlapX(boxes[i], boxes[j]), `${boxes[i].name} vs ${boxes[j].name}`).toBe(false);
          }
        }
      });

      it("hangs the bell with 60 units of clear space under it", () => {
        const bell: Box = { name: "bell", from: l.bell.x - 20, to: l.bell.x + 20, top: l.bell.y, bottom: l.bell.y + 60 };
        for (const b of stationBoxes(l)) expect(overlap(bell, b), `bell vs ${b.name}`).toBe(false);
      });

      it("puts smoke where there is something to smoke", () => {
        const smoky = ship.extras.some((e) => e === "smokestacks" || e === "kitchen-chimney" || e === "woodstove");
        if (smoky) expect(l.smoke.length).toBeGreaterThan(0);
        for (const p of l.smoke) expect(p.y).toBeLessThan(-150);
      });

      it("has bounds around the masts, flag and stations", () => {
        const b = l.bounds!;
        const pts = [l.flag, l.helm, l.citrusTree, l.desk, l.bell, ...l.tables, ...l.orchard, ...l.masts.map((m) => ({ x: m.x, y: m.top }))];
        for (const p of pts) {
          expect(p.x).toBeGreaterThanOrEqual(b.left);
          expect(p.x).toBeLessThanOrEqual(b.right);
          expect(p.y).toBeGreaterThanOrEqual(b.top);
          expect(p.y).toBeLessThanOrEqual(b.bottom);
        }
      });
    });
  }
});
