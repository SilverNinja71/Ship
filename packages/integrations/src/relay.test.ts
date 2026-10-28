import { describe, expect, it } from "vitest";
import type { RelayRequest } from "@ship/shared-types";
import { createRelayFetch, relayEndpoint, responseFromRelay } from "./relay.js";
import { HttpError, getCursorPaged, getLinkPaged, mapWithConcurrency, parseLinkHeader, requestJson, withQuery } from "./http.js";
import { fakeFetch } from "./testing/fakeFetch.js";

describe("relayEndpoint", () => {
  it("appends /relay once", () => {
    expect(relayEndpoint("http://localhost:8787")).toBe("http://localhost:8787/relay");
    expect(relayEndpoint(" http://localhost:8787/ ")).toBe("http://localhost:8787/relay");
    expect(relayEndpoint("http://localhost:8787/relay")).toBe("http://localhost:8787/relay");
  });
});

describe("createRelayFetch", () => {
  it("wraps the request in a RelayRequest and unwraps the RelayResponse", async () => {
    const transport = fakeFetch(() => ({
      body: {
        status: 200,
        headers: { "Content-Type": "application/json", Link: '<https://x.instructure.com/p2>; rel="next"' },
        body: JSON.stringify([{ id: 1 }]),
      },
    }));
    const relayed = createRelayFetch("http://localhost:8787", transport);
    const res = await relayed("https://x.instructure.com/api/v1/courses", {
      method: "GET",
      headers: { Authorization: "Bearer t" },
    });

    expect(transport.calls).toHaveLength(1);
    const call = transport.calls[0]!;
    expect(call.url).toBe("http://localhost:8787/relay");
    expect(call.init?.method).toBe("POST");
    expect(call.init?.headers).toEqual({ "content-type": "application/json" });
    const sent = JSON.parse(call.init?.body ?? "") as RelayRequest;
    expect(sent).toEqual({ url: "https://x.instructure.com/api/v1/courses", method: "GET", headers: { Authorization: "Bearer t" } });

    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.headers.get("link")).toBe('<https://x.instructure.com/p2>; rel="next"');
    expect(res.headers.get("CONTENT-TYPE")).toBe("application/json");
    expect(res.headers.get("x-missing")).toBeNull();
    expect(await res.json()).toEqual([{ id: 1 }]);
    expect(await res.text()).toBe('[{"id":1}]');
  });

  it("forwards a request body and passes upstream errors through", async () => {
    const transport = fakeFetch(() => ({ body: { status: 401, headers: {}, body: '{"errors":[{"message":"Invalid access token."}]}' } }));
    const res = await createRelayFetch("http://localhost:8787/", transport)("https://x/api", { method: "POST", body: "{}" });
    expect((JSON.parse(transport.calls[0]?.init?.body ?? "") as RelayRequest).body).toBe("{}");
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
  });

  it("turns a relay refusal into a failed response", async () => {
    const transport = fakeFetch(() => ({ status: 403, headers: { "content-type": "text/plain" }, body: "host not allowed" }));
    const res = await createRelayFetch("http://localhost:8787", transport)("https://evil.example/");
    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("host not allowed");
  });

  it("treats a malformed 200 from the relay as a bad gateway", async () => {
    const transport = fakeFetch(() => ({ status: 200, body: { unexpected: true } }));
    const res = await createRelayFetch("http://localhost:8787", transport)("https://x/");
    expect(res.status).toBe(502);
  });

  it("responseFromRelay rejects invalid JSON bodies on json()", async () => {
    await expect(responseFromRelay({ status: 200, headers: {}, body: "nope" }).json()).rejects.toThrow();
  });
});

describe("http helpers", () => {
  it("parses Link headers", () => {
    expect(
      parseLinkHeader(
        '<https://a/x?page=2&per_page=100>; rel="next", <https://a/x?page=1>; rel="first",<https://a/x?page=9>; rel=last',
      ),
    ).toEqual({ next: "https://a/x?page=2&per_page=100", first: "https://a/x?page=1", last: "https://a/x?page=9" });
    expect(parseLinkHeader('<https://a/1>; rel="prev next"')).toEqual({ prev: "https://a/1", next: "https://a/1" });
    expect(parseLinkHeader(null)).toEqual({});
  });

  it("builds queries with repeated keys", () => {
    expect(withQuery("https://a/b?x=1", { "include[]": ["submission", "overrides"], per_page: 100, skip: null })).toBe(
      "https://a/b?x=1&include%5B%5D=submission&include%5B%5D=overrides&per_page=100",
    );
  });

  it("follows Link pages, resolves relative links and stops on loops", async () => {
    const fetch = fakeFetch({
      "https://a/items": { body: [1, 2], headers: { Link: '</items?page=2>; rel="next"' } },
      "https://a/items?page=2": { body: [3], headers: { Link: '<https://a/items>; rel="next"' } },
    });
    expect(await getLinkPaged(fetch, "https://a/items", undefined)).toEqual([1, 2, 3]);
    expect(fetch.calls).toHaveLength(2);
  });

  it("follows cursors and accepts a bare array", async () => {
    const fetch = fakeFetch((url) => {
      const cursor = new URL(url).searchParams.get("cursor");
      if (!cursor) return { body: { results: ["a"], next_cursor: "c1" } };
      if (cursor === "c1") return { body: { results: ["b"], next_cursor: null } };
      return undefined;
    });
    expect(await getCursorPaged(fetch, (c) => withQuery("https://t/x", { cursor: c }), undefined)).toEqual(["a", "b"]);
    const bare = fakeFetch(() => ({ body: ["x", "y"] }));
    expect(await getCursorPaged(bare, () => "https://t/x", undefined)).toEqual(["x", "y"]);
  });

  it("throws HttpError with a readable message", async () => {
    const fetch = fakeFetch(() => ({ status: 401, body: { errors: [{ message: "Invalid access token." }] } }));
    const error = await requestJson(fetch, "https://a/x", undefined, "Canvas").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(401);
    expect((error as HttpError).isAuthError).toBe(true);
    expect((error as HttpError).message).toBe("Canvas failed with HTTP 401: Invalid access token.");
  });

  it("strips Canvas's while(1); prefix", async () => {
    const fetch = fakeFetch(() => ({ body: 'while(1);{"ok":true}' }));
    expect((await requestJson(fetch, "https://a/x")).data).toEqual({ ok: true });
  });

  it("limits concurrency and keeps order", async () => {
    let active = 0;
    let peak = 0;
    const out = await mapWithConcurrency([5, 1, 3, 2], 2, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, n));
      active--;
      return n * 10;
    });
    expect(out).toEqual([50, 10, 30, 20]);
    expect(peak).toBe(2);
  });
});
