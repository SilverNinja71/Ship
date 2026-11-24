// A still portrait of one of the house characters (Captain Banan, Mochi, Lumi, Pip, the frog, or
// Pwedo the pigeon) for Study Rooms cards and banners. It draws the scene's own canvas art once,
// on a frozen frame, so a portrait matches the character on deck exactly. No new art.

import { useEffect, useRef } from "react";
import type { CrewAccessory } from "../../ship-engine/kawaiiThemes.js";
import { drawPastelMinion } from "../../ship-engine/minions.js";
import type { MinionChore, MinionCostume } from "../../ship-engine/minions.js";
import { drawPwedoBird } from "../../ship-engine/StudySceneRenderer.js";
import { STILL_FRAME } from "../../ship-engine/types.js";

export function MinionPortrait({
  costume,
  size,
  chore,
  accessory,
}: {
  costume: MinionCostume | "pwedo";
  size: number;
  /** What they're holding or doing (a mop, a boba, a focus flame…). The pigeon has none. */
  chore?: MinionChore;
  accessory?: CrewAccessory;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    if (costume === "pwedo") {
      // The bird is drawn around its middle, about 45 units wide with its feet.
      const s = size / 60;
      drawPwedoBird(ctx, size / 2 + 3 * s, size / 2 - 2 * s, STILL_FRAME, { scale: s, showFeet: true });
    } else {
      // A character stands on its feet and reaches about 68 units up (ears, cap or focus flame),
      // with chores reaching about 35 to the sides: fit an 80-unit box.
      const s = size / 80;
      drawPastelMinion(ctx, { x: size / 2, y: size / 2 + 32 * s }, costume, STILL_FRAME, { scale: s, chore, accessory, shadow: false });
    }
  }, [costume, size, chore, accessory]);

  return <canvas ref={ref} width={size} height={size} aria-hidden="true" className="block shrink-0" style={{ width: size, height: size }} />;
}
