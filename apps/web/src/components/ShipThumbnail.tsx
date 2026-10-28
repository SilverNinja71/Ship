// A still picture of a ship on its own sky and sea, for the Shipwright.

import { useEffect, useRef } from "react";
import type { ShipDefinition, ShipLoadout } from "@ship/shared-types";
import { ENVIRONMENTS, defaultLoadout } from "@ship/ship-theme-kit";
import { linearGradient } from "../ship-engine/draw.js";
import { STILL_FRAME } from "../ship-engine/types.js";
import { drawShip, shipLayout } from "../ships/index.js";

/** `fluid` stretches it to its container's width at the same aspect ratio. */
export function ShipThumbnail({ ship, loadout, width = 240, height = 150, className, fluid = false }: { ship: ShipDefinition; loadout?: ShipLoadout; width?: number; height?: number; className?: string; fluid?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(loadout ?? null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const env = ENVIRONMENTS[ship.environment];
    const layout = shipLayout(ship);
    const b = layout.bounds ?? { left: -560, right: 600, top: -640, bottom: 170 };
    const unit = Math.min((width * 0.9) / (b.right - b.left), (height * 0.86) / (Math.max(b.bottom, layout.waterline + 40) - b.top));
    const seaY = height * 0.08 + (layout.waterline - b.top) * unit;
    ctx.fillStyle = linearGradient(ctx, 0, 0, 0, seaY, [
      [0, env.skyTop],
      [1, env.skyBottom],
    ]);
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2 - ((b.left + b.right) / 2) * unit, seaY - layout.waterline * unit);
    ctx.scale(unit, unit);
    drawShip(ctx, ship, loadout ?? defaultLoadout(ship), STILL_FRAME);
    ctx.restore();
    ctx.fillStyle = env.sea[2];
    ctx.fillRect(0, seaY, width, height - seaY);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillRect(0, seaY, width, 2);
  }, [ship, key, width, height]);

  const style = fluid ? { width: "100%", height: "auto", aspectRatio: `${width} / ${height}` } : { width, height };
  return <canvas ref={ref} style={style} className={className} aria-label={`The ${ship.name}`} role="img" />;
}
