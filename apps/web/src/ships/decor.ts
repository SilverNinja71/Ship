import { paint, roundRectPath } from "../ship-engine/draw.js";
import type { Ctx, FrameInfo, Point } from "../ship-engine/types.js";

export function drawCabinDecor(ctx: Ctx, _shipId: string, at: Point, _frame: FrameInfo): void {
  paint(ctx, (c) => roundRectPath(c, at.x - 50, at.y - 160, 100, 160, 12), "#B08D57");
}
