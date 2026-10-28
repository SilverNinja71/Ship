// A pretend `chrome` for the dev pages. Claude's browser pane can't load
// extensions, so these pages run the real gate, popup and options code
// against this fake, which routes runtime messages to the real background
// logic (createLookout) over an in-memory store. Nothing leaves the page.

import { createLookout, type KeyValueStore, type Lookout, type LookoutDeps } from "../background/lookout.js";
import type { LookoutFetch } from "../core/net.js";

export interface MemoryStore extends KeyValueStore {
  data: Record<string, unknown>;
}

const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

export function memoryStore(initial: Record<string, unknown> = {}): MemoryStore {
  const data: Record<string, unknown> = clone(initial);
  return {
    data,
    async get(keys) {
      return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, clone(data[k])]));
    },
    async set(items) {
      Object.assign(data, clone(items));
    },
  };
}

type Json = Record<string, unknown>;

/** A fetch-shaped answer from a JSON body or bytes. */
export function fakeResponse(body: Json | Uint8Array, status = 200, contentType = "application/json"): Awaited<ReturnType<LookoutFetch>> {
  const bytes = body instanceof Uint8Array ? body : new TextEncoder().encode(JSON.stringify(body));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? contentType : null) },
    json: async () => JSON.parse(new TextDecoder().decode(bytes)),
    text: async () => new TextDecoder().decode(bytes),
    arrayBuffer: async () => bytes.slice().buffer,
  };
}

export interface FakeChromeOptions {
  store: MemoryStore;
  fetch: LookoutFetch;
  /** Whether "steer back" finds an open Ship tab to focus. */
  shipTabOpen?: () => boolean;
  /** Tab actions the real extension would take, shown on the dev page instead. */
  onAction?: (text: string) => void;
}

export function installFakeChrome(options: FakeChromeOptions): Lookout {
  const say = options.onAction ?? (() => undefined);
  const deps: LookoutDeps = {
    store: options.store,
    now: () => Date.now(),
    fetch: options.fetch,
    randomId: () => Math.random().toString(36).slice(2, 10),
    async focusShipTab(shipUrl) {
      const open = options.shipTabOpen?.() ?? true;
      if (open) say(`Would focus the open Ship tab (${shipUrl}).`);
      return open;
    },
    async openShip(tabId, shipUrl) {
      say(tabId === null ? `Would open ${shipUrl} in a new tab.` : `Would send this tab to ${shipUrl}.`);
    },
    async broadcast(message, to) {
      say(`Would tell the ${to === "guards" ? "guarded tabs" : "Ship tabs"}: ${message.t}.`);
    },
    setBadge(text) {
      if (text) say(`Toolbar badge: ${text}`);
    },
  };
  const lookout = createLookout(deps);
  const changeListeners: Array<(changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, area: string) => void> = [];

  const fake = {
    runtime: {
      id: "lookout-dev",
      // Round-trips through JSON like real messaging does.
      sendMessage: async (message: unknown) => clone((await lookout.handle(clone(message), { tabId: 1 })) ?? null),
      onMessage: { addListener() {}, removeListener() {} },
      openOptionsPage: async () => say("Would open the Lookout's options page."),
    },
    storage: {
      local: {
        get: async (keys: string | string[]) => options.store.get(Array.isArray(keys) ? keys : [keys]),
        set: async (items: Record<string, unknown>) => {
          const changes = Object.fromEntries(Object.keys(items).map((k) => [k, { oldValue: clone(options.store.data[k]), newValue: clone(items[k]) }]));
          await options.store.set(items);
          for (const fn of changeListeners) fn(changes, "local");
          if (changes.settings) await lookout.onSettingsChanged(changes.settings.oldValue, changes.settings.newValue);
        },
      },
      onChanged: { addListener: (fn: (typeof changeListeners)[number]) => changeListeners.push(fn) },
    },
    permissions: {
      request: async ({ origins }: { origins: string[] }) => {
        say(`Chrome would ask to allow: ${origins.join(", ")}`);
        return true;
      },
      contains: async () => true,
      remove: async () => true,
    },
    tabs: { create: async ({ url }: { url: string }) => say(`Would open ${url} in a new tab.`) },
  };
  (globalThis as unknown as { chrome: unknown }).chrome = fake;
  return lookout;
}
