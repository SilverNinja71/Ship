// The sailors. Chibi (big head, small body), drawn in a 3/4 front view facing
// the viewer, seated behind their desk (the desk is in front of them and hides
// the legs). Units match the ship: a study station is about STATION_WIDTH wide
// and STATION_HEIGHT tall (floor to hat tip) at scale 1. The artwork lives in
// ./avatar/; this file is the stable API the engine calls.

import type { AvatarLoadout, AvatarState, DeskId } from "@ship/shared-types";
import { hashString, withTransform } from "./draw.js";
import { drawChairBack, drawDesk, drawGalleyTableBody } from "./avatar/desks.js";
import { drawTranslucent, type Bounds } from "./avatar/layer.js";
import { DESK_FAR, DESK_NEAR } from "./avatar/look.js";
import { computePose } from "./avatar/pose.js";
import { drawSailor } from "./avatar/sailor.js";
import { curvyPath, paintShaded } from "./avatar/kit.js";
import { shade } from "./draw.js";
import type { Ctx, FrameInfo, Point } from "./types.js";

export const STATION_WIDTH = 150;
export const STATION_HEIGHT = 190;

/** x offset of each galley seat's sailor from the table's center at scale 1 (left at -, right at +). */
export const GALLEY_SEAT_X = 38;
/**
 * y of the top of a seated sailor's head (hair included, no hat) relative to
 * the floor point `at`, at scale 1. Hats reach up to about -STATION_HEIGHT.
 * Galley crew are drawn at GALLEY_SEAT_SCALE, so theirs is HEAD_TOP × that.
 */
export const HEAD_TOP = -172;
/** Galley crew are drawn a little smaller than a study station's sailor. */
export const GALLEY_SEAT_SCALE = 0.85;

export interface StationOptions {
  avatar: AvatarLoadout;
  state: AvatarState;
  desk: DeskId;
  /** The floor point under the middle of the desk. */
  at: Point;
  /** 1 on the main deck; the Captain's Quarters view draws it bigger. */
  scale?: number;
  /** 0..1. Ghost ships are drawn at about 0.45. */
  opacity?: number;
  /** Varies blink and fidget timing so sailors don't move in lockstep. */
  seed?: number;
}

/** Everything a station can draw (spyglass, Zzz, stretch, roots), in station units. */
const STATION_BOUNDS: Bounds = { x0: -100, y0: -218, x1: 100, y1: 10 };
const SEAT_BOUNDS: Bounds = { x0: -100, y0: -218, x1: 100, y1: -40 };

const sceneTime = (frame: FrameInfo) => (frame.reducedMotion ? frame.t * 0.08 : frame.t);

/** A sailor at their desk with their study tool, animated by state. */
export function drawStudyStation(ctx: Ctx, opts: StationOptions, frame: FrameInfo): void {
  const seed = opts.seed ?? hashString(opts.avatar.name);
  const pose = computePose(opts.state, opts.avatar.tool, frame.t, seed, frame.reducedMotion);
  withTransform(ctx, { x: opts.at.x, y: opts.at.y, scale: opts.scale ?? 1 }, () => {
    drawTranslucent(ctx, opts.opacity ?? 1, STATION_BOUNDS, (c) =>
      drawSailor(c, { avatar: opts.avatar, pose, frame, seed, desk: (cc) => drawDesk(cc, opts.desk, sceneTime(frame), seed) }),
    );
  });
}

export interface CrewSeat {
  avatar: AvatarLoadout;
  state: AvatarState;
  opacity?: number;
  seed?: number;
}

/** A galley table (about STATION_WIDTH wide) with up to two crew sitting behind it. */
export function drawGalleyTable(ctx: Ctx, at: Point, seats: [CrewSeat | null, CrewSeat | null], frame: FrameInfo, scale = 1): void {
  const sx = GALLEY_SEAT_X / GALLEY_SEAT_SCALE;
  withTransform(ctx, { x: at.x, y: at.y, scale: scale * GALLEY_SEAT_SCALE }, () => {
    for (const s of [-1, 1]) withTransform(ctx, { x: s * sx }, () => drawChairBack(ctx));
    drawGalleyTableBody(ctx, 92);
    seats.forEach((seat, i) => {
      if (!seat) return;
      const seed = seat.seed ?? hashString(seat.avatar.name);
      // Crew face each other; a monitor goes on the outer end of the table.
      const dir = i === 0 ? 1 : -1;
      const pose = computePose(seat.state, seat.avatar.tool, frame.t, seed, frame.reducedMotion, -1);
      withTransform(ctx, { x: (i === 0 ? -1 : 1) * sx }, () =>
        drawTranslucent(ctx, seat.opacity ?? 1, SEAT_BOUNDS, (c) =>
          drawSailor(c, { avatar: seat.avatar, pose, frame, seed, dir, desk: "clip", screenSide: -1 }),
        ),
      );
    });
  });
}

/** The sailor alone, fitted into a size × size box centered on (cx, cy), for the Wardrobe and crew lists. */
export function drawAvatarPreview(ctx: Ctx, avatar: AvatarLoadout, state: AvatarState, cx: number, cy: number, size: number, frame: FrameInfo): void {
  const seed = hashString(avatar.name);
  const pose = computePose(state, avatar.tool, frame.t, seed, frame.reducedMotion);
  // The sailor plus a hint of desk spans about x -62..62, y -198..-52.
  const s = size / 152;
  withTransform(ctx, { x: cx, y: cy, scale: s }, () => {
    withTransform(ctx, { y: 125 }, () => {
      deskHint(ctx);
      drawSailor(ctx, { avatar, pose, frame, seed, desk: "clip" });
    });
  });
}

/** A short slice of desk under the preview sailor so it doesn't end in a hard cut. */
function deskHint(ctx: Ctx): void {
  const wood = "#B07443";
  paintShaded(ctx, (c) => c.roundRect(-56, DESK_NEAR - 1, 112, 9, [0, 0, 6, 6]), shade(wood, -0.12), null, null);
  paintShaded(ctx, (c) => curvyPath(c, [[-52, DESK_FAR - 1, 1], [52, DESK_FAR - 1, 1], [56, DESK_NEAR, 1], [-56, DESK_NEAR, 1]], 0), "#C98D55", null, null);
}
