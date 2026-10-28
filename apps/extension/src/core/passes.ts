// Leisure passes: answering the Siren Gate's cards opens one site for a few minutes.

import { GATE_LEISURE_MINUTES } from "@ship/shared-types";

/** Site → expiry (epoch ms). */
export type Passes = Record<string, number>;

export function normalizePasses(raw: unknown): Passes {
  const out: Passes = {};
  if (raw && typeof raw === "object") {
    for (const [site, until] of Object.entries(raw)) if (typeof until === "number" && Number.isFinite(until)) out[site] = until;
  }
  return out;
}

export function activePass(passes: Passes, site: string, now: number): number | null {
  const until = passes[site];
  return until !== undefined && until > now ? until : null;
}

export function prunePasses(passes: Passes, now: number): Passes {
  return Object.fromEntries(Object.entries(passes).filter(([, until]) => until > now));
}

export function grantPass(passes: Passes, site: string, now: number, minutes = GATE_LEISURE_MINUTES): { passes: Passes; until: number } {
  const until = now + minutes * 60_000;
  return { passes: { ...prunePasses(passes, now), [site]: until }, until };
}
