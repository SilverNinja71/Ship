// The background logic end to end, over an in-memory store with fake tabs
// and a fake network: what the bridge, the guard and the gate would see.

import { describe, expect, it } from "vitest";
import { BRIDGE_PROTOCOL_VERSION, LOOKOUT_SOURCE, STEER_BACK_BONUS, WEB_SOURCE, type LookoutToWeb, type LookoutVoyageState } from "@ship/shared-types";
import { HEARTBEAT_STALE_MS } from "../core/constants.js";
import type { LookoutFetch } from "../core/net.js";
import { fakeResponse, memoryStore } from "../dev/fakeChrome.js";
import type { GuardDecision, PopupState, ToContent } from "../shared/messages.js";
import { createLookout } from "./lookout.js";

const MIN = 60_000;
const T0 = new Date(2026, 9, 28, 14, 0, 0).getTime();
const WATCH = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

const offline: LookoutFetch = async () => {
  throw new Error("no network in tests");
};

function harness(options: { settings?: Record<string, unknown>; fetch?: LookoutFetch; shipTabOpen?: boolean; store?: ReturnType<typeof memoryStore> } = {}) {
  let now = T0;
  let n = 0;
  const store = options.store ?? memoryStore({ settings: { blockedSites: ["reddit.com"], ...options.settings } });
  const broadcasts: { message: ToContent; to: string }[] = [];
  const opened: { tabId: number | null; url: string }[] = [];
  const focused: string[] = [];
  const badges: string[] = [];
  const lookout = createLookout({
    store,
    now: () => now,
    fetch: options.fetch ?? offline,
    randomId: () => `r${n++}`,
    focusShipTab: async (url) => {
      if (options.shipTabOpen) focused.push(url);
      return options.shipTabOpen ?? false;
    },
    openShip: async (tabId, url) => {
      opened.push({ tabId, url });
    },
    broadcast: async (message, to) => {
      broadcasts.push({ message, to });
    },
    setBadge: (text) => {
      badges.push(text);
    },
  });
  const send = (message: Record<string, unknown>) => lookout.handle(message, { tabId: 7 });
  const web = (msg: Record<string, unknown>) => send({ t: "web", msg: { source: WEB_SOURCE, ...msg } }) as Promise<LookoutToWeb | null>;
  const check = (url: string) => send({ t: "check", url }) as Promise<GuardDecision>;
  const judge = (title: string, description = "", url = WATCH) =>
    send({ t: "judge", url, inspection: { videoId: "ignored", title, channel: "Cell Lab", description, transcriptExcerpt: null, thumbnailUrl: null } }) as Promise<GuardDecision>;
  const popup = () => send({ t: "popup-state" }) as Promise<PopupState>;
  const voyage = (over: Partial<LookoutVoyageState> = {}) =>
    web({
      t: "voyage",
      voyage: {
        phase: "sailing",
        guarding: true,
        endsAt: now + 25 * MIN,
        objective: "Finish the discussion",
        assignment: { title: "Enzyme kinetics lab report", course: "BIO 201" },
        updatedAt: now,
        ...over,
      },
    });
  return {
    lookout,
    store,
    broadcasts,
    opened,
    focused,
    badges,
    send,
    web,
    check,
    judge,
    popup,
    voyage,
    advance: (ms: number) => {
      now += ms;
    },
    setNow: (t: number) => {
      now = t;
    },
  };
}

function geminiFetch(answer: unknown, calls: { url: string; body?: string }[]): LookoutFetch {
  return async (url, init) => {
    calls.push({ url, body: init?.body });
    if (url.startsWith("https://i.ytimg.com/")) return fakeResponse(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), 200, "image/jpeg");
    if (url.includes(":generateContent")) return fakeResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] });
    return fakeResponse({}, 404);
  };
}

describe("bridge messages", () => {
  it("answers hello with the protocol version and today's stats", async () => {
    const h = harness();
    expect(await h.web({ t: "hello", version: 1 })).toEqual({
      source: LOOKOUT_SOURCE,
      t: "hello",
      version: BRIDGE_PROTOCOL_VERSION,
      stats: { blockedToday: 0, steeredBackToday: 0, leisurePassesToday: 0, geminiReady: false },
    });
  });

  it("always answers claim-rewards, even with nothing queued", async () => {
    expect(await harness().web({ t: "claim-rewards" })).toEqual({ source: LOOKOUT_SOURCE, t: "rewards", events: [] });
  });

  it("ignores malformed or foreign messages without touching state", async () => {
    const h = harness();
    expect(await h.send({ t: "web", msg: { source: "evil", t: "voyage", voyage: {} } })).toBeNull();
    expect(await h.web({ t: "voyage", voyage: { phase: "sailing" } })).toBeNull();
    expect(await h.send({ t: "nonsense" })).toBeNull();
    expect(await h.send("hello" as unknown as Record<string, unknown>)).toBeNull();
    expect(h.store.data.voyage).toBeUndefined();
  });

  it("stores the cards Ship sends for the gate", async () => {
    const h = harness();
    await h.web({ t: "cards", cards: [{ id: "a", front: "Q", back: "A" }, { id: "b", front: "", back: "x" }] });
    expect(await h.send({ t: "gate-cards" })).toEqual({ cards: [{ id: "a", front: "Q", back: "A" }] });
  });
});

