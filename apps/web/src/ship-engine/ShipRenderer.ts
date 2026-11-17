// The Main Deck view: sky, sea, the whole ship bobbing on the waves, and
// everything standing on its deck. Returns the frame's clickable regions.

import type { AvatarLoadout, AvatarState, ShipDefinition, ShipLoadout } from "@ship/shared-types";
import type { EnvironmentTheme } from "@ship/ship-theme-kit";
import { drawShip } from "../ships/index.js";
import type { HullLayout } from "../ships/index.js";
import { GALLEY_SEAT_SCALE, GALLEY_SEAT_X, HEAD_TOP, STATION_HEIGHT, drawGalleyTable, drawStudyStation } from "./AvatarRenderer.js";
import type { CrewSeat } from "./AvatarRenderer.js";
import { alpha, clamp, hashString, paint, roundRectPath, sway, withTransform } from "./draw.js";
import { rectRegion, toScreen } from "./hitRegions.js";
import type { HitRegion } from "./hitRegions.js";
import { drawClouds, drawLightShafts, drawMist, drawScenery, drawSeaBack, drawSeaFront, drawSky, surfaceAt } from "./OceanEngine.js";
import type { SeaGeometry } from "./OceanEngine.js";
import type { EmitterContext } from "./ParticleFX.js";
import { drawBell, drawCitrusTree, drawDeckCritters, drawHelm, drawLabel } from "./props.js";
import type { TreeLook } from "./props.js";
import { drawPastelMinion } from "./minions.js";
import { toTinyInkAvatar, toTinyInkEnv, toTinyInkShip } from "./tinyInk.js";
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
  tinyInk?: boolean;
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

export function renderDeck(ctx: Ctx, view: Viewport, frame: FrameInfo, rawScene: DeckScene, layout: HullLayout): DeckOutput {
  const tiny = Boolean(rawScene.tinyInk);
  const scene: DeckScene = tiny
    ? {
        ...rawScene,
        env: toTinyInkEnv(rawScene.env),
        ship: toTinyInkShip(rawScene.ship),
        me: { ...rawScene.me, avatar: toTinyInkAvatar(rawScene.me.avatar) },
        crew: rawScene.crew.map((c) => ({ ...c, avatar: toTinyInkAvatar(c.avatar) })),
      }
    : rawScene;
  const { env, ship } = scene;
  const cam = deckCamera(view, layout);
  const geo: SeaGeometry = { width: view.width, height: view.height, seaY: cam.seaY, unit: cam.unit };
  const u = cam.unit;

  drawSky(ctx, env, geo, frame, tiny);
  drawClouds(ctx, env, geo, frame, tiny);
  if (!tiny) drawScenery(ctx, env, geo, frame);
  drawSeaBack(ctx, env, geo, frame, tiny);

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

  if (tiny) {
    drawTinyInkShip(ctx, layout, frame, (l) => {
      drawDeckLife(ctx, view.dpr, frame, scene, l, regions, u);
      treeAt = toScreen(ctx, { x: l.citrusTree.x, y: l.citrusTree.y - 130 }, view.dpr);
    });
  } else {
    drawShip(ctx, ship, scene.loadout, frame, (l) => {
      drawDeckLife(ctx, view.dpr, frame, scene, l, regions, u);
      treeAt = toScreen(ctx, { x: l.citrusTree.x, y: l.citrusTree.y - 130 }, view.dpr);
    });
  }

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

  drawSeaFront(ctx, env, geo, frame, tiny);
  if (!tiny) {
    drawMist(ctx, env, geo, frame);
    drawLightShafts(ctx, env, geo, frame);
  }

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

  const tiny = Boolean(scene.tinyInk);
  drawHelm(ctx, l.helm, scene.helmAngle, ship.palette.trim, tiny);
  if (tiny) {
    drawPastelMinion(ctx, { x: l.helm.x + 18, y: l.helm.y }, "captain", frame, { scale: 1.06, seed: 7 });
  }
  regions.push(rectRegion(ctx, dpr, "helm", "Helm: plan your voyage", l.helm.x - 48, l.helm.y - 125, 96, 125));

  if (!tiny) {
    for (const spot of l.orchard) drawCitrusTree(ctx, spot, scene.tree, frame, hashString(`${spot.x}`), tiny);
    drawCitrusTree(ctx, l.citrusTree, scene.tree, frame, 3, tiny);
    regions.push(rectRegion(ctx, dpr, "tree", "Citrus tree", l.citrusTree.x - 55, l.citrusTree.y - 205, 110, 205));
    for (const spot of l.orchard) regions.push(rectRegion(ctx, dpr, "tree", "Citrus tree", spot.x - 55, spot.y - 205, 110, 205));
  }

  if (!tiny) {
    drawBell(ctx, l.bell, scene.bellSwing, glow, tiny);
    regions.push(rectRegion(ctx, dpr, "bell", "Ship's bell", l.bell.x - 28, l.bell.y - 6, 56, 64));
  }

  // Cute companion critters & pastel costume minions grounded directly on their deck surfaces!
  const { bowX, hullTopY } = tinyInkHullMetrics(l);
  const birdAt = tiny ? { x: bowX - 24, y: hullTopY - 9 } : { x: l.bow.x - 16, y: l.bow.y - 4 };
  drawDeckCritters(ctx, birdAt, { x: l.desk.x + 86, y: surfaceYAt(l, l.desk.x + 86) }, frame);
  drawPastelMinion(ctx, { x: l.desk.x + 125, y: surfaceYAt(l, l.desk.x + 125) }, "banana", frame, { scale: 1.32, seed: 1, chore: "sweep" });
  drawPastelMinion(ctx, { x: l.desk.x + 205, y: surfaceYAt(l, l.desk.x + 205) }, "teddy", frame, { scale: 1.28, seed: 2, chore: "none" });
  drawPastelMinion(ctx, { x: l.deck.to - 145, y: surfaceYAt(l, l.deck.to - 145) }, "bunny", frame, { scale: 1.24, seed: 3, chore: "spyglass" });

  if (!tiny) {
    drawStudyStation(ctx, { avatar: scene.me.avatar, state: scene.me.state, desk: scene.loadout.desk, at: l.desk, seed: 1 }, frame);
    regions.push(rectRegion(ctx, dpr, "avatar", "You: open the Wardrobe", l.desk.x - 55, l.desk.y - STATION_HEIGHT, 110, STATION_HEIGHT - 70));
  }
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
      withTransform(ctx, {}, () => drawLabel(ctx, c.name, x, top - 18 * tagScale - side * 30 * tagScale, tagScale, c.ghost ? "ghost" : "plain", tiny));
      const id = c.ghost ? (`ghost:${c.id}` as const) : (`crew:${c.id}` as const);
      regions.push(rectRegion(ctx, dpr, id, c.ghost ? `${c.name} (ghost ship: a replay of their last session)` : c.name, x - 40, top, 80, table.y - top));
    });
  });
}

