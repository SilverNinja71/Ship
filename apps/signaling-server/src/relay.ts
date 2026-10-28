// POST /relay: a small allowlisted proxy for APIs that refuse browser requests
// (Canvas sends no CORS headers). Only Ship pages on this computer may use it,
// and it only talks to a few hosts, re-checking every redirect hop.
//
// Replies are always a RelayResponse. HTTP 200 means the upstream answered
// (its own status is inside, even a 404). Any other HTTP status means the
// relay itself refused, with `{ "error": "..." }` as the body.

import type { IncomingMessage, ServerResponse } from "node:http";
import type { RelayRequest, RelayResponse } from "@ship/shared-types";
import { sendJson } from "./http.js";

/** The outbound fetch, injectable so tests never touch the network. */
export type RelayFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface RelayOptions {
  /** A school's own Canvas domains (CANVAS_HOSTS), on top of *.instructure.com. */
  canvasHosts?: readonly string[];
  fetch?: RelayFetch;
  /** For the whole exchange, redirects and body included. Default 20 s. */
  timeoutMs?: number;
  /** Default 1 MiB. */
  maxRequestBytes?: number;
  /** A Canvas page of 100 assignments with descriptions can be a few MB. Default 10 MiB. */
  maxResponseBytes?: number;
  /** Default 5. */
  maxRedirects?: number;
}

export interface Relay {
  /** Answers OPTIONS and POST on RELAY_PATH. Never rejects. */
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
  /** Forwards one request; throws a RelayError when it refuses. */
  forward(request: RelayRequest): Promise<RelayResponse>;
}

export class RelayError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const FIXED_HOSTS = ["api.todoist.com", "lodestarplanner.com", "www.lodestarplanner.com"];
const WILDCARD_SUFFIX = ".instructure.com";

/** The only request headers the integrations need. Cookies and hop-by-hop headers never pass. */
const FORWARDED_REQUEST_HEADERS = new Set(["accept", "accept-language", "authorization", "content-type", "x-request-id"]);
/** content-type for the body, link for Canvas paging. */
const KEPT_RESPONSE_HEADERS = ["content-type", "link"];
const METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_URL_LENGTH = 8192;
const MAX_HEADER_LENGTH = 8192;

// Dotted DNS names only. The last label must start with a letter, which rules
// out IP addresses; a trailing dot or an empty label doesn't match either.
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** "Canvas.School.edu" or "https://canvas.school.edu/" becomes "canvas.school.edu"; null if it isn't a hostname. */
export function normalizeHostname(value: string): string | null {
  let host = value.trim().toLowerCase();
  if (host.includes("://")) {
    try {
      host = new URL(host).hostname;
    } catch {
      return null;
    }
  }
  return HOSTNAME.test(host) ? host : null;
}

/** Parses CANVAS_HOSTS (comma- or space-separated); entries that aren't hostnames are skipped. */
export function parseHostList(value: string | undefined): string[] {
  const hosts = (value ?? "").split(/[\s,]+/).map(normalizeHostname);
  return [...new Set(hosts.filter((host): host is string => host !== null))];
}

/** Returns a check for target URLs: https, default port, no userinfo, host on the allowlist. */
export function createHostAllowlist(canvasHosts: readonly string[] = []): (url: URL) => boolean {
  const exact = new Set(FIXED_HOSTS);
  for (const host of canvasHosts) {
    const normalized = normalizeHostname(host);
    if (normalized) exact.add(normalized);
  }
  return (url) => {
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "") return false;
    const host = url.hostname;
    if (!HOSTNAME.test(host)) return false;
    // endsWith(".instructure.com") so "evilinstructure.com" doesn't count; HOSTNAME guarantees a real label before it.
    return exact.has(host) || host.endsWith(WILDCARD_SUFFIX);
  };
}

const LOCAL_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::([0-9]{1,5}))?$/;

/** A page served from http://localhost or http://127.0.0.1, on any port. */
export function isAllowedOrigin(origin: string | undefined): origin is string {
  const match = origin === undefined ? null : LOCAL_ORIGIN.exec(origin);
  if (!match) return false;
  return match[1] === undefined || (Number(match[1]) >= 1 && Number(match[1]) <= 65535);
}

/** The TCP peer is this computer (also catches a non-browser client faking Origin from elsewhere). */
export function isLoopbackAddress(address: string | undefined): boolean {
  if (address === undefined) return false;
  const v4 = address.startsWith("::ffff:") ? address.slice("::ffff:".length) : address;
  return v4 === "::1" || /^127\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/.test(v4);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Checks the shape of a RelayRequest that arrived as JSON. Policy (hosts, methods) is forward()'s job. */
export function parseRelayRequest(value: unknown): RelayRequest {
  const bad = (message: string) => new RelayError(400, message);
  if (!isRecord(value)) throw bad("The body must be a RelayRequest object.");
  const { url, method, headers, body } = value;
  if (typeof url !== "string" || url.length > MAX_URL_LENGTH) throw bad("url must be a string.");
  const request: RelayRequest = { url };
  if (method !== undefined) {
    if (typeof method !== "string") throw bad("method must be a string.");
    request.method = method;
  }
  if (headers !== undefined) {
    if (!isRecord(headers)) throw bad("headers must be an object of strings.");
    const clean: Record<string, string> = {};
    for (const [name, headerValue] of Object.entries(headers)) {
      if (typeof headerValue !== "string" || headerValue.length > MAX_HEADER_LENGTH || /[\r\n\0]/.test(headerValue)) {
        throw bad(`Header "${name}" must be a single-line string.`);
      }
      clean[name] = headerValue;
    }
    request.headers = clean;
  }
  if (body !== undefined) {
    if (typeof body !== "string") throw bad("body must be a string.");
    request.body = body;
  }
  return request;
}

function forwardedHeaders(input: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(input ?? {})) {
    const key = name.toLowerCase();
    if (FORWARDED_REQUEST_HEADERS.has(key)) out[key] = value;
  }
  return out;
}

function keptHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of KEPT_RESPONSE_HEADERS) {
    const value = headers.get(name);
    if (value !== null) out[name] = value;
  }
  return out;
}

async function readLimited(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new RelayError(502, `The upstream response is bigger than ${maxBytes} bytes.`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function readRequestBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const tooBig = () => new RelayError(413, `The request body is bigger than ${maxBytes} bytes.`);
    if (Number(req.headers["content-length"]) > maxBytes) return reject(tooBig());
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    req.on("data", (chunk: Buffer) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBytes) {
        settled = true;
        reject(tooBig());
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

function refusal(error: RelayError): RelayResponse {
  return { status: error.status, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: error.message }) };
}

export function createRelay(options: RelayOptions = {}): Relay {
  const isAllowed = createHostAllowlist(options.canvasHosts);
  const fetchFn: RelayFetch = options.fetch ?? ((url, init) => fetch(url, init));
  const timeoutMs = options.timeoutMs ?? 20_000;
  const maxRequestBytes = options.maxRequestBytes ?? 1024 * 1024;
  const maxResponseBytes = options.maxResponseBytes ?? 10 * 1024 * 1024;
  const maxRedirects = options.maxRedirects ?? 5;

  function target(raw: string): URL {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new RelayError(400, "url is not a valid absolute URL.");
    }
    if (!isAllowed(url)) throw new RelayError(403, `The relay doesn't forward to ${url.protocol}//${url.host}.`);
    return url;
  }

  async function forward(request: RelayRequest): Promise<RelayResponse> {
    let method = (request.method ?? "GET").toUpperCase();
    if (!METHODS.has(method)) throw new RelayError(400, `Method ${method} isn't supported.`);
    let body = request.body;
    if (body !== undefined && (method === "GET" || method === "HEAD")) throw new RelayError(400, `A ${method} request can't have a body.`);
    // Always fetch url.href, the exact string the allowlist checked.
    let url = target(request.url);
    const headers = forwardedHeaders(request.headers);
    const signal = AbortSignal.timeout(timeoutMs);

    try {
      for (let hop = 0; ; hop++) {
        const res = await fetchFn(url.href, { method, headers: { ...headers }, body, redirect: "manual", signal });
        const location = REDIRECT_STATUSES.has(res.status) ? res.headers.get("location") : null;
        if (location === null) {
          return { status: res.status, headers: keptHeaders(res.headers), body: method === "HEAD" ? "" : await readLimited(res, maxResponseBytes) };
        }

        await res.body?.cancel().catch(() => {});
        if (hop >= maxRedirects) throw new RelayError(502, "Too many redirects.");
        let next: URL;
        try {
          next = new URL(location, url);
        } catch {
          throw new RelayError(502, "The upstream sent a broken redirect.");
        }
        if (!isAllowed(next)) throw new RelayError(403, `The relay doesn't follow redirects to ${next.protocol}//${next.host}.`);
        // Like browsers: a token for one host never goes to another.
        if (next.origin !== url.origin) delete headers.authorization;
        // Like fetch: 303 turns into GET, and so does POST after 301/302.
        if ((res.status === 303 && method !== "HEAD") || ((res.status === 301 || res.status === 302) && method === "POST")) {
          method = "GET";
          body = undefined;
          delete headers["content-type"];
        }
        url = next;
      }
    } catch (err) {
      if (err instanceof RelayError) throw err;
      if (signal.aborted) throw new RelayError(504, `The upstream didn't answer within ${timeoutMs} ms.`);
      throw new RelayError(502, "The upstream request failed.");
    }
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const origin = req.headers.origin;
    if (!isLoopbackAddress(req.socket.remoteAddress) || !isAllowedOrigin(origin)) {
      return sendJson(res, 403, refusal(new RelayError(403, "The relay only serves Ship pages on this computer (http://localhost).")));
    }
    const cors = { "access-control-allow-origin": origin, vary: "Origin" };
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        ...cors,
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "600",
      });
      res.end();
      return;
    }

    try {
      if (req.method !== "POST") throw new RelayError(405, "Use POST.");
      // Requiring JSON also means every browser call is CORS-preflighted.
      const contentType = (req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
      if (contentType !== "application/json") throw new RelayError(415, "Send the RelayRequest as application/json.");
      const raw = await readRequestBody(req, maxRequestBytes);
      let input: unknown;
      try {
        input = JSON.parse(raw);
      } catch {
        throw new RelayError(400, "The body isn't valid JSON.");
      }
      sendJson(res, 200, await forward(parseRelayRequest(input)), cors);
    } catch (err) {
      const error = err instanceof RelayError ? err : new RelayError(500, "The relay failed.");
      if (!(err instanceof RelayError)) console.error("relay:", err);
      const extra: Record<string, string> = {};
      if (error.status === 405) extra.allow = "POST, OPTIONS";
      // Stop reading an oversized upload: answer, then hang up.
      if (error.status === 413) extra.connection = "close";
      sendJson(res, error.status, refusal(error), { ...cors, ...extra });
    }
  }

  return { handle, forward };
}
