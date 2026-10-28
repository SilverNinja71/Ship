// The Captain's Quarters: a zoomed cabin with a porthole onto the voyage,
// a bookshelf, a hanging lantern, the sailor at their desk and the ship's
// one themed decor item. Room units: 1000 wide, floor at y = 540. A ship
// with a cabin-room sprite swaps the walls, shelf, rug and lantern for it.

import type { AvatarLoadout, AvatarState, ShipDefinition, ShipLoadout } from "@ship/shared-types";
import { SHIP_SPRITE, SPRITE_FOLDERS } from "@ship/shared-types";
import { CABIN_PORTHOLE } from "@ship/ship-theme-kit";
import type { EnvironmentTheme } from "@ship/ship-theme-kit";
import { drawCabinDecor } from "../ships/index.js";
import { STATION_HEIGHT, drawStudyStation } from "./AvatarRenderer.js";
import { INK, alpha, circlePath, clamp, mix, paint, radialGradient, rng, roundRectPath, shade, sway, withTransform } from "./draw.js";
import { rectRegion } from "./hitRegions.js";
import type { HitRegion } from "./hitRegions.js";
import { drawSeaBack, drawSeaFront, drawSky } from "./OceanEngine.js";
import type { Viewport } from "./ShipRenderer.js";
import { drawSprite } from "./sprites/paint.js";
import { sprites } from "./sprites/store.js";
import type { Ctx, FrameInfo } from "./types.js";

export interface QuartersScene {
  ship: ShipDefinition;
  loadout: ShipLoadout;
  env: EnvironmentTheme;
  me: { avatar: AvatarLoadout; state: AvatarState };
}

const ROOM_W = 1000;
const ROOM_H = 640;
const FLOOR = 540;
const STATION_SCALE = 2.05;
const PORTHOLE = CABIN_PORTHOLE;

export function renderQuarters(ctx: Ctx, view: Viewport, frame: FrameInfo, scene: QuartersScene): HitRegion[] {
  const { env, ship } = scene;
  const availH = Math.max(200, view.height - view.insetTop - view.insetBottom * 0.6);
  const u = clamp(Math.min(view.width / ROOM_W, availH / ROOM_H), 0.25, 2.2);
  const ox = (view.width - ROOM_W * u) / 2;
  const oy = view.insetTop + (availH - ROOM_H * u) / 2;
  const wood = mix("#8A5A36", ship.palette.hullDark, 0.18);
  const regions: HitRegion[] = [];

  // Walls fill the whole screen, so wide windows never show a gap.
  ctx.fillStyle = shade(wood, -0.1);
  ctx.fillRect(0, 0, view.width, view.height);

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(u, u);

  const room = sprites.sprite(SPRITE_FOLDERS.ship(ship.id), SHIP_SPRITE.cabinRoom);
  if (room) {
    // The room art leaves the porthole see-through, so the sea goes in first.
    drawPortholeView(ctx, env, frame, u, ox, oy, view.dpr);
    drawSprite(ctx, room, 0, 0);
  } else {
    drawWall(ctx, wood, view, ox, oy, u);
    drawPorthole(ctx, env, frame, u, ox, oy, view.dpr);
    drawBookshelf(ctx, ship.id);
    drawRug(ctx, ship.palette.accent);
    drawLantern(ctx, frame, ship.palette.glow ?? "#FFD27A", env.night);
  }
  regions.push(rectRegion(ctx, view.dpr, "porthole", "Porthole: back to the deck", PORTHOLE.x - PORTHOLE.r, PORTHOLE.y - PORTHOLE.r, PORTHOLE.r * 2, PORTHOLE.r * 2));
  regions.push(rectRegion(ctx, view.dpr, "bookshelf", "Bookshelf: open the Captain's Log", 40, 150, 210, FLOOR - 150));

  drawCabinDecor(ctx, ship.id, { x: 905, y: FLOOR }, frame);
  regions.push(rectRegion(ctx, view.dpr, "decor", "Cabin decor", 835, FLOOR - 200, 140, 200));

  const desk = { x: 500, y: FLOOR + 6 };
  drawStudyStation(ctx, { avatar: scene.me.avatar, state: scene.me.state, desk: scene.loadout.desk, at: desk, scale: STATION_SCALE, seed: 1 }, frame);
  regions.push(rectRegion(ctx, view.dpr, "avatar", "You: open the Wardrobe", desk.x - 110, desk.y - STATION_HEIGHT * STATION_SCALE, 220, STATION_HEIGHT * STATION_SCALE - 150));
  regions.push(rectRegion(ctx, view.dpr, "desk", "Desk: review flashcards", desk.x - 160, desk.y - 150, 320, 150));
  ctx.restore();

  // Night outside makes a dim cabin, warmed by the lantern.
  if (env.night) {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "rgba(70,60,110,0.35)";
    ctx.fillRect(0, 0, view.width, view.height);
    ctx.restore();
    lanternGlow(ctx, ox + 330 * u, oy + 205 * u, 520 * u, frame, ship.palette.glow ?? "#FFD27A", 0.28);
  } else {
    lanternGlow(ctx, ox + 330 * u, oy + 205 * u, 380 * u, frame, ship.palette.glow ?? "#FFD27A", 0.12);
  }
  return regions;
}

