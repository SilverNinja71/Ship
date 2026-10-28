// The canvas behind the HUD. One requestAnimationFrame loop reads the stores
// directly each frame (no React re-render per frame), draws the Main Deck or
// the Captain's Quarters, and turns clicks on the ship into actions.

import { useEffect, useRef } from "react";
import { CABIN_DECOR, ENVIRONMENTS } from "@ship/ship-theme-kit";
import { ringChime } from "../hooks/useAmbiance.js";
import { focusProgress } from "../lib/voyageLogic.js";
import { myAvatarState, useActivity } from "../stores/activityStore.js";
import { absentGhosts, ghostStateAt, useCrew } from "../stores/crewStore.js";
import { useEconomy } from "../stores/economyStore.js";
import { prefersReducedMotion, useSettings } from "../stores/settingsStore.js";
import { resolveActiveShip, resolveAvatar, useCustomizer } from "../stores/shipCustomizer.js";
import { useUi } from "../stores/uiStore.js";
import { useVoyage } from "../stores/voyageStore.js";
import { shipLayout } from "../ships/index.js";
import { drawRegions, hitTest } from "./hitRegions.js";
import type { HitId, HitRegion } from "./hitRegions.js";
import { ParticleField } from "./ParticleFX.js";
import { renderQuarters } from "./QuartersRenderer.js";
import { renderDeck } from "./ShipRenderer.js";
import { sprites } from "./sprites/store.js";
import type { CrewOnDeck, Viewport } from "./ShipRenderer.js";
import type { FrameInfo } from "./types.js";

const HUD_TOP = 76;
const HUD_BOTTOM = 96;
const MAX_DPR = 2;

interface LoopState {
  t: number;
  wind: number;
  helmAngle: number;
  bellRungAt: number;
  harvestedAt: number;
  view: number;
  regions: HitRegion[];
  hover: HitId | null;
  pointer: { x: number; y: number } | null;
  treeAt: { x: number; y: number };
  unit: number;
  soundHintShown: boolean;
}

const approach = (value: number, target: number, rate: number, dt: number) => value + (target - value) * Math.min(1, rate * dt);

