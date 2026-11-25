// Study Rooms crewmates in the canvas scenes. Each one is a house character in the costume and
// accessory they picked, doing what they're doing (a focus flame, a boba break, a blanket nap),
// with their made-up name and their latest cheer. Nothing here reads a store: ShipCanvas builds
// the SceneMates each frame (sceneMates in lib/roomRules.ts) and the scenes hand them in.
// Every movement is multiplied by `m`, which is 0 with reduced motion.

import { ROOM_ACCESSORIES, ROOM_CHEERS, STICKER_IDS } from "@ship/shared-types";
import type { RoomState } from "@ship/shared-types";
import type { SceneMate } from "../lib/roomRules.js";
import { alpha, circlePath, ellipsePath, hashString, line, paint, roundRectPath, withTransform } from "./draw.js";
import type { CrewAccessory } from "./kawaiiThemes.js";
import { drawPastelMinion } from "./minions.js";
import type { MinionChore } from "./minions.js";
import { drawPwedoBird } from "./StudySceneRenderer.js";
import type { Ctx, FrameInfo, Point } from "./types.js";

const MARKER_INK = "#8D8D8D";
const OUTLINE_GREY = "#A29C93";
const BUBBLE_FILL = "#FFFDF7";
const BUBBLE_INK = "#6D655C";

/** A spot in a scene, in that scene's own units (feet at x, y). */
export interface SceneSpot extends Point {
  /** In the break scene's pool: a sailor on a break swims there. */
  swim?: boolean;
  /** For a pool spot: where anyone not on a break stands instead, on the pool's near rim. */
  dryY?: number;
  /** Lift the name tag one row, so neighbours' tags don't overlap. */
  tagRow?: number;
}

/** The chore that shows what a crewmate is doing: focusing, on a break, napping (paused or away), or nothing (in port). */
export function mateChore(state: RoomState, away: boolean): MinionChore {
  if (away || state === 3) return "blanket-nap";
  if (state === 1) return "fire-focus";
  if (state === 2) return "boba";
  return "none";
}

/** "Cozy Dango 42 · Focusing", for the hover tooltip. */
export function mateTitle(mate: SceneMate): string {
  const doing = mate.away ? "Away" : mate.state === 1 ? "Focusing" : mate.state === 2 ? "On a break" : mate.state === 3 ? "Paused" : "In port";
  return `${mate.label}${mate.skipper ? " (skipper)" : ""} · ${doing}. Open Study Rooms`;
}

const toAccessory = (id: string): CrewAccessory => ((ROOM_ACCESSORIES as readonly string[]).includes(id) ? (id as CrewAccessory) : "none");

/** How tall a crewmate stands at scale 1, ears included (for name tags and click areas). */
export const MATE_HEIGHT = 62;

/**
 * Draws one crewmate standing at `at` (origin at their feet). The pigeon costume is Pwedo's own
 * bird; the rest are the deck characters' costumes. Away sailors are drawn faded, as their badge is.
 */
export function drawMate(
  ctx: Ctx,
  at: Point,
  mate: SceneMate,
  frame: FrameInfo,
  scale = 1,
  opts: { chore?: MinionChore; shadow?: boolean } = {},
): void {
  const chore = opts.chore ?? mateChore(mate.state, mate.away);
  const seed = (hashString(mate.key) % 89) + 11;
  const accessory = toAccessory(mate.accessory);
  withTransform(ctx, mate.away ? { alpha: 0.6 } : {}, () => {
    if (mate.costume === "pwedo") {
      drawBirdMate(ctx, at, frame, scale, chore, accessory, seed, opts.shadow ?? false);
    } else {
      drawPastelMinion(ctx, at, mate.costume, frame, { scale, seed, chore, accessory, shadow: opts.shadow ?? false });
    }
  });
}

