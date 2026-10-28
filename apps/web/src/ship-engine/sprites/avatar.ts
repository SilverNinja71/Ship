// Sailors from sprites: the avatar sheet's layers stacked in the station
// frame, posed by the same Pose the procedural sailor uses. A sailor switches
// to sprites only when every layer their loadout needs has arrived, so the two
// styles never mix on one sailor.

import { SPRITE_FOLDERS } from "@ship/shared-types";
import type { AvatarEyes, AvatarLoadout, AvatarMouth, AvatarSpriteLayer, StudyToolId } from "@ship/shared-types";
import { avatarSpriteSlots, focusArmPose, missingAvatarSprites } from "@ship/ship-theme-kit";
import type { AvatarSpriteFrame, AvatarSpriteSlot } from "@ship/ship-theme-kit";
import { withTransform } from "../draw.js";
import { drawStretchLines, drawZzz } from "../avatar/fx.js";
import { withClip } from "../avatar/kit.js";
import { DESK_FAR, DESK_NEAR, HEAD_Y } from "../avatar/look.js";
import type { EyeKind, MouthKind, Pose } from "../avatar/pose.js";
import type { SailorOptions } from "../avatar/sailor.js";
import type { Ctx } from "../types.js";
import { drawSprite } from "./paint.js";
import { sprites } from "./store.js";
import type { Sprite, SpriteSheet } from "./store.js";

const readiness = new Map<string, { version: number; ok: boolean }>();

/** True once the avatar sheet holds every layer this loadout can need. */
export function avatarSpritesReady(avatar: AvatarLoadout): boolean {
  const sheet = sprites.sheet(SPRITE_FOLDERS.avatar);
  if (!sheet) return false;
  const key = `${avatar.skin}|${avatar.hair}|${avatar.coat}|${avatar.hat}|${avatar.accessory}|${avatar.tool}`;
  const hit = readiness.get(key);
  if (hit?.version === sprites.version) return hit.ok;
  const ok = missingAvatarSprites(avatar, (id) => sheet.sprites.has(id)).length === 0;
  if (readiness.size > 64) readiness.clear();
  readiness.set(key, { version: sprites.version, ok });
  return ok;
}

const EYES: Record<EyeKind, AvatarEyes> = {
  open: "open",
  focus: "focus",
  blink: "blink",
  happy: "happy",
  squeeze: "happy",
  wink: "happy",
  sleep: "sleep",
};

const MOUTHS: Record<MouthKind, AvatarMouth> = {
  smile: "smile",
  cat: "smile",
  grin: "smile",
  flat: "flat",
  tongue: "flat",
  o: "open",
  yawn: "open",
  sip: "sip",
  sleep: "sleep",
};

/** The sprite variants for one frame of a procedural pose. */
export function spriteFrameOf(pose: Pose, tool: StudyToolId): AvatarSpriteFrame {
  return { arms: armsOf(pose, tool), eyes: EYES[pose.eyes], mouth: MOUTHS[pose.mouth] };
}

function armsOf(pose: Pose, tool: StudyToolId): AvatarSpriteFrame["arms"] {
  if (pose.state === "DRIFTING_IDLE") return "resting";
  if (pose.state === "SAILING_FOCUS") return focusArmPose(tool);
  // Halfway into a break activity the hands are up; before that they rest.
  if (!pose.activity || pose.amount < 0.5) return "relaxed";
  return pose.activity === "sip" ? "sipping" : pose.activity === "stretch" ? "stretching" : "spyglass";
}

/** Behind the desk top: in front of a galley table these are cut off at its far edge. */
const BEHIND_DESK: ReadonlySet<AvatarSpriteLayer> = new Set(["hair-back", "body", "coat"]);
/** Accessories worn on the body rather than the face. */
const BODY_ACCESSORIES = new Set(["scarf", "parrot"]);

/** Same options as the procedural drawSailor, so AvatarRenderer can use either. */
export function drawSpriteSailor(ctx: Ctx, o: SailorOptions): void {
  const sheet = sprites.sheet(SPRITE_FOLDERS.avatar);
  if (!sheet) return;
  const { pose, avatar } = o;
  const dir = o.dir ?? 1;
  const frame = spriteFrameOf(pose, avatar.tool);
  withTransform(ctx, { scaleX: dir }, () => {
    for (const slot of avatarSpriteSlots(avatar, frame)) {
      if (slot.layer === "tool" && o.tool === false) continue;
      const s = pick(sheet, slot);
      if (s) {
        // Nothing on the head hangs past the desk's front edge; against a
        // galley table the torso stops at the table's far edge.
        const cut = o.desk === "clip" && BEHIND_DESK.has(slot.layer) ? DESK_FAR - 2 : slot.head || o.desk === "clip" ? DESK_NEAR : null;
        const paint = () => drawLayer(ctx, s, slot, pose, avatar, frame);
        if (cut === null) paint();
        else withClip(ctx, (c) => c.rect(-400, -600, 800, 600 + cut), paint);
      }
      if (slot.layer === "coat" && o.desk !== "clip") o.desk(ctx);
    }
    if (pose.stretch > 0) {
      drawStretchLines(ctx, pose.arms[0].hand, -1, pose.stretch, pose.t);
      drawStretchLines(ctx, pose.arms[1].hand, 1, pose.stretch, pose.t);
    }
    if (pose.zzz !== null) drawZzz(ctx, { x: pose.head.x + 26, y: pose.head.y - 32 }, pose.zzz, dir);
  });
}

function pick(sheet: SpriteSheet, slot: AvatarSpriteSlot): Sprite | undefined {
  for (const id of slot.ids) {
    const s = sheet.sprites.get(id);
    if (s) return s;
  }
  return undefined;
}

function drawLayer(ctx: Ctx, s: Sprite, slot: AvatarSpriteSlot, pose: Pose, avatar: AvatarLoadout, frame: AvatarSpriteFrame): void {
  const onHead = slot.head || (slot.layer === "accessory" && !BODY_ACCESSORIES.has(avatar.accessory));
  if (onHead) {
    // The head nods and tilts around its own center.
    withTransform(ctx, { x: pose.head.x, y: pose.head.y, rotate: pose.headRot }, () => drawSprite(ctx, s, 0, -HEAD_Y, { tint: slot.tint }));
    return;
  }
  if (slot.layer === "tool") {
    drawSprite(ctx, s, 0, 0);
    return;
  }
  let { x, y } = pose.torso;
  if (slot.layer === "hands") {
    // Small busy motions: the pen travels along the line, keys get pressed.
    if (frame.arms === "writing") x += (pose.write.along - 0.5) * 6;
    if (frame.arms === "typing" && (pose.keys[0] >= 0 || pose.keys[1] >= 0)) y += 1.2;
  }
  drawSprite(ctx, s, x, y, { tint: slot.tint });
}
