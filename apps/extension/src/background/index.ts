// The service worker: wires createLookout to the real Chrome APIs. Listeners
// are registered at the top level so Chrome can wake the worker for them.

import { YOUTUBE_MATCHES, YOUTUBE_SITE, originPatternsFor } from "../core/classify.js";
import { TICK_ALARM } from "../core/constants.js";
import type { LookoutFetch } from "../core/net.js";
import { customShipOriginPattern, isShipTabUrl, normalizeSettings, shipTabPatterns } from "../core/settings.js";
import type { ToContent } from "../shared/messages.js";
import { createLookout } from "./lookout.js";

const BRIDGE_MATCHES = ["http://localhost/*", "http://127.0.0.1/*"];
const SEAFOAM = "#3FB59A";

async function currentSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return normalizeSettings(settings);
}

async function focusShipTab(shipUrl: string): Promise<boolean> {
  const tabs = await chrome.tabs.query({ url: shipTabPatterns(shipUrl) });
  const tab = tabs.find((t) => t.id !== undefined && t.url && isShipTabUrl(t.url, shipUrl));
  if (!tab?.id) return false;
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  return true;
}

async function openShip(tabId: number | null, shipUrl: string): Promise<void> {
  if (tabId !== null) await chrome.tabs.update(tabId, { url: shipUrl });
  else await chrome.tabs.create({ url: shipUrl });
}

async function broadcast(message: ToContent, to: "guards" | "bridges"): Promise<void> {
  const settings = await currentSettings();
  const custom = customShipOriginPattern(settings.shipUrl);
  const patterns =
    to === "guards" ? [...YOUTUBE_MATCHES, ...settings.blockedSites.flatMap(originPatternsFor)] : [...BRIDGE_MATCHES, ...(custom ? [custom] : [])];
  const tabs = await chrome.tabs.query({ url: patterns });
  // Tabs without our script reject; that's fine.
  await Promise.all(tabs.map((t) => (t.id === undefined ? undefined : chrome.tabs.sendMessage(t.id, message).catch(() => undefined))));
}

async function setBadge(text: string): Promise<void> {
  await chrome.action.setBadgeText({ text });
  if (text) await chrome.action.setBadgeBackgroundColor({ color: SEAFOAM });
}

const lookout = createLookout({
  store: { get: (keys) => chrome.storage.local.get(keys), set: (items) => chrome.storage.local.set(items) },
  now: () => Date.now(),
  fetch: ((url, init) => fetch(url, init)) as LookoutFetch,
  randomId: () => crypto.randomUUID().slice(0, 13),
  focusShipTab,
  openShip,
  broadcast,
  setBadge,
});

/**
 * Blocked sites (and a Ship URL outside localhost) get content scripts only
 * once the user grants that host from the options page, so they're
 * registered here rather than in the manifest.
 */
async function syncDynamicScripts(): Promise<void> {
  const settings = await currentSettings();
  const wanted: chrome.scripting.RegisteredContentScript[] = [];
  for (const site of settings.blockedSites) {
    // The manifest already guards YouTube.
    if (site === YOUTUBE_SITE) continue;
    const matches = originPatternsFor(site);
    if (await chrome.permissions.contains({ origins: matches })) {
      wanted.push({ id: `guard-${site.replace(/[^a-z0-9-]/g, "_")}`, matches, js: ["content/guard.js"], runAt: "document_start" });
    }
  }
  const custom = customShipOriginPattern(settings.shipUrl);
  if (custom && (await chrome.permissions.contains({ origins: [custom] }))) {
    wanted.push({ id: "bridge-custom", matches: [custom], js: ["content/bridge.js"], runAt: "document_start" });
  }
  const existing = await chrome.scripting.getRegisteredContentScripts();
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: existing.map((s) => s.id) });
  if (wanted.length) await chrome.scripting.registerContentScripts(wanted);
}

// Adding a site fires permissions.onAdded and a settings change together; overlapping syncs would register the same ids twice.
let syncing: Promise<void> = Promise.resolve();
function queueSync(): Promise<void> {
  syncing = syncing.then(syncDynamicScripts).catch((e) => warn("sync scripts", e));
  return syncing;
}

function warn(where: string, e: unknown) {
  // Messages only: nothing here may print the API key.
  console.warn(`[lookout] ${where}:`, e instanceof Error ? e.message : String(e));
}

async function ensureAlarm(): Promise<void> {
  if (!(await chrome.alarms.get(TICK_ALARM))) await chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
}

async function setup(): Promise<void> {
  await ensureAlarm();
  // Keep the stored Gemini key away from content scripts where Chrome supports it.
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }).catch(() => undefined);
  await queueSync();
  await lookout.tick();
}

// Chrome may drop alarms on restart; any wake-up puts the tick back.
void ensureAlarm().catch((e) => warn("alarm", e));
chrome.runtime.onInstalled.addListener(() => void setup().catch((e) => warn("install", e)));
chrome.runtime.onStartup.addListener(() => void setup().catch((e) => warn("startup", e)));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  lookout
    .handle(message, { tabId: sender.tab?.id ?? null })
    .then((reply) => sendResponse(reply ?? null))
    .catch((e) => {
      warn("message", e);
      sendResponse(null);
    });
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK_ALARM) void lookout.tick().catch((e) => warn("tick", e));
});

chrome.storage.onChanged.addListener((changes, area) => {
  const change = changes.settings;
  if (area !== "local" || !change) return;
  void lookout.onSettingsChanged(change.oldValue, change.newValue).catch((e) => warn("settings", e));
  void queueSync();
});

chrome.permissions.onAdded.addListener(() => void queueSync());
chrome.permissions.onRemoved.addListener(() => void queueSync());
