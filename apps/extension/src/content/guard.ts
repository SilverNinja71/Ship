// The guard content script, on YouTube (from the manifest) and on blocked
// sites (registered once the user grants them). It asks the background
// whether this page is allowed, reads watch pages for judging, and puts up
// the Siren Gate. YouTube navigates without reloading, so URL changes
// trigger a fresh check.

import { mountSirenGate, mountToast, type LookoutToast, type SirenGate } from "../gate/gate.js";
import { chromeGateClient } from "../gate/client.js";
import { isYouTubeHost } from "../core/classify.js";
import type { GuardDecision, ToContent } from "../shared/messages.js";
import { sendToBackground } from "../shared/runtime.js";
import { createMediaHush } from "./media.js";
import { readInspection, watchPageReady } from "./youtubePage.js";

declare global {
  var __shipLookoutGuard: boolean | undefined;
}

const READY_TIMEOUT_MS = 4000;
const URL_POLL_MS = 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function startGuard() {
  const hush = createMediaHush(document);
  let generation = 0;
  let gate: SirenGate | null = null;
  let gateUrl: string | null = null;
  let toast: LookoutToast | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let passTimer: ReturnType<typeof setTimeout> | undefined;
  let lastUrl = location.href;
  /** The page last let through. Re-checking it (tab shown again, guarding changed) happens quietly. */
  let allowedUrl: string | null = null;

  function clearToast() {
    clearTimeout(toastTimer);
    toast?.remove();
    toast = null;
  }

  function unmountGate() {
    gate?.destroy();
    gate = null;
    gateUrl = null;
  }

  async function waitForWatchPage(videoId: string, gen: number): Promise<boolean> {
    const until = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < until) {
      if (gen !== generation) return false;
      if (watchPageReady(document, videoId)) {
        // Let YouTube finish swapping the description in.
        await sleep(300);
        return gen === generation;
      }
      await sleep(250);
    }
    return gen === generation;
  }

  /** `announce`: we paused the page and showed "checking", so resume it and say how it went. */
  function apply(decision: GuardDecision, url: string, announce: boolean) {
    clearTimeout(passTimer);
    if (decision.action === "allow") {
      allowedUrl = url;
      unmountGate();
      hush.stop(announce);
      if (decision.passUntil !== null) passTimer = setTimeout(() => void evaluate(), Math.max(0, decision.passUntil - Date.now()) + 500);
      if (announce && decision.verdict) {
        toast ??= mountToast("");
        toast.set("The Lookout cleared this video.", decision.verdict.source === "heuristic" ? `Keyword check: ${decision.verdict.reason}` : decision.verdict.reason, true);
        toastTimer = setTimeout(clearToast, 4500);
      } else clearToast();
      return;
    }
    if (decision.action !== "block") return;
    allowedUrl = null;
    clearToast();
    hush.start();
    // Same page, already blocked: keep the gate (and any quiz progress) as it is.
    if (gate && gateUrl === url) return;
    unmountGate();
    gate = mountSirenGate({
      site: decision.site,
      verdict: decision.verdict,
      voyage: decision.voyage,
      client: chromeGateClient(url),
      onPassed: () => void evaluate(),
    });
    gateUrl = url;
    void sendToBackground({ t: "blocked", url });
  }

  async function evaluate() {
    const gen = ++generation;
    const url = location.href;
    const decision = await sendToBackground({ t: "check", url });
    if (gen !== generation || !decision) return;
    if (decision.action !== "inspect") return apply(decision, url, false);

    if (gate && gateUrl === url) return;
    const loud = allowedUrl !== url;
    if (loud) {
      hush.start();
      clearToast();
      toast = mountToast("The Lookout is checking this video…");
    }
    if (!(await waitForWatchPage(decision.videoId, gen))) return;
    const judged = await sendToBackground({ t: "judge", url, inspection: readInspection(document, decision.videoId) });
    if (gen !== generation) return;
    apply(judged ?? { action: "allow", verdict: null, passUntil: null }, url, loud);
  }

  function onUrlMaybeChanged() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    void evaluate();
  }

  chrome.runtime.onMessage.addListener((message: ToContent) => {
    if (message?.t === "lookout-refresh") void evaluate();
    return false;
  });
  if (isYouTubeHost(location.hostname)) {
    document.addEventListener("yt-navigate-finish", onUrlMaybeChanged);
    setInterval(onUrlMaybeChanged, URL_POLL_MS);
  }
  window.addEventListener("popstate", onUrlMaybeChanged);
  // A tab left open while the voyage went stale, or a pass ran out, gets checked when it's looked at.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void evaluate();
  });
  void evaluate();
}

// Registered and static scripts can both match a page; run once.
if (!globalThis.__shipLookoutGuard) {
  globalThis.__shipLookoutGuard = true;
  startGuard();
}
