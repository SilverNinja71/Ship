// HTTP helpers shared by the network adapters. Every request goes through a
// FetchLike, so the web app can route it via the relay and tests can fake it.

import type { FetchLike } from "@ship/shared-types";

export type FetchInit = Parameters<FetchLike>[1];
export type FetchResponse = Awaited<ReturnType<FetchLike>>;

/** A non-2xx answer. `status` lets the UI tell "bad token" (401/403) from "server down". */
export class HttpError extends Error {
  readonly status: number;
  readonly url: string;
  /** The start of the response body, to help debugging. */
  readonly body: string;

  constructor(status: number, url: string, body: string, service = "Request") {
    const detail = errorDetail(body);
    super(`${service} failed with HTTP ${status}${detail ? `: ${detail}` : ""}`);
    this.name = "HttpError";
    this.status = status;
    this.url = url;
    this.body = body.slice(0, 500);
  }

  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

/** Pulls a readable message out of Canvas / Google / plain-text error bodies. */
function errorDetail(body: string): string {
  const text = body.trim();
  if (!text) return "";
  try {
    const json: unknown = JSON.parse(text);
    if (typeof json === "object" && json !== null) {
      const j = json as { errors?: { message?: unknown }[]; error?: unknown; message?: unknown };
      const canvas = Array.isArray(j.errors) ? j.errors[0]?.message : undefined;
      if (typeof canvas === "string") return canvas;
      if (typeof j.error === "string") return j.error;
      if (typeof j.error === "object" && j.error !== null) {
        const msg = (j.error as { message?: unknown }).message;
        if (typeof msg === "string") return msg;
      }
      if (typeof j.message === "string") return j.message;
    }
  } catch {
    // Not JSON; fall through to the raw text.
  }
  return text.replace(/\s+/g, " ").slice(0, 200);
}

/** Appends query params; arrays repeat the key (Canvas `include[]`). */
export function withQuery(
  url: string,
  params: Record<string, string | number | boolean | readonly string[] | null | undefined>,
): string {
  const u = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) for (const v of value) u.searchParams.append(key, v);
    else u.searchParams.append(key, String(value));
  }
  return u.toString();
}

export async function requestText(fetch: FetchLike, url: string, init?: FetchInit, service?: string): Promise<string> {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) throw new HttpError(res.status, url, text, service);
  return text;
}

/** GET and parse JSON. Parses from text so a relay response and a real Response behave the same. */
export async function requestJson(
  fetch: FetchLike,
  url: string,
  init?: FetchInit,
  service?: string,
): Promise<{ data: unknown; response: FetchResponse }> {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) throw new HttpError(response.status, url, text, service);
  // Canvas can prefix JSON with `while(1);` as a CSRF guard.
  const body = text.replace(/^\s*while\(1\);/, "");
  try {
    return { data: body.trim() === "" ? null : JSON.parse(body), response };
  } catch {
    throw new Error(`${service ?? "Request"} returned something that isn't JSON.`);
  }
}

/** `<a>; rel="next", <b>; rel="last"` → { next: "a", last: "b" }. */
export function parseLinkHeader(header: string | null): Record<string, string> {
  const links: Record<string, string> = {};
  if (!header) return links;
  const re = /<([^>]*)>([^<]*)/g;
  for (let m = re.exec(header); m; m = re.exec(header)) {
    const url = m[1] ?? "";
    const rel = /;\s*rel\s*=\s*(?:"([^"]*)"|([^\s;,]+))/i.exec(m[2] ?? "");
    const rels = (rel?.[1] ?? rel?.[2] ?? "").split(/\s+/).filter(Boolean);
    for (const r of rels) links[r.toLowerCase()] ??= url;
  }
  return links;
}

export interface PagingOptions {
  service?: string;
  /** Stop after this many pages, in case a server loops. */
  maxPages?: number;
}

/** Follows `Link: <...>; rel="next"` (Canvas) and concatenates the array pages. */
export async function getLinkPaged(
  fetch: FetchLike,
  firstUrl: string,
  init: FetchInit,
  { service, maxPages = 100 }: PagingOptions = {},
): Promise<unknown[]> {
  const items: unknown[] = [];
  const seen = new Set<string>();
  let url: string | null = firstUrl;
  while (url && !seen.has(url) && seen.size < maxPages) {
    seen.add(url);
    const { data, response } = await requestJson(fetch, url, init, service);
    if (!Array.isArray(data)) throw new Error(`${service ?? "Request"} returned an unexpected page (not a list).`);
    items.push(...data);
    const next = parseLinkHeader(response.headers.get("link")).next;
    url = next ? new URL(next, url).toString() : null;
  }
  return items;
}

/**
 * Cursor paging (Todoist API v1): each page is `{ results, next_cursor }`.
 * A bare array is accepted as a single page.
 */
export async function getCursorPaged(
  fetch: FetchLike,
  pageUrl: (cursor: string | null) => string,
  init: FetchInit,
  { service, maxPages = 100, itemsKey = "results", cursorKey = "next_cursor" }: PagingOptions & {
    itemsKey?: string;
    cursorKey?: string;
  } = {},
): Promise<unknown[]> {
  const items: unknown[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const { data } = await requestJson(fetch, pageUrl(cursor), init, service);
    if (Array.isArray(data)) {
      items.push(...data);
      break;
    }
    const obj = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
    const pageItems = obj[itemsKey];
    if (!Array.isArray(pageItems)) throw new Error(`${service ?? "Request"} returned an unexpected page.`);
    items.push(...pageItems);
    const next = obj[cursorKey];
    if (typeof next !== "string" || next === "" || seen.has(next)) break;
    seen.add(next);
    cursor = next;
  }
  return items;
}

/** Runs `fn` over `items` with at most `limit` in flight, keeping order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T, index);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

export function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token.trim()}`, Accept: "application/json" };
}
