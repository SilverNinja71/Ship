// The bridge content script, on the Ship web app. The page and the bridge
// talk with window.postMessage (WebToLookout / LookoutToWeb); the bridge
// passes page messages to the background and posts the replies back.
//
// It runs at document_start so the app's first "hello" isn't missed, and it
// also says hello itself once the page is up, in case it loaded late.

import { BRIDGE_PROTOCOL_VERSION, LOOKOUT_SOURCE, SHIP_APP_META, WEB_SOURCE, type LookoutToWeb, type WebToLookout } from "@ship/shared-types";
import { parseWebMessage } from "../core/bridgeProtocol.js";
import type { ToContent } from "../shared/messages.js";
import { sendToBackground } from "../shared/runtime.js";

declare global {
  var __shipLookoutBridge: boolean | undefined;
}

const META_WAIT_MS = 10_000;

function isShipPage(): boolean {
  return document.querySelector(`meta[name="${SHIP_APP_META}"][content="1"]`) !== null;
}

function post(message: LookoutToWeb) {
  window.postMessage(message, location.origin);
}

async function forward(message: WebToLookout) {
  const reply = await sendToBackground({ t: "web", msg: message });
  if (reply) post(reply);
}

function startBridge() {
  window.addEventListener("message", (event: MessageEvent) => {
    // Only this window's own scripts: not iframes, not other windows.
    if (event.source !== window) return;
    const message = parseWebMessage(event.data);
    if (message && isShipPage()) void forward(message);
  });

  chrome.runtime.onMessage.addListener((message: ToContent) => {
    if (message?.t === "lookout-stats" && isShipPage()) post({ source: LOOKOUT_SOURCE, t: "stats", stats: message.stats });
    return false;
  });

  const announce = () => void forward({ source: WEB_SOURCE, t: "hello", version: BRIDGE_PROTOCOL_VERSION });
  const whenShip = () => {
    if (isShipPage()) return announce();
    // An app that adds the meta tag from script: watch <head> for a while.
    const observer = new MutationObserver(() => {
      if (!isShipPage()) return;
      observer.disconnect();
      announce();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), META_WAIT_MS);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", whenShip, { once: true });
  else whenShip();
}

if (!globalThis.__shipLookoutBridge) {
  globalThis.__shipLookoutBridge = true;
  startBridge();
}
