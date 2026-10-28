// Test-only: a scripted FetchLike that records every call.

import type { FetchLike } from "@ship/shared-types";
import type { FetchInit, FetchResponse } from "../http.js";

export interface FakeReply {
  status?: number;
  headers?: Record<string, string>;
  /** Objects are sent as JSON. */
  body?: unknown;
}

export interface FakeCall {
  url: string;
  init: FetchInit;
}

export function reply({ status = 200, headers = {}, body = null }: FakeReply): FetchResponse {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const lower = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => lower.get(name.toLowerCase()) ?? null },
    json: async () => JSON.parse(text) as unknown,
    text: async () => text,
  };
}

/** `routes` maps a URL (exact, or a predicate) to a reply; unknown URLs get 404. */
export function fakeFetch(
  routes: ((url: string, init: FetchInit) => FakeReply | undefined) | Record<string, FakeReply>,
): FetchLike & { calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  const fn = async (url: string, init?: FetchInit) => {
    calls.push({ url, init });
    const found = typeof routes === "function" ? routes(url, init) : routes[url];
    return reply(found ?? { status: 404, body: { message: `no route for ${url}` } });
  };
  return Object.assign(fn, { calls });
}
