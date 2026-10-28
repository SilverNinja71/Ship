// dist/dev/gate.html: the real Siren Gate on a pretend YouTube page, for
// checking it in a normal tab. ?scenario= picks the situation; the side panel
// shows what the fake background recorded (rewards, stats, tab actions).

import { LOOKOUT_SOURCE, WEB_SOURCE, type GateCard, type LookoutVoyageState, type VideoInspection } from "@ship/shared-types";
import { mountSirenGate, mountToast } from "../gate/gate.js";
import { chromeGateClient } from "../gate/client.js";
import { plural } from "../core/labels.js";
import type { GuardDecision, PopupState } from "../shared/messages.js";
import { fakeResponse, installFakeChrome, memoryStore } from "./fakeChrome.js";

const CARDS: GateCard[] = [
  { id: "dev:1", front: "What does an enzyme lower to speed up a reaction?", back: "activation energy" },
  { id: "dev:2", front: "Km is the substrate concentration at which the rate is what fraction of Vmax?", back: "half (1/2)" },
  { id: "dev:3", front: "Which organelle makes most of the cell's ATP?", back: "mitochondria" },
  { id: "dev:4", front: "A molecule that binds the active site and blocks the substrate is a ___ inhibitor.", back: "competitive" },
];

interface Scenario {
  label: string;
  url: string;
  apiKey: string;
  cards: GateCard[];
  blockedSites?: string[];
  video?: Omit<VideoInspection, "videoId" | "thumbnailUrl" | "transcriptExcerpt">;
  gemini?: { decision: string; reason: string; confidence: number };
}

const SCENARIOS: Record<string, Scenario> = {
  gemini: {
    label: "Gemini verdict",
    url: "https://www.youtube.com/watch?v=Zx8sKkX1y2Q",
    apiKey: "dev-only-not-a-key",
    cards: CARDS,
    video: { title: "Top 10 Speedrun Fails of the Year", channel: "Blocky Laughs", description: "The funniest speedrun disasters, ranked." },
    gemini: { decision: "BLOCKED", reason: "Speedrun fails are gaming entertainment, not enzyme kinetics. Save it for shore leave!", confidence: 0.93 },
  },
  heuristic: {
    label: "Keyword check",
    url: "https://www.youtube.com/watch?v=Qw3rTy7uI9o",
    apiKey: "",
    cards: CARDS,
    video: { title: "Cats React to Cucumbers (Compilation)", channel: "Purrfect Clips", description: "You won't believe number 7." },
  },
  shorts: { label: "Shorts (always blocked)", url: "https://www.youtube.com/shorts/aBcDeFgHiJk", apiKey: "dev-only-not-a-key", cards: CARDS },
  "few-cards": { label: "Not enough cards", url: "https://www.youtube.com/", apiKey: "", cards: CARDS.slice(0, 1) },
  blocklist: { label: "Blocked site", url: "https://old.reddit.com/r/aww", apiKey: "", cards: CARDS, blockedSites: ["reddit.com"] },
  cleared: {
    label: "Cleared video",
    url: "https://www.youtube.com/watch?v=Mm3nB5vC7xZ",
    apiKey: "dev-only-not-a-key",
    cards: CARDS,
    video: { title: "Enzyme Kinetics: Michaelis–Menten Explained", channel: "Cell Lab", description: "Vmax, Km and Lineweaver–Burk plots." },
    gemini: { decision: "PROCEED", reason: "A clear lesson on enzyme kinetics, right on course for your lab report.", confidence: 0.91 },
  },
};

const params = new URLSearchParams(location.search);
const scenarioId = params.get("scenario") && SCENARIOS[params.get("scenario")!] ? params.get("scenario")! : "gemini";
const scenario = SCENARIOS[scenarioId]!;
const shipTabOpen = params.get("shipTab") !== "closed";

const actions: string[] = [];
const statePanel = document.getElementById("state")!;
const frame = document.getElementById("frame")!;
const fakePage = document.getElementById("fakepage")!;

function devBar() {
  const bar = document.getElementById("devbar")!;
  for (const [id, s] of Object.entries(SCENARIOS)) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = s.label;
    b.setAttribute("aria-pressed", String(id === scenarioId));
    b.addEventListener("click", () => {
      params.set("scenario", id);
      location.search = params.toString();
    });
    bar.append(b);
  }
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.textContent = shipTabOpen ? "Ship tab: open" : "Ship tab: closed";
  toggle.addEventListener("click", () => {
    params.set("shipTab", shipTabOpen ? "closed" : "open");
    location.search = params.toString();
  });
  bar.append(toggle);
  document.getElementById("page-url")!.textContent = scenario.url;
}