function drawWall(ctx: Ctx, wood: string, view: Viewport, ox: number, oy: number, u: number): void {
  // Extend the planks past the room box to the screen edges.
  const left = -ox / u - 10;
  const right = (view.width - ox) / u + 10;
  const top = -oy / u - 10;
  const bottom = (view.height - oy) / u + 10;
  const plank = 70;
  for (let x = Math.floor(left / plank) * plank, i = 0; x < right; x += plank, i++) {
    ctx.fillStyle = i % 2 ? wood : shade(wood, 0.06);
    ctx.fillRect(x, top, plank, FLOOR - top);
    ctx.fillStyle = alpha(INK, 0.25);
    ctx.fillRect(x, top, 3, FLOOR - top);
    // Knots in the wood.
    const r = rng(i * 13 + 5);
    if (r() > 0.5) paint(ctx, (c) => c.ellipse(x + 20 + r() * 30, 80 + r() * 380, 6, 3, 0, 0, Math.PI * 2), shade(wood, -0.2), { stroke: false });
  }
  // A ceiling beam.
  paint(ctx, (c) => c.rect(left, 20, right - left, 46), shade(wood, -0.25), { stroke: INK });
  // Floorboards.
  ctx.fillStyle = shade(wood, -0.18);
  ctx.fillRect(left, FLOOR, right - left, bottom - FLOOR);
  ctx.strokeStyle = alpha(INK, 0.3);
  ctx.lineWidth = 3;
  for (let y = FLOOR + 22; y < bottom; y += 26) {
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }
  paint(ctx, (c) => c.rect(left, FLOOR - 12, right - left, 14), shade(wood, -0.32), { stroke: INK });
}

function drawPorthole(ctx: Ctx, env: EnvironmentTheme, frame: FrameInfo, u: number, ox: number, oy: number, dpr: number): void {
  const { x, y, r } = PORTHOLE;
  drawPortholeView(ctx, env, frame, u, ox, oy, dpr);
  drawPortholeRim(ctx, x, y, r);
}

/** The sky and sea through the porthole glass. */
function drawPortholeView(ctx: Ctx, env: EnvironmentTheme, frame: FrameInfo, u: number, ox: number, oy: number, dpr: number): void {
  const { x, y, r } = PORTHOLE;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  // A little viewport onto the same sky and sea as the deck: the porthole's
  // box becomes the "screen" the ocean renderer draws into.
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, (ox + (x - r) * u) * dpr, (oy + (y - r) * u) * dpr);
  const size = 2 * r * u;
  const geo = { width: size, height: size, seaY: size * 0.58, unit: u * 0.7 };
  drawSky(ctx, env, geo, frame);
  drawSeaBack(ctx, env, geo, frame);
  drawSeaFront(ctx, env, geo, frame);
  ctx.restore();
  // Glass glare.
  ctx.fillStyle = alpha("#FFFFFF", 0.18);
  ctx.beginPath();
  ctx.ellipse(x - r * 0.35, y - r * 0.4, r * 0.5, r * 0.18, -0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPortholeRim(ctx: Ctx, x: number, y: number, r: number): void {
  // Brass rim and rivets.
  ctx.beginPath();
  ctx.arc(x, y, r + 14, 0, Math.PI * 2);
  ctx.lineWidth = 30;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.lineWidth = 23;
  ctx.strokeStyle = "#D9A93A";
  ctx.stroke();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#F2D27A";
  ctx.beginPath();
  ctx.arc(x, y, r + 14, Math.PI * 1.05, Math.PI * 1.6);
  ctx.stroke();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    paint(ctx, (c) => circlePath(c, x + Math.cos(a) * (r + 14), y + Math.sin(a) * (r + 14), 4.5), "#B8862B", { width: 2 });
  }
}

