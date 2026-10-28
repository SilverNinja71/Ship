// The Main Deck view: sky, sea, the whole ship bobbing on the waves, and
// everything standing on its deck. Returns the frame's clickable regions.

import type { AvatarLoadout, AvatarState, ShipDefinition, ShipLoadout } from "@ship/shared-types";
import type { EnvironmentTheme } from "@ship/ship-theme-kit";
import { drawShip } from "../ships/index.js";
import type { HullLayout } from "../ships/index.js";
import { GALLEY_SEAT_SCALE, GALLEY_SEAT_X, HEAD_TOP, STATION_HEIGHT, drawGalleyTable, drawStudyStation } from "./AvatarRenderer.js";
import type { CrewSeat } from "./AvatarRenderer.js";
import { clamp, hashString, withTransform } from "./draw.js";
import { rectRegion, toScreen } from "./hitRegions.js";
import type { HitRegion } from "./hitRegions.js";
import { drawClouds, drawLightShafts, drawMist, drawScenery, drawSeaBack, drawSeaFront, drawSky, surfaceAt } from "./OceanEngine.js";
import type { SeaGeometry } from "./OceanEngine.js";
import type { EmitterContext } from "./ParticleFX.js";
import { drawBell, drawCitrusTree, drawHelm, drawLabel } from "./props.js";
import type { TreeLook } from "./props.js";
import type { Ctx, FrameInfo, Point } from "./types.js";

export interface CrewOnDeck {
  id: string;
  name: string;
  avatar: AvatarLoadout;
  state: AvatarState;
  ghost: boolean;
}

export interface DeckScene {
  ship: ShipDefinition;
  loadout: ShipLoadout;
  env: EnvironmentTheme;
  me: { avatar: AvatarLoadout; state: AvatarState };
  /** Crewmates (and ghosts) in seat order; only as many as there are table seats are shown. */
  crew: CrewOnDeck[];
  tree: TreeLook;
  helmAngle: number;
  bellSwing: number;
}

export interface Viewport {
  width: number;
  height: number;
  dpr: number;
  /** CSS pixels kept clear at the top and bottom for the HUD. */
  insetTop: number;
  insetBottom: number;
}

export interface DeckOutput {
  regions: HitRegion[];
  emitter: EmitterContext;
  /** Screen point of the citrus tree's canopy, for coin bursts. */
  treeAt: Point;
  unit: number;
}

// The ship's drawn extent in ship units, flag and figurehead included, when the hull doesn't say.
const DEFAULT_BOUNDS = { left: -560, right: 600, top: -640, bottom: 170 };
const CREW_SCALE = 0.82;

export function deckCamera(view: Viewport, layout: Pick<HullLayout, "waterline" | "bounds">): { unit: number; deckY: number; seaY: number; cx: number } {
  // Pad the drawn box a little, and always leave room below for the waves.
  const b = layout.bounds ?? DEFAULT_BOUNDS;
  const box = { left: b.left - 30, right: b.right + 30, top: b.top - 30, bottom: Math.max(b.bottom, layout.waterline + 90) };
  const availH = Math.max(200, view.height - view.insetTop - view.insetBottom);
  const unit = clamp(Math.min((view.width * 0.94) / (box.right - box.left), (availH * 0.96) / (box.bottom - box.top)), 0.2, 1.35);
  const middle = view.insetTop + availH / 2;
  const deckY = middle - ((box.top + box.bottom) / 2) * unit;
  return { unit, deckY, seaY: deckY + layout.waterline * unit, cx: view.width / 2 - ((box.left + box.right) / 2) * unit };
}

export function renderDeck(ctx: Ctx, view: Viewport, frame: FrameInfo, scene: DeckScene, layout: HullLayout): DeckOutput {
  const { env, ship } = scene;
  const cam = deckCamera(view, layout);
  const geo: SeaGeometry = { width: view.width, height: view.height, seaY: cam.seaY, unit: cam.unit };
  const u = cam.unit;

  drawSky(ctx, env, geo, frame);
  drawClouds(ctx, env, geo, frame);
  drawScenery(ctx, env, geo, frame);
  drawSeaBack(ctx, env, geo, frame);

  // Float on the swell: rise and fall with the surface under the middle, tilt with its slope.
  const span = 320 * u;
  const mid = surfaceAt(cam.cx, geo, frame) - cam.seaY;
  const pitch = Math.atan2(surfaceAt(cam.cx + span, geo, frame) - surfaceAt(cam.cx - span, geo, frame), span * 2) * 0.55;
  const floaty = env.cloudSea ? Math.sin(frame.t * (frame.reducedMotion ? 0.1 : 0.7)) * 10 * u : 0;
  const shipY = cam.deckY + mid * 0.7 + floaty;

  const regions: HitRegion[] = [];
  let treeAt: Point = { x: cam.cx, y: cam.deckY };
  const sailPoints: Point[] = [];
  const smokePoints: Point[] = [];
  let bowPoint: Point = { x: cam.cx + 480 * u, y: cam.seaY };

  ctx.save();
  ctx.translate(cam.cx, shipY);
  ctx.rotate(pitch);
  ctx.scale(u, u);

  drawShip(ctx, ship, scene.loadout, frame, (l) => {
    drawDeckLife(ctx, view.dpr, frame, scene, l, regions, u);
    treeAt = toScreen(ctx, { x: l.citrusTree.x, y: l.citrusTree.y - 130 }, view.dpr);
  });

  regions.push(rectRegion(ctx, view.dpr, "flag", "Flag: open the Shipwright", layout.flag.x - 120, layout.flag.y - 10, 120, 90));
  if (scene.loadout.figurehead !== "none") {
    regions.push(rectRegion(ctx, view.dpr, "figurehead", "Figurehead: open the Shipwright", layout.bow.x - 70, layout.bow.y - 90, 130, 130));
  }
  for (const m of layout.masts) sailPoints.push(toScreen(ctx, { x: m.x, y: (m.top + m.base) / 2 }, view.dpr));
  for (const s of layout.smoke) smokePoints.push(toScreen(ctx, s, view.dpr));
  bowPoint = toScreen(ctx, { x: layout.bow.x - 20, y: layout.waterline }, view.dpr);
  const left = toScreen(ctx, { x: layout.deck.from, y: layout.waterline }, view.dpr);
  const right = toScreen(ctx, { x: layout.deck.to, y: layout.waterline }, view.dpr);
  ctx.restore();

  drawSeaFront(ctx, env, geo, frame);
  drawMist(ctx, env, geo, frame);
  drawLightShafts(ctx, env, geo, frame);

  return {
    regions,
    treeAt,
    unit: u,
    emitter: {
      width: view.width,
      height: view.height,
      unit: u,
      bow: bowPoint,
      smoke: smokePoints,
      sails: sailPoints,
      hull: { left: left.x, right: right.x, waterY: cam.seaY },
      seaY: cam.seaY,
    },
  };
}