const store = memoryStore({
  settings: { geminiApiKey: scenario.apiKey, geminiModel: "gemini-flash-latest", shipUrl: "http://localhost:5173", blockedSites: scenario.blockedSites ?? [] },
});

const lookout = installFakeChrome({
  store,
  shipTabOpen: () => shipTabOpen,
  onAction: (text) => {
    actions.unshift(`${new Date().toLocaleTimeString()} · ${text}`);
    actions.length = Math.min(actions.length, 12);
  },
  fetch: async (url) => {
    if (url.includes("generativelanguage.googleapis.com")) {
      const answer = scenario.gemini ?? { decision: "BLOCKED", reason: "Not on course.", confidence: 0.8 };
      return fakeResponse({ candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(answer) }] }, finishReason: "STOP" }] });
    }
    if (url.includes("i.ytimg.com")) return fakeResponse(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), 200, "image/jpeg");
    return fakeResponse({ error: "offline dev page" }, 404);
  },
});

async function renderState() {
  const s = (await chrome.runtime.sendMessage({ t: "popup-state" })) as PopupState;
  const { rewards } = await lookout.read();
  statePanel.replaceChildren();
  const add = (tag: string, text: string, className?: string) => {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    statePanel.append(node);
  };
  add("h2", "Fake background");
  add("p", `Blocked ${s.stats.blockedToday} · steered back ${s.stats.steeredBackToday} · passes ${s.stats.leisurePassesToday}`);
  add("p", `Gemini ready: ${s.stats.geminiReady ? "yes" : "no (keyword check)"}`);
  add("h3", `Reward queue (${plural(rewards.length, "event")}, ${s.pendingDoubloons} doubloons)`);
  for (const e of rewards) add("p", `${e.kind} · ${e.site} · +${e.doubloons}`, "mono");
  if (s.passes.length) add("h3", "Leisure passes");
  for (const p of s.passes) add("p", `${p.site} until ${new Date(p.until).toLocaleTimeString()}`, "mono");
  add("h3", "Tab actions");
  for (const a of actions) add("p", a, "mono small");
}

async function run() {
  devBar();
  const now = Date.now();
  const voyage: LookoutVoyageState = {
    phase: "sailing",
    guarding: true,
    endsAt: now + 23 * 60_000 + 20_000,
    objective: "Finish the discussion section",
    assignment: { title: "Enzyme kinetics lab report", course: "BIO 201" },
    updatedAt: now,
  };
  await chrome.runtime.sendMessage({ t: "web", msg: { source: WEB_SOURCE, t: "voyage", voyage } });
  await chrome.runtime.sendMessage({ t: "web", msg: { source: WEB_SOURCE, t: "cards", cards: scenario.cards } });

  const url = scenario.url;
  let decision = (await chrome.runtime.sendMessage({ t: "check", url })) as GuardDecision;
  if (decision.action === "inspect") {
    const toast = mountToast("The Lookout is checking this video…", frame);
    const inspection: VideoInspection = {
      videoId: decision.videoId,
      title: scenario.video?.title ?? "",
      channel: scenario.video?.channel ?? "",
      description: scenario.video?.description ?? "",
      transcriptExcerpt: null,
      thumbnailUrl: null,
    };
    await new Promise((r) => setTimeout(r, 400));
    decision = (await chrome.runtime.sendMessage({ t: "judge", url, inspection })) as GuardDecision;
    if (decision.action === "allow" && decision.verdict) {
      toast.set("The Lookout cleared this video.", decision.verdict.reason, true);
    } else toast.remove();
  }
  if (decision.action === "block") {
    mountSirenGate({
      site: decision.site,
      verdict: decision.verdict,
      voyage: decision.voyage,
      client: chromeGateClient(url),
      container: frame,
      inertTarget: fakePage,
      // No shuffle, so screenshot scripts know which card comes next.
      random: () => 0.999,
      onPassed: () => void renderState(),
    });
    await chrome.runtime.sendMessage({ t: "blocked", url });
  }
  await renderState();
  setInterval(() => void renderState(), 250);
  // Lets screenshot scripts know the page settled.
  document.documentElement.dataset.ready = LOOKOUT_SOURCE;
}

void run();
