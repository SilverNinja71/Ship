// Sky, scenery, clouds and the sea. Waves are layered sines with parallax:
// far layers are smaller, slower and paler. The cloud-sea environment draws
// the same layers as puffy cloud banks. Everything is in CSS pixels; `unit`
// is how many pixels one ship unit is, so waves scale with the ship.

import type { EnvironmentTheme } from "@ship/ship-theme-kit";
import { INK, alpha, circlePath, linearGradient, mix, paint, radialGradient, rng, shade } from "./draw.js";
import { drawCloudSprite, drawSkySprite, drawWaveSprites } from "./sprites/ocean.js";
import type { WaveBand } from "./sprites/ocean.js";
import type { Ctx, FrameInfo } from "./types.js";

export interface SeaGeometry {
  width: number;
  height: number;
  /** Screen y of the calm sea surface under the ship. */
  seaY: number;
  /** Pixels per ship unit. */
  unit: number;
}

interface WaveLayer {
  /** Offset from seaY, in ship units (negative = further back, higher up). */
  offset: number;
  amps: [number, number];
  /** Wavelengths in ship units. */
  lengths: [number, number];
  speeds: [number, number];
  phase: number;
}

const LAYERS: WaveLayer[] = [
  { offset: -46, amps: [5, 3], lengths: [520, 230], speeds: [0.25, 0.4], phase: 0.3 },
  { offset: -20, amps: [8, 4], lengths: [610, 260], speeds: [0.38, 0.55], phase: 2.1 },
  { offset: 10, amps: [12, 5], lengths: [700, 300], speeds: [0.55, 0.8], phase: 4.2 },
];

function motion(frame: FrameInfo): number {
  return frame.reducedMotion ? 0.15 : 1;
}

/** Height of wave layer `i` at screen x, in pixels. */
export function waveY(i: number, x: number, geo: SeaGeometry, frame: FrameInfo): number {
  const L = LAYERS[i];
  const t = frame.t * motion(frame);
  const u = x / geo.unit;
  const swell = 0.7 + 0.3 * frame.wind;
  const y =
    L.amps[0] * swell * Math.sin((u / L.lengths[0]) * Math.PI * 2 + t * L.speeds[0] * Math.PI * 2 * 0.25 + L.phase) +
    L.amps[1] * swell * Math.sin((u / L.lengths[1]) * Math.PI * 2 - t * L.speeds[1] * Math.PI * 2 * 0.25 + L.phase * 1.7);
  return geo.seaY + (L.offset + y) * geo.unit;
}

/** Where wave sprites sit: each layer's resting line, bobbing gently, scrolling at its own speed (far is slower). */
function waveBands(geo: SeaGeometry, frame: FrameInfo): WaveBand[] {
  const t = frame.t * motion(frame);
  const swell = 0.7 + 0.3 * frame.wind;
  return LAYERS.map((L, i) => ({
    y: geo.seaY + (L.offset + L.amps[1] * swell * Math.sin(t * L.speeds[0] * Math.PI * 0.5 + L.phase)) * geo.unit,
    scroll: t * (12 + i * 9) * geo.unit,
  }));
}

/** The surface the ship floats on: the middle layer, smoothed. */
export function surfaceAt(x: number, geo: SeaGeometry, frame: FrameInfo): number {
  return (waveY(1, x, geo, frame) + waveY(2, x, geo, frame)) / 2 - LAYERS[1].offset * geo.unit * 0.5 - LAYERS[2].offset * geo.unit * 0.5;
}

