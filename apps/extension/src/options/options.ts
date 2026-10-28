// The options page: the Gemini key and model, the Ship URL, and the blocked
// sites. Settings go straight into chrome.storage.local; the background
// notices the change and re-registers the blocked-site scripts.
//
// The key is never logged and never shown in a status message.

import { originPatternsFor, normalizeSiteEntry, YOUTUBE_SITE } from "../core/classify.js";
import { checkGeminiModel, GEMINI_API_BASE } from "../core/gemini.js";
import type { LookoutFetch } from "../core/net.js";
import { customShipOriginPattern, DEFAULT_GEMINI_MODEL, normalizeModel, normalizeSettings, normalizeShipUrl, type LookoutSettings } from "../core/settings.js";

async function load(): Promise<LookoutSettings> {
  const { settings } = await chrome.storage.local.get("settings");
  return normalizeSettings(settings);
}

async function save(patch: Partial<LookoutSettings>): Promise<LookoutSettings> {
  const next = normalizeSettings({ ...(await load()), ...patch });
  await chrome.storage.local.set({ settings: next });
  return next;
}

function byId<T extends HTMLElement>(doc: Document, id: string): T {
  const node = doc.getElementById(id);
  if (!node) throw new Error(`options.html is missing #${id}`);
  return node as T;
}

function say(node: HTMLElement, text: string, tone: "good" | "bad" | "" = "") {
  node.textContent = text;
  node.className = `status ${tone}`;
}

export async function startOptions(doc: Document = document, fetchImpl: LookoutFetch = (url, init) => fetch(url, init)): Promise<void> {
  const keyInput = byId<HTMLInputElement>(doc, "gemini-key");
  const showKey = byId<HTMLButtonElement>(doc, "show-key");
  const modelInput = byId<HTMLInputElement>(doc, "gemini-model");
  const geminiStatus = byId<HTMLElement>(doc, "gemini-status");
  const shipInput = byId<HTMLInputElement>(doc, "ship-url");
  const shipStatus = byId<HTMLElement>(doc, "ship-status");
  const siteInput = byId<HTMLInputElement>(doc, "site-input");
  const siteList = byId<HTMLUListElement>(doc, "site-list");
  const siteStatus = byId<HTMLElement>(doc, "site-status");

  let settings = await load();
  keyInput.value = settings.geminiApiKey;
  modelInput.value = settings.geminiModel;
  modelInput.placeholder = DEFAULT_GEMINI_MODEL;
  shipInput.value = settings.shipUrl;

  showKey.addEventListener("click", () => {
    const hidden = keyInput.type === "password";
    keyInput.type = hidden ? "text" : "password";
    showKey.textContent = hidden ? "Hide" : "Show";
    showKey.setAttribute("aria-pressed", String(hidden));
  });

  byId<HTMLFormElement>(doc, "gemini-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    settings = await save({ geminiApiKey: keyInput.value.trim(), geminiModel: normalizeModel(modelInput.value || DEFAULT_GEMINI_MODEL) });
    modelInput.value = settings.geminiModel;
    say(
      geminiStatus,
      settings.geminiApiKey ? `Saved. When the video groups aren't sure, ${settings.geminiModel} decides.` : "Saved. With no key, the Lookout's video groups judge every watch page.",
      "good",
    );
  });

  byId<HTMLButtonElement>(doc, "check-key").addEventListener("click", async () => {
    const key = keyInput.value.trim();
    if (!key) return say(geminiStatus, "Paste a key first.", "bad");
    const model = normalizeModel(modelInput.value || DEFAULT_GEMINI_MODEL);
    say(geminiStatus, `Asking ${GEMINI_API_BASE.replace("https://", "")} about ${model}…`);
    const result = await checkGeminiModel(fetchImpl, key, model);
    if (result.ok) say(geminiStatus, `The key works and can use ${result.displayName}. Remember to save.`, "good");
    else say(geminiStatus, result.message, "bad");
  });

  byId<HTMLFormElement>(doc, "ship-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const url = normalizeShipUrl(shipInput.value);
    if (!url) return say(shipStatus, "That isn't a web address. Try http://localhost:5173.", "bad");
    const custom = customShipOriginPattern(url);
    // permissions.request must run inside the click, before any await.
    const granted = custom ? chrome.permissions.request({ origins: [custom] }) : Promise.resolve(true);
    void granted.then(async (ok) => {
      settings = await save({ shipUrl: url });
      shipInput.value = settings.shipUrl;
      say(
        shipStatus,
        ok
          ? "Saved. Steering back will sail here."
          : "Saved, but without access to that site the Lookout can't talk to Ship there. Steering back still opens it.",
        ok ? "good" : "bad",
      );
    });
  });

  function renderSites() {
    siteList.replaceChildren();
    if (!settings.blockedSites.length) {
      const empty = doc.createElement("li");
      empty.className = "empty";
      empty.textContent = "No extra sites yet.";
      siteList.append(empty);
    }
    for (const site of settings.blockedSites) {
      const li = doc.createElement("li");
      const name = doc.createElement("span");
      name.textContent = site;
      const remove = doc.createElement("button");
      remove.type = "button";
      remove.className = "btn ghost small";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove ${site}`);
      remove.addEventListener("click", async () => {
        settings = await save({ blockedSites: settings.blockedSites.filter((s) => s !== site) });
        if (site !== YOUTUBE_SITE) await chrome.permissions.remove({ origins: originPatternsFor(site) }).catch(() => false);
        renderSites();
        say(siteStatus, `${site} is no longer blocked.`, "good");
      });
      li.append(name, remove);
      siteList.append(li);
    }
  }
  renderSites();

  byId<HTMLFormElement>(doc, "site-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const site = normalizeSiteEntry(siteInput.value);
    if (!site) return say(siteStatus, "That doesn't look like a website. Try something like reddit.com.", "bad");
    if (settings.blockedSites.includes(site)) return say(siteStatus, `${site} is already on the list.`);
    // YouTube is already covered by the manifest; everything else needs the user's OK, asked inside the click.
    const granted = site === YOUTUBE_SITE ? Promise.resolve(true) : chrome.permissions.request({ origins: originPatternsFor(site) });
    void granted.then(async (ok) => {
      if (!ok) return say(siteStatus, `Chrome didn't grant access to ${site}, so the Lookout can't block it.`, "bad");
      settings = await save({ blockedSites: [...settings.blockedSites, site] });
      siteInput.value = "";
      renderSites();
      say(siteStatus, `${site} (and its subdomains) will be blocked during focus blocks.`, "good");
    });
  });
}
