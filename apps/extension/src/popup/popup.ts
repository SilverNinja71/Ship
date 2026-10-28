// The toolbar popup: the voyage, today's stats and whether Gemini is ready.
// It only reads state from the background; nothing here changes anything.

import { formatClock, formatTimeLeft, GUARD_STATUS_LABELS, PHASE_LABELS, plural, verdictSourceShort } from "../core/labels.js";
import type { PopupState } from "../shared/messages.js";
import { sendToBackground } from "../shared/runtime.js";

const REFETCH_MS = 5000;

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function render(doc: Document, root: HTMLElement, state: PopupState, clockNow: number) {
  const { voyage, stats } = state;
  const guarding = state.status === "guarding";

  const voyageCard = el(doc, "section", `card voyage ${guarding ? "on" : "off"}`);
  const top = el(doc, "div", "row");
  top.append(el(doc, "span", "phase", voyage ? PHASE_LABELS[voyage.phase] : "No voyage yet"));
  if (voyage?.endsAt != null) top.append(el(doc, "span", "clock", formatClock(voyage.endsAt - clockNow)));
  voyageCard.append(top);
  if (voyage?.assignment) voyageCard.append(el(doc, "p", "line", `${voyage.assignment.title}${voyage.assignment.course ? ` · ${voyage.assignment.course}` : ""}`));
  if (voyage?.objective) voyageCard.append(el(doc, "p", "line muted", `Objective: ${voyage.objective}`));
  voyageCard.append(el(doc, "p", `status ${guarding ? "good" : ""}`, GUARD_STATUS_LABELS[state.status]));

  const tiles = el(doc, "section", "tiles");
  for (const [n, label] of [
    [stats.blockedToday, "Sirens blocked"],
    [stats.steeredBackToday, "Steered back"],
    [stats.leisurePassesToday, "Leisure passes"],
  ] as const) {
    const tile = el(doc, "div", "tile");
    tile.append(el(doc, "strong", undefined, String(n)), el(doc, "span", undefined, label));
    tiles.append(tile);
  }

  const info = el(doc, "section", "card info");
  const gemini = el(doc, "p", `dot ${stats.geminiReady ? "good" : "warn"}`);
  gemini.textContent = stats.geminiReady ? `Gemini ready · ${state.geminiModel}` : "No Gemini key: watch pages get the keyword check (heuristic)";
  info.append(gemini);
  if (state.geminiError && stats.geminiReady) {
    info.append(el(doc, "p", "small bad", `Last Gemini call failed ${formatAgo(clockNow - state.geminiError.at)}: ${state.geminiError.message}`));
  }
  if (state.lastVerdict) {
    const v = state.lastVerdict.verdict;
    const line = el(doc, "p", "small");
    line.append(
      "Last check: ",
      el(doc, "q", undefined, state.lastVerdict.title || "a video"),
      " ",
      el(doc, "b", v.decision === "PROCEED" ? "goodtext" : "badtext", v.decision === "PROCEED" ? "cleared" : "blocked"),
      ` by ${verdictSourceShort(v)}`,
    );
    info.append(line);
  }
  for (const pass of state.passes) info.append(el(doc, "p", "small", `Leisure pass on ${pass.site}: ${formatTimeLeft(pass.until - clockNow)}`));
  info.append(
    el(
      doc,
      "p",
      "small",
      state.pendingRewards
        ? `${plural(state.pendingRewards, "reward")} (${state.pendingDoubloons} doubloons) waiting for Ship to collect`
        : "No rewards waiting: Ship has collected them all.",
    ),
    el(doc, "p", "small muted", `${plural(state.cards, "flashcard")} aboard for the Siren Gate`),
  );

  const actions = el(doc, "div", "actions");
  const open = el(doc, "button", "btn", "Open Ship");
  open.type = "button";
  open.addEventListener("click", () => void sendToBackground({ t: "open-ship" }).then(() => window.close()));
  const settings = el(doc, "button", "btn ghost", "Settings");
  settings.type = "button";
  settings.addEventListener("click", () => void chrome.runtime.openOptionsPage());
  actions.append(open, settings);

  root.replaceChildren(voyageCard, tiles, info, actions);
}

function formatAgo(ms: number): string {
  const min = Math.round(ms / 60_000);
  return min < 1 ? "just now" : min < 60 ? `${min} min ago` : `${Math.round(min / 60)} h ago`;
}

export async function startPopup(doc: Document = document): Promise<void> {
  const root = doc.getElementById("app");
  if (!root) return;
  let state: PopupState | null = null;
  let fetchedAt = 0;

  const draw = () => {
    if (!state) return;
    // Count down from the background's clock without asking it every second.
    render(doc, root, state, state.now + (Date.now() - fetchedAt));
  };
  const refetch = async () => {
    const next = await sendToBackground({ t: "popup-state" });
    if (!next) {
      root.replaceChildren(el(doc, "p", "card status", "The Lookout's background isn't answering. Try reloading the extension."));
      return;
    }
    state = next;
    fetchedAt = Date.now();
    draw();
  };

  await refetch();
  setInterval(draw, 1000);
  setInterval(() => void refetch(), REFETCH_MS);
}