export function drawSky(ctx: Ctx, env: EnvironmentTheme, geo: SeaGeometry, frame: FrameInfo): void {
  const { width: w, height: h } = geo;
  if (drawSkySprite(ctx, env.id, w, h)) return;
  ctx.fillStyle = linearGradient(ctx, 0, 0, 0, geo.seaY, [
    [0, env.skyTop],
    [1, env.skyBottom],
  ]);
  ctx.fillRect(0, 0, w, h);

  if (env.night) drawStars(ctx, geo, frame);

  // The sun or moon sits up and to the right, with a soft halo.
  if (env.celestial !== "none") {
    const cx = w * 0.8;
    const cy = Math.min(geo.seaY * 0.32, h * 0.22);
    const r = Math.max(28, geo.unit * 58);
    ctx.fillStyle = radialGradient(ctx, cx, cy, r * 3.2, [
      [0, alpha(env.celestialColor, 0.55)],
      [1, alpha(env.celestialColor, 0)],
    ]);
    ctx.fillRect(cx - r * 3.2, cy - r * 3.2, r * 6.4, r * 6.4);
    paint(ctx, (c) => circlePath(c, cx, cy, r), env.celestialColor, { stroke: false });
    if (env.celestial === "sun") {
      // Soft stylized sunbeams radiating outward with gentle motion.
      const rays = 12;
      const rot = frame.t * motion(frame) * 0.08;
      const pulse = 1 + 0.05 * Math.sin(frame.t * motion(frame) * 1.5);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.fillStyle = alpha(env.celestialColor, 0.18);
      for (let k = 0; k < rays; k++) {
        const a = (k / rays) * Math.PI * 2;
        const len = r * (1.8 + (k % 2 === 0 ? 0.4 : 0)) * pulse;
        const halfW = 0.06;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a - halfW) * r * 0.95, Math.sin(a - halfW) * r * 0.95);
        ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
        ctx.lineTo(Math.cos(a + halfW) * r * 0.95, Math.sin(a + halfW) * r * 0.95);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      // Bright core highlight on the sun disk.
      ctx.fillStyle = alpha("#FFFFFF", 0.45);
      ctx.beginPath();
      ctx.arc(cx - r * 0.25, cy - r * 0.25, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    } else if (env.celestial === "moon") {
      // Two soft craters and a soft crescent highlight keep the moon reading as a luminous orb.
      const crater = shade(env.celestialColor, -0.12);
      paint(ctx, (c) => circlePath(c, cx - r * 0.3, cy - r * 0.15, r * 0.22), crater, { stroke: false });
      paint(ctx, (c) => circlePath(c, cx + r * 0.25, cy + r * 0.3, r * 0.14), crater, { stroke: false });
      ctx.fillStyle = alpha("#FFFFFF", 0.25);
      ctx.beginPath();
      ctx.arc(cx - r * 0.15, cy - r * 0.15, r * 0.8, -Math.PI * 0.7, Math.PI * 0.1);
      ctx.arc(cx - r * 0.05, cy - r * 0.05, r * 0.7, Math.PI * 0.1, -Math.PI * 0.7, true);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawStars(ctx: Ctx, geo: SeaGeometry, frame: FrameInfo): void {
  const rand = rng(7);
  const count = Math.round((geo.width * geo.seaY) / 9000);
  for (let i = 0; i < count; i++) {
    const x = rand() * geo.width;
    const y = rand() * geo.seaY * 0.85;
    const twinkle = 0.55 + 0.45 * Math.sin(frame.t * motion(frame) * (1 + rand() * 2) + i);
    const r = (0.6 + rand() * 1.3) * Math.max(0.8, geo.unit * 1.2);
    ctx.fillStyle = `rgba(255,250,230,${(0.35 + rand() * 0.5) * twinkle})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // A few brighter stars have a gentle four-point twinkle cross.
    if (i % 6 === 0 && twinkle > 0.65) {
      const sp = r * 2.2;
      ctx.strokeStyle = `rgba(255,250,230,${0.35 * twinkle})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - sp, y);
      ctx.lineTo(x + sp, y);
      ctx.moveTo(x, y - sp);
      ctx.lineTo(x, y + sp);
      ctx.stroke();
    }
  }
}

/** Distant land for each environment, sitting on the horizon behind the far waves. */
export function drawScenery(ctx: Ctx, env: EnvironmentTheme, geo: SeaGeometry, frame: FrameInfo): void {
  const { width: w, unit: u } = geo;
  // A fixed horizon (t = 0) so the land doesn't bob with the waves.
  const horizon = waveY(0, w / 2, geo, { ...frame, t: 0, wind: 0 }) - 6 * u;
  const far = mix(env.skyBottom, env.sea[0], 0.45);
  const farDark = mix(far, INK, 0.12);
  const rand = rng(env.id.length * 31);
  ctx.save();
  switch (env.id) {
    case "tropical-sea": {
      // A little island with two palms.
      const x = w * 0.18;
      paint(ctx, (c) => c.ellipse(x, horizon, 120 * u, 34 * u, 0, Math.PI, 0), mix(far, "#7FB86A", 0.55), { stroke: false });
      for (const [dx, lean] of [[-30, -0.25], [25, 0.2]] as const) {
        const bx = x + dx * u;
        ctx.strokeStyle = mix(far, "#8B6A44", 0.6);
        ctx.lineWidth = 6 * u;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(bx, horizon - 28 * u);
        ctx.quadraticCurveTo(bx + lean * 40 * u, horizon - 70 * u, bx + lean * 70 * u, horizon - 100 * u);
        ctx.stroke();
        const tx = bx + lean * 70 * u;
        const ty = horizon - 100 * u;
        for (let k = 0; k < 5; k++) {
          const a = -Math.PI / 2 + (k - 2) * 0.62;
          paint(ctx, (c) => c.ellipse(tx + Math.cos(a) * 26 * u, ty + Math.sin(a) * 12 * u + 8 * u, 30 * u, 8 * u, a, 0, Math.PI * 2), mix(far, "#4F9A52", 0.65), { stroke: false });
        }
      }
      break;
    }
    case "navy-grey-sea": {
      // A lighthouse on a rocky point, its lamp turning slowly.
      const x = w * 0.14;
      paint(ctx, (c) => c.ellipse(x, horizon, 90 * u, 22 * u, 0, Math.PI, 0), farDark, { stroke: false });
      paint(ctx, (c) => {
        c.moveTo(x - 14 * u, horizon - 12 * u);
        c.lineTo(x - 9 * u, horizon - 110 * u);
        c.lineTo(x + 9 * u, horizon - 110 * u);
        c.lineTo(x + 14 * u, horizon - 12 * u);
        c.closePath();
      }, mix(far, "#F2F4F7", 0.6), { stroke: false });
      ctx.fillStyle = mix(far, "#C8102E", 0.5);
      ctx.fillRect(x - 11 * u, horizon - 75 * u, 22 * u, 12 * u);
      const beam = (frame.t * motion(frame) * 0.6) % (Math.PI * 2);
      ctx.fillStyle = alpha("#FFF4C2", 0.18 + 0.12 * Math.max(0, Math.cos(beam)));
      ctx.beginPath();
      ctx.moveTo(x, horizon - 118 * u);
      ctx.lineTo(x + Math.cos(beam) * 260 * u, horizon - 140 * u);
      ctx.lineTo(x + Math.cos(beam) * 260 * u, horizon - 96 * u);
      ctx.closePath();
      ctx.fill();
      paint(ctx, (c) => circlePath(c, x, horizon - 118 * u, 8 * u), "#FFF4C2", { stroke: false });
      break;
    }
    case "cedar-fjord":
    case "aegean-shallows": {
      const fjord = env.id === "cedar-fjord";
      const peaks = fjord ? [[0.05, 230], [0.2, 300], [0.36, 190], [0.92, 260], [1.05, 210]] : [[0.12, 120], [0.3, 80]];
      for (const [px, ph] of peaks) {
        const x = w * px;
        paint(ctx, (c) => {
          c.moveTo(x - ph * 1.1 * u, horizon);
          c.quadraticCurveTo(x - ph * 0.2 * u, horizon - ph * 1.05 * u, x, horizon - ph * u);
          c.quadraticCurveTo(x + ph * 0.25 * u, horizon - ph * 0.95 * u, x + ph * 1.1 * u, horizon);
          c.closePath();
        }, fjord ? farDark : mix(far, "#C9B79C", 0.4), { stroke: false });
        if (fjord) {
          // Snowy caps.
          paint(ctx, (c) => {
            c.moveTo(x - ph * 0.22 * u, horizon - ph * 0.78 * u);
            c.quadraticCurveTo(x, horizon - ph * 1.04 * u, x + ph * 0.24 * u, horizon - ph * 0.8 * u);
            c.closePath();
          }, "#F5F8FA", { stroke: false });
        }
      }
      if (fjord) {
        for (let i = 0; i < 26; i++) {
          const x = rand() * w * 0.45 + (i % 2 ? w * 0.6 : 0);
          const s = (0.6 + rand() * 0.6) * u;
          paint(ctx, (c) => {
            c.moveTo(x, horizon - 70 * s);
            c.lineTo(x + 16 * s, horizon);
            c.lineTo(x - 16 * s, horizon);
            c.closePath();
          }, mix(farDark, "#2F4A3A", 0.5), { stroke: false });
        }
      } else {
        // Whitewashed houses with blue domes.
        for (let i = 0; i < 7; i++) {
          const x = w * 0.08 + i * 26 * u + rand() * 8 * u;
          const y = horizon - (30 + rand() * 40) * u;
          ctx.fillStyle = "#FBFBF7";
          ctx.fillRect(x, y, 20 * u, 18 * u);
          if (i % 3 === 0) paint(ctx, (c) => c.arc(x + 10 * u, y, 10 * u, Math.PI, 0), "#2F6FB8", { stroke: false });
        }
      }
      break;
    }
    case "solar-sky": {
      // Mesas glowing in the heat.
      for (const [px, pw, ph] of [[0.1, 160, 70], [0.3, 110, 50], [0.95, 200, 85]]) {
        const x = w * px;
        paint(ctx, (c) => {
          c.moveTo(x - pw * u, horizon);
          c.lineTo(x - pw * 0.7 * u, horizon - ph * u);
          c.lineTo(x + pw * 0.7 * u, horizon - ph * u);
          c.lineTo(x + pw * u, horizon);
          c.closePath();
        }, mix(far, "#B5532D", 0.45), { stroke: false });
      }
      break;
    }
    case "marigold-night": {
      // A hillside town with warm windows and floating paper lanterns.
      paint(ctx, (c) => c.ellipse(w * 0.2, horizon, 260 * u, 60 * u, 0, Math.PI, 0), mix(far, "#23123F", 0.5), { stroke: false });
      for (let i = 0; i < 24; i++) {
        const x = w * 0.2 + (rand() - 0.5) * 380 * u;
        const y = horizon - rand() * 45 * u - 4 * u;
        ctx.fillStyle = alpha("#FFB84D", 0.5 + 0.4 * Math.sin(frame.t * motion(frame) + i));
        ctx.fillRect(x, y, 5 * u, 5 * u);
      }
      for (let i = 0; i < 9; i++) {
        const x = (rand() * w + frame.t * motion(frame) * (6 + rand() * 6)) % (w + 40) - 20;
        const y = geo.seaY * (0.25 + rand() * 0.45) - Math.sin(frame.t * 0.4 + i) * 10 * u;
        paint(ctx, (c) => c.ellipse(x, y, 7 * u, 9 * u, 0, 0, Math.PI * 2), "#FF8A3D", { stroke: false });
        ctx.fillStyle = radialGradient(ctx, x, y, 26 * u, [
          [0, alpha("#FFB84D", 0.35)],
          [1, alpha("#FFB84D", 0)],
        ]);
        ctx.fillRect(x - 26 * u, y - 26 * u, 52 * u, 52 * u);
      }
      break;
    }
    case "neon-mist": {
      // A sunken city's skyline, half lost in green fog.
      for (let i = 0; i < 14; i++) {
        const x = w * 0.02 + i * 34 * u + rand() * 10 * u;
        const bh = (40 + rand() * 120) * u;
        ctx.fillStyle = mix(far, "#0B1418", 0.35);
        ctx.fillRect(x, horizon - bh, 26 * u, bh);
        for (let k = 0; k < 4; k++) {
          if (rand() > 0.5) continue;
          ctx.fillStyle = alpha("#39FF88", 0.25 + 0.2 * Math.sin(frame.t * motion(frame) * 2 + i + k));
          ctx.fillRect(x + 6 * u, horizon - bh + 10 * u + k * 22 * u, 5 * u, 6 * u);
        }
      }
      break;
    }
    case "twilight-clouds": {
      // Floating islands with tiny waterfalls.
      for (const [px, py, s] of [[0.15, 0.42, 1], [0.62, 0.3, 0.6]] as const) {
        const x = w * px;
        const y = geo.seaY * py;
        const r = 70 * s * u;
        paint(ctx, (c) => {
          c.moveTo(x - r, y);
          c.quadraticCurveTo(x, y + r * 1.4, x + r, y);
          c.closePath();
        }, mix(far, "#6E5AA8", 0.5), { stroke: false });
        paint(ctx, (c) => c.ellipse(x, y, r, r * 0.28, 0, 0, Math.PI * 2), mix(far, "#8FD18A", 0.55), { stroke: false });
        ctx.fillStyle = alpha("#FFFFFF", 0.5);
        ctx.fillRect(x + r * 0.5, y + 2, 3 * s * u, r * 0.9);
      }
      break;
    }
    case "deep-reef": {
      // Coral rocks breaking the surface with branching sea-fan coral silhouettes.
      for (const [px, pw, ph] of [[0.1, 80, 40], [0.88, 110, 55]]) {
        const cx = w * px;
        paint(ctx, (c) => c.ellipse(cx, horizon, pw * u, ph * u, 0, Math.PI, 0), mix(far, "#E58A8A", 0.4), { stroke: false });
        // Branching coral silhouettes rising from the reef
        ctx.strokeStyle = mix(far, "#D96868", 0.55);
        ctx.lineWidth = 2.4 * u;
        ctx.lineCap = "round";
        for (const dx of [-0.3, 0.15, 0.45]) {
          const bx = cx + dx * pw * u;
          const by = horizon - ph * u * (1 - Math.abs(dx) * 0.8);
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + dx * 8 * u, by - 16 * u);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(bx + dx * 8 * u, by - 10 * u);
          ctx.lineTo(bx + dx * 16 * u, by - 22 * u);
          ctx.stroke();
        }
      }
      break;
    }
  }
  ctx.restore();
}

