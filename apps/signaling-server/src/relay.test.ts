import { afterEach, describe, expect, it } from "vitest";
import { request as httpRequest } from "node:http";
import type { IncomingHttpHeaders } from "node:http";
import type { RelayResponse } from "@ship/shared-types";
import { createHostAllowlist, createRelay, isAllowedOrigin, isLoopbackAddress, parseHostList, RelayError } from "./relay.js";
import type { RelayFetch } from "./relay.js";
import { createSignalingServer } from "./server.js";
import type { SignalingServer } from "./server.js";

interface Call {
  url: string;
  init: RequestInit;
}

/** A fake upstream: answers each call with the next response and records what it was sent. */
function fakeFetch(...responses: (() => Response)[]) {
  const calls: Call[] = [];
  const fetch: RelayFetch = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error("unexpected fetch");
    return next();
  };
  return { fetch, calls };
}

const json = (body: unknown, headers: Record<string, string> = {}, status = 200) => () =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const redirect = (status: number, location: string) => () => new Response(null, { status, headers: { location } });

const COURSES = "https://school.instructure.com/api/v1/courses?enrollment_state=active";

describe("origin and peer checks", () => {
  it.each(["http://localhost", "http://localhost:5173", "http://127.0.0.1:5173", "http://127.0.0.1:65535"])("allows %s", (origin) => {
    expect(isAllowedOrigin(origin)).toBe(true);
  });

  it.each([
    undefined,
    "null",
    "https://localhost:5173",
    "http://localhost:5173/",
    "http://localhost.evil.com",
    "http://127.0.0.1.nip.io",
    "http://evil.com",
    "http://localhost:0",
    "http://localhost:99999",
    "http://user@localhost:5173",
  ])("refuses %s", (origin) => {
    expect(isAllowedOrigin(origin)).toBe(false);
  });

  it("only treats loopback peers as local", () => {
    for (const address of ["127.0.0.1", "127.8.9.10", "::1", "::ffff:127.0.0.1"]) expect(isLoopbackAddress(address)).toBe(true);
    for (const address of [undefined, "10.0.0.2", "::ffff:192.168.1.4", "fe80::1", "128.0.0.1"]) expect(isLoopbackAddress(address)).toBe(false);
  });
});

describe("host allowlist", () => {
  const allowed = createHostAllowlist(["Canvas.MySchool.edu", "https://lms.uni.ac.uk/"]);

  it.each([
    COURSES,
    "https://canvas.myschool.edu/api/v1/users/self/colors",
    "https://lms.uni.ac.uk/api/v1/courses",
    "https://api.todoist.com/rest/v2/tasks",
    "https://lodestarplanner.com/api/extension/auth/session",
    "https://www.lodestarplanner.com/api/canvas/sync",
    "https://SCHOOL.Instructure.com:443/api",
  ])("allows %s", (url) => {
    expect(allowed(new URL(url))).toBe(true);
  });

  it.each([
    "http://school.instructure.com/api/v1/courses",
    "https://instructure.com/",
    "https://evilinstructure.com/",
    "https://school.instructure.com.evil.com/",
    "https://school.instructure.com@evil.com/",
    "https://user:pw@school.instructure.com/",
    "https://school.instructure.com:8443/",
    "https://school.instructure.com./",
    "https://evil.com#.instructure.com",
    "https://evil.com\\.instructure.com",
    "https://evil.com/?x=.instructure.com",
    "https://127.0.0.1/",
    "https://0x7f000001/",
    "https://[::1]/",
    "https://todoist.com/",
    "https://api.todoist.com.evil.com/",
    "https://myschool.edu/",
    "ftp://school.instructure.com/",
  ])("refuses %s", (url) => {
    expect(allowed(new URL(url))).toBe(false);
  });

  it("parses CANVAS_HOSTS and skips junk", () => {
    expect(parseHostList(" canvas.myschool.edu, https://lms.uni.ac.uk/ ,not a host!, 10.0.0.1,,canvas.myschool.edu")).toEqual([
      "canvas.myschool.edu",
      "lms.uni.ac.uk",
    ]);
    expect(parseHostList(undefined)).toEqual([]);
  });
});

