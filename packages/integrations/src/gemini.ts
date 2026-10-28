// Google's Gemini API, as Ship uses it: the Lookout's video judge and the
// Captain's Log grader both send a generateContent request that asks for JSON,
// with the sailor's own API key. Any surprise becomes a GeminiError, so callers
// can fall back to their offline checks.

import type { FetchLike } from "@ship/shared-types";

export const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
/** Model ids change; this alias follows Google's current Flash model. It's a setting wherever Gemini is used. */
export const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";
/** Where to get a key. */
export const GEMINI_KEY_URL = "https://aistudio.google.com/apikey";

export class GeminiError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
  }
}

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/** "models/gemini-2.5-flash " becomes "gemini-2.5-flash"; anything odd falls back to the default. */
export function normalizeGeminiModel(input: unknown): string {
  if (typeof input !== "string") return DEFAULT_GEMINI_MODEL;
  const model = input.trim().replace(/^models\//, "");
  return MODEL_ID.test(model) ? model : DEFAULT_GEMINI_MODEL;
}

export function geminiModelUrl(model: string): string {
  return `${GEMINI_API_BASE}/models/${encodeURIComponent(normalizeGeminiModel(model))}`;
}

export function geminiGenerateUrl(model: string): string {
  return `${geminiModelUrl(model)}:generateContent`;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export const clipText = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max)}…` : s);

/** The model's text from a generateContent response, skipping "thought" parts. */
export function extractCandidateText(body: unknown): string {
  if (!isRecord(body)) throw new GeminiError("Gemini sent something that isn't JSON.");
  const feedback = body.promptFeedback;
  if (isRecord(feedback) && typeof feedback.blockReason === "string") {
    throw new GeminiError(`Gemini declined to answer (${feedback.blockReason}).`);
  }
  const candidate = Array.isArray(body.candidates) ? body.candidates[0] : undefined;
  if (!isRecord(candidate)) throw new GeminiError("Gemini sent no answer.");
  const content = candidate.content;
  const parts = isRecord(content) && Array.isArray(content.parts) ? content.parts : [];
  const text = parts
    .filter((p): p is Record<string, unknown> => isRecord(p) && typeof p.text === "string" && p.thought !== true)
    .map((p) => p.text as string)
    .join("");
  if (!text.trim()) {
    const why = typeof candidate.finishReason === "string" ? ` (${candidate.finishReason})` : "";
    throw new GeminiError(`Gemini's answer was empty${why}.`);
  }
  return text;
}

/** JSON inside the model's text, tolerating code fences and prose around the object. Undefined if there's none. */
export function parseJsonLoose(text: string): unknown {
  const unfenced = text
    .trim()
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    // Prose around the object: try the outermost {...}.
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(unfenced.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
    return undefined;
  }
}

/** Google's error message from a failed response, as ": message", or "". */
export async function geminiErrorDetail(res: { json(): Promise<unknown> }): Promise<string> {
  try {
    const body = await res.json();
    const msg = isRecord(body) && isRecord(body.error) ? body.error.message : null;
    return typeof msg === "string" ? `: ${clipText(msg, 200)}` : "";
  } catch {
    return "";
  }
}

export interface GeminiCallOptions {
  apiKey: string;
  model: string;
  /** Give up after this long. */
  timeoutMs: number;
}

/**
 * POSTs a generateContent request and returns the JSON the model wrote.
 * Throws GeminiError for network trouble, timeouts, HTTP errors, refusals and
 * answers that aren't JSON.
 */
export async function generateGeminiJson(fetch: FetchLike, options: GeminiCallOptions, request: unknown): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await fetch(geminiGenerateUrl(options.model), {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": options.apiKey },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } catch {
      throw new GeminiError(controller.signal.aborted ? "Gemini took too long to answer." : "Couldn't reach Gemini.");
    }
    if (!res.ok) throw new GeminiError(`Gemini answered HTTP ${res.status}${await geminiErrorDetail(res)}`, res.status);
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new GeminiError(controller.signal.aborted ? "Gemini took too long to answer." : "Gemini sent something that isn't JSON.");
    }
    const data = parseJsonLoose(extractCandidateText(body));
    if (data === undefined) throw new GeminiError("Gemini's answer wasn't the JSON we asked for.");
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/** For "Check key" buttons: can this key see this model? */
export async function checkGeminiModel(
  fetch: FetchLike,
  apiKey: string,
  model: string,
): Promise<{ ok: true; displayName: string } | { ok: false; message: string }> {
  try {
    const res = await fetch(geminiModelUrl(model), { method: "GET", headers: { "x-goog-api-key": apiKey } });
    if (!res.ok) return { ok: false, message: `Gemini answered HTTP ${res.status}${await geminiErrorDetail(res)}` };
    const body = await res.json();
    const name = isRecord(body) && typeof body.displayName === "string" ? body.displayName : normalizeGeminiModel(model);
    return { ok: true, displayName: name };
  } catch {
    return { ok: false, message: "Couldn't reach Gemini." };
  }
}