describe("guarding", () => {
  it("lets everything through until a focus block starts", async () => {
    const h = harness();
    expect(await h.check("https://www.youtube.com/")).toEqual({ action: "allow", verdict: null, passUntil: null });
    await h.voyage({ phase: "shore-leave", guarding: false });
    expect((await h.check("https://www.youtube.com/shorts/aBcDeFgHiJk")).action).toBe("allow");
  });

  it("tells tabs to re-check when guarding starts, not on every heartbeat", async () => {
    const h = harness();
    await h.voyage();
    await h.voyage();
    h.advance(30_000);
    await h.voyage();
    expect(h.broadcasts.filter((b) => b.message.t === "lookout-refresh")).toHaveLength(1);
    expect(h.badges.at(-1)).toBe("25m");
    await h.voyage({ objective: "Write the conclusion" });
    expect(h.broadcasts.filter((b) => b.message.t === "lookout-refresh")).toHaveLength(2);
  });

  it("always blocks YouTube feeds during a focus block, with the voyage for the gate", async () => {
    const h = harness();
    await h.voyage();
    const d = await h.check("https://www.youtube.com/feed/subscriptions");
    expect(d).toMatchObject({
      action: "block",
      site: "youtube.com",
      verdict: { decision: "BLOCKED", source: "always-blocked", confidence: 1 },
      voyage: { assignment: "Enzyme kinetics lab report (BIO 201)", objective: "Finish the discussion", geminiModel: null },
    });
  });

  it("blocks listed sites and their subdomains, and nothing else", async () => {
    const h = harness();
    await h.voyage();
    expect(await h.check("https://old.reddit.com/r/aww")).toMatchObject({ action: "block", site: "reddit.com" });
    expect((await h.check("https://notreddit.com/")).action).toBe("allow");
    expect((await h.check("https://www.youtube.com/results?search_query=enzymes")).action).toBe("allow");
  });

  it("asks the guard to read watch pages", async () => {
    const h = harness();
    await h.voyage();
    expect(await h.check(WATCH)).toEqual({ action: "inspect", site: "youtube.com", videoId: "dQw4w9WgXcQ" });
  });

  it("stops guarding when Ship goes quiet, and tells tabs on the next tick", async () => {
    const h = harness();
    await h.voyage();
    h.advance(HEARTBEAT_STALE_MS + 1000);
    expect((await h.check("https://www.youtube.com/")).action).toBe("allow");
    await h.lookout.tick();
    expect(h.broadcasts.filter((b) => b.message.t === "lookout-refresh")).toHaveLength(2);
    expect(h.badges.at(-1)).toBe("");
    expect((await h.popup()).status).toBe("stale");
  });
});

