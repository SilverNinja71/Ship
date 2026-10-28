// The options-page settings, and the Ship URL helpers that depend on them.

import { normalizeSiteEntry } from "./classify.js";

export interface LookoutSettings {
  /** The user's own Gemini key. Stays in chrome.storage.local and is only sent to Google. */
  geminiApiKey: string;
  /** A setting because Gemini model ids change. */
  geminiModel: string;
  shipUrl: string;
  /** Hostnames such as "reddit.com"; subdomains are included. */
  blockedSites: string[];
}

export const DEFAULT_SHIP_URL = "http://localhost:5173";
/** Google's alias for its newest Flash model, so the default doesn't go stale. */
export const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";

export const DEFAULT_SETTINGS: LookoutSettings = {
  geminiApiKey: "",
  geminiModel: DEFAULT_GEMINI_MODEL,
  shipUrl: DEFAULT_SHIP_URL,
  blockedSites: [],
};

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

/** "localhost:5173" or "http://localhost:5173/" becomes "http://localhost:5173"; null if it isn't a web URL. */
export function normalizeShipUrl(input: string): string | null {
  let value = input.trim();
  if (!value) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    const host = value.split(/[/:?#]/)[0] ?? "";
    value = `${isLoopbackHost(host) ? "http" : "https"}://${value}`;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || !url.hostname) return null;
  return url.origin + url.pathname.replace(/\/+$/, "");
}

/** "models/gemini-2.5-flash " becomes "gemini-2.5-flash"; anything odd falls back to the default. */
export function normalizeModel(input: unknown): string {
  if (typeof input !== "string") return DEFAULT_GEMINI_MODEL;
  const model = input.trim().replace(/^models\//, "");
  return MODEL_ID.test(model) ? model : DEFAULT_GEMINI_MODEL;
}

export function normalizeSettings(raw: unknown): LookoutSettings {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const sites = Array.isArray(r.blockedSites) ? r.blockedSites : [];
  const blockedSites = [...new Set(sites.map((s) => (typeof s === "string" ? normalizeSiteEntry(s) : null)).filter((s): s is string => s !== null))];
  return {
    geminiApiKey: typeof r.geminiApiKey === "string" ? r.geminiApiKey.trim() : "",
    geminiModel: normalizeModel(r.geminiModel),
    shipUrl: (typeof r.shipUrl === "string" && normalizeShipUrl(r.shipUrl)) || DEFAULT_SHIP_URL,
    blockedSites,
  };
}

export function geminiReady(settings: LookoutSettings): boolean {
  return settings.geminiApiKey.length > 0;
}

/** localhost and 127.0.0.1 are the same Ship, so a tab on either counts. */
function shipOrigins(shipUrl: string): string[] {
  const url = new URL(shipUrl);
  const origins = [url.origin];
  const twin = url.hostname === "localhost" ? "127.0.0.1" : url.hostname === "127.0.0.1" ? "localhost" : null;
  if (twin) origins.push(`${url.protocol}//${twin}${url.port ? `:${url.port}` : ""}`);
  return origins;
}

/** Match patterns for chrome.tabs.query. They leave the port out (any port matches); isShipTabUrl narrows. */
export function shipTabPatterns(shipUrl: string): string[] {
  return shipOrigins(shipUrl).map((origin) => {
    const url = new URL(origin);
    return `${url.protocol}//${url.hostname}/*`;
  });
}

export function isShipTabUrl(tabUrl: string, shipUrl: string): boolean {
  try {
    return shipOrigins(shipUrl).includes(new URL(tabUrl).origin);
  } catch {
    return false;
  }
}

/** A Ship URL outside localhost needs its own (optional) host permission and a registered bridge script. */
export function customShipOriginPattern(shipUrl: string): string | null {
  const url = new URL(shipUrl);
  return isLoopbackHost(url.hostname) ? null : `${url.protocol}//${url.hostname}/*`;
}