/** Pwedo's bird as a crewmate, with the same chores drawn around it. */
function drawBirdMate(ctx: Ctx, at: Point, frame: FrameInfo, scale: number, chore: MinionChore, accessory: CrewAccessory, seed: number, shadow: boolean): void {
  const m = frame.reducedMotion ? 0 : 1;
  const bs = scale * 1.25;
  const napping = chore === "blanket-nap";
  const bob = Math.sin(frame.t * (napping ? 1.2 : 2.3) + seed * 1.7) * (napping ? 0.6 : 1.2) * m;
  withTransform(ctx, { x: at.x, y: at.y + bob, scale: bs }, () => {
    if (shadow) paint(ctx, (c) => ellipsePath(c, 0, 1, 15, 4), "#DCDCDC", { stroke: false });
    if (chore === "fire-focus") {
      const flicker = Math.sin(frame.t * 9 + seed) * 2 * m;
      paint(
        ctx,
        (c) => {
          c.moveTo(-20, 0);
          c.quadraticCurveTo(-25, -24, -13, -34 - flicker);
          c.lineTo(-5, -44 + flicker * 0.5);
          c.lineTo(1, -52 - flicker);
          c.lineTo(7, -43 + flicker * 0.5);
          c.lineTo(14, -35 - flicker);
          c.quadraticCurveTo(25, -24, 20, 0);
          c.closePath();
        },
        alpha("#F38C7B", 0.72),
        { width: 1.8, stroke: MARKER_INK },
      );
    }
  });
  // The bird's own drawing is centered on its body; its feet reach 19 units down.
  drawPwedoBird(ctx, at.x, at.y + bob - 19 * bs, frame, { scale: bs, showFeet: true, squashY: napping ? 0.9 : 1 });
  withTransform(ctx, { x: at.x, y: at.y + bob - 19 * bs, scale: bs }, () => {
    drawBirdAccessory(ctx, accessory);
    if (chore === "boba") {
      paint(ctx, (c) => c.rect(14, -4, 9, 12), "#F4E5CA", { width: 1.8, stroke: MARKER_INK });
      paint(ctx, (c) => ellipsePath(c, 18.5, -4, 5, 1.8), "#D5E6C8", { width: 1.4, stroke: MARKER_INK });
      line(ctx, [{ x: 18.5, y: -4 }, { x: 21, y: -11 }], "#8EA87D", 1.6);
      paint(ctx, (c) => circlePath(c, 17, 5, 1.1), "#6E5A4F", { stroke: false });
      paint(ctx, (c) => circlePath(c, 20, 5.5, 1.1), "#6E5A4F", { stroke: false });
    } else if (napping) {
      paint(ctx, (c) => ellipsePath(c, 0, 9, 19, 8), "#FFF3A8", { width: 2, stroke: MARKER_INK });
      line(ctx, [{ x: -11, y: 9 }, { x: 11, y: 9 }], "#F9C5C3", 2.4);
      ctx.save();
      ctx.fillStyle = MARKER_INK;
      ctx.font = "italic 700 10px Georgia, serif";
      ctx.fillText("zZ", 10, -20 - Math.sin(frame.t * 2) * 1.5 * m);
      ctx.restore();
    }
  });
}