describe("forward", () => {
  it("passes only the needed request headers and keeps only content-type and link", async () => {
    const link = '<https://school.instructure.com/api/v1/courses?page=2>; rel="next"';
    const upstream = fakeFetch(json([{ id: 1 }], { link, "set-cookie": "session=1", "x-canvas-meta": "x" }));
    const relay = createRelay({ fetch: upstream.fetch });
    const response = await relay.forward({
      url: COURSES,
      headers: {
        Authorization: "Bearer canvas-token",
        Accept: "application/json",
        Cookie: "session=1",
        Host: "evil.com",
        Connection: "keep-alive",
        "X-Forwarded-For": "1.2.3.4",
      },
    });
    expect(response).toEqual({ status: 200, headers: { "content-type": "application/json", link }, body: '[{"id":1}]' });
    expect(upstream.calls).toHaveLength(1);
    expect(upstream.calls[0]!.url).toBe(COURSES);
    expect(upstream.calls[0]!.init).toMatchObject({ method: "GET", redirect: "manual", headers: { authorization: "Bearer canvas-token", accept: "application/json" } });
    expect(Object.keys(upstream.calls[0]!.init.headers as object).sort()).toEqual(["accept", "authorization"]);
  });

  it("passes upstream errors through as the inner status", async () => {
    const relay = createRelay({ fetch: fakeFetch(json({ errors: [{ message: "Invalid access token." }] }, {}, 401)).fetch });
    expect(await relay.forward({ url: COURSES })).toMatchObject({ status: 401 });
  });

  it("refuses hosts off the allowlist without calling out", async () => {
    const upstream = fakeFetch();
    const relay = createRelay({ fetch: upstream.fetch });
    await expect(relay.forward({ url: "https://evil.com/steal" })).rejects.toMatchObject({ status: 403 });
    await expect(relay.forward({ url: "not a url" })).rejects.toMatchObject({ status: 400 });
    await expect(relay.forward({ url: COURSES, method: "CONNECT" })).rejects.toMatchObject({ status: 400 });
    await expect(relay.forward({ url: COURSES, body: "x" })).rejects.toMatchObject({ status: 400 });
    expect(upstream.calls).toHaveLength(0);
  });

  it("follows allowed redirects, dropping the token when the host changes", async () => {
    const upstream = fakeFetch(
      redirect(302, "/api/v1/courses?page=1"),
      redirect(301, "https://canvas.myschool.edu/api/v1/courses?page=1"),
      json([]),
    );
    const relay = createRelay({ fetch: upstream.fetch, canvasHosts: ["canvas.myschool.edu"] });
    expect(await relay.forward({ url: COURSES, headers: { authorization: "Bearer t" } })).toMatchObject({ status: 200, body: "[]" });
    expect(upstream.calls.map((call) => [call.url, (call.init.headers as Record<string, string>).authorization])).toEqual([
      [COURSES, "Bearer t"],
      ["https://school.instructure.com/api/v1/courses?page=1", "Bearer t"],
      ["https://canvas.myschool.edu/api/v1/courses?page=1", undefined],
    ]);
  });

  it("re-checks every redirect hop against the allowlist", async () => {
    for (const location of ["https://evil.com/", "http://school.instructure.com/api", "https://attacker@school.instructure.com.evil.com/"]) {
      const upstream = fakeFetch(redirect(307, location), json("should not get here"));
      const relay = createRelay({ fetch: upstream.fetch });
      await expect(relay.forward({ url: COURSES })).rejects.toMatchObject({ status: 403 });
      expect(upstream.calls).toHaveLength(1);
    }
  });

  it("gives up after too many redirects", async () => {
    const loop = Array.from({ length: 4 }, () => redirect(302, COURSES));
    const relay = createRelay({ fetch: fakeFetch(...loop).fetch, maxRedirects: 3 });
    await expect(relay.forward({ url: COURSES })).rejects.toMatchObject({ status: 502, message: "Too many redirects." });
  });

  it("turns POST into GET after 303 but keeps it after 307", async () => {
    const tasks = "https://api.todoist.com/rest/v2/tasks";
    const post = { url: tasks, method: "post", headers: { "content-type": "application/json" }, body: '{"content":"Read ch. 4"}' };

    const after303 = fakeFetch(redirect(303, tasks), json({ ok: true }));
    await createRelay({ fetch: after303.fetch }).forward(post);
    expect(after303.calls[1]!.init).toMatchObject({ method: "GET", body: undefined });
    expect(after303.calls[1]!.init.headers).toEqual({});

    const after307 = fakeFetch(redirect(307, tasks), json({ ok: true }));
    await createRelay({ fetch: after307.fetch }).forward(post);
    expect(after307.calls[1]!.init).toMatchObject({ method: "POST", body: post.body, headers: { "content-type": "application/json" } });
  });

  it("maps network failures, timeouts and huge bodies to relay errors", async () => {
    const failing: RelayFetch = async () => {
      throw new TypeError("fetch failed");
    };
    await expect(createRelay({ fetch: failing }).forward({ url: COURSES })).rejects.toMatchObject({ status: 502 });

    const hanging: RelayFetch = (_url, init) =>
      new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason)));
    await expect(createRelay({ fetch: hanging, timeoutMs: 20 }).forward({ url: COURSES })).rejects.toMatchObject({ status: 504 });

    const huge = fakeFetch(() => new Response("x".repeat(5000)));
    await expect(createRelay({ fetch: huge.fetch, maxResponseBytes: 1000 }).forward({ url: COURSES })).rejects.toBeInstanceOf(RelayError);
  });
});

