// A sailor on their own little canvas: animated in the Wardrobe, still in lists.

import { useEffect, useRef } from "react";
import type { AvatarLoadout, AvatarState } from "@ship/shared-types";
import { drawAvatarPreview } from "../ship-engine/AvatarRenderer.js";
import { STILL_FRAME } from "../ship-engine/types.js";

export function AvatarPreview({ avatar, state, size = 200, animated = true, opacity = 1 }: { avatar: AvatarLoadout; state: AvatarState; size?: number; animated?: boolean; opacity?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ avatar, state });
  latest.current = { avatar, state };
  // Still previews redraw only when what they show changes.
  const stillKey = animated ? "" : JSON.stringify([avatar, state]);

  useEffect(() => {
    const canvas = ref.current!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext("2d")!;
    const paint = (t: number, reduced: boolean) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      drawAvatarPreview(ctx, latest.current.avatar, latest.current.state, size / 2, size / 2, size, { ...STILL_FRAME, t, reducedMotion: reduced });
    };
    if (!animated) {
      paint(0, true);
      return;
    }
    const start = performance.now();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      paint((now - start) / 1000, reduced);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [size, animated, stillKey]);

  return <canvas ref={ref} style={{ width: size, height: size, opacity }} role="img" aria-label={`${avatar.name}, a sailor`} />;
}
