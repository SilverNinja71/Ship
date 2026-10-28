// Tolerant readers for data Ship doesn't control (Canvas and Todoist JSON,
// Parchment plists). They narrow `unknown` without throwing, so one odd field
// skips one item instead of failing a whole sync.

export type Dict = Record<string, unknown>;

/** Makes ids for things that have no remote id. Injectable so tests are deterministic. */
export type IdFactory = () => string;

export const randomId: IdFactory = () => crypto.randomUUID();

/** Injectable clock (epoch ms). */
export type Clock = () => number;

export const systemClock: Clock = () => Date.now();

export function isDict(value: unknown): value is Dict {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof Uint8Array)
  );
}

export function asDict(value: unknown): Dict | null {
  return isDict(value) ? value : null;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** A non-empty trimmed string, or null. */
export function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Remote ids arrive as strings (Todoist, Parchment) or numbers (Canvas). */
export function asId(value: unknown): string | null {
  if (typeof value === "string") return value.trim() === "" ? null : value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "bigint") return value.toString();
  return null;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") {
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

/** First of `keys` whose value is neither undefined nor null. */
export function pick(obj: Dict | null, keys: readonly string[]): unknown {
  if (!obj) return undefined;
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

const looseKey = (key: string) => key.toLowerCase().replace(/[_\-\s]/g, "");

/**
 * Like `pick`, but matches keys ignoring case, `_` and `-`, so a guessed
 * `deckId` also finds `deckID` or `deck_id`. Used for formats we only know
 * from a description (Parchment).
 */
export function pickLoose(obj: Dict | null, keys: readonly string[]): unknown {
  if (!obj) return undefined;
  const exact = pick(obj, keys);
  if (exact !== undefined) return exact;
  const wanted = keys.map(looseKey);
  for (const want of wanted) {
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined && value !== null && looseKey(key) === want) return value;
    }
  }
  return undefined;
}

/** Small deterministic hash (FNV-1a, hex) for ids when a feed gives none. */
export function stableHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** "Bio Notes.parchment" → "Bio Notes". */
export function baseName(fileName: string): string {
  const name = fileName.split(/[\\/]/).pop() ?? fileName;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}
