// Types every drawing module shares.

export type Ctx = CanvasRenderingContext2D;

export interface Point {
  x: number;
  y: number;
}

export interface FrameInfo {
  /** Seconds since the scene started. Every animation is a function of this. */
  t: number;
  /** Seconds since the last frame, clamped so a backgrounded tab doesn't jump. */
  dt: number;
  /** The sailor asked for less motion: keep things still or very slow. */
  reducedMotion: boolean;
  /** 0 calm (docked) .. 1 brisk (sailing). Sails billow and flags snap with it. */
  wind: number;
}

/** A frozen frame for thumbnails and previews. */
export const STILL_FRAME: FrameInfo = { t: 0, dt: 0, reducedMotion: true, wind: 0.5 };
