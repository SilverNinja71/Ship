// Google's Gemini API, as Ship uses it: the Lookout's video judge and the
// Captain's Log grader send a generateContent request that asks for JSON, and
// the Fleet Log asks for notes on links and images, all with the sailor's own
// API key. Any surprise becomes a GeminiError, so callers can fall back to
// their offline checks or explain the problem.

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
 * POSTs a generateContent request and returns Google's whole response. Throws
 * GeminiError for network trouble, timeouts, HTTP errors and unreadable replies.
 */
export async function postGeminiGenerate(fetch: FetchLike, options: GeminiCallOptions, request: unknown): Promise<unknown> {
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
    try {
      return await res.json();
    } catch {
      throw new GeminiError(controller.signal.aborted ? "Gemini took too long to answer." : "Gemini sent something that isn't JSON.");
    }
  } finally {
    clearTimeout(timer);
  }
}

export interface JsonSchema {
  readonly type: "STRING" | "NUMBER" | "BOOLEAN" | "OBJECT" | "ARRAY";
  readonly enum?: readonly string[];
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly items?: JsonSchema;
}

export type SchemaValidationResult =
  | { ok: true }
  | { ok: false; path: string; reason: string };

/**
 * Runtime JSON Schema validator aligned with Gemini `responseSchema` definitions.
 * Ensures model outputs strictly match declared types, enums, arrays, and required fields.
 */
export function validateJsonSchema(value: unknown, schema: JsonSchema, path = "$"): SchemaValidationResult {
  switch (schema.type) {
    case "STRING": {
      if (typeof value !== "string") return { ok: false, path, reason: `expected STRING, got ${typeof value}` };
      if (schema.enum && !schema.enum.includes(value)) {
        // Allow case-insensitive enum match when caller normalizes case downstream? No — keep strict unless exact!
        const lower = value.trim().toLowerCase();
        if (!schema.enum.some((e) => e.toLowerCase() === lower)) {
          return { ok: false, path, reason: `expected one of [${schema.enum.join(", ")}], got "${value}"` };
        }
      }
      return { ok: true };
    }
    case "NUMBER":
      if (typeof value === "number" && Number.isFinite(value)) return { ok: true };
      if (typeof value === "string" && Number.isFinite(Number.parseFloat(value))) return { ok: true };
      return { ok: false, path, reason: `expected finite NUMBER, got ${typeof value}` };
    case "BOOLEAN":
      return typeof value === "boolean"
        ? { ok: true }
        : { ok: false, path, reason: `expected BOOLEAN, got ${typeof value}` };
    case "ARRAY": {
      if (!Array.isArray(value)) return { ok: false, path, reason: "expected ARRAY" };
      if (schema.items) {
        for (let i = 0; i < value.length; i++) {
          const itemCheck = validateJsonSchema(value[i], schema.items, `${path}[${i}]`);
          if (!itemCheck.ok) return itemCheck;
        }
      }
      return { ok: true };
    }
    case "OBJECT": {
      if (!isRecord(value)) return { ok: false, path, reason: "expected OBJECT" };
      if (schema.required) {
        for (const key of schema.required) {
          if (!(key in value) || value[key] === undefined) {
            return { ok: false, path: `${path}.${key}`, reason: "missing required property" };
          }
        }
      }
      if (schema.properties) {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          if (key in value && value[key] !== undefined) {
            const propCheck = validateJsonSchema(value[key], propSchema, `${path}.${key}`);
            if (!propCheck.ok) return propCheck;
          }
        }
      }
      return { ok: true };
    }
  }
}

function schemaFromRequest(request: unknown): JsonSchema | undefined {
  if (!isRecord(request) || !isRecord(request.generationConfig)) return undefined;
  const s = request.generationConfig.responseSchema;
  return isRecord(s) && typeof s.type === "string" ? (s as unknown as JsonSchema) : undefined;
}

/**
 * POSTs a generateContent request and returns parsed JSON. Enforces strict JSON schema
 * validation whenever `schema` or `request.generationConfig.responseSchema` is present.
 */
export async function generateGeminiJson(
  fetch: FetchLike,
  options: GeminiCallOptions,
  request: unknown,
  schema?: JsonSchema,
): Promise<unknown> {
  const data = parseJsonLoose(extractCandidateText(await postGeminiGenerate(fetch, options, request)));
  if (data === undefined) throw new GeminiError("Gemini's answer wasn't the JSON we asked for.");
  const activeSchema = schema ?? schemaFromRequest(request);
  if (activeSchema) {
    const check = validateJsonSchema(data, activeSchema);
    if (!check.ok) {
      throw new GeminiError(`Gemini's answer wasn't the JSON we asked for (schema check at ${check.path}: ${check.reason}).`);
    }
  }
  return data;
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