export function drawClouds(ctx: Ctx, env: EnvironmentTheme, geo: SeaGeometry, frame: FrameInfo): void {
  if (drawCloudSprite(ctx, env.id, geo.width, geo.seaY, frame.t * motion(frame) * 8 * geo.unit)) return;
  const rand = rng(env.id.length * 7 + 3);
  const count = 7;
  const span = geo.width + 400 * geo.unit;
  for (let i = 0; i < count; i++) {
    const depth = 0.4 + rand() * 0.6;
    const speed = (8 + rand() * 10) * depth * motion(frame);
    const x = ((rand() * span + frame.t * speed * geo.unit) % span) - 200 * geo.unit;
    const y = geo.seaY * (0.12 + rand() * 0.45);
    const s = geo.unit * (0.6 + depth * 0.8);
    const color = mix(env.cloud, env.skyBottom, 1 - depth * 0.8);
    const puffs = [
      { x: 0, y: 0, r: 46 },
      { x: -50, y: 12, r: 34 },
      { x: 52, y: 10, r: 38 },
      { x: 18, y: -24, r: 34 },
      { x: -22, y: -16, r: 28 },
    ];
    ctx.save();
    ctx.globalAlpha = env.night ? 0.55 : 0.92;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const p of puffs) {
      ctx.moveTo(x + (p.x + p.r) * s, y + p.y * s);
      ctx.arc(x + p.x * s, y + p.y * s, p.r * s, 0, Math.PI * 2);
    }
    ctx.fill();
    // A soft shadow along the underside gives them some volume.
    ctx.fillStyle = shade(color, -0.07);
    ctx.beginPath();
    ctx.ellipse(x, y + 22 * s, 78 * s, 12 * s, 0, 0, Math.PI);
    ctx.fill();
    ctx.restore();
  }
}