const TINY_OUTLINE = "#A29C93";
const TINY_SHADOW = "#EAE5DA";

/** Deterministic coordinate-seeded jitter in [-amp, amp] so hand-drawn strokes never shimmer. */
function sketchJitter(seed: number, amp: number): number {
  const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return ((s - Math.floor(s)) * 2 - 1) * amp;
}

/** Finds the walkable deck surface y at x so props and minions never float above the deck. */
function surfaceYAt(l: HullLayout, x: number): number {
  if (l.surfaces && l.surfaces.length > 0) {
    const hit = l.surfaces.find((s) => x >= s.from && x <= s.to);
    if (hit) return hit.y;
    let best = l.surfaces[0];
    let bestDist = Math.min(Math.abs(x - best.from), Math.abs(x - best.to));
    for (const s of l.surfaces) {
      const d = Math.min(Math.abs(x - s.from), Math.abs(x - s.to));
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    return best.y;
  }
  return l.desk.y;
}

function tinyInkHullMetrics(layout: HullLayout) {
  const { deck, keel, surfaces } = layout;
  const minSurf = surfaces?.reduce((m, s) => Math.min(m, s.from), deck.from) ?? deck.from;
  const maxSurf = surfaces?.reduce((m, s) => Math.max(m, s.to), deck.to) ?? deck.to;
  const sternX = Math.min(deck.from - 92, minSurf - 20);
  const bowX = Math.max(deck.to + 96, maxSurf + 36);
  const hullTopY = -12;
  const hullBottomY = Math.min(keel - 12, 154);
  return { sternX, bowX, hullTopY, hullBottomY };
}

function sketchLine(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, color: string, width: number, seed: number): void {
  const mx = (x1 + x2) / 2 + sketchJitter(seed + 1, 1.4);
  const my = (y1 + y2) / 2 + sketchJitter(seed + 2, 1.8);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x1 + sketchJitter(seed + 3, 0.7), y1 + sketchJitter(seed + 4, 0.7));
  ctx.quadraticCurveTo(mx, my, x2 + sketchJitter(seed + 5, 0.7), y2 + sketchJitter(seed + 6, 0.7));
  ctx.stroke();
  ctx.restore();
}

