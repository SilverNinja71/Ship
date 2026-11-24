// The Main Deck view: sky, sea, the whole ship bobbing on the waves, and
// everything standing on its deck. Returns the frame's clickable regions.

import type { AvatarLoadout, AvatarState, RoomCostume, RoomState, ShipDefinition, ShipLoadout } from "@ship/shared-types";
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
import type { KawaiiTheme } from "./kawaiiThemes.js";
import { DESK_FAR } from "./avatar/look.js";
import { drawPastelMinion } from "./minions.js";
import { MATE_HEIGHT, drawCheerBubble, drawMate, mateTitle } from "./roomCrew.js";
import { drawThemeBackdrop } from "./themeBackdrop.js";
import { toTinyInkAvatar, toTinyInkEnv, toTinyInkShip } from "./tinyInk.js";
import type { Ctx, FrameInfo, Point } from "./types.js";

export interface CrewOnDeck {
  id: string;
  name: string;
  avatar: AvatarLoadout;
  state: AvatarState;
  ghost: boolean;
  /** A Study Rooms crewmate: drawn as this house character instead of a chibi sailor, in both looks. */
  costume?: RoomCostume;
  accessory?: string;
  /** Study Rooms only: what they're doing (finer than `state`), whether they're away, their cheer showing, and the skipper's hat. */
  roomState?: RoomState;
  away?: boolean;
  cheer?: number | null;
  skipper?: boolean;
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
  preparing?: boolean;
  kawaiiTheme?: KawaiiTheme;
  showAffirmations?: boolean;
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
/** A crewmate character at a galley table: about a seated sailor's size, sitting on the chair behind it. */
const MATE_DECK_SCALE = 1.55;
/** Pwedo's bird is drawn a quarter bigger than the costumes, so a pigeon crewmate gets a smaller scale to match the house Pwedo. */
const MATE_DECK_SCALE_PWEDO = 1.1;
/** How far either side of a galley table its two seated crewmates reach, in ship units. */
const TABLE_REACH = 95;
/** Half a standing house character's width, plus a little air. */
const HOUSE_HALF_WIDTH = 36;
const MATE_SEAT_Y = -28;
/** Below this camera zoom (ship units to px), room crewmates on deck go without name tags. */
const MATE_TAG_MIN_UNIT = 0.5;

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
  const kt = tiny ? rawScene.kawaiiTheme : undefined;
  const tinyEnvBase = tiny ? toTinyInkEnv(rawScene.env) : rawScene.env;
  const themedEnv = kt
    ? {
        ...tinyEnvBase,
        skyTop: kt.canvas.skyTop,
        skyBottom: kt.canvas.skyBottom,
        sea: [kt.canvas.seaTop, kt.canvas.seaBottom, kt.canvas.seaBottom] as [string, string, string],
      }
    : tinyEnvBase;
  const scene: DeckScene = tiny
    ? {
        ...rawScene,
        env: themedEnv,
        ship: toTinyInkShip(rawScene.ship),
        me: { ...rawScene.me, avatar: toTinyInkAvatar(rawScene.me.avatar) },
        crew: rawScene.crew.map((c) => ({ ...c, avatar: toTinyInkAvatar(c.avatar) })),
      }
    : rawScene;
  const { env, ship } = scene;
  const cam = deckCamera(view, layout);
  const geo: SeaGeometry = { width: view.width, height: view.height, seaY: cam.seaY, unit: cam.unit };
  const u = cam.unit;

