// Two small limiters. Both take `now` as an argument so tests can drive time.

/** At most `max` events in any sliding window of `windowMs`. */
export class SlidingWindowLimiter {
  private readonly max: number;
  private readonly windowMs: number;
  private readonly stamps: number[] = [];

  constructor(max: number, windowMs: number) {
    this.max = max;
    this.windowMs = windowMs;
  }

  tryTake(now: number): boolean {
    while (this.stamps.length > 0 && this.stamps[0]! <= now - this.windowMs) this.stamps.shift();
    if (this.stamps.length >= this.max) return false;
    this.stamps.push(now);
    return true;
  }
}

/** Allows bursts of up to `burst` events, refilling `perSecond` tokens each second. */
export class TokenBucket {
  private readonly burst: number;
  private readonly perSecond: number;
  private tokens: number;
  private last: number;

  constructor(burst: number, perSecond: number, now: number) {
    this.burst = burst;
    this.perSecond = perSecond;
    this.tokens = burst;
    this.last = now;
  }

  tryTake(now: number): boolean {
    this.tokens = Math.min(this.burst, this.tokens + (Math.max(0, now - this.last) / 1000) * this.perSecond);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