/** Draws a cream/pastel box with soft drop shadow and Mr. Tiny Studio open-corner hand-drawn outline. */
function sketchOpenRoundedBox(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  width: number,
  seed: number,
): void {
  paint(ctx, (c) => roundRectPath(c, x + 4, y + 5, w, h, r), alpha(TINY_SHADOW, 0.85), { stroke: false });
  paint(ctx, (c) => roundRectPath(c, x, y, w, h, r), fill, { width, stroke: TINY_OUTLINE });
}

/** Ultra-minimal Mr. Tiny Studio boat: hand-sketched cream silhouette, imperfect strokes & open corners. */
function drawTinyInkShip(ctx: Ctx, layout: HullLayout, frame: FrameInfo, onDeck: (layout: HullLayout) => void): void {
  const { deck, masts, flag, helm, surfaces } = layout;
  const { sternX, bowX, hullTopY, hullBottomY } = tinyInkHullMetrics(layout);

  // 1. Simple pastel/cream masts & clean billowing cream sails (behind deck life)
  for (let i = 0; i < masts.length; i++) {
    const m = masts[i];
    const h = m.base - m.top;
    const tilt = sketchJitter(i * 19 + 1, 2.2);
    // Slightly imperfect hand-drawn mast pole with soft shadow
    paint(ctx, (c) => roundRectPath(c, m.x - 3, m.top + 4, 12, h + 6, 6), alpha(TINY_SHADOW, 0.8), { stroke: false });
    paint(ctx, (c) => {
      c.moveTo(m.x - 5.5 + tilt, m.top);
      c.lineTo(m.x + 5.5 + tilt, m.top + 1);
      c.lineTo(m.x + 6.5, m.base + 8);
      c.lineTo(m.x - 6.5, m.base + 8);
      c.closePath();
    }, "#F5F0E2", { stroke: false });
    sketchLine(ctx, m.x - 5.5 + tilt, m.top + 3, m.x - 6.5, m.base + 6, TINY_OUTLINE, 2.6, i * 31 + 1);
    sketchLine(ctx, m.x + 5.5 + tilt, m.top + 2, m.x + 6.5, m.base + 4, TINY_OUTLINE, 2.6, i * 31 + 7);
    sketchLine(ctx, m.x - 5 + tilt, m.top + 1, m.x + 5 + tilt, m.top + 1.5, TINY_OUTLINE, 2.4, i * 31 + 13);

    // Hand-sketched puffy cream sail with gentle asymmetry
    const sailTop = m.top + Math.min(46, h * 0.12);
    const sailBot = m.base - Math.min(68, h * 0.16);
    const sailW = Math.min(185, h * 0.38);
    const billow = 18 + sway(frame.t, 1.1, i + 1, frame.reducedMotion) * 8 * (0.5 + frame.wind);
    const j1 = sketchJitter(i * 41 + 1, 3.5);
    const j2 = sketchJitter(i * 41 + 2, 3.5);
    const j3 = sketchJitter(i * 41 + 3, 3.5);
    const traceSail = (c: Ctx, ox: number, oy: number) => {
      c.moveTo(m.x + ox - sailW * 0.42 + j1 * 0.4, sailTop + oy);
      c.quadraticCurveTo(m.x + ox + sailW * 0.1, sailTop + oy - 10 + j2, m.x + ox + sailW * 0.56, sailTop + oy + 8 + j3 * 0.5);
      c.quadraticCurveTo(m.x + ox + sailW * 0.62 + billow + j1, (sailTop + sailBot) / 2 + oy, m.x + ox + sailW * 0.54, sailBot + oy - 2);
      c.quadraticCurveTo(m.x + ox + sailW * 0.05, sailBot + oy + 11 + j2 * 0.6, m.x + ox - sailW * 0.46, sailBot + oy - 4);
      c.quadraticCurveTo(m.x + ox - sailW * 0.34 + billow * 0.35 + j3, (sailTop + sailBot) / 2 + oy, m.x + ox - sailW * 0.42 + j1 * 0.4, sailTop + oy);
      c.closePath();
    };
    paint(ctx, (c) => traceSail(c, 5, 5), alpha(TINY_SHADOW, 0.85), { stroke: false });
    paint(ctx, (c) => traceSail(c, 0, 0), "#FFFFFF", { width: 2.9, stroke: TINY_OUTLINE });
  }

  // 2. Cute pastel banana pennant flag (no dark skull pirate flag!)
  const flutter = sway(frame.t, 2.2, 5, frame.reducedMotion) * 6;
  const tracePennant = (c: Ctx, ox: number, oy: number) => {
    c.moveTo(flag.x + ox, flag.y + oy + 2);
    c.quadraticCurveTo(flag.x + ox - 44, flag.y + oy - 9 + flutter * 0.5, flag.x + ox - 92, flag.y + oy + 16 + flutter);
    c.quadraticCurveTo(flag.x + ox - 44, flag.y + oy + 33 + flutter * 0.4, flag.x + ox, flag.y + oy + 36);
    c.closePath();
  };
  paint(ctx, (c) => tracePennant(c, 3, 4), TINY_SHADOW, { stroke: false });
  paint(ctx, (c) => tracePennant(c, 0, 0), "#FFF3A8", { width: 2.8, stroke: TINY_OUTLINE });
  ctx.save();
  ctx.strokeStyle = TINY_OUTLINE;
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(flag.x - 32, flag.y + 18 + flutter * 0.3, 9, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.restore();

  // 3. Raised deck platforms for every raised surface (quarterdeck, forecastle, etc.) so nothing floats!
  const raised = (surfaces ?? []).filter((s) => s.y < -4);
  if (raised.length > 0) {
    raised.forEach((s, idx) => {
      sketchOpenRoundedBox(ctx, s.from - 8, s.y, s.to - s.from + 16, Math.abs(s.y) + 18, 12, "#F7F2E4", 3.0, 200 + idx * 17);
    });
  } else if (helm.y < -10) {
    const sternLeft = Math.min(deck.from - 65, helm.x - 75);
    const sternRight = Math.max(deck.from + 20, helm.x + 75);
    sketchOpenRoundedBox(ctx, sternLeft, helm.y, sternRight - sternLeft, Math.abs(helm.y) + 18, 12, "#F7F2E4", 3.0, 200);
  }

  // 4. Props, Captain Minion, pastel chore minions, and perched bird on deck
  onDeck(layout);

  // 5. Hand-sketched cream/ivory boat hull silhouette in front of deck edge
  const hJ1 = sketchJitter(301, 2.8);
  const hJ2 = sketchJitter(302, 2.8);
  const hJ3 = sketchJitter(303, 2.4);
  const traceHull = (c: Ctx, ox: number, oy: number) => {
    c.moveTo(sternX + ox, hullTopY + oy + hJ1 * 0.4);
    c.quadraticCurveTo(sternX + ox + 14 + hJ2, hullBottomY + oy - 12, sternX + ox + 130, hullBottomY + oy + hJ3 * 0.5);
    c.quadraticCurveTo((sternX + bowX) / 2 + ox, hullBottomY + oy + 3 + hJ1 * 0.5, bowX + ox - 150, hullBottomY + oy);
    c.quadraticCurveTo(bowX + ox - 28, hullBottomY + oy - 10 + hJ2 * 0.5, bowX + ox, hullTopY + oy - 10);
    c.quadraticCurveTo(bowX + ox - 36, oy + 6 + hJ3 * 0.4, deck.to + ox, oy);
    c.quadraticCurveTo((deck.from + deck.to) / 2 + ox, oy + 2.5, deck.from + ox, oy);
    c.quadraticCurveTo(sternX + ox + 28, oy + 2, sternX + ox, hullTopY + oy + hJ1 * 0.4);
    c.closePath();
  };

  paint(ctx, (c) => traceHull(c, 6, 8), TINY_SHADOW, { stroke: false });
  paint(ctx, (c) => traceHull(c, 0, 0), "#FFFDF6", { width: 3.4, stroke: TINY_OUTLINE });

  // Soft cream belly shading band along the lower hull
  ctx.save();
  ctx.beginPath();
  traceHull(ctx, 0, 0);
  ctx.clip();
  ctx.fillStyle = alpha("#EAE5DA", 0.55);
  ctx.fillRect(sternX - 10, hullBottomY - 46, bowX - sternX + 20, 60);
  ctx.restore();

  // Continuous connected deck rim line
  sketchLine(ctx, deck.from, 0.5, deck.to, 0.5, TINY_OUTLINE, 3.0, 501);
}