/** The room accessories, sized for the bird's head (its beak points left). */
function drawBirdAccessory(ctx: Ctx, accessory: CrewAccessory): void {
  switch (accessory) {
    case "astro-helmet":
      paint(ctx, (c) => circlePath(c, -2, 0, 24), alpha("#DCEBFA", 0.26), { width: 2, stroke: "#B5C8E4" });
      line(ctx, [{ x: 8, y: -16 }, { x: 12, y: -11 }], "#FFFFFF", 2);
      break;
    case "cafe-apron":
      paint(ctx, (c) => ellipsePath(c, 2, 7, 8, 6), "#B7CFA0", { width: 1.8, stroke: MARKER_INK });
      paint(ctx, (c) => circlePath(c, 2, 7, 1.8), "#FFFDF7", { stroke: false });
      break;
    case "woodland-sprout":
      line(ctx, [{ x: -3, y: -14 }, { x: -3, y: -21 }], "#7C935A", 1.8);
      paint(ctx, (c) => ellipsePath(c, -7, -21, 4, 2.2, -0.4), "#B7D68E", { width: 1.4, stroke: MARKER_INK });
      paint(ctx, (c) => ellipsePath(c, 1, -21, 4, 2.2, 0.4), "#B7D68E", { width: 1.4, stroke: MARKER_INK });
      break;
    case "sunflower":
      paint(ctx, (c) => circlePath(c, 4, -15, 5), "#FFE066", { width: 1.6, stroke: MARKER_INK });
      paint(ctx, (c) => circlePath(c, 4, -15, 2.1), "#B97D45", { stroke: false });
      break;
    case "pumpkin-cap":
      paint(ctx, (c) => ellipsePath(c, -3, -15, 8, 4.5), "#F09B4B", { width: 1.8, stroke: MARKER_INK });
      line(ctx, [{ x: -3, y: -19 }, { x: -1, y: -23 }], "#7C935A", 2);
      break;
    case "star-pin":
      paint(ctx, (c) => circlePath(c, 9, -7, 3.6), "#FFE48E", { width: 1.6, stroke: MARKER_INK });
      break;
    case "jelly-bow":
      paint(ctx, (c) => ellipsePath(c, -6, -15, 4, 2.4, 0.3), "#B5DCF9", { width: 1.6, stroke: MARKER_INK });
      paint(ctx, (c) => ellipsePath(c, 0, -15, 4, 2.4, -0.3), "#B5DCF9", { width: 1.6, stroke: MARKER_INK });
      break;
    default:
      break;
  }
}

// ---- Where crewmates go -------------------------------------------------------------------------

// The study desk is a slab rotated 0.11 rad around the scene's center, its top edge at y 22:
// a crewmate behind it stands a little below that edge, so the desk tucks their feet away.
const DESK_TILT = 0.11;
const deskTopAt = (x: number) => 22 * Math.cos(DESK_TILT) + x * Math.sin(DESK_TILT);

/** Up to 4 places behind the study desk, clear of the house crew: right of Pip first, then the far left, then further right. */
const DESK_SPOTS: readonly SceneSpot[] = [180, -330, 265, 350].map((x, i) => ({ x, y: Math.round(deskTopAt(x) + 6), tagRow: i === 2 ? 1 : 0 }));

/**
 * Up to 5 places in the break scene, in seat order: the front of the picnic mat, the pool, the
 * mat's other end, the pool, and between the mat and the pool. Their name tags go under their
 * feet (the house crew stand behind them).
 */
const BREAK_SPOTS: readonly SceneSpot[] = [
  { x: -330, y: 136 },
  { x: 110, y: 102, swim: true, dryY: 150 },
  { x: -40, y: 136 },
  { x: 345, y: 88, swim: true, dryY: 142 },
  { x: 40, y: 150, tagRow: 1 },
];

/**
 * On a phone the scene is zoomed out, so name tags (kept about 12 px tall on screen) are wide in
 * scene units: a tag at x 180 would sit on Pip's face and the pigeon on his head. Phones show two
 * crewmates, at the desk's far ends, where their tags and cheers stay clear of Pip.
 */
const DESK_SPOTS_NARROW: readonly SceneSpot[] = [300, -330].map((x) => ({ x, y: Math.round(deskTopAt(x) + 6) }));

/** Where Pip stands at the desk (x), and how far his face and the pigeon reach to each side. */
export const DESK_PIP = { x: 65, halfWidth: 60 } as const;

/** Feet positions behind the study desk for `count` crewmates (at most 4; on a narrow screen at most 2, clear of Pip). */
export function deskSpots(count: number, narrow = false): SceneSpot[] {
  const spots = narrow ? DESK_SPOTS_NARROW : DESK_SPOTS;
  return spots.slice(0, Math.max(0, Math.min(count, spots.length)));
}