  if (kt) {
    drawThemeBackdrop(ctx, view.width, view.height, kt, frame, { showAffirmation: rawScene.showAffirmations ?? true });
  } else {
    drawSky(ctx, env, geo, frame, tiny);
  }
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
    drawTinyInkShip(ctx, layout, frame, houseSpots(layout, scene.crew, true), (l) => {
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
  if (tiny && scene.preparing) {
    const pillW = Math.min(310, view.width - 32);
    const pillX = (view.width - pillW) / 2;
    const pillY = view.insetTop + 8;
    paint(ctx, (c) => roundRectPath(c, pillX + 3, pillY + 4, pillW, 30, 15), alpha(TINY_SHADOW, 0.85), { stroke: false });
    paint(ctx, (c) => roundRectPath(c, pillX, pillY, pillW, 30, 15), "#FFFDF7", { width: 2, stroke: TINY_OUTLINE });
    ctx.save();
    ctx.fillStyle = "#6D655C";
    ctx.font = '600 12px ui-serif, Georgia, "Times New Roman", serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Preparing the ship · Sweeping & mopping ♪", view.width / 2, pillY + 15.5);
    ctx.restore();
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
  const helmPos = tiny ? { x: l.helm.x, y: 0 } : l.helm;
  drawHelm(ctx, helmPos, scene.helmAngle, ship.palette.trim, tiny);
  const acc = scene.kawaiiTheme?.accessory ?? "none";
  if (tiny) {
    const capPos = { x: l.helm.x + 22, y: 0 };
    drawPastelMinion(ctx, capPos, "captain", frame, {
      scale: 1.15,
      seed: 7,
      shadow: false,
      cheering: Boolean(scene.preparing),
      chore: scene.preparing ? "mop" : "none",
      accessory: acc,
    });
  }
  regions.push(rectRegion(ctx, dpr, "helm", "Helm: plan your voyage", helmPos.x - 48, helmPos.y - 125, 96, 125));

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

  // The house crew stand on the deck. With crew seated, they're drawn after the galley tables,
  // so the tables (which stand where they do on some ships) never hide them, and they step aside
  // from any table with study room crewmates, so they never stand in front of them.
  const drawHouseCrew = () => {
    // Cute companion pigeon & pastel costume minions grounded directly on the deck!
    const birdAt = tiny ? { x: l.deck.to - 46, y: 0 } : { x: l.bow.x - 16, y: l.bow.y - 4 };
    const { pip: pipX, mochi: mochiX, lumi: lumiX } = houseSpots(l, scene.crew, tiny);
    const pipPos = pipX === null ? null : { x: pipX, y: tiny ? 0 : surfaceYAt(l, pipX) };
    const mochiPos = mochiX === null ? null : { x: mochiX, y: tiny ? 0 : surfaceYAt(l, mochiX) };
    const lumiPos = { x: lumiX, y: tiny ? 0 : surfaceYAt(l, lumiX) };

    drawDeckCritters(ctx, birdAt, { x: l.desk.x + 86, y: tiny ? 0 : surfaceYAt(l, l.desk.x + 86) }, frame);
    if (pipPos)
      drawPastelMinion(ctx, pipPos, "banana", frame, {
        scale: 1.32,
        seed: 1,
        chore: "sweep",
        cheering: Boolean(scene.preparing),
        shadow: !tiny,
        accessory: acc,
      });
    if (mochiPos)
      drawPastelMinion(ctx, mochiPos, "teddy", frame, {
        scale: 1.28,
        seed: 2,
        chore: scene.preparing ? "mop" : "none",
        cheering: Boolean(scene.preparing),
        shadow: !tiny,
        accessory: acc,
      });
    drawPastelMinion(ctx, lumiPos, "bunny", frame, {
      scale: 1.24,
      seed: 3,
      chore: scene.preparing ? "sweep" : "spyglass",
      cheering: Boolean(scene.preparing),
      shadow: !tiny,
      accessory: acc,
    });

    if (tiny) {
      regions.push(rectRegion(ctx, dpr, "minion:captain", "Captain Banan — Steers the ship & keeps everyone calm", helmPos.x - 6, -62, 56, 72));
      if (pipPos) regions.push(rectRegion(ctx, dpr, "minion:banana", "Pip — Banana-wrapped helper who sweeps away distractions", pipPos.x - 28, -68, 56, 78));
      if (mochiPos) regions.push(rectRegion(ctx, dpr, "minion:teddy", "Mochi — Cozy teddy buddy who cheers you on during study sprints", mochiPos.x - 28, -68, 56, 78));
      regions.push(rectRegion(ctx, dpr, "minion:bunny", "Lumi — Bunny lookout keeping watch for off-task tabs", lumiPos.x - 28, -74, 56, 84));
      regions.push(rectRegion(ctx, dpr, "minion:pigeon", "Pwedo — Tiny deck pigeon who loves quiet Pomodoro mornings", birdAt.x - 22, -32, 44, 42));
    }
  };
  const seats = l.tables.length * 2;
  const crew = scene.crew.slice(0, seats);
  if (crew.length === 0) drawHouseCrew();

  if (!tiny) {
    drawStudyStation(ctx, { avatar: scene.me.avatar, state: scene.me.state, desk: scene.loadout.desk, at: l.desk, seed: 1 }, frame);
    regions.push(rectRegion(ctx, dpr, "avatar", "You: open the Wardrobe", l.desk.x - 55, l.desk.y - STATION_HEIGHT, 110, STATION_HEIGHT - 70));
  }
  regions.push(rectRegion(ctx, dpr, "desk", "Desk: review flashcards", l.desk.x - 78, l.desk.y - 72, 156, 72));

  // Crew sit two to a table, in seat order (Study Rooms crewmates first); ghosts fill any seats left over.
  l.tables.forEach((table, i) => {
    const pair = [crew[i * 2] ?? null, crew[i * 2 + 1] ?? null] as const;
    if (!pair[0] && !pair[1]) return;
    const toSeat = (c: CrewOnDeck | null): CrewSeat | null =>
      c && !c.costume ? { avatar: c.avatar, state: c.state, opacity: c.ghost ? 0.45 : 1, seed: hashString(c.id) } : null;
    drawGalleyTable(ctx, table, [toSeat(pair[0]), toSeat(pair[1])], frame, CREW_SCALE);
    // A room crewmate sits on the chair: drawn over the chair back, but cut off at the table top
    // so the table hides their lower half, as it does a seated sailor's.
    const tableTop = table.y + DESK_FAR * GALLEY_SEAT_SCALE * CREW_SCALE;
    pair.forEach((c, side) => {
      if (!c?.costume) return;
      const x = table.x + (side === 0 ? -GALLEY_SEAT_X : GALLEY_SEAT_X) * CREW_SCALE;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - 90, tableTop - 400, 180, 400);
      ctx.clip();
      drawMate(ctx, { x, y: table.y + MATE_SEAT_Y }, deckMate(c), frame, c.costume === "pwedo" ? MATE_DECK_SCALE_PWEDO : MATE_DECK_SCALE);
      ctx.restore();
    });
    pair.forEach((c, side) => {
      if (!c) return;
      const x = table.x + (side === 0 ? -GALLEY_SEAT_X : GALLEY_SEAT_X) * CREW_SCALE;
      const top = c.costume ? table.y + MATE_SEAT_Y - MATE_HEIGHT * (c.costume === "pwedo" ? MATE_DECK_SCALE_PWEDO : MATE_DECK_SCALE) : table.y + HEAD_TOP * GALLEY_SEAT_SCALE * CREW_SCALE;
      // Neighbours' tags are staggered so long names don't overlap; a ghost's tag is pale.
      // A zoomed-out deck (a phone) leaves room crewmates' tags and cheers to the crew strip.
      const tagY = top - 18 * tagScale - side * 30 * tagScale;
      const tagged = !c.costume || unit >= MATE_TAG_MIN_UNIT;
      if (tagged) withTransform(ctx, {}, () => drawLabel(ctx, c.name, x, tagY, tagScale, c.ghost || c.away ? "ghost" : "plain", tiny));
      if (c.costume) {
        // Cheers stack above both of the table's tags: the left seat's first, the right seat's over it.
        const cheerY = top - 18 * tagScale - 30 * tagScale - 16 * tagScale - side * 36 * tagScale;
        if (tagged && c.cheer !== undefined && c.cheer !== null) drawCheerBubble(ctx, { x, y: cheerY }, c.cheer, tagScale);
        regions.push(rectRegion(ctx, dpr, `mate:${c.id}`, mateTitle(deckMate(c)), x - 40, top, 80, table.y - top));
        return;
      }
      const id = c.ghost ? (`ghost:${c.id}` as const) : (`crew:${c.id}` as const);
      regions.push(rectRegion(ctx, dpr, id, c.ghost ? `${c.name} (ghost ship: a replay of their last session)` : c.name, x - 40, top, 80, table.y - top));
    });
  });
  if (crew.length > 0) drawHouseCrew();
}

/**
 * Where the house crew stand on deck (x in ship units): Lumi by the bow, and Pip and Mochi by the
 * desk, unless study room crewmates sit at a galley table there: then they step along to the
 * nearest free spots, so they never stand in front of a crewmate (null: no room on deck).
 */
function houseSpots(l: HullLayout, allCrew: readonly CrewOnDeck[], tiny: boolean): { pip: number | null; mochi: number | null; lumi: number } {
  const crew = allCrew.slice(0, l.tables.length * 2);
  const lumi = l.deck.to - 145;
  const bird = l.deck.to - 46;
  const busy = l.tables.filter((_, i) => crew[i * 2]?.costume || crew[i * 2 + 1]?.costume);
  // With no crewmates at the tables, everyone keeps their usual spot on every ship.
  if (!busy.length) return { pip: l.desk.x + 125, mochi: l.desk.x + 215, lumi };
  const taken: [number, number][] = [
    ...busy.map((t): [number, number] => [t.x - TABLE_REACH, t.x + TABLE_REACH]),
    [l.helm.x - 30, l.helm.x + 60],
    [lumi - 30, lumi + 30],
    [bird - 26, bird + 26],
  ];
  // Ink & Paper draws no desk or sailor of your own on deck, so that spot is free there.
  if (!tiny) taken.push([l.desk.x - 70, l.desk.x + 70]);
  const pip = freeDeckSpot(l.desk.x + 125, taken, l.deck);
  if (pip !== null) taken.push([pip - 30, pip + 30]);
  const mochi = freeDeckSpot(l.desk.x + 215, taken, l.deck);
  return { pip, mochi, lumi };
}

/**
 * Where a house character can stand near `preferred` without covering anything in `taken`
 * (seated crewmates, the desk, the helm, the others), trying ever further either way along the
 * deck; null when the deck is full, and then they stay below deck for now.
 */
function freeDeckSpot(preferred: number, taken: readonly [number, number][], deck: { from: number; to: number }): number | null {
  const lo = deck.from + HOUSE_HALF_WIDTH;
  const hi = deck.to - HOUSE_HALF_WIDTH;
  const clear = (x: number) => x >= lo && x <= hi && taken.every(([a, b]) => x + HOUSE_HALF_WIDTH <= a || x - HOUSE_HALF_WIDTH >= b);
  for (let step = 0; step <= 600; step += 15) {
    if (clear(preferred + step)) return preferred + step;
    if (step && clear(preferred - step)) return preferred - step;
  }
  return null;
}

/** A room crewmate on deck, in the shape roomCrew.ts draws. */
function deckMate(c: CrewOnDeck): Parameters<typeof drawMate>[2] {
  const fromAvatar: RoomState = c.state === "SAILING_FOCUS" ? 1 : c.state === "SHORE_LEAVE_BREAK" ? 2 : 3;
  return {
    key: c.id,
    label: c.name,
    costume: c.costume ?? "pwedo",
    accessory: c.accessory ?? "none",
    skipper: c.skipper ?? false,
    state: c.roomState ?? fromAvatar,
    away: c.away ?? false,
    cheer: c.cheer ?? null,
  };
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

/** Draws a cream/pastel box with soft drop shadow and open-corner hand-drawn outline. */
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

/** Ultra-minimal stationery studio boat: hand-sketched cream silhouette, imperfect strokes & open corners. */
function drawTinyInkShip(ctx: Ctx, layout: HullLayout, frame: FrameInfo, spots: { pip: number | null; mochi: number | null; lumi: number }, onDeck: (layout: HullLayout) => void): void {
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

  // 3. Props, Captain Minion, pastel chore minions, and pigeon directly on flat deck
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

  // Subtle serif character names right below each character on the hull (hover/click for bio),
  // clamped within the hull bounds so names never clip near deck edges.
  const minCaptionX = sternX + 56;
  const maxCaptionX = bowX - 46;
  const capX = (x: number) => clamp(x, minCaptionX, maxCaptionX);
  ctx.save();
  ctx.fillStyle = "#8D8D8D";
  ctx.font = '13px ui-serif, Georgia, Cambria, "Times New Roman", serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("Captain Banan", capX(helm.x + 22), 14);
  // Names follow the characters when they've stepped aside for study room crewmates.
  if (spots.pip !== null) ctx.fillText("Pip", capX(spots.pip), 14);
  if (spots.mochi !== null) ctx.fillText("Mochi", capX(spots.mochi), 14);
  ctx.fillText("Lumi", capX(spots.lumi), 14);
  ctx.fillText("Pwedo", capX(deck.to - 46), 14);
  ctx.restore();
}
