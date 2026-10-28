// Dev gallery for the ship artwork (dev/ships.html). Not part of the app.
//
// Query options:
//   ?view=ships|sails|figureheads|flags|decor|all   which sheets to show (default all)
//   ?ship=<id>     only that ship, big
//   ?still=1       freeze on STILL_FRAME (for screenshots)
//   ?t=<seconds>   freeze at that time, with motion (to check animation poses)
//   ?wind=<0..1>   wind strength
//   ?markers=1     dots, labels and footprints at every layout point
//   ?crew=1        stand-in props and placeholder sailors at the stations
//   ?w=<px>        cell width
//   ?fw=<px>       flag cell width; ?flag=<id> shows one flag

import type { FigureheadId, FlagId, SailStyle, ShipDefinition, ShipLoadout } from "@ship/shared-types";
import { CABIN_DECOR, DEFAULT_AVATAR, ENVIRONMENTS, FIGUREHEADS, FLAGS, SAILS, SHIPS, defaultLoadout, getShip } from "@ship/ship-theme-kit";
import type { EnvironmentTheme } from "@ship/ship-theme-kit";
import { drawGalleyTable, drawStudyStation } from "../ship-engine/AvatarRenderer.js";
import { circlePath, paint, roundRectPath } from "../ship-engine/draw.js";
import { STILL_FRAME } from "../ship-engine/types.js";
import type { Ctx, FrameInfo } from "../ship-engine/types.js";
import { drawCabinDecor, drawShip, shipLayout } from "../ships/index.js";
import type { HullLayout } from "../ships/index.js";
import { drawFlag } from "../ships/parts/flags.js";

const q = new URLSearchParams(location.search);
const still = q.get("still") === "1";
const fixedT = q.has("t") ? Number(q.get("t")) : null;
const windParam = q.has("wind") ? Number(q.get("wind")) : null;
const markers = q.get("markers") === "1";
const crew = q.get("crew") === "1";
const only = q.get("ship");
const view = q.get("view") ?? "all";
const cellW = Number(q.get("w") ?? (only ? 1400 : 700));

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Scene {
  canvas: HTMLCanvasElement;
  draw(ctx: Ctx, w: number, h: number, frame: FrameInfo): void;
}

const scenes: Scene[] = [];
const root = document.getElementById("root")!;
const nav = document.getElementById("nav")!;

for (const v of ["all", "ships", "sails", "figureheads", "flags", "decor"]) {
  const a = document.createElement("a");
  const p = new URLSearchParams(q);
  p.set("view", v);
  p.delete("ship");
  a.href = `?${p}`;
  a.textContent = v;
  nav.appendChild(a);
}

function section(title: string): HTMLElement {
  const h = document.createElement("h2");
  h.textContent = title;
  root.appendChild(h);
  const grid = document.createElement("div");
  grid.className = "grid";
  root.appendChild(grid);
  return grid;
}

function cell(parent: HTMLElement, caption: string, w: number, h: number, draw: Scene["draw"]): void {
  const fig = document.createElement("figure");
  const canvas = document.createElement("canvas");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  fig.appendChild(canvas);
  const cap = document.createElement("figcaption");
  cap.textContent = caption;
  fig.appendChild(cap);
  parent.appendChild(fig);
  scenes.push({ canvas, draw });
}

// ---------------------------------------------------------------------------
// Scenery: a simple sky and flat water, with front water covering the hull below the waterline.

