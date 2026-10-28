// Puts the sailor together, back to front:
//   back hair → torso/coat (+ scarf) → arms in the lap → [desk] → arms behind
//   the head → head, face, front hair, hat, head accessories → parrot →
//   tool → hands on the tool → laptop lid / monitor → hands at the face
//   (cup, spyglass) → Zzz and steam.

import type { AvatarLoadout } from "@ship/shared-types";
import { withTransform } from "../draw.js";
import type { Ctx, FrameInfo } from "../types.js";
import { drawEarring, drawEyepatch, drawGlasses, drawGoggles, drawParrot, drawScarf } from "./accessories.js";
import { drawArm, drawHand, drawSteam } from "./arms.js";
import { drawTorso, type SleeveStyle } from "./coats.js";
import { drawStretchLines, drawZzz } from "./fx.js";
import { drawHairBack, drawHairFront, hairShadow } from "./hair.js";
import { drawEar, drawFace, drawHeadShape } from "./head.js";
import { drawHat, hatInfo } from "./hats.js";
import { rotPt, withClip } from "./kit.js";
import { DESK_FAR, DESK_NEAR, NECK_Y, resolveLook, type Look } from "./look.js";
import type { ArmLayer, Pose } from "./pose.js";
import { drawToolOver, drawToolUnder } from "./tools.js";

export interface SailorOptions {
  avatar: AvatarLoadout;
  pose: Pose;
  frame: FrameInfo;
  seed: number;
  /** 1 faces right (+x), -1 is drawn mirrored. */
  dir?: 1 | -1;
  /**
   * What sits in front of the body: a function that draws the desk, or
   * "clip" when someone else already drew it (the galley table), in which
   * case everything behind the desk top is cut off at its far edge.
   */
  desk: ((ctx: Ctx) => void) | "clip";
  /** Which side of the desk a monitor goes on, in the sailor's own frame. */
  screenSide?: 1 | -1;
  /** Draw the study tool on the desk (previews may leave it off). */
  tool?: boolean;
}

export function drawSailor(ctx: Ctx, o: SailorOptions): void {
  const look = resolveLook(o.avatar);
  const dir = o.dir ?? 1;
  withTransform(ctx, { scaleX: dir }, () => paintSailor(ctx, look, o, dir));
}

function paintSailor(ctx: Ctx, look: Look, o: SailorOptions, dir: 1 | -1): void {
  const { pose, frame } = o;
  const av = look.loadout;
  const hat = hatInfo(av.hat);
  const hairCtx = { turn: pose.turn, hatted: hat.hides, t: pose.t };
  let sleeve: SleeveStyle = { fill: look.coat };

  const under = () => {
    inHead(ctx, pose, () => drawHairBack(ctx, look, av.hair, hairCtx));
    withTransform(ctx, { x: pose.torso.x, y: NECK_Y + pose.torso.y }, () => {
      sleeve = drawTorso(ctx, look, av.coat, pose.turn);
      if (av.accessory === "scarf") drawScarf(ctx, look, pose.turn, pose.t, frame.wind);
    });
    arms(ctx, look, sleeve, pose, "under");
  };
  if (o.desk === "clip") {
    withClip(ctx, (c) => c.rect(-400, -600, 800, 600 + DESK_FAR - 2), under);
  } else {
    under();
    o.desk(ctx);
  }

  arms(ctx, look, sleeve, pose, "back");

  // Nothing on the head (braids, long locks) hangs past the desk's front edge.
  withClip(ctx, (c) => c.rect(-400, -600, 800, 600 + DESK_NEAR), () => inHead(ctx, pose, () => {
    drawEar(ctx, look);
    if (av.accessory === "earring" && !hairCoversEar(av.hair)) drawEarring(ctx);
    const shadow = hairShadow(av.hair, hairCtx);
    drawHeadShape(ctx, look, pose, shadow);
    drawFace(ctx, look, pose, av.accessory === "eyepatch" ? -1 : 0);
    if (av.accessory === "glasses") drawGlasses(ctx, pose.turn);
    drawHairFront(ctx, look, av.hair, hairCtx);
    if (av.accessory === "eyepatch") drawEyepatch(ctx, pose.turn);
    drawHat(ctx, av.hat, pose.turn, pose.t);
    if (av.accessory === "aviator-goggles") drawGoggles(ctx, hat, pose.turn);
    if (av.accessory === "earring" && hairCoversEar(av.hair)) drawEarring(ctx);
  }));

  // Hands raised in a stretch show above the hair and hat.
  if (pose.stretch > 0.4) pose.arms.forEach((arm, i) => drawHand(ctx, look, arm.hand, i === 0 ? -1 : 1, arm));

  if (av.accessory === "parrot") {
    withTransform(ctx, { x: pose.torso.x - 28, y: NECK_Y + pose.torso.y + 5 - 3 * pose.stretch }, () => drawParrot(ctx, pose));
  }

  const tc = { pose, seed: o.seed, screenSide: o.screenSide ?? 1 };
  if (o.tool !== false) drawToolUnder(ctx, av.tool, tc);
  arms(ctx, look, sleeve, pose, "desk");
  if (o.tool !== false) drawToolOver(ctx, av.tool, tc);
  arms(ctx, look, sleeve, pose, "front");

  // Steam over a teacup that isn't at the lips.
  const right = pose.arms[1];
  if (right.hold === "tea" && pose.sip < 0.5 && right.layer === "front") {
    const top = rotPt({ x: -9, y: -10 }, right.angle);
    drawSteam(ctx, right.hand.x + top.x, right.hand.y + top.y, pose.t, 1 - pose.sip * 2, 0.7);
  }
  if (pose.stretch > 0) {
    drawStretchLines(ctx, pose.arms[0].hand, -1, pose.stretch, pose.t);
    drawStretchLines(ctx, pose.arms[1].hand, 1, pose.stretch, pose.t);
  }
  if (pose.zzz !== null) {
    const from = { x: pose.head.x + 26, y: pose.head.y - 32 };
    drawZzz(ctx, from, pose.zzz, dir);
  }
}

function inHead(ctx: Ctx, pose: Pose, fn: () => void): void {
  withTransform(ctx, { x: pose.head.x, y: pose.head.y, rotate: pose.headRot }, fn);
}

function arms(ctx: Ctx, look: Look, sleeve: SleeveStyle, pose: Pose, layer: ArmLayer): void {
  pose.arms.forEach((arm, i) => {
    if (arm.layer !== layer) return;
    const draw = () => drawArm(ctx, look, sleeve, arm, i === 0 ? -1 : 1, pose);
    // An arm coming up from the lap is still behind the desk below its far edge.
    if (arm.fromLap) withClip(ctx, (c) => c.rect(-400, -600, 800, 600 + DESK_FAR - 2), draw);
    else draw();
  });
}

/** Styles whose side locks hide the ear; the earring is then drawn over the hair. */
function hairCoversEar(style: AvatarLoadout["hair"]): boolean {
  return style === "long" || style === "bob" || style === "curls" || style === "messy" || style === "spiky" || style === "braids";
}