function layerPath(ctx: Ctx, i: number, geo: SeaGeometry, frame: FrameInfo, bottom: number): void {
  const step = Math.max(6, geo.width / 140);
  ctx.moveTo(-10, bottom);
  for (let x = -10; x <= geo.width + step + 10; x += step) ctx.lineTo(x, waveY(i, x, geo, frame));
  ctx.lineTo(geo.width + step + 10, bottom);
  ctx.closePath();
}

/** Puffy cloud tops along a layer's crest, for the cloud sea. */
function cloudCrest(ctx: Ctx, i: number, geo: SeaGeometry, frame: FrameInfo, color: string): void {
  const r = (22 + i * 8) * geo.unit;
  const step = r * 1.3;
  const drift = (frame.t * motion(frame) * (10 + i * 6) * geo.unit) % step;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let x = -step + drift; x <= geo.width + step; x += step) {
    const y = waveY(i, x, geo, frame);
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.fill();
}

/** The far and middle wave layers, drawn behind the ship. */
export function drawSeaBack(ctx: Ctx, env: EnvironmentTheme, geo: SeaGeometry, frame: FrameInfo): void {
  if (drawWaveSprites(ctx, env.id, waveBands(geo, frame), 0, 1, geo.unit, geo.width, geo.height)) return;
  for (let i = 0; i < 2; i++) {
    const color = env.cloudSea ? mix(env.sea[i], env.skyBottom, 0.25 - i * 0.1) : env.sea[i];
    if (env.cloudSea) cloudCrest(ctx, i, geo, frame, color);
    ctx.beginPath();
    layerPath(ctx, i, geo, frame, geo.height + 10);
    ctx.fillStyle = color;
    ctx.fill();
    // A soft foam highlight on the middle wave layer gives layered depth behind the hull.
    if (!env.cloudSea && i === 1) {
      const step = Math.max(8, geo.width / 120);
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineWidth = 1.6 * geo.unit;
      ctx.strokeStyle = alpha(env.foam, 0.25);
      ctx.beginPath();
      for (let x = -10; x <= geo.width + 10; x += step) {
        const y = waveY(i, x, geo, frame) + 1.2 * geo.unit;
        if (x === -10) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }
  if (!env.cloudSea) drawGlints(ctx, env, geo, frame);
}

/** Sparkles of light on the water, brighter near the sun or moon. */
function drawGlints(ctx: Ctx, env: EnvironmentTheme, geo: SeaGeometry, frame: FrameInfo): void {
  const rand = rng(11);
  const t = frame.t * motion(frame);
  ctx.save();
  for (let i = 0; i < 34; i++) {
    const x = rand() * geo.width;
    const near = 1 - Math.min(1, Math.abs(x - geo.width * 0.8) / (geo.width * 0.6));
    const y = waveY(1, x, geo, frame) + (4 + rand() * 30) * geo.unit;
    const a = (0.15 + 0.5 * near) * Math.max(0, Math.sin(t * (0.8 + rand()) + i * 1.7));
    if (a < 0.05) continue;
    ctx.fillStyle = alpha(env.foam, a);
    ctx.fillRect(x, y, (8 + rand() * 18) * geo.unit, 2.2 * geo.unit);
  }
  ctx.restore();
}

/** The near wave layer, drawn in front of the hull so the ship sits in the water. */
export function drawSeaFront(ctx: Ctx, env: EnvironmentTheme, geo: SeaGeometry, frame: FrameInfo): void {
  if (drawWaveSprites(ctx, env.id, waveBands(geo, frame), 2, 2, geo.unit, geo.width, geo.height)) return;
  const i = 2;
  const color = env.cloudSea ? mix(env.sea[i], "#FFFFFF", 0.15) : env.sea[i];
  if (env.cloudSea) cloudCrest(ctx, i, geo, frame, color);
  ctx.beginPath();
  layerPath(ctx, i, geo, frame, geo.height + 10);
  ctx.fillStyle = env.cloudSea
    ? color
    : linearGradient(ctx, 0, geo.seaY, 0, geo.height, [
        [0, color],
        [1, shade(color, -0.25)],
      ]);
  ctx.fill();
  if (env.cloudSea) return;

  // Foam: a faint line along the whole crest, plus little whitecaps that ride the waves.
  const step = Math.max(5, geo.width / 160);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = 2.4 * geo.unit;
  ctx.strokeStyle = alpha(env.foam, 0.35);
  ctx.beginPath();
  for (let x = -10; x <= geo.width + 10; x += step) {
    const y = waveY(i, x, geo, frame) + 1.5 * geo.unit;
    if (x === -10) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  const spacing = 150 * geo.unit;
  const drift = (frame.t * motion(frame) * 22 * geo.unit) % spacing;
  ctx.lineWidth = 3.4 * geo.unit;
  ctx.strokeStyle = alpha(env.foam, 0.85);
  for (let k = -1, x0 = -spacing + drift; x0 < geo.width + spacing; x0 += spacing, k++) {
    // Each cap is a short arc of crest, a different length each time.
    const len = (28 + Math.abs((k * 37) % 5) * 9) * geo.unit;
    const jitter = Math.abs((k * 53) % 7) * 6 * geo.unit;
    ctx.beginPath();
    for (let x = x0 + jitter; x <= x0 + jitter + len; x += step / 2) {
      const y = waveY(i, x, geo, frame) + 2 * geo.unit;
      if (x === x0 + jitter) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Mist over the water for the foggy environments. */
export function drawMist(ctx: Ctx, env: EnvironmentTheme, geo: SeaGeometry, frame: FrameInfo): void {
  if (env.id !== "neon-mist" && env.id !== "cedar-fjord") return;
  const color = env.id === "neon-mist" ? "#2E8F6A" : "#FFFFFF";
  const strength = env.id === "neon-mist" ? 0.18 : 0.12;
  const t = frame.t * motion(frame);
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const y = geo.seaY - (60 - i * 40) * geo.unit;
    const offset = Math.sin(t * 0.1 + i) * 60 * geo.unit;
    ctx.fillStyle = linearGradient(ctx, 0, y - 50 * geo.unit, 0, y + 50 * geo.unit, [
      [0, alpha(color, 0)],
      [0.5, alpha(color, strength)],
      [1, alpha(color, 0)],
    ]);
    ctx.fillRect(offset - 100, y - 50 * geo.unit, geo.width + 200, 100 * geo.unit);
  }
  ctx.restore();
}

/** Light shafts slanting down into the deep reef. */
export function drawLightShafts(ctx: Ctx, env: EnvironmentTheme, geo: SeaGeometry, frame: FrameInfo): void {
  if (env.id !== "deep-reef") return;
  const t = frame.t * motion(frame);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 5; i++) {
    const x = geo.width * (0.1 + i * 0.2) + Math.sin(t * 0.2 + i) * 30 * geo.unit;
    ctx.fillStyle = alpha("#C9FFF4", 0.06);
    ctx.beginPath();
    ctx.moveTo(x - 20 * geo.unit, geo.seaY);
    ctx.lineTo(x + 20 * geo.unit, geo.seaY);
    ctx.lineTo(x + 90 * geo.unit, geo.height);
    ctx.lineTo(x - 10 * geo.unit, geo.height);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