/** Feet positions on the picnic mat and in the pool for `count` crewmates (at most 5). */
export function breakSpots(count: number): SceneSpot[] {
  return BREAK_SPOTS.slice(0, Math.max(0, Math.min(count, BREAK_SPOTS.length)));
}

// ---- Cheers -------------------------------------------------------------------------------------

/** StickerArt's names for the 12 stickers (a new sticker id won't compile until it has one here). */
const STICKER_WORDS: Record<(typeof STICKER_IDS)[number], string> = {
  "100-sign": "100% Goal",
  "fire-focus": "Locked In Fire",
  "boba-break": "Boba Break",
  "teacup-nap": "Warm Matcha Cup",
  "plane-pwedo": "Paper Plane Pwedo",
  "blanket-zz": "Cozy Blanket zZ",
  "book-stack": "Book Stack",
  "astro-mochi": "Astro Mochi",
  "mini-dumbbell": "Brain Lift",
  "buttered-toast": "Buttered Toast",
  "star-sparkle": "Star Sparkle",
  "dango-trio": "Dango Trio",
};

/** The words for a `say` index: a cheer (0–23) or a sticker's name (24–35). Null for none. */
export function cheerWords(say: number | null): { text: string; sticker: boolean } | null {
  if (say === null || !Number.isInteger(say) || say < 0) return null;
  if (say < ROOM_CHEERS.length) return { text: ROOM_CHEERS[say]!, sticker: false };
  const id = STICKER_IDS[say - ROOM_CHEERS.length];
  return id ? { text: STICKER_WORDS[id], sticker: true } : null;
}

/**
 * A speech bubble whose tail points down at `at` (above a crewmate's head or name tag). A sticker
 * shows its name after a small drawn star, since the die-cut art itself is SVG.
 */
export function drawCheerBubble(ctx: Ctx, at: Point, say: number | null, scale = 1): void {
  const words = cheerWords(say);
  if (!words) return;
  ctx.save();
  ctx.font = `600 ${Math.round(14 * scale)}px ui-rounded, "SF Pro Rounded", Nunito, system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const star = words.sticker ? 16 * scale : 0;
  const w = ctx.measureText(words.text).width + 20 * scale + star;
  const h = 26 * scale;
  const x = at.x - w / 2;
  const y = at.y - 7 * scale - h;
  const trace = (c: Ctx, ox: number, oy: number) => {
    roundRectPath(c, x + ox, y + oy, w, h, h / 2);
    c.moveTo(at.x - 6 * scale + ox, y + h + oy - 0.5);
    c.lineTo(at.x + ox, at.y + oy);
    c.lineTo(at.x + 5 * scale + ox, y + h + oy - 0.5);
  };
  paint(ctx, (c) => trace(c, 2 * scale, 3 * scale), alpha("#EAE5DA", 0.85), { stroke: false });
  paint(ctx, (c) => trace(c, 0, 0), BUBBLE_FILL, { width: 1.8 * scale, stroke: OUTLINE_GREY });
  if (words.sticker) drawStar(ctx, x + 10 * scale + 6 * scale, y + h / 2, 6.5 * scale);
  ctx.fillStyle = BUBBLE_INK;
  ctx.fillText(words.text, x + 10 * scale + star, y + h / 2 + 1 * scale);
  ctx.restore();
}

function drawStar(ctx: Ctx, cx: number, cy: number, r: number): void {
  paint(
    ctx,
    (c) => {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 === 0 ? r : r * 0.45;
        const px = cx + Math.cos(a) * rr;
        const py = cy + Math.sin(a) * rr;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.closePath();
    },
    "#FCE38A",
    { width: 1.2, stroke: OUTLINE_GREY },
  );
}