describe("POST /relay over HTTP", () => {
  let server: SignalingServer | null = null;
  afterEach(async () => {
    await server?.close();
    server = null;
  });

  function call(options: { method: string; path?: string; headers?: Record<string, string>; body?: string }) {
    return new Promise<{ status: number; headers: IncomingHttpHeaders; body: string }>((resolve, reject) => {
      const req = httpRequest(
        { host: "127.0.0.1", port: server!.port, method: options.method, path: options.path ?? "/relay", headers: options.headers },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => (body += chunk));
          res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
        },
      );
      req.on("error", reject);
      req.end(options.body);
    });
  }

  const origin = "http://localhost:5173";
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    call({ method: "POST", headers: { origin, "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

  it("answers the CORS preflight for localhost pages only", async () => {
    server = await createSignalingServer({ port: 0, relay: { fetch: fakeFetch().fetch } });
    const preflight = { "access-control-request-method": "POST", "access-control-request-headers": "content-type" };
    const ok = await call({ method: "OPTIONS", headers: { origin, ...preflight } });
    expect(ok.status).toBe(204);
    expect(ok.headers).toMatchObject({
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      vary: "Origin",
    });

    const evil = await call({ method: "OPTIONS", headers: { origin: "https://evil.com", ...preflight } });
    expect(evil.status).toBe(403);
    expect(evil.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("relays a request and answers with a RelayResponse", async () => {
    const upstream = fakeFetch(json([{ id: 7, name: "Biology" }]));
    server = await createSignalingServer({ port: 0, relay: { fetch: upstream.fetch } });
    const res = await post({ url: COURSES, headers: { authorization: "Bearer t" } });
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(origin);
    expect(JSON.parse(res.body) as RelayResponse).toEqual({
      status: 200,
      headers: { "content-type": "application/json" },
      body: '[{"id":7,"name":"Biology"}]',
    });
  });

  it("refuses requests without a localhost Origin, non-JSON bodies and disallowed hosts", async () => {
    const upstream = fakeFetch();
    server = await createSignalingServer({ port: 0, relay: { fetch: upstream.fetch } });

    const noOrigin = await call({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: COURSES }) });
    expect(noOrigin.status).toBe(403);

    const otherSite = await post({ url: COURSES }, { origin: "https://evil.com" });
    expect(otherSite.status).toBe(403);

    const plain = await post({ url: COURSES }, { "content-type": "text/plain" });
    expect(plain.status).toBe(415);

    const offList = await post({ url: "https://evil.com/" });
    expect(offList.status).toBe(403);
    expect(JSON.parse(offList.body)).toMatchObject({ status: 403, body: expect.stringContaining("evil.com") });

    const notJson = await call({ method: "POST", headers: { origin, "content-type": "application/json" }, body: "{" });
    expect(notJson.status).toBe(400);

    const get = await call({ method: "GET", headers: { origin } });
    expect(get.status).toBe(405);

    expect(upstream.calls).toHaveLength(0);
  });

  it("refuses oversized request bodies", async () => {
    server = await createSignalingServer({ port: 0, relay: { fetch: fakeFetch().fetch, maxRequestBytes: 100 } });
    const res = await post({ url: COURSES, body: "x".repeat(200), method: "POST" });
    expect(res.status).toBe(413);
  });
});
