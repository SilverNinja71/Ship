// Ambient particles for each ship (spray, bubbles, stardust, smoke, embers,
// petals, snow...) plus one-off bursts (zest coins, sparkles). Particles live
// in screen pixels; emitters are placed from the ship's layout each frame.

import type { ParticleKind } from "@ship/shared-types";
import { alpha, circlePath, paint } from "./draw.js";
import type { Ctx, Point } from "./types.js";

type BurstKind = "coin" | "sparkle";

interface Particle {
  kind: ParticleKind | BurstKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds lived / seconds to live. */
  age: number;
  life: number;
  size: number;
  spin: number;
  angle: number;
  seed: number;
  /** Bubbles pop at the surface; other kinds ignore it. */
  ceiling?: number;
}

export interface EmitterContext {
  width: number;
  height: number;
  /** Pixels per ship unit. */
  unit: number;
  /** Screen points from the ship's layout. */
  bow: Point;
  smoke: Point[];
  sails: Point[];
  hull: { left: number; right: number; waterY: number };
  /** Screen y of the sea surface, for bubbles. */
  seaY: number;
}

/** Per kind: particles per second at full motion. */
const RATES: Record<ParticleKind, number> = {
  "sea-spray": 14,
  bubbles: 6,
  stardust: 5,
  "cannon-smoke": 3,
  "solar-sparks": 8,
  "mikan-petals": 2.2,
  "marigold-petals": 3,
  "neon-motes": 4,
  embers: 6,
  "pine-needles": 3,
  "olive-leaves": 1.6,
  snow: 14,
};

const MAX_PARTICLES = 500;

export class ParticleField {
  private particles: Particle[] = [];
  private debt = new Map<string, number>();
  private seed = 1;

  /** Spawns this frame's ambient particles for the ship's kinds. */
  emit(kinds: readonly ParticleKind[], ctx: EmitterContext, dt: number, reducedMotion: boolean): void {
    const factor = reducedMotion ? 0.15 : 1;
    for (const kind of kinds) {
      const owed = (this.debt.get(kind) ?? 0) + RATES[kind] * dt * factor;
      const n = Math.floor(owed);
      this.debt.set(kind, owed - n);
      for (let i = 0; i < n; i++) this.spawn(kind, ctx);
    }
  }

  burst(kind: BurstKind, at: Point, count: number, unit: number): void {
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const speed = (kind === "coin" ? 220 : 140) * (0.6 + Math.random() * 0.6) * unit * 2;
      this.add({ kind, x: at.x, y: at.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: kind === "coin" ? 1.4 : 0.9, size: (kind === "coin" ? 14 : 8) * unit * 2 });
    }
  }

  private add(p: Omit<Particle, "age" | "spin" | "angle" | "seed"> & Partial<Particle>): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({ age: 0, spin: (Math.random() - 0.5) * 4, angle: Math.random() * Math.PI * 2, seed: this.seed++, ...p });
  }

  private spawn(kind: ParticleKind, e: EmitterContext): void {
    const u = e.unit;
    const r = Math.random;
    const any = (pts: Point[]) => pts[Math.floor(r() * pts.length)];
    switch (kind) {
      case "sea-spray":
        this.add({ kind, x: e.bow.x + (r() - 0.5) * 30 * u, y: e.hull.waterY - 4 * u, vx: (40 + r() * 80) * u, vy: -(90 + r() * 120) * u, life: 0.8 + r() * 0.5, size: (2 + r() * 3) * u });
        break;
      case "bubbles":
        this.add({ kind, x: e.hull.left + r() * (e.hull.right - e.hull.left), y: e.height + 10, vx: 0, vy: -(30 + r() * 40) * u, life: 12, size: (3 + r() * 6) * u, ceiling: e.seaY + 10 * u });
        break;
      case "stardust":
        this.add({ kind, x: r() * e.width, y: r() * e.seaY, vx: (r() - 0.3) * 10 * u, vy: (r() - 0.5) * 6 * u, life: 3 + r() * 3, size: (2 + r() * 3) * u });
        break;
      case "cannon-smoke": {
        const at = e.smoke.length ? any(e.smoke) : { x: e.hull.left + 100 * u, y: e.hull.waterY - 220 * u };
        this.add({ kind, x: at.x, y: at.y, vx: -(20 + r() * 20) * u, vy: -(30 + r() * 20) * u, life: 4 + r() * 2, size: (14 + r() * 10) * u });
        break;
      }
      case "solar-sparks": {
        const at = e.sails.length ? any(e.sails) : e.bow;
        this.add({ kind, x: at.x + (r() - 0.5) * 120 * u, y: at.y + (r() - 0.5) * 120 * u, vx: (r() - 0.5) * 30 * u, vy: -(20 + r() * 40) * u, life: 1.2 + r(), size: (2 + r() * 2) * u });
        break;
      }
      case "embers": {
        const at = e.smoke.length ? any(e.smoke) : { x: e.hull.left + 200 * u, y: e.hull.waterY - 150 * u };
        this.add({ kind, x: at.x + (r() - 0.5) * 10 * u, y: at.y, vx: (r() - 0.6) * 25 * u, vy: -(40 + r() * 40) * u, life: 1.5 + r(), size: (2 + r() * 2) * u });
        break;
      }
      case "neon-motes":
        this.add({ kind, x: r() * e.width, y: e.seaY - r() * 300 * u, vx: (r() - 0.5) * 12 * u, vy: -(4 + r() * 10) * u, life: 4 + r() * 3, size: (2.5 + r() * 2.5) * u });
        break;
      case "snow":
        this.add({ kind, x: r() * (e.width + 100) - 50, y: -10, vx: -(6 + r() * 10) * u, vy: (28 + r() * 30) * u, life: 30, size: (1.8 + r() * 2.4) * u });
        break;
      case "mikan-petals":
      case "marigold-petals":
      case "pine-needles":
      case "olive-leaves":
        this.add({ kind, x: r() * (e.width + 200), y: -10, vx: -(30 + r() * 40) * u, vy: (30 + r() * 30) * u, life: 30, size: (kind === "olive-leaves" ? 7 : 5) * u * (0.8 + r() * 0.5) });
        break;
    }
  }

  update(dt: number, height: number): void {
    const keep: Particle[] = [];
    for (const p of this.particles) {
      p.age += dt;
      p.angle += p.spin * dt;
      switch (p.kind) {
        case "sea-spray":
        case "coin":
        case "sparkle":
          p.vy += 520 * dt * (p.kind === "coin" ? 1.4 : 1) * (p.size / 6);
          break;
        case "cannon-smoke":
          p.size += 10 * dt * (p.size / 20);
          break;
        case "mikan-petals":
        case "marigold-petals":
        case "pine-needles":
        case "olive-leaves":
        case "snow":
          p.vx += Math.sin(p.age * 2 + p.seed) * 6 * dt;
          break;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const popped = p.ceiling !== undefined && p.y < p.ceiling;
      if (p.age < p.life && !popped && p.y < height + 40) keep.push(p);
    }
    this.particles = keep;
  }

  draw(ctx: Ctx): void {
    for (const p of this.particles) {
      const fadeIn = Math.min(1, p.age / 0.25);
      const fadeOut = Math.min(1, (p.life - p.age) / 0.6);
      const a = Math.max(0, Math.min(fadeIn, fadeOut));
      drawParticle(ctx, p, a);
    }
  }

  clear(): void {
    this.particles = [];
  }
}