describe("gate outcomes and rewards", () => {
  it("counts a block once per report and queues a stats-only event", async () => {
    const h = harness();
    await h.voyage();
    await h.send({ t: "blocked", url: "https://www.youtube.com/" });
    const queued = (await h.web({ t: "claim-rewards" })) as Extract<LookoutToWeb, { t: "rewards" }>;
    expect(queued.events).toEqual([{ id: expect.stringMatching(/^lookout-/), kind: "blocked", doubloons: 0, site: "youtube.com", at: T0 }]);
    expect((await h.popup()).stats.blockedToday).toBe(1);
    expect(h.broadcasts.at(-1)).toEqual({ message: { t: "lookout-stats", stats: expect.objectContaining({ blockedToday: 1 }) }, to: "bridges" });
  });

  it("doesn't count blocks when not guarding", async () => {
    const h = harness();
    await h.send({ t: "blocked", url: "https://www.youtube.com/" });
    expect((await h.popup()).stats.blockedToday).toBe(0);
  });

  it("steering back pays once per cooldown and sends this tab to Ship", async () => {
    const h = harness();
    await h.voyage();
    expect(await h.send({ t: "steer-back", url: "https://www.youtube.com/" })).toEqual({ doubloons: STEER_BACK_BONUS, focusedExistingTab: false });
    expect(h.opened).toEqual([{ tabId: 7, url: "http://localhost:5173" }]);
    h.advance(MIN);
    expect(await h.send({ t: "steer-back", url: "https://www.youtube.com/" })).toMatchObject({ doubloons: 0 });
    const { events } = (await h.web({ t: "claim-rewards" })) as Extract<LookoutToWeb, { t: "rewards" }>;
    expect(events.map((e) => [e.kind, e.doubloons])).toEqual([
      ["steer-back", 50],
      ["steer-back", 0],
    ]);
    expect((await h.popup()).stats.steeredBackToday).toBe(2);
  });

  it("focuses an open Ship tab instead of navigating", async () => {
    const h = harness({ shipTabOpen: true, settings: { shipUrl: "http://127.0.0.1:5173" } });
    await h.voyage();
    expect(await h.send({ t: "steer-back", url: "https://www.youtube.com/" })).toEqual({ doubloons: 50, focusedExistingTab: true });
    expect(h.focused).toEqual(["http://127.0.0.1:5173"]);
    expect(h.opened).toEqual([]);
  });

  it("keeps events until Ship acks them, across a worker restart", async () => {
    const h = harness();
    await h.voyage();
    await h.send({ t: "steer-back", url: "https://www.youtube.com/" });
    await h.send({ t: "blocked", url: "https://www.youtube.com/" });
    const restarted = harness({ store: h.store });
    const first = (await restarted.web({ t: "claim-rewards" })) as Extract<LookoutToWeb, { t: "rewards" }>;
    expect(first.events).toHaveLength(2);
    expect(new Set(first.events.map((e) => e.id)).size).toBe(2);
    await restarted.web({ t: "ack-rewards", ids: [first.events[0]!.id] });
    const second = (await restarted.web({ t: "claim-rewards" })) as Extract<LookoutToWeb, { t: "rewards" }>;
    expect(second.events.map((e) => e.id)).toEqual([first.events[1]!.id]);
  });

  it("doesn't lose events when several tabs report at once", async () => {
    const h = harness();
    await h.voyage();
    await Promise.all(Array.from({ length: 10 }, () => h.send({ t: "blocked", url: "https://www.youtube.com/" })));
    const { events } = (await h.web({ t: "claim-rewards" })) as Extract<LookoutToWeb, { t: "rewards" }>;
    expect(events).toHaveLength(10);
    expect(new Set(events.map((e) => e.id)).size).toBe(10);
  });

  it("a passed gate opens the site for five minutes", async () => {
    const h = harness();
    await h.voyage();
    expect(await h.send({ t: "gate-passed", url: "https://www.youtube.com/shorts/aBcDeFgHiJk" })).toEqual({ passUntil: T0 + 5 * MIN });
    expect(await h.check("https://www.youtube.com/")).toEqual({
      action: "allow",
      verdict: { decision: "PROCEED", reason: "Leisure pass for youtube.com.", confidence: 1, source: "leisure-pass" },
      passUntil: T0 + 5 * MIN,
    });
    expect((await h.check("https://old.reddit.com/")).action).toBe("block");
    expect((await h.popup()).stats.leisurePassesToday).toBe(1);
    expect(h.broadcasts.at(-1)?.message.t).toBe("lookout-refresh");
    h.advance(5 * MIN);
    await h.voyage(); // the heartbeat
    expect((await h.check("https://www.youtube.com/")).action).toBe("block");
  });

  it("grants no pass outside a focus block", async () => {
    expect(await harness().send({ t: "gate-passed", url: "https://www.youtube.com/" })).toBeNull();
  });
});

