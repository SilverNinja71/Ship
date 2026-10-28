// Timings and limits for the Lookout. Economy numbers (steer-back bonus,
// leisure minutes, cards required) live in shared-types so the app agrees.

/** The web app heartbeats every 30 s, but Chrome slows timers in hidden tabs to about once a minute. */
export const HEARTBEAT_STALE_MS = 3 * 60_000;
/** A focus block whose endsAt passed this long ago is over, even if Ship never said so. */
export const ENDS_AT_GRACE_MS = 2 * 60_000;

export const VERDICT_TTL_MS = 12 * 60 * 60_000;
export const VERDICT_CACHE_MAX = 300;

/** Unacked events wait here until Ship is opened; zero-doubloon events go first when it fills. */
export const REWARD_QUEUE_MAX = 500;
export const MAX_CARDS = 50;

/** Steering back pays once per this window, so opening and leaving YouTube can't farm doubloons. */
export const STEER_BACK_COOLDOWN_MS = 10 * 60_000;

export const GEMINI_TIMEOUT_MS = 15_000;
export const THUMBNAIL_MAX_BYTES = 256 * 1024;

export const TICK_ALARM = "lookout-tick";