function drawParticle(ctx: Ctx, p: Particle, a: number): void {
  const s = p.size;
  switch (p.kind) {
    case "sea-spray":
      ctx.fillStyle = alpha("#FFFFFF", 0.8 * a);
      ctx.beginPath();
      ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "bubbles":
      ctx.strokeStyle = alpha("#E8FFFB", 0.7 * a);
      ctx.lineWidth = Math.max(1, s * 0.25);
      ctx.beginPath();
      ctx.arc(p.x + Math.sin(p.age * 3 + p.seed) * 3, p.y, s, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "stardust":
    case "sparkle":
    case "solar-sparks": {
      const color = p.kind === "solar-sparks" ? "#FFB347" : p.kind === "sparkle" ? "#FFF3A6" : "#FFF6D5";
      const twinkle = 0.6 + 0.4 * Math.sin(p.age * 8 + p.seed);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle * 0.3);
      ctx.fillStyle = alpha(color, a * twinkle);
      ctx.beginPath();
      // A four-pointed star.
      for (let i = 0; i < 8; i++) {
        const r = i % 2 === 0 ? s * 2 : s * 0.5;
        const ang = (i / 8) * Math.PI * 2;
        ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    case "cannon-smoke":
      ctx.fillStyle = alpha("#D9DCE0", 0.45 * a);
      ctx.beginPath();
      ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "embers":
    case "neon-motes": {
      const color = p.kind === "embers" ? "#FF9A4D" : "#39FF88";
      const flicker = 0.6 + 0.4 * Math.sin(p.age * 12 + p.seed);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = alpha(color, 0.25 * a * flicker);
      ctx.beginPath();
      ctx.arc(p.x, p.y, s * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = alpha(color, a * flicker);
      ctx.beginPath();
      ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case "snow":
      ctx.fillStyle = alpha("#FFFFFF", 0.9 * a);
      ctx.beginPath();
      ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "mikan-petals":
    case "marigold-petals":
    case "olive-leaves": {
      const color = p.kind === "mikan-petals" ? (p.seed % 3 === 0 ? "#FFA94D" : "#FFF7EE") : p.kind === "marigold-petals" ? "#FF9F1C" : "#7FA35B";
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.globalAlpha *= a;
      paint(ctx, (c) => c.ellipse(0, 0, s, s * 0.5, 0, 0, Math.PI * 2), color, { width: Math.max(1, s * 0.25) });
      ctx.restore();
      break;
    }
    case "pine-needles":
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.strokeStyle = alpha("#3E6B3A", a);
      ctx.lineWidth = Math.max(1, s * 0.3);
      ctx.beginPath();
      ctx.moveTo(-s, 0);
      ctx.lineTo(s, 0);
      ctx.stroke();
      ctx.restore();
      break;
    case "coin":
      drawCoin(ctx, p.x, p.y, s, p.angle, a);
      break;
  }
}

/** A doubloon, squashed horizontally as it spins. */
export function drawCoin(ctx: Ctx, x: number, y: number, r: number, angle: number, a = 1): void {
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.translate(x, y);
  ctx.scale(Math.max(0.15, Math.abs(Math.cos(angle))), 1);
  paint(ctx, (c) => circlePath(c, 0, 0, r), "#F2C14E", { width: Math.max(1.5, r * 0.18) });
  paint(ctx, (c) => circlePath(c, 0, 0, r * 0.62), "#E3A82B", { stroke: false });
  ctx.fillStyle = "#FFF1B8";
  ctx.beginPath();
  ctx.ellipse(-r * 0.3, -r * 0.35, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