export function ShipCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const loop = useRef<LoopState>({
    t: 0,
    wind: 0.3,
    helmAngle: 0,
    bellRungAt: -100,
    harvestedAt: -100,
    view: useSettings.getState().view === "quarters" ? 1 : 0,
    regions: [],
    hover: null,
    pointer: null,
    treeAt: { x: 0, y: 0 },
    unit: 1,
    soundHintShown: false,
  });
  const particles = useRef(new ParticleField());

  useEffect(() => {
    // The graphics AI's art, where it exists; everything else stays procedural.
    void sprites.start();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d", { alpha: false })!;
    let raf = 0;
    let last = performance.now();
    let reduced = prefersReducedMotion(useSettings.getState().motion);
    let reducedCheckedAt = 0;
    const view: Viewport = { width: 1, height: 1, dpr: 1, insetTop: HUD_TOP, insetBottom: HUD_BOTTOM };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      view.dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      view.width = Math.max(1, rect.width);
      view.height = Math.max(1, rect.height);
      canvas.width = Math.round(view.width * view.dpr);
      canvas.height = Math.round(view.height * view.dpr);
      // Narrow screens keep less room for the HUD so the ship stays big enough.
      view.insetTop = view.width < 640 ? 64 : HUD_TOP;
      view.insetBottom = view.width < 640 ? 250 : HUD_BOTTOM;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const s = loop.current;
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      s.t += dt;
      if (now - reducedCheckedAt > 1000) {
        reduced = prefersReducedMotion(useSettings.getState().motion);
        reducedCheckedAt = now;
      }

      const settings = useSettings.getState();
      const voyage = useVoyage.getState();
      const inventory = useEconomy.getState().inventory;
      const custom = useCustomizer.getState();
      const { idle, hidden } = useActivity.getState();
      const crew = useCrew.getState();
      const { ship, loadout } = resolveActiveShip(custom, inventory);
      const avatar = resolveAvatar(custom.avatar, inventory);
      const env = ENVIRONMENTS[ship.environment];
      const nowMs = Date.now();

      const sailing = voyage.phase === "sailing";
      s.wind = approach(s.wind, sailing ? 1 : voyage.phase === "shore-leave" ? 0.55 : 0.3, 0.6, dt);
      s.helmAngle = approach(s.helmAngle, sailing ? Math.sin(s.t * 0.35) * 0.6 : 0, 1.5, dt);
      s.view = approach(s.view, settings.view === "quarters" ? 1 : 0, 6, dt);
      if (Math.abs(s.view - Math.round(s.view)) < 0.01) s.view = Math.round(s.view);
      const ringAge = s.t - s.bellRungAt;
      const bellSwing = ringAge < 4 ? Math.sin(ringAge * 9) * 0.5 * Math.exp(-ringAge * 1.3) : 0;

      const frame: FrameInfo = { t: s.t, dt, reducedMotion: reduced, wind: s.wind };
      const me = { avatar, state: myAvatarState(voyage.phase, idle, hidden) };

      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      let regions: HitRegion[] = [];

      if (s.view < 1) {
        const others = crew.members.filter((m) => m.peerId !== crew.peerId).sort((a, b) => a.seat - b.seat);
        const onDeck: CrewOnDeck[] = others.map((m) => ({ id: m.peerId, name: m.name, avatar: m.avatar, state: m.state, ghost: false }));
        for (const g of absentGhosts(crew.ghosts, crew.members)) {
          onDeck.push({ id: g.id, name: g.name, avatar: g.avatar, state: ghostStateAt(g, s.t + g.recordedAt / 1000), ghost: true });
        }
        const out = renderDeck(
          ctx,
          view,
          frame,
          {
            ship,
            loadout,
            env,
            me,
            crew: onDeck,
            tree: { state: voyage.tree.state, fruit: voyage.tree.fruit, progress: focusProgress(voyage, nowMs), shake: s.t - s.harvestedAt },
            helmAngle: s.helmAngle,
            bellSwing,
          },
          shipLayout(ship),
        );
        s.treeAt = out.treeAt;
        s.unit = out.unit;
        particles.current.emit(ship.particles, out.emitter, dt, reduced);
        particles.current.update(dt, view.height);
        particles.current.draw(ctx);
        regions = out.regions;
      }
      if (s.view > 0) {
        ctx.save();
        ctx.globalAlpha = s.view;
        const quarterRegions = renderQuarters(ctx, view, frame, { ship, loadout, env, me });
        ctx.restore();
        if (s.view >= 0.5) regions = quarterRegions;
      }

      s.regions = regions;
      if (settings.showHitRegions) drawRegions(ctx, regions, s.hover);
      updateHover();
    };

    const updateHover = () => {
      const s = loop.current;
      const hit = s.pointer ? hitTest(s.regions, s.pointer) : null;
      s.hover = hit?.id ?? null;
      canvas.style.cursor = hit ? "pointer" : "default";
      const tip = tipRef.current;
      if (!tip) return;
      if (hit && s.pointer) {
        tip.textContent = hit.label;
        tip.style.transform = `translate(${Math.round(s.pointer.x + 14)}px, ${Math.round(s.pointer.y + 18)}px)`;
        tip.style.opacity = "1";
      } else {
        tip.style.opacity = "0";
      }
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    loop.current.pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerLeave = () => {
    loop.current.pointer = null;
  };

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const hit = hitTest(loop.current.regions, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    if (hit) act(hit.id);
  };

  const act = (id: HitId) => {
    const ui = useUi.getState();
    const s = loop.current;
    if (id === "helm") ui.openPanel("helm");
    else if (id === "desk") ui.openPanel("flashcards");
    else if (id === "avatar") ui.openPanel("wardrobe");
    else if (id === "figurehead" || id === "flag") ui.openPanel("shipwright");
    else if (id === "bookshelf") ui.openPanel("log");
    else if (id === "porthole") useSettings.getState().set({ view: "deck" });
    else if (id.startsWith("crew:") || id.startsWith("ghost:")) ui.openPanel("crew");
    else if (id === "decor") {
      const shipId = useCustomizer.getState().activeShipId;
      ui.toast(CABIN_DECOR[shipId] ?? "A keepsake from your travels.");
    } else if (id === "bell") {
      s.bellRungAt = s.t;
      ringChime("bell");
      if (!useSettings.getState().soundOn && !s.soundHintShown) {
        s.soundHintShown = true;
        ui.toast("Ding! Sound is off. Turn it on in Settings to hear the bell.");
      }
    } else if (id === "tree") {
      const voyage = useVoyage.getState();
      const coins = voyage.harvest();
      if (coins > 0) {
        s.harvestedAt = s.t;
        particles.current.burst("coin", s.treeAt, Math.min(24, 4 + coins), s.unit);
        particles.current.burst("sparkle", s.treeAt, 10, s.unit);
        ui.toast(`Zesty! The citrus tree dropped ${coins} doubloons.`, "reward");
      } else if (voyage.tree.state === "blooming") {
        ui.toast("The tree is blooming. Finish this voyage and its fruit will ripen.");
      } else if (voyage.tree.state === "wilted") {
        ui.toast("The tree wilted when the last voyage was abandoned. Sail a full voyage to revive it.");
      } else {
        ui.toast("No ripe fruit yet. Each completed voyage grows some.");
      }
    }
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full touch-none select-none"
        role="img"
        aria-label="Your study ship at sea. Click the helm, citrus tree, bell, desk or your sailor to interact."
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={onClick}
      />
      <div
        ref={tipRef}
        aria-hidden="true"
        className="pointer-events-none fixed top-0 left-0 z-10 rounded-full bg-cream-50 px-3 py-1 text-sm font-semibold text-ink opacity-0 shadow-card transition-opacity duration-150"
      />
    </>
  );
}