/** Props, the sailor and the crew, in ship units, between the deck and the hull front. */
function drawDeckLife(ctx: Ctx, dpr: number, frame: FrameInfo, scene: DeckScene, l: HullLayout, regions: HitRegion[], unit: number): void {
  // Name tags stay about 12 px tall on screen however far the camera zooms out.
  const tagScale = clamp(12.5 / (17 * unit), 0.6, 1.8);
  const { ship } = scene;
  const glow = ship.palette.glow ?? "#FFD27A";

  drawHelm(ctx, l.helm, scene.helmAngle, ship.palette.trim);
  regions.push(rectRegion(ctx, dpr, "helm", "Helm: plan your voyage", l.helm.x - 48, l.helm.y - 125, 96, 125));

  for (const spot of l.orchard) drawCitrusTree(ctx, spot, scene.tree, frame, hashString(`${spot.x}`));
  drawCitrusTree(ctx, l.citrusTree, scene.tree, frame, 3);
  regions.push(rectRegion(ctx, dpr, "tree", "Citrus tree", l.citrusTree.x - 55, l.citrusTree.y - 205, 110, 205));
  for (const spot of l.orchard) regions.push(rectRegion(ctx, dpr, "tree", "Citrus tree", spot.x - 55, spot.y - 205, 110, 205));

  drawBell(ctx, l.bell, scene.bellSwing, glow);
  regions.push(rectRegion(ctx, dpr, "bell", "Ship's bell", l.bell.x - 28, l.bell.y - 6, 56, 64));

  drawStudyStation(ctx, { avatar: scene.me.avatar, state: scene.me.state, desk: scene.loadout.desk, at: l.desk, seed: 1 }, frame);
  regions.push(rectRegion(ctx, dpr, "avatar", "You: open the Wardrobe", l.desk.x - 55, l.desk.y - STATION_HEIGHT, 110, STATION_HEIGHT - 70));
  regions.push(rectRegion(ctx, dpr, "desk", "Desk: review flashcards", l.desk.x - 78, l.desk.y - 72, 156, 72));

  // Crew sit two to a table, in seat order; ghosts fill any seats left over.
  const seats = l.tables.length * 2;
  const crew = scene.crew.slice(0, seats);
  l.tables.forEach((table, i) => {
    const pair = [crew[i * 2] ?? null, crew[i * 2 + 1] ?? null] as const;
    if (!pair[0] && !pair[1]) return;
    const toSeat = (c: CrewOnDeck | null): CrewSeat | null =>
      c ? { avatar: c.avatar, state: c.state, opacity: c.ghost ? 0.45 : 1, seed: hashString(c.id) } : null;
    drawGalleyTable(ctx, table, [toSeat(pair[0]), toSeat(pair[1])], frame, CREW_SCALE);
    pair.forEach((c, side) => {
      if (!c) return;
      const x = table.x + (side === 0 ? -GALLEY_SEAT_X : GALLEY_SEAT_X) * CREW_SCALE;
      const top = table.y + HEAD_TOP * GALLEY_SEAT_SCALE * CREW_SCALE;
      // Neighbours' tags are staggered so long names don't overlap; a ghost's tag is pale.
      withTransform(ctx, {}, () => drawLabel(ctx, c.name, x, top - 18 * tagScale - side * 30 * tagScale, tagScale, c.ghost ? "ghost" : "plain"));
      const id = c.ghost ? (`ghost:${c.id}` as const) : (`crew:${c.id}` as const);
      regions.push(rectRegion(ctx, dpr, id, c.ghost ? `${c.name} (ghost ship: a replay of their last session)` : c.name, x - 40, top, 80, table.y - top));
    });
  });
}
