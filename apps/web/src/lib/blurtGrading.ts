// Grading a Captain's Log entry: Gemini when the sailor has added their own
// key, Ship's offline keyword engine otherwise, and the offline engine again
// whenever Gemini can't answer (no network, a bad key, an odd reply).

import type { BlurtResult, FetchLike } from "@ship/shared-types";
import { checkBlurt } from "@ship/active-recall-engine";
import { gradeBlurtWithGemini } from "@ship/integrations";
import { browserFetch } from "./network.js";

export interface LogGrade {
  result: BlurtResult;
  /** Set when Gemini was asked but the offline engine had to grade instead. */
  notice: string | null;
}

export interface GradingSettings {
  geminiApiKey: string;
  geminiModel: string;
}

export async function gradeLogEntry(blurt: string, notes: string, settings: GradingSettings, fetch: FetchLike = browserFetch): Promise<LogGrade> {
  const offline = (): BlurtResult => ({ ...checkBlurt(blurt, notes), gradedBy: "heuristic" });
  const apiKey = settings.geminiApiKey.trim();
  if (!apiKey) return { result: offline(), notice: null };
  try {
    return { result: await gradeBlurtWithGemini(fetch, { apiKey, model: settings.geminiModel }, blurt, notes), notice: null };
  } catch (e) {
    const why = e instanceof Error ? e.message.replace(/\.$/, "") : "something went wrong";
    return { result: offline(), notice: `Gemini couldn't grade this (${why}), so Ship graded it on this device.` };
  }
}
