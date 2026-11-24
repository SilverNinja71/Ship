// Flashcards from a note: Gemini writes them when the sailor has added a key,
// Ship's offline maker otherwise, and the offline maker again whenever Gemini
// can't (no network, a bad key, nothing usable in its answer).

import { cardsFromNotes } from "@ship/active-recall-engine";
import type { DraftCard } from "@ship/active-recall-engine";
import { makeCardsWithGemini } from "@ship/integrations";
import type { FetchLike } from "@ship/shared-types";
import type { GradingSettings } from "./blurtGrading.js";
import { browserFetch } from "./network.js";

export interface DraftSet {
  cards: DraftCard[];
  madeBy: "gemini" | "device";
  /** Set when Gemini was asked but the offline maker had to step in. */
  notice: string | null;
}

export async function makeStudySet(notes: string, settings: GradingSettings, count = 15, fetch: FetchLike = browserFetch): Promise<DraftSet> {
  const offline = (): DraftCard[] => cardsFromNotes(notes, count);
  const apiKey = settings.geminiApiKey.trim();
  if (!apiKey) return { cards: offline(), madeBy: "device", notice: null };
  try {
    return { cards: await makeCardsWithGemini(fetch, { apiKey, model: settings.geminiModel }, notes, count), madeBy: "gemini", notice: null };
  } catch (e) {
    const why = e instanceof Error ? e.message.replace(/\.$/, "") : "something went wrong";
    return { cards: offline(), madeBy: "device", notice: `Gemini couldn't make cards (${why}), so Ship made these on this device.` };
  }
}
