// A FetchLike that tunnels requests through the crew server's /relay, for
// APIs that send no CORS headers (Canvas). The relay only forwards to its
// allowlist and only keeps a few response headers (content-type, link).

import { RELAY_PATH } from "@ship/shared-types";
import type { FetchLike, RelayRequest, RelayResponse } from "@ship/shared-types";
import type { FetchResponse } from "./http.js";

/** "http://localhost:8787" or ".../relay" → "http://localhost:8787/relay". */
export function relayEndpoint(relayUrl: string): string {
  const base = relayUrl.trim().replace(/\/+$/, "");
  return base.endsWith(RELAY_PATH) ? base : `${base}${RELAY_PATH}`;
}

export function isRelayResponse(value: unknown): value is RelayResponse {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<RelayResponse>;
  return (
    typeof v.status === "number" &&
    typeof v.body === "string" &&
    typeof v.headers === "object" &&
    v.headers !== null &&
    !Array.isArray(v.headers)
  );
}

/** Turns a RelayResponse back into the shape a FetchLike resolves to. */
export function responseFromRelay(relayed: RelayResponse): FetchResponse {
  const headers = new Map<string, string>();
  for (const [name, value] of Object.entries(relayed.headers)) {
    if (typeof value === "string") headers.set(name.toLowerCase(), value);
  }
  return {
    ok: relayed.status >= 200 && relayed.status < 300,
    status: relayed.status,
    headers: { get: (name) => headers.get(name.toLowerCase()) ?? null },
    json: async () => JSON.parse(relayed.body) as unknown,
    text: async () => relayed.body,
  };
}

/**
 * `relayUrl` is the crew server's origin (e.g. "http://localhost:8787").
 * `fetchImpl` defaults to the browser's fetch; it only ever talks to the relay.
 */
export function createRelayFetch(relayUrl: string, fetchImpl?: FetchLike): FetchLike {
  const endpoint = relayEndpoint(relayUrl);
  const transport: FetchLike = fetchImpl ?? ((url, init) => globalThis.fetch(url, init));
  return async (url, init) => {
    const request: RelayRequest = { url, method: init?.method ?? "GET", headers: init?.headers ?? {} };
    if (init?.body !== undefined) request.body = init.body;
    const res = await transport(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
    if (isRelayResponse(parsed)) return responseFromRelay(parsed);
    // The relay itself refused (host not allowlisted, bad origin) or is broken.
    // Surface that as a failed response so callers' HttpError handling applies.
    return responseFromRelay({
      status: res.ok ? 502 : res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "text/plain" },
      body: text,
    });
  };
}
