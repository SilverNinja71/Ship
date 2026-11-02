// Gemini verdicts, remembered per video and study context so re-opening a
// video doesn't cost another call. The video groups' verdicts aren't cached:
// they're instant, and caching them would hide Gemini once a key is added.

import type { LookoutVerdict } from "@ship/shared-types";
import { VERDICT_CACHE_MAX, VERDICT_TTL_MS } from "./constants.js";

export interface CachedVerdict {
  verdict: LookoutVerdict;
  at: number;
}

export type VerdictCache = Record<string, CachedVerdict>;

export function verdictCacheKey(videoId: string, contextKey: string): string {
  return `${videoId}|${contextKey}`;
}

export function normalizeVerdictCache(raw: unknown): VerdictCache {
  const out: VerdictCache = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, entry] of Object.entries(raw)) {
    const e = entry as Partial<CachedVerdict> | null;
    const v = e?.verdict;
    if (typeof e?.at === "number" && v && (v.decision === "PROCEED" || v.decision === "BLOCKED") && typeof v.reason === "string") {
      out[key] = { verdict: { decision: v.decision, reason: v.reason, confidence: Number(v.confidence) || 0, source: v.source ?? "gemini" }, at: e.at };
    }
  }
  return out;
}

/** The remembered verdict, labeled as coming from the cache; null if missing or expired. */
export function getCachedVerdict(cache: VerdictCache, key: string, now: number, ttlMs = VERDICT_TTL_MS): LookoutVerdict | null {
  const hit = cache[key];
  if (!hit || now - hit.at > ttlMs) return null;
  return { ...hit.verdict, source: "cache" };
}

export function putCachedVerdict(
  cache: VerdictCache,
  key: string,
  verdict: LookoutVerdict,
  now: number,
  max = VERDICT_CACHE_MAX,
  ttlMs = VERDICT_TTL_MS,
): VerdictCache {
  const entries = Object.entries(cache).filter(([k, e]) => k !== key && now - e.at <= ttlMs);
  entries.push([key, { verdict, at: now }]);
  entries.sort((a, b) => a[1].at - b[1].at);
  return Object.fromEntries(entries.slice(Math.max(0, entries.length - max)));
}

export function pruneVerdictCache(cache: VerdictCache, now: number, ttlMs = VERDICT_TTL_MS): VerdictCache {
  return Object.fromEntries(Object.entries(cache).filter(([, e]) => now - e.at <= ttlMs));
}
