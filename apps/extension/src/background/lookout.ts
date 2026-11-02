// The Lookout's background logic, with every Chrome API behind `deps` so the
// tests and the dev pages can run it with an in-memory store and fake tabs.
//
// MV3 service workers stop after about 30 s idle, so nothing lives in memory
// except a lock and in-flight Gemini calls: all state is in the store, read
// fresh for each message.

import {
  BRIDGE_PROTOCOL_VERSION,
  LOOKOUT_SOURCE,
  type GateCard,
  type LookoutRewardEvent,
  type LookoutStats,
  type LookoutToWeb,
  type LookoutVerdict,
  type VideoInspection,
} from "@ship/shared-types";
import { parseVoyageState, parseWebMessage, sanitizeCards } from "../core/bridgeProtocol.js";
import { classifyUrl, type PageClass } from "../core/classify.js";
import { THUMBNAIL_MAX_BYTES } from "../core/constants.js";
import { askGemini, GeminiError, type InlineImage } from "../core/gemini.js";
import { sortVideo } from "../core/videoSort.js";
import type { SortedVideo } from "../core/videoSort.js";
import { bytesToBase64, type LookoutFetch } from "../core/net.js";
import { activePass, grantPass, normalizePasses, prunePasses, type Passes } from "../core/passes.js";
import { ackRewards, claimRewards, enqueueReward, isRewardEvent, makeReward, newRewardId, pendingDoubloons, steerBackPayout } from "../core/rewards.js";
import { geminiReady, normalizeSettings, type LookoutSettings } from "../core/settings.js";
import { bumpStat, currentStats, normalizeStats, statsView, type DailyStats, type StatField } from "../core/stats.js";
import { getCachedVerdict, normalizeVerdictCache, pruneVerdictCache, putCachedVerdict, verdictCacheKey, type VerdictCache } from "../core/verdictCache.js";
import { guardKey, guardStatus, isGuarding, studyContext, studyContextKey, type StoredVoyage, type StudyContext } from "../core/voyage.js";
import type { GateVoyageInfo, GuardDecision, PopupState, SenderInfo, SteerBackResult, ToContent } from "../shared/messages.js";

