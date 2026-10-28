// Date handling shared by the adapters. Everything leaves here as epoch ms.

/** Apple's reference date (2001-01-01T00:00:00Z), used by plists and Swift's JSONEncoder. */
export const APPLE_REFERENCE_EPOCH_MS = Date.UTC(2001, 0, 1);

export function appleSecondsToEpochMs(seconds: number): number {
  return APPLE_REFERENCE_EPOCH_MS + seconds * 1000;
}

/**
 * A date with no time ("due Friday") counts as due at the end of that day in
 * the user's own time zone, so it doesn't show up as overdue all day.
 */
export function endOfLocalDay(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const FLOATING = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?$/;

/**
 * Parses "2026-10-30" (end of that local day), "2026-10-30T14:00:00" (local
 * wall time) and full ISO 8601 with `Z` or an offset. Null if unreadable.
 */
export function parseDateString(text: string): number | null {
  const s = text.trim();
  const dateOnly = DATE_ONLY.exec(s);
  if (dateOnly) return endOfLocalDay(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]));
  const floating = FLOATING.exec(s);
  if (floating) {
    const ms = floating[7] ? Number(floating[7].slice(0, 3).padEnd(3, "0")) : 0;
    return new Date(
      Number(floating[1]),
      Number(floating[2]) - 1,
      Number(floating[3]),
      Number(floating[4]),
      Number(floating[5]),
      Number(floating[6] ?? 0),
      ms,
    ).getTime();
  }
  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? null : parsed;
}

/** How bare numbers in a file should be read as dates. */
export type NumericDateEncoding = "apple-seconds" | "unix-seconds" | "unix-ms";

/** Date objects, date strings and numbers (per `numeric`) to epoch ms. */
export function toEpochMs(value: unknown, numeric: NumericDateEncoding = "apple-seconds"): number | null {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (numeric === "apple-seconds") return appleSecondsToEpochMs(value);
    if (numeric === "unix-seconds") return value * 1000;
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const asNum = Number(value);
    if (Number.isFinite(asNum)) return toEpochMs(asNum, numeric);
    return parseDateString(value);
  }
  return null;
}