function drawBookshelf(ctx: Ctx, shipId: string): void {
  const x = 40;
  const top = 150;
  const w = 210;
  const shelfWood = "#6B4423";
  paint(ctx, (c) => roundRectPath(c, x, top, w, FLOOR - top, 8), shelfWood);
  const rand = rng(shipId.length * 17 + 3);
  const colors = ["#C2524A", "#2E5E8B", "#3F7A4A", "#D9822B", "#6B4C9A", "#E3B341", "#1F8A8A", "#F2E6C9"];
  for (let s = 0; s < 4; s++) {
    const shelfY = top + 22 + s * 92;
    ctx.fillStyle = shade(shelfWood, -0.35);
    ctx.fillRect(x + 12, shelfY, w - 24, 76);
    let bx = x + 16;
    while (bx < x + w - 34) {
      const bw = 13 + rand() * 12;
      const bh = 48 + rand() * 24;
      const lean = rand() > 0.88 ? 0.18 : 0;
      const color = colors[Math.floor(rand() * colors.length)];
      withTransform(ctx, { x: bx, y: shelfY + 76, rotate: lean }, () => {
        paint(ctx, (c) => roundRectPath(c, 0, -bh, bw, bh, 2), color, { width: 2.5 });
        ctx.fillStyle = alpha("#FFFFFF", 0.35);
        ctx.fillRect(2, -bh + 8, bw - 4, 3);
      });
      bx += bw + (lean ? 8 : 2);
    }
    paint(ctx, (c) => c.rect(x + 6, shelfY + 76, w - 12, 10), shade(shelfWood, 0.1), { width: 2.5 });
  }
}

function drawRug(ctx: Ctx, accent: string): void {
  paint(ctx, (c) => c.ellipse(500, FLOOR + 40, 300, 34, 0, 0, Math.PI * 2), mix(accent, "#C2524A", 0.4), { width: 3 });
  ctx.strokeStyle = alpha("#FFF1D6", 0.6);
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.ellipse(500, FLOOR + 40, 270, 24, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

function flicker(frame: FrameInfo): number {
  if (frame.reducedMotion) return 1;
  return 0.88 + 0.07 * Math.sin(frame.t * 7.3) + 0.05 * Math.sin(frame.t * 13.1 + 1.3);
}

function drawLantern(ctx: Ctx, frame: FrameInfo, glow: string, night: boolean): void {
  const swing = sway(frame.t, 0.8, 0, frame.reducedMotion) * 0.04;
  withTransform(ctx, { x: 330, y: 66, rotate: swing }, () => {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 92);
    ctx.stroke();
    paint(ctx, (c) => roundRectPath(c, -26, 92, 52, 14, 5), "#3E3A4A");
    const f = flicker(frame);
    paint(ctx, (c) => roundRectPath(c, -22, 104, 44, 62, 10), mix("#FFE7A0", glow, 0.4));
    ctx.fillStyle = radialGradient(ctx, 0, 136, 26, [
      [0, alpha("#FFFFFF", 0.9 * f)],
      [1, alpha(glow, night ? 0.4 : 0.15)],
    ]);
    ctx.fillRect(-20, 106, 40, 58);
    for (const dx of [-22, 0, 22]) {
      ctx.fillStyle = "#3E3A4A";
      ctx.fillRect(dx - 2.5, 104, 5, 62);
    }
    paint(ctx, (c) => roundRectPath(c, -26, 164, 52, 12, 5), "#3E3A4A");
  });
}

function lanternGlow(ctx: Ctx, x: number, y: number, r: number, frame: FrameInfo, glow: string, strength: number): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = radialGradient(ctx, x, y, r, [
    [0, alpha(glow, strength * flicker(frame))],
    [1, alpha(glow, 0)],
  ]);
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

/** Room-unit height of the scene, for tests and the HUD layout. */
export const QUARTERS_SIZE = { width: ROOM_W, height: ROOM_H, floor: FLOOR };