function sky(ctx: Ctx, w: number, h: number, env: EnvironmentTheme): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, env.skyTop);
  g.addColorStop(1, env.skyBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function water(ctx: Ctx, env: EnvironmentTheme, y: number, box: Box, front: boolean, frame: FrameInfo): void {
  const x0 = box.left - 400;
  const x1 = box.right + 400;
  if (env.cloudSea) {
    const color = front ? env.sea[1] : env.sea[0];
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x0, y + 400);
    for (let x = x0; x <= x1; x += 60) {
      const yy = y + (front ? 6 : -10) + 10 * Math.sin(x * 0.02 + frame.t * 0.3);
      ctx.arc(x, yy, 46, Math.PI, 0);
    }
    ctx.lineTo(x1, y + 400);
    ctx.closePath();
    ctx.fill();
    return;
  }
  ctx.fillStyle = front ? env.sea[1] : env.sea[0];
  ctx.beginPath();
  ctx.moveTo(x0, y + 600);
  for (let x = x0; x <= x1; x += 20) ctx.lineTo(x, y + (front ? 4 : -6) + 4 * Math.sin(x * 0.03 + frame.t * (front ? 1.2 : 0.8)));
  ctx.lineTo(x1, y + 600);
  ctx.closePath();
  ctx.fill();
  if (front) {
    ctx.strokeStyle = env.foam;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 20) {
      const yy = y + 4 + 4 * Math.sin(x * 0.03 + frame.t * 1.2);
      if (x === x0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// Stand-in props (the engine draws the real ones) and markers

function standIns(ctx: Ctx, l: HullLayout, frame: FrameInfo): void {
  // Helm: a wheel on a post.
  paint(ctx, (c) => roundRectPath(c, l.helm.x - 8, l.helm.y - 60, 16, 60, 4), "#7A4A2B");
  paint(ctx, (c) => circlePath(c, l.helm.x, l.helm.y - 70, 30), "rgba(160,110,60,0.9)");
  // Citrus trees.
  for (const t of [l.citrusTree, ...l.orchard]) {
    paint(ctx, (c) => roundRectPath(c, t.x - 22, t.y - 34, 44, 34, 6), "#B5523B");
    paint(ctx, (c) => roundRectPath(c, t.x - 6, t.y - 90, 12, 60, 4), "#7A4A2B");
    paint(ctx, (c) => circlePath(c, t.x, t.y - 112, 44), "#5FAE4E");
    for (const [dx, dy] of [[-18, -118], [14, -100], [6, -132], [-6, -96]]) paint(ctx, (c) => circlePath(c, t.x + dx, t.y + dy, 6), "#FFA42B");
  }
  // Bell.
  paint(ctx, (c) => {
    c.moveTo(l.bell.x - 6, l.bell.y + 14);
    c.quadraticCurveTo(l.bell.x - 8, l.bell.y + 4, l.bell.x, l.bell.y + 4);
    c.quadraticCurveTo(l.bell.x + 8, l.bell.y + 4, l.bell.x + 6, l.bell.y + 14);
    c.lineTo(l.bell.x + 18, l.bell.y + 50);
    c.lineTo(l.bell.x - 18, l.bell.y + 50);
    c.closePath();
  }, "#E3B341");
  try {
    drawStudyStation(ctx, { avatar: DEFAULT_AVATAR, state: "SAILING_FOCUS", desk: "captains-desk", at: l.desk }, frame);
    const mate = { avatar: { ...DEFAULT_AVATAR, hat: "bandana" as const, coatColor: "#5B8FD1" }, state: "SAILING_FOCUS" as const };
    for (const t of l.tables) drawGalleyTable(ctx, t, [mate, { ...mate, avatar: { ...mate.avatar, coatColor: "#E8743B" } }], frame);
  } catch {
    // The avatar renderer is someone else's work in progress; the gallery shouldn't die with it.
  }
}

function drawMarkers(ctx: Ctx, l: HullLayout, scale: number): void {
  const px = 1 / scale;
  ctx.save();
  ctx.font = `${12 * px}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  const dot = (x: number, y: number, color: string, label?: string) => {
    ctx.beginPath();
    ctx.arc(x, y, 5 * px, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.5 * px;
    ctx.strokeStyle = "#000";
    ctx.stroke();
    if (label) {
      ctx.fillStyle = "#000";
      ctx.fillText(label, x + px, y - 8 * px + px);
      ctx.fillStyle = "#fff";
      ctx.fillText(label, x, y - 8 * px);
    }
  };
  const box = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x - w / 2, y - h, w, h);
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 1 * px;
    ctx.strokeRect(x - w / 2, y - h, w, h);
  };
  box(l.helm.x, l.helm.y, 70, 100, "rgba(255,200,0,0.25)");
  box(l.citrusTree.x, l.citrusTree.y, 90, 150, "rgba(0,200,80,0.25)");
  for (const o of l.orchard) box(o.x, o.y, 90, 150, "rgba(0,200,80,0.2)");
  box(l.desk.x, l.desk.y, 150, 190, "rgba(255,80,80,0.25)");
  for (const t of l.tables) box(t.x, t.y, 130, 170, "rgba(80,140,255,0.25)");
  box(l.bell.x, l.bell.y + 60, 40, 60, "rgba(255,255,255,0.35)");
  ctx.setLineDash([8 * px, 6 * px]);
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = 1.5 * px;
  ctx.beginPath();
  ctx.moveTo(-600, l.waterline);
  ctx.lineTo(600, l.waterline);
  ctx.moveTo(-600, l.keel);
  ctx.lineTo(600, l.keel);
  ctx.moveTo(l.deck.from, 20);
  ctx.lineTo(l.deck.to, 20);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const s of l.surfaces ?? []) {
    ctx.strokeStyle = "rgba(255,0,255,0.9)";
    ctx.lineWidth = 3 * px;
    ctx.beginPath();
    ctx.moveTo(s.from, s.y);
    ctx.lineTo(s.to, s.y);
    ctx.stroke();
  }
  if (l.bounds) {
    ctx.strokeStyle = "rgba(255,255,0,0.7)";
    ctx.lineWidth = 1 * px;
    ctx.strokeRect(l.bounds.left, l.bounds.top, l.bounds.right - l.bounds.left, l.bounds.bottom - l.bounds.top);
  }
  l.masts.forEach((m, i) => {
    dot(m.x, m.base, "#fff", `mast${i}`);
    dot(m.x, m.top, "#ccc");
  });
  dot(l.bow.x, l.bow.y, "#f0f", "bow");
  ctx.beginPath();
  ctx.moveTo(l.bow.x, l.bow.y);
  ctx.lineTo(l.bow.x + Math.cos(l.bow.angle) * 50, l.bow.y + Math.sin(l.bow.angle) * 50);
  ctx.strokeStyle = "#f0f";
  ctx.lineWidth = 2 * px;
  ctx.stroke();
  dot(l.flag.x, l.flag.y, "#f80", "flag");
  dot(l.helm.x, l.helm.y, "#fc0", "helm");
  dot(l.citrusTree.x, l.citrusTree.y, "#0c4", "tree");
  l.orchard.forEach((o, i) => dot(o.x, o.y, "#0c4", `orch${i}`));
  dot(l.bell.x, l.bell.y, "#fff", "bell");
  dot(l.desk.x, l.desk.y, "#f44", "desk");
  l.tables.forEach((t, i) => dot(t.x, t.y, "#48f", `t${i}`));
  l.smoke.forEach((s) => dot(s.x, s.y, "#888", "smoke"));
  ctx.restore();
}

// ---------------------------------------------------------------------------

function shipScene(ship: ShipDefinition, loadout: ShipLoadout, crop?: Box): Scene["draw"] {
  const env = ENVIRONMENTS[ship.environment];
  return (ctx, w, h, frame) => {
    sky(ctx, w, h, env);
    const l = shipLayout(ship);
    const b = crop ?? { ...(l.bounds ?? { left: -560, top: -580, right: 600, bottom: 150 }), bottom: l.waterline + 50 };
    const pad = 14;
    const scale = Math.min((w - pad * 2) / (b.right - b.left), (h - pad * 2) / (b.bottom - b.top));
    ctx.save();
    ctx.translate(w / 2 - ((b.left + b.right) / 2) * scale, h / 2 - ((b.top + b.bottom) / 2) * scale);
    ctx.scale(scale, scale);
    water(ctx, env, l.waterline, b, false, frame);
    drawShip(ctx, ship, loadout, frame, (layout) => {
      if (crew) standIns(ctx, layout, frame);
    });
    water(ctx, env, l.waterline, b, true, frame);
    if (markers) drawMarkers(ctx, l, scale);
    ctx.restore();
  };
}

const shipH = (w: number) => Math.round(w * 0.6);
const shipsToShow = only ? SHIPS.filter((s) => s.id === only) : SHIPS;

if (view === "all" || view === "ships" || only) {
  const grid = section("Ships (default loadouts)");
  for (const ship of shipsToShow) cell(grid, `${ship.name} — ${ship.hull}`, cellW, shipH(cellW), shipScene(ship, defaultLoadout(ship)));
}

if (!only && (view === "all" || view === "sails")) {
  const grid = section("Sails");
  const hosts = [getShip("woolly-wanderer")!, getShip("crimson-corsair")!];
  for (const sail of SAILS) {
    for (const host of hosts) {
      cell(grid, `${sail.id} on ${host.name}`, 460, 300, shipScene(host, { ...defaultLoadout(host), sails: sail.id as SailStyle }));
    }
  }
}

if (!only && (view === "all" || view === "figureheads")) {
  const grid = section("Figureheads (bow close-ups)");
  const host = getShip("golden-mane")!;
  for (const f of FIGUREHEADS) {
    if (f.id === "none") continue;
    cell(grid, f.id, 300, 260, shipScene(host, { ...defaultLoadout(host), figurehead: f.id as FigureheadId }, { left: 370, top: -170, right: 640, bottom: 60 }));
  }
}

if (!only && (view === "all" || view === "flags")) {
  const grid = section("Flags");
  const host = getShip("woolly-wanderer")!;
  const fw = Number(q.get("fw") ?? 260);
  const flags = q.get("flag") ? FLAGS.filter((f) => f.id === q.get("flag")) : FLAGS;
  for (const f of flags) {
    cell(grid, `${f.id} (${f.name})`, fw, Math.round(fw * 0.77), (ctx, w, h, frame) => {
      sky(ctx, w, h, ENVIRONMENTS["tropical-sea"]);
      ctx.save();
      ctx.translate(w * 0.72, h * 0.2);
      ctx.scale((1.4 * w) / 260, (1.4 * w) / 260);
      paint(ctx, (c) => roundRectPath(c, -4, -6, 8, 140, 3), "#8B5A2B");
      drawFlag(ctx, f.id as FlagId, { x: 0, y: 0 }, frame, host);
      ctx.restore();
    });
  }
}

if (!only && (view === "all" || view === "decor")) {
  const grid = section("Captain's Quarters decor");
  for (const ship of SHIPS) {
    cell(grid, `${ship.name}: ${CABIN_DECOR[ship.id]}`, 260, 260, (ctx, w, h, frame) => {
      ctx.fillStyle = "#6B4A33";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#8A6346";
      for (let x = 0; x < w; x += 40) ctx.fillRect(x, 0, 3, h * 0.78);
      ctx.fillStyle = "#4E3424";
      ctx.fillRect(0, h * 0.78, w, h * 0.22);
      ctx.save();
      ctx.translate(w / 2, h * 0.8);
      ctx.scale(1.2, 1.2);
      drawCabinDecor(ctx, ship.id, { x: 0, y: 0 }, frame);
      if (markers) {
        ctx.strokeStyle = "rgba(255,255,0,0.8)";
        ctx.strokeRect(-80, -160, 160, 160);
      }
      ctx.restore();
    });
  }
}

// ---------------------------------------------------------------------------

function frameAt(t: number, dt: number): FrameInfo {
  if (still) return { ...STILL_FRAME, wind: windParam ?? STILL_FRAME.wind };
  if (fixedT !== null) return { t: fixedT, dt: 0, reducedMotion: false, wind: windParam ?? 0.6 };
  return { t, dt, reducedMotion: false, wind: windParam ?? 0.6 };
}

let last = performance.now();
const start = last;
function render(now: number): void {
  const frame = frameAt((now - start) / 1000, Math.min(0.05, (now - last) / 1000));
  last = now;
  for (const s of scenes) {
    const ctx = s.canvas.getContext("2d")!;
    const dpr = s.canvas.width / parseFloat(s.canvas.style.width);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, s.canvas.width, s.canvas.height);
    s.draw(ctx, s.canvas.width / dpr, s.canvas.height / dpr, frame);
  }
  if (!still && fixedT === null) requestAnimationFrame(render);
  else document.body.dataset.ready = "1";
}
requestAnimationFrame(render);