describe("judging watch pages", () => {
  it("uses the keyword check without a key, and labels it", async () => {
    const h = harness();
    await h.voyage();
    expect(await h.judge("Enzyme Kinetics Explained")).toMatchObject({ action: "allow", verdict: { decision: "PROCEED", source: "heuristic" } });
    expect(await h.judge("Prank compilation 2026")).toMatchObject({ action: "block", verdict: { source: "heuristic" } });
    expect((await h.popup()).lastVerdict).toMatchObject({ title: "Prank compilation 2026", verdict: { source: "heuristic" } });
  });

  it("asks Gemini with the thumbnail when there's a key, then remembers the verdict", async () => {
    const calls: { url: string; body?: string }[] = [];
    const h = harness({ settings: { geminiApiKey: "k" }, fetch: geminiFetch({ decision: "BLOCKED", reason: "Gaming.", confidence: 0.9 }, calls) });
    await h.voyage();
    const first = await h.judge("Speedrun fails");
    expect(first).toMatchObject({ action: "block", verdict: { source: "gemini", reason: "Gaming." }, voyage: { geminiModel: "gemini-flash-latest" } });
    const gen = calls.find((c) => c.url.includes(":generateContent"))!;
    expect(JSON.parse(gen.body!).contents[0].parts[1]).toEqual({ inlineData: { mimeType: "image/jpeg", data: "/9j/2Q==" } });
    expect(calls[0]!.url).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg");

    const before = calls.length;
    expect(await h.judge("Speedrun fails")).toMatchObject({ verdict: { source: "cache", reason: "Gaming." } });
    expect(calls).toHaveLength(before);

    // A different assignment is a different question.
    await h.voyage({ assignment: { title: "Game design essay", course: null } });
    await h.judge("Speedrun fails");
    expect(calls.length).toBeGreaterThan(before);
  });

  it("shares one Gemini call between tabs judging the same video", async () => {
    const calls: { url: string }[] = [];
    const h = harness({ settings: { geminiApiKey: "k" }, fetch: geminiFetch({ decision: "PROCEED", reason: "On topic.", confidence: 0.8 }, calls) });
    await h.voyage();
    const [a, b] = await Promise.all([h.judge("Enzymes"), h.judge("Enzymes")]);
    expect(a).toEqual(b);
    expect(calls.filter((c) => c.url.includes(":generateContent"))).toHaveLength(1);
  });

  it("falls back to the keyword check when Gemini fails, and says why in the popup", async () => {
    const h = harness({ settings: { geminiApiKey: "bad" }, fetch: async (url) => (url.includes("generateContent") ? fakeResponse({ error: { message: "API key not valid." } }, 400) : fakeResponse({}, 404)) });
    await h.voyage();
    const d = await h.judge("Enzyme Kinetics Explained");
    expect(d).toMatchObject({ action: "allow", verdict: { source: "heuristic", reason: expect.stringMatching(/^Gemini couldn't answer, so the keyword check decided\./) } });
    expect((await h.popup()).geminiError).toEqual({ at: T0, message: "Gemini answered HTTP 400: API key not valid." });
  });

  it("looks the title up when the page didn't show one", async () => {
    const urls: string[] = [];
    const fetch: LookoutFetch = async (url) => {
      urls.push(url);
      return url.includes("/oembed") ? fakeResponse({ title: "Enzyme Kinetics Explained", author_name: "Cell Lab" }) : fakeResponse({}, 404);
    };
    const h = harness({ fetch });
    await h.voyage();
    expect((await h.judge("")).action).toBe("allow");
    expect(urls[0]).toContain("https://www.youtube.com/oembed?format=json&url=");
  });

  it("re-checks guarding and passes before judging", async () => {
    const h = harness();
    expect(await h.judge("Prank compilation")).toEqual({ action: "allow", verdict: null, passUntil: null });
    await h.voyage();
    await h.send({ t: "gate-passed", url: WATCH });
    expect(await h.judge("Prank compilation")).toMatchObject({ action: "allow", verdict: { source: "leisure-pass" } });
  });
});

describe("housekeeping", () => {
  it("resets today's stats at local midnight and tells Ship", async () => {
    const h = harness();
    h.setNow(new Date(2026, 9, 28, 23, 50).getTime());
    await h.voyage();
    await h.send({ t: "blocked", url: "https://www.youtube.com/" });
    h.setNow(new Date(2026, 9, 29, 0, 1).getTime());
    const pushes = h.broadcasts.length;
    await h.lookout.tick();
    expect(h.broadcasts.slice(pushes)).toContainEqual({ message: { t: "lookout-stats", stats: expect.objectContaining({ blockedToday: 0 }) }, to: "bridges" });
    expect((h.store.data.stats as { day: string }).day).toBe("2026-10-29");
  });

  it("pushes stats when Gemini becomes ready and re-checks tabs when the blocklist changes", async () => {
    const h = harness();
    await h.lookout.onSettingsChanged({ geminiApiKey: "" }, { geminiApiKey: "k" });
    expect(h.broadcasts.at(-1)?.to).toBe("bridges");
    await h.lookout.onSettingsChanged({ blockedSites: [] }, { blockedSites: ["x.com"] });
    expect(h.broadcasts.at(-1)).toEqual({ message: { t: "lookout-refresh" }, to: "guards" });
  });

  it("summarises everything for the popup", async () => {
    const h = harness();
    await h.voyage();
    await h.web({ t: "cards", cards: [{ id: "a", front: "Q", back: "A" }] });
    await h.send({ t: "steer-back", url: "https://www.youtube.com/" });
    expect(await h.popup()).toMatchObject({
      status: "guarding",
      voyage: { phase: "sailing" },
      pendingRewards: 1,
      pendingDoubloons: 50,
      cards: 1,
      shipUrl: "http://localhost:5173",
      geminiModel: "gemini-flash-latest",
    });
  });
});
