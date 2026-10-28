// dist/dev/popup.html: the real popup over a fake background with a voyage
// underway. ?gemini=0 shows the keyword-check state; ?voyage=docked shows
// the popup between voyages.

import { WEB_SOURCE, type LookoutRewardEvent } from "@ship/shared-types";
import { startPopup } from "../popup/popup.js";
import { localDayKey } from "../core/stats.js";
import { fakeResponse, installFakeChrome, memoryStore } from "./fakeChrome.js";

const params = new URLSearchParams(location.search);
const gemini = params.get("gemini") !== "0";
const docked = params.get("voyage") === "docked";
const now = Date.now();

const rewards: LookoutRewardEvent[] = [
  { id: "dev-1", kind: "blocked", doubloons: 0, site: "youtube.com", at: now - 20 * 60_000 },
  { id: "dev-2", kind: "steer-back", doubloons: 50, site: "youtube.com", at: now - 19 * 60_000 },
  { id: "dev-3", kind: "gate-passed", doubloons: 0, site: "reddit.com", at: now - 4 * 60_000 },
];

const store = memoryStore({
  settings: {
    geminiApiKey: gemini ? "dev-only-not-a-key" : "",
    geminiModel: "gemini-flash-latest",
    shipUrl: "http://localhost:5173",
    blockedSites: ["reddit.com"],
  },
  stats: { day: localDayKey(now), blocked: 4, steeredBack: 2, leisurePasses: 1 },
  rewards,
  passes: { "reddit.com": now + 3 * 60_000 + 10_000 },
  lastVerdict: {
    at: now - 2 * 60_000,
    title: gemini ? "Enzyme Kinetics: Michaelis–Menten Explained" : "Cats React to Cucumbers (Compilation)",
    verdict: gemini
      ? { decision: "PROCEED", reason: "Right on course.", confidence: 0.91, source: "gemini" }
      : { decision: "BLOCKED", reason: "Sounds like entertainment.", confidence: 0.55, source: "heuristic" },
  },
});

installFakeChrome({ store, fetch: async () => fakeResponse({}, 404) });

async function run() {
  await chrome.runtime.sendMessage({
    t: "web",
    msg: {
      source: WEB_SOURCE,
      t: "voyage",
      voyage: docked
        ? { phase: "docked", guarding: false, endsAt: null, objective: null, assignment: null, updatedAt: now }
        : {
            phase: "sailing",
            guarding: true,
            endsAt: now + 23 * 60_000 + 41_000,
            objective: "Finish the discussion section",
            assignment: { title: "Enzyme kinetics lab report", course: "BIO 201" },
            updatedAt: now,
          },
    },
  });
  await chrome.runtime.sendMessage({
    t: "web",
    msg: { source: WEB_SOURCE, t: "cards", cards: Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, front: `Q${i}`, back: `A${i}` })) },
  });
  await startPopup();
  document.documentElement.dataset.ready = "1";
}

void run();