export interface KeyValueStore {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface LookoutDeps {
  store: KeyValueStore;
  now(): number;
  fetch: LookoutFetch;
  /** A short random string for reward ids. */
  randomId(): string;
  /** Focus an open Ship tab; false if there is none. */
  focusShipTab(shipUrl: string): Promise<boolean>;
  /** Send this tab to Ship, or open a new tab when tabId is null. */
  openShip(tabId: number | null, shipUrl: string): Promise<void>;
  broadcast(message: ToContent, to: "guards" | "bridges"): Promise<void>;
  setBadge(text: string): void | Promise<void>;
}

export interface LookoutState {
  settings: LookoutSettings;
  voyage: StoredVoyage | null;
  cards: GateCard[];
  rewards: LookoutRewardEvent[];
  stats: DailyStats;
  verdicts: VerdictCache;
  passes: Passes;
  lastSteerBackPaidAt: number | null;
  /** The last guardKey tabs were told about. */
  guardKey: string;
  geminiError: { at: number; message: string } | null;
  lastVerdict: { at: number; title: string; verdict: LookoutVerdict } | null;
}

export const STATE_KEYS: (keyof LookoutState)[] = [
  "settings",
  "voyage",
  "cards",
  "rewards",
  "stats",
  "verdicts",
  "passes",
  "lastSteerBackPaidAt",
  "guardKey",
  "geminiError",
  "lastVerdict",
];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function parseState(raw: Record<string, unknown>, now: number): LookoutState {
  const v = raw.voyage;
  const voyageState = isRecord(v) ? parseVoyageState(v.state) : null;
  const receivedAt = isRecord(v) ? num(v.receivedAt) : null;
  const err = raw.geminiError;
  const last = raw.lastVerdict;
  return {
    settings: normalizeSettings(raw.settings),
    voyage: voyageState && receivedAt !== null ? { state: voyageState, receivedAt } : null,
    cards: Array.isArray(raw.cards) ? sanitizeCards(raw.cards) : [],
    rewards: Array.isArray(raw.rewards) ? raw.rewards.filter(isRewardEvent) : [],
    stats: normalizeStats(raw.stats, now),
    verdicts: normalizeVerdictCache(raw.verdicts),
    passes: normalizePasses(raw.passes),
    lastSteerBackPaidAt: num(raw.lastSteerBackPaidAt),
    guardKey: typeof raw.guardKey === "string" ? raw.guardKey : "off",
    geminiError: isRecord(err) && typeof err.message === "string" && num(err.at) !== null ? { at: err.at as number, message: err.message } : null,
    lastVerdict:
      isRecord(last) && isRecord(last.verdict) && typeof last.title === "string" && num(last.at) !== null ? (last as LookoutState["lastVerdict"]) : null,
  };
}

function createMutex() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn, fn);
    tail = run.catch(() => undefined);
    return run;
  };
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Only YouTube's thumbnail host is fetched; anything else is replaced with the standard thumbnail URL. */
export function safeThumbnailUrl(raw: unknown, videoId: string): string {
  if (typeof raw === "string") {
    try {
      const url = new URL(raw);
      if (url.protocol === "https:" && url.hostname === "i.ytimg.com") return url.href;
    } catch {
      // fall through
    }
  }
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

export function sanitizeInspection(raw: unknown, videoId: string): VideoInspection {
  const r = isRecord(raw) ? raw : {};
  return {
    videoId,
    title: str(r.title, 300),
    channel: str(r.channel, 120),
    description: str(r.description, 2000),
    transcriptExcerpt: str(r.transcriptExcerpt, 2000) || null,
    thumbnailUrl: safeThumbnailUrl(r.thumbnailUrl, videoId),
    category: str(r.category, 60) || null,
  };
}

function blockReason(page: Exclude<PageClass, { kind: "none" }>): string {
  if (page.kind === "blocklist") return `${page.site} is on your blocked list for focus blocks.`;
  if (page.kind === "youtube-blocked") return `The Lookout keeps ${page.label} closed during focus blocks.`;
  return "This page is closed during focus blocks.";
}

export function createLookout(deps: LookoutDeps) {
  const locked = createMutex();
  const inflight = new Map<string, Promise<LookoutVerdict>>();

  async function read(): Promise<LookoutState> {
    return parseState(await deps.store.get(STATE_KEYS), deps.now());
  }

  /** Read-modify-write under the lock, so two tabs reporting at once can't lose an event. */
  function mutate(fn: (s: LookoutState) => Partial<LookoutState>): Promise<LookoutState> {
    return locked(async () => {
      const s = await read();
      const patch = fn(s);
      if (Object.keys(patch).length) await deps.store.set(patch);
      return { ...s, ...patch };
    });
  }

  const statsOf = (s: LookoutState): LookoutStats => statsView(s.stats, deps.now(), geminiReady(s.settings));
  const pushStats = (s: LookoutState) => deps.broadcast({ t: "lookout-stats", stats: statsOf(s) }, "bridges");
  const newId = () => newRewardId(deps.now(), deps.randomId);

  function badgeText(s: LookoutState, now: number): string {
    if (!s.voyage || !isGuarding(s.voyage, now)) return "";
    const { endsAt } = s.voyage.state;
    return endsAt === null ? "ON" : `${Math.max(1, Math.ceil((endsAt - now) / 60_000))}m`;
  }

  /** Sets guardKey in the patch; true if tabs should re-check. */
  function withGuardKey(s: LookoutState, patch: Partial<LookoutState>, now: number): boolean {
    const key = guardKey(patch.voyage !== undefined ? patch.voyage : s.voyage, now);
    if (key === s.guardKey) return false;
    patch.guardKey = key;
    return true;
  }

  function gateInfo(s: LookoutState): GateVoyageInfo {
    const v = s.voyage?.state ?? null;
    const assignment = v?.assignment ? (v.assignment.course ? `${v.assignment.title} (${v.assignment.course})` : v.assignment.title) : null;
    return { endsAt: v?.endsAt ?? null, objective: v?.objective ?? null, assignment, geminiModel: geminiReady(s.settings) ? s.settings.geminiModel : null };
  }

  /** Everything decidable without reading the page. */
  function preDecision(s: LookoutState, url: string, now: number): GuardDecision {
    const allow: GuardDecision = { action: "allow", verdict: null, passUntil: null };
    if (!isGuarding(s.voyage, now)) return allow;
    const page = classifyUrl(url, s.settings.blockedSites);
    if (page.kind === "none" || page.kind === "youtube-other") return allow;
    const pass = activePass(s.passes, page.site, now);
    if (pass !== null) {
      const verdict: LookoutVerdict = { decision: "PROCEED", reason: `Leisure pass for ${page.site}.`, confidence: 1, source: "leisure-pass" };
      return { action: "allow", verdict, passUntil: pass };
    }
    if (page.kind === "youtube-watch") return { action: "inspect", site: page.site, videoId: page.videoId };
    const verdict: LookoutVerdict = { decision: "BLOCKED", reason: blockReason(page), confidence: 1, source: "always-blocked" };
    return { action: "block", site: page.site, verdict, voyage: gateInfo(s) };
  }

  function decide(s: LookoutState, site: string, verdict: LookoutVerdict): GuardDecision {
    return verdict.decision === "PROCEED" ? { action: "allow", verdict, passUntil: null } : { action: "block", site, verdict, voyage: gateInfo(s) };
  }

  async function oembed(videoId: string): Promise<{ title: string; channel: string } | null> {
    const watch = `https://www.youtube.com/watch?v=${videoId}`;
    try {
      const res = await deps.fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const body = await res.json();
      return isRecord(body) ? { title: str(body.title, 300), channel: str(body.author_name, 120) } : null;
    } catch {
      return null;
    }
  }

  async function thumbnail(url: string): Promise<InlineImage | null> {
    try {
      const res = await deps.fetch(url, { signal: AbortSignal.timeout(5000) });
      const type = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0]!.trim();
      if (!res.ok || !type.startsWith("image/")) return null;
      const bytes = new Uint8Array(await res.arrayBuffer());
      return bytes.length && bytes.length <= THUMBNAIL_MAX_BYTES ? { mimeType: type, data: bytesToBase64(bytes) } : null;
    } catch {
      return null;
    }
  }

  async function callGemini(settings: LookoutSettings, video: VideoInspection, context: StudyContext, key: string, sorted: SortedVideo): Promise<LookoutVerdict> {
    try {
      const thumb = video.thumbnailUrl ? await thumbnail(video.thumbnailUrl) : null;
      const verdict = await askGemini(deps.fetch, { apiKey: settings.geminiApiKey, model: settings.geminiModel, video, context, thumbnail: thumb });
      await mutate((s) => ({ verdicts: putCachedVerdict(s.verdicts, key, verdict, deps.now()), geminiError: null }));
      return verdict;
    } catch (e) {
      const message = e instanceof GeminiError ? e.message : "Gemini call failed.";
      await mutate(() => ({ geminiError: { at: deps.now(), message } }));
      return { ...sorted.verdict, reason: `Gemini couldn't answer, so the Lookout's video groups decided. ${sorted.verdict.reason}` };
    }
  }

  async function judge(url: string, rawInspection: unknown): Promise<GuardDecision> {
    const s = await read();
    const pre = preDecision(s, url, deps.now());
    if (pre.action !== "inspect") return pre;
    const video = sanitizeInspection(rawInspection, pre.videoId);
    if (!video.title) {
      const meta = await oembed(video.videoId);
      if (meta) Object.assign(video, { title: meta.title, channel: video.channel || meta.channel });
    }
    const context = studyContext(s.voyage?.state ?? null);
    // The video groups sort most videos on the spot; Gemini only settles the ones they're unsure about.
    const sorted = sortVideo(video, context);
    const key = verdictCacheKey(video.videoId, studyContextKey(context));
    let verdict = sorted.sure || !geminiReady(s.settings) ? sorted.verdict : getCachedVerdict(s.verdicts, key, deps.now());
    if (!verdict) {
      // Two tabs (or a quick re-check) on the same video share one call.
      let pending = inflight.get(key);
      if (!pending) {
        pending = callGemini(s.settings, video, context, key, sorted).finally(() => inflight.delete(key));
        inflight.set(key, pending);
      }
      verdict = await pending;
    }
    const final = verdict;
    const after = await mutate(() => ({ lastVerdict: { at: deps.now(), title: video.title, verdict: final } }));
    return decide(after, pre.site, final);
  }

  /** The site a gate action is about: the classified site, or the bare host. */
  function siteOf(s: LookoutState, url: string): string | null {
    const page = classifyUrl(url, s.settings.blockedSites);
    if (page.kind !== "none") return page.site;
    try {
      return new URL(url).hostname || null;
    } catch {
      return null;
    }
  }

  async function record(field: StatField, kind: LookoutRewardEvent["kind"], site: string, extra: (s: LookoutState) => Partial<LookoutState> = () => ({})) {
    const now = deps.now();
    const s = await mutate((st) => ({
      stats: bumpStat(st.stats, field, now),
      rewards: enqueueReward(st.rewards, makeReward(kind, site, 0, now, newId())),
      ...extra(st),
    }));
    await pushStats(s);
    return s;
  }

  async function steerBack(url: string, sender: SenderInfo): Promise<SteerBackResult | null> {
    const site = siteOf(await read(), url);
    if (!site) return null;
    const now = deps.now();
    let doubloons = 0;
    const s = await mutate((st) => {
      doubloons = steerBackPayout(st.lastSteerBackPaidAt, now);
      return {
        stats: bumpStat(st.stats, "steeredBack", now),
        rewards: enqueueReward(st.rewards, makeReward("steer-back", site, doubloons, now, newId())),
        lastSteerBackPaidAt: doubloons > 0 ? now : st.lastSteerBackPaidAt,
      };
    });
    await pushStats(s);
    const focusedExistingTab = await deps.focusShipTab(s.settings.shipUrl).catch(() => false);
    if (!focusedExistingTab) await deps.openShip(sender.tabId, s.settings.shipUrl).catch(() => undefined);
    return { doubloons, focusedExistingTab };
  }

  async function gatePassed(url: string): Promise<{ passUntil: number } | null> {
    const s0 = await read();
    const site = siteOf(s0, url);
    if (!site || !isGuarding(s0.voyage, deps.now())) return null;
    let until = 0;
    await record("leisurePasses", "gate-passed", site, (st) => {
      const granted = grantPass(st.passes, site, deps.now());
      until = granted.until;
      return { passes: granted.passes };
    });
    // Other tabs on the same site open up too.
    await deps.broadcast({ t: "lookout-refresh" }, "guards");
    return { passUntil: until };
  }

  async function blocked(url: string): Promise<null> {
    const s = await read();
    if (!isGuarding(s.voyage, deps.now())) return null;
    const page = classifyUrl(url, s.settings.blockedSites);
    if (page.kind === "none" || page.kind === "youtube-other") return null;
    await record("blocked", "blocked", page.site);
    return null;
  }

  async function web(raw: unknown): Promise<LookoutToWeb | null> {
    const msg = parseWebMessage(raw);
    if (!msg) return null;
    const now = deps.now();
    switch (msg.t) {
      case "hello":
        return { source: LOOKOUT_SOURCE, t: "hello", version: BRIDGE_PROTOCOL_VERSION, stats: statsOf(await read()) };
      case "voyage": {
        let changed = false;
        const s = await mutate((st) => {
          const patch: Partial<LookoutState> = { voyage: { state: msg.voyage, receivedAt: now } };
          changed = withGuardKey(st, patch, now);
          return patch;
        });
        await deps.setBadge(badgeText(s, now));
        if (changed) await deps.broadcast({ t: "lookout-refresh" }, "guards");
        return null;
      }
      case "cards":
        await mutate(() => ({ cards: msg.cards }));
        return null;
      case "claim-rewards":
        return { source: LOOKOUT_SOURCE, t: "rewards", events: claimRewards((await read()).rewards) };
      case "ack-rewards":
        if (msg.ids.length) await mutate((st) => ({ rewards: ackRewards(st.rewards, msg.ids) }));
        return null;
    }
  }

  async function popupState(): Promise<PopupState> {
    const s = await read();
    const now = deps.now();
    return {
      now,
      voyage: s.voyage?.state ?? null,
      status: guardStatus(s.voyage, now),
      lastHeartbeat: s.voyage?.receivedAt ?? null,
      stats: statsOf(s),
      geminiModel: s.settings.geminiModel,
      geminiError: s.geminiError,
      lastVerdict: s.lastVerdict,
      pendingRewards: s.rewards.length,
      pendingDoubloons: pendingDoubloons(s.rewards),
      passes: Object.entries(prunePasses(s.passes, now)).map(([site, until]) => ({ site, until })),
      cards: s.cards.length,
      shipUrl: s.settings.shipUrl,
    };
  }

  async function handle(message: unknown, sender: SenderInfo): Promise<unknown> {
    if (!isRecord(message) || typeof message.t !== "string") return null;
    const url = typeof message.url === "string" ? message.url : "";
    switch (message.t) {
      case "web":
        return web(message.msg);
      case "check":
        return preDecision(await read(), url, deps.now());
      case "judge":
        return judge(url, message.inspection);
      case "blocked":
        return blocked(url);
      case "gate-cards":
        return { cards: (await read()).cards };
      case "gate-passed":
        return gatePassed(url);
      case "steer-back":
        return steerBack(url, sender);
      case "popup-state":
        return popupState();
      case "open-ship": {
        const { shipUrl } = (await read()).settings;
        if (!(await deps.focusShipTab(shipUrl).catch(() => false))) await deps.openShip(null, shipUrl);
        return null;
      }
      default:
        return null;
    }
  }

  /** Once a minute: staleness, midnight, expired passes and the badge. */
  async function tick(): Promise<void> {
    const now = deps.now();
    let refresh = false;
    let newDay = false;
    const s = await mutate((st) => {
      const patch: Partial<LookoutState> = {};
      refresh = withGuardKey(st, patch, now);
      const today = currentStats(st.stats, now);
      if (today !== st.stats) {
        newDay = true;
        patch.stats = today;
      }
      const passes = prunePasses(st.passes, now);
      if (Object.keys(passes).length !== Object.keys(st.passes).length) patch.passes = passes;
      const verdicts = pruneVerdictCache(st.verdicts, now);
      if (Object.keys(verdicts).length !== Object.keys(st.verdicts).length) patch.verdicts = verdicts;
      return patch;
    });
    await deps.setBadge(badgeText(s, now));
    if (refresh) await deps.broadcast({ t: "lookout-refresh" }, "guards");
    if (newDay) await pushStats(s);
  }

  async function onSettingsChanged(prevRaw: unknown, nextRaw: unknown): Promise<void> {
    const prev = normalizeSettings(prevRaw);
    const next = normalizeSettings(nextRaw);
    if (geminiReady(prev) !== geminiReady(next)) await pushStats(await read());
    if (prev.blockedSites.join() !== next.blockedSites.join()) await deps.broadcast({ t: "lookout-refresh" }, "guards");
  }

  return { handle, tick, onSettingsChanged, read };
}

export type Lookout = ReturnType<typeof createLookout>;
