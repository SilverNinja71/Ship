// The Siren Friction Gate: a full-page overlay in a closed shadow root, so
// the page's CSS can't reach it and its scripts can't read it. Two ways out:
// answer flashcards for a leisure pass, or steer back to Ship for doubloons.
//
// Nothing is set with innerHTML: text from outside (the verdict's reason,
// card text) goes in as text nodes, and the art is built element by element.

import { GATE_CARDS_REQUIRED, GATE_LEISURE_MINUTES, STEER_BACK_BONUS, type GateCard, type LookoutVerdict } from "@ship/shared-types";
import { formatTimeLeft, plural, verdictSourceLabel } from "../core/labels.js";
import { canQuiz, currentCard, nextCard, shuffled, startQuiz, submitAnswer, type QuizState } from "../core/quiz.js";
import type { GateVoyageInfo, SteerBackResult } from "../shared/messages.js";
import { CARDS_ICON, SIREN_SVG, SPYGLASS_ICON, WHEEL_ICON } from "./art.js";
import { GATE_CSS } from "./styles.js";
import { svgElement } from "./svg.js";

export interface GateClient {
  cards(): Promise<GateCard[]>;
  passed(): Promise<{ passUntil: number } | null>;
  steerBack(): Promise<SteerBackResult | null>;
}

export interface SirenGateOptions {
  site: string;
  verdict: LookoutVerdict;
  voyage: GateVoyageInfo;
  client: GateClient;
  /** Where the overlay goes. Default: <html>, covering the viewport. */
  container?: Element;
  /** Made inert while the gate is up so Tab can't reach the page. Default: <body>. */
  inertTarget?: HTMLElement | null;
  onPassed?: (passUntil: number) => void;
  now?: () => number;
  random?: () => number;
}

export interface SirenGate {
  readonly host: HTMLElement;
  destroy(): void;
}

type View =
  | { name: "choices" }
  | { name: "quiz"; quiz: QuizState }
  | { name: "passed"; until: number }
  | { name: "steered"; result: SteerBackResult }
  | { name: "sailing" };

type Child = Node | string | null | false | undefined;

function makeH(doc: Document) {
  return function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    for (const c of children) if (c) el.append(c);
    return el;
  };
}

function icon(doc: Document, svg: string): HTMLElement {
  const span = doc.createElement("span");
  span.className = "icon";
  span.append(svgElement(doc, svg));
  return span;
}

function setImportant(el: HTMLElement, styles: Record<string, string>) {
  for (const [k, v] of Object.entries(styles)) el.style.setProperty(k, v, "important");
}

const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function mountSirenGate(options: SirenGateOptions): SirenGate {
  const container = options.container ?? document.documentElement;
  const doc = container.ownerDocument;
  const now = options.now ?? (() => Date.now());
  const h = makeH(doc);
  const fullPage = container === doc.documentElement;

  // A custom element name no page stylesheet targets, pinned with !important.
  const host = doc.createElement("ship-lookout-gate");
  setImportant(host, {
    position: fullPage ? "fixed" : "absolute",
    inset: "0",
    "z-index": "2147483647",
    display: "block",
    margin: "0",
    padding: "0",
    border: "0",
    background: "transparent",
  });
  const root = host.attachShadow({ mode: "closed" });
  const style = doc.createElement("style");
  style.textContent = GATE_CSS;
  root.append(style);

  // Keys typed into the gate must not reach the page's shortcuts (YouTube's "f" is fullscreen).
  for (const type of ["keydown", "keyup", "keypress"]) root.addEventListener(type, (e) => e.stopPropagation());

  let cards: GateCard[] | null = null;
  let view: View = { name: "choices" };
  let busy = false;
  let focusSelector: string | null = ".choice";
  const cleanups: Array<() => void> = [];

  const titleId = "lk-title";
  const reasonId = "lk-reason";
  const panel = h("div", { class: "panel" });
  const voyageLine = h("p", { class: "voyage" });
  const sourceClass = options.verdict.source;
  const showConfidence = options.verdict.source === "gemini" || options.verdict.source === "heuristic" || options.verdict.source === "cache";

  const card = h(
    "section",
    { class: "card", role: "dialog", "aria-modal": "true", "aria-labelledby": titleId, "aria-describedby": reasonId },
    h("div", { class: "art" }, svgElement(doc, SIREN_SVG)),
    h(
      "div",
      { class: "body" },
      h("p", { class: "kicker" }, "The Lookout spotted a siren"),
      h("h1", { id: titleId }, "Avast! Hold your course."),
      h("p", { class: "reason", id: reasonId }, options.verdict.reason),
      h(
        "div",
        { class: "chips" },
        h("span", { class: `chip ${sourceClass}` }, verdictSourceLabel(options.verdict, options.voyage.geminiModel)),
        showConfidence && h("span", { class: "chip" }, `Confidence ${Math.round(options.verdict.confidence * 100)}%`),
        h("span", { class: "chip" }, options.site),
      ),
    ),
    voyageLine,
    panel,
    h("p", { class: "foot" }, "The Lookout only stands watch during focus blocks."),
  );
  const backdrop = h("div", { class: "backdrop" }, card);
  root.append(backdrop);

  function renderVoyageLine() {
    const { objective, assignment, endsAt } = options.voyage;
    const parts: string[] = [];
    if (assignment) parts.push(`Studying: ${assignment}`);
    if (objective && objective !== assignment) parts.push(`Objective: ${objective}`);
    if (endsAt !== null) parts.push(`${formatTimeLeft(endsAt - now())} in this focus block`);
    voyageLine.textContent = parts.join(" · ") || "A focus block is underway.";
  }

  function choicesView(): Node[] {
    const steer = h(
      "button",
      { class: "choice steer", type: "button", "data-action": "steer" },
      icon(doc, WHEEL_ICON),
      h("span", {}, h("strong", {}, "Steer back to the ship"), h("span", { class: "sub" }, `+${STEER_BACK_BONUS} doubloons`)),
    );
    steer.addEventListener("click", () => void steerBack());

    let quiz: Node;
    if (cards === null) {
      quiz = h(
        "button",
        { class: "choice quiz", type: "button", disabled: "" },
        icon(doc, CARDS_ICON),
        h("span", {}, h("strong", {}, "Loading flashcards…"), h("span", { class: "sub" }, "Checking which cards Ship sent")),
      );
    } else if (canQuiz(cards)) {
      const btn = h(
        "button",
        { class: "choice quiz", type: "button", "data-action": "quiz" },
        icon(doc, CARDS_ICON),
        h(
          "span",
          {},
          h("strong", {}, `Answer ${plural(GATE_CARDS_REQUIRED, "flashcard")}`),
          h("span", { class: "sub" }, `Earn a ${GATE_LEISURE_MINUTES}-minute leisure pass for ${options.site}`),
        ),
      );
      btn.addEventListener("click", () => {
        const deck = shuffled(cards ?? [], options.random);
        view = { name: "quiz", quiz: startQuiz(deck, now()) };
        focusSelector = "input";
        render();
      });
      quiz = btn;
    } else {
      const have = cards.length === 0 ? "No flashcards are aboard yet." : `Only ${plural(cards.length, "flashcard")} aboard.`;
      quiz = h(
        "div",
        { class: "note", role: "note" },
        h("strong", {}, "No leisure pass this time"),
        `${have} Open Ship and it sends your due cards to the Lookout; answering ${GATE_CARDS_REQUIRED} of them earns a ${GATE_LEISURE_MINUTES}-minute pass.`,
      );
    }
    return [h("div", { class: "choices" }, quiz, steer)];
  }

  function quizView(quiz: QuizState): Node[] {
    const pips = h("span", { class: "pips", "aria-hidden": "true" });
    for (let i = 0; i < quiz.required; i++) pips.append(h("span", { class: `pip${i < quiz.correct ? " on" : ""}` }));
    const back = h("button", { class: "linkbtn", type: "button" }, "Back");
    back.addEventListener("click", () => {
      view = { name: "choices" };
      focusSelector = ".choice";
      render();
    });
    const head = h("div", { class: "quizhead" }, h("span", {}, `${quiz.correct} of ${quiz.required} correct`, pips), back);

    const feedback = h("div", { class: "feedback", role: "status", "aria-live": "polite" });
    const out: Node[] = [head];

    if (quiz.phase === "exhausted") {
      feedback.classList.add("bad");
      feedback.append("That's every flashcard aboard, and not enough were right for a pass. Review them in Ship, or steer back now.");
      const steer = h("button", { class: "btn", type: "button", "data-action": "steer" }, `Steer back (+${STEER_BACK_BONUS} doubloons)`);
      steer.addEventListener("click", () => void steerBack());
      focusSelector = "[data-action=steer]";
      return [...out, feedback, h("div", { class: "actions" }, steer)];
    }

    const c = currentCard(quiz);
    if (!c) return out;
    out.push(h("div", { class: "front" }, h("small", {}, "Flashcard"), c.front));

    const missed = quiz.phase === "missed";
    const input = h("input", {
      type: "text",
      id: "lk-answer",
      autocomplete: "off",
      spellcheck: "false",
      placeholder: "Type your answer",
      "aria-label": "Your answer",
    });
    if (missed) {
      input.value = quiz.last?.given ?? "";
      input.disabled = true;
    }
    const submit = h("button", { class: "btn seafoam", type: "submit" }, "Check");
    if (missed) submit.disabled = true;
    const form = h("form", {}, input, submit);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const current = view.name === "quiz" ? view.quiz : null;
      if (!current || !input.value.trim()) return;
      const next = submitAnswer(current, input.value, now());
      view = { name: "quiz", quiz: next };
      if (next.phase === "passed") void passed();
      else {
        focusSelector = next.phase === "missed" ? "[data-action=next]" : "input";
        render();
      }
    });
    out.push(form);

    if (missed && quiz.last) {
      feedback.classList.add("bad");
      feedback.append("Not quite. The answer was:", h("span", { class: "answer" }, quiz.last.card.back));
      const next = h("button", { class: "btn", type: "button", "data-action": "next" }, "Try another card");
      next.addEventListener("click", () => {
        if (view.name !== "quiz") return;
        view = { name: "quiz", quiz: nextCard(view.quiz, now()) };
        focusSelector = "input";
        render();
      });
      out.push(feedback, h("div", { class: "actions" }, next));
    } else {
      if (quiz.last?.accepted) {
        feedback.classList.add("good");
        const left = quiz.required - quiz.correct;
        feedback.append(`${quiz.last.grade.verdict === "close" ? "Close enough, aye!" : "Aye, that's right!"} ${plural(left, "more card")} to go.`);
      }
      out.push(feedback);
    }
    return out;
  }

  function doneView(): Node[] {
    if (view.name === "passed") {
      return [
        h(
          "div",
          { class: "done", role: "status" },
          h("strong", {}, "Leisure pass granted!"),
          `Enjoy ${GATE_LEISURE_MINUTES} minutes on ${options.site}. The Lookout is back on watch at ${clock(view.until)}.`,
        ),
      ];
    }
    if (view.name === "steered") {
      const { doubloons } = view.result;
      const pay = doubloons > 0 ? h("span", { class: "gold" }, `+${doubloons} doubloons`) : null;
      return [
        h(
          "div",
          { class: "done steered", role: "status" },
          h("strong", {}, "Steered back to the ship!"),
          pay ? pay : "The steer-back bonus pays once every 10 minutes, so no doubloons this time.",
          pay ? " are waiting aboard Ship." : "",
          h("br"),
          "This tab stays docked until the focus block ends.",
        ),
      ];
    }
    return [h("div", { class: "done steered", role: "status" }, h("strong", {}, "Setting sail for Ship…"), "Hold tight.")];
  }

  function render() {
    renderVoyageLine();
    const nodes = view.name === "choices" ? choicesView() : view.name === "quiz" ? quizView(view.quiz) : doneView();
    panel.replaceChildren(...nodes);
    if (focusSelector) {
      const target = panel.querySelector<HTMLElement>(`${focusSelector}:not([disabled])`);
      target?.focus();
      focusSelector = null;
    }
  }

  async function steerBack() {
    if (busy) return;
    busy = true;
    view = { name: "sailing" };
    render();
    const result = await options.client.steerBack();
    busy = false;
    // When this tab is being sent to Ship the page is about to go away; keep "Setting sail".
    if (result?.focusedExistingTab) view = { name: "steered", result };
    else if (!result) view = { name: "choices" };
    render();
  }

  async function passed() {
    if (busy) return;
    busy = true;
    const result = await options.client.passed();
    busy = false;
    if (!result) {
      view = { name: "choices" };
      render();
      return;
    }
    view = { name: "passed", until: result.passUntil };
    render();
    const timer = setTimeout(() => options.onPassed?.(result.passUntil), 1600);
    cleanups.push(() => clearTimeout(timer));
  }

  // Keep Tab inside the dialog.
  root.addEventListener("keydown", (e) => {
    const ke = e as KeyboardEvent;
    if (ke.key !== "Tab") return;
    const focusables = [...root.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])")];
    if (!focusables.length) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = root.activeElement;
    if (ke.shiftKey && (active === first || !active)) {
      ke.preventDefault();
      last.focus();
    } else if (!ke.shiftKey && (active === last || !active)) {
      ke.preventDefault();
      first.focus();
    }
  });

  // Fullscreen video would sit above any z-index.
  const exitFullscreen = () => {
    if (doc.fullscreenElement) void doc.exitFullscreen().catch(() => undefined);
  };
  doc.addEventListener("fullscreenchange", exitFullscreen);
  cleanups.push(() => doc.removeEventListener("fullscreenchange", exitFullscreen));
  exitFullscreen();

  // Make the page inert and unscrollable while the gate is up.
  const applyInert = () => {
    const target = options.inertTarget === undefined ? doc.body : options.inertTarget;
    if (!target) return;
    const was = target.inert;
    target.inert = true;
    cleanups.push(() => {
      target.inert = was;
    });
  };
  if (options.inertTarget === undefined && !doc.body) {
    const onReady = () => applyInert();
    doc.addEventListener("DOMContentLoaded", onReady, { once: true });
    cleanups.push(() => doc.removeEventListener("DOMContentLoaded", onReady));
  } else applyInert();
  if (fullPage) {
    const html = doc.documentElement;
    const overflow = html.style.getPropertyValue("overflow");
    const priority = html.style.getPropertyPriority("overflow");
    html.style.setProperty("overflow", "hidden", "important");
    cleanups.push(() => html.style.setProperty("overflow", overflow, priority));
  }

  const ticker = setInterval(renderVoyageLine, 15_000);
  cleanups.push(() => clearInterval(ticker));

  container.append(host);
  render();
  void options.client.cards().then((list) => {
    cards = list;
    if (view.name === "choices") {
      // Still the opening view, so focus can move to the first choice.
      focusSelector = ".choice";
      render();
    }
  });

  return {
    host,
    destroy() {
      for (const fn of cleanups.splice(0)) fn();
      host.remove();
    },
  };
}

export interface LookoutToast {
  set(text: string, detail?: string, ok?: boolean): void;
  remove(): void;
}

/** A small corner note: "checking this video…", then "cleared to watch". */
export function mountToast(text: string, container: Element = document.documentElement): LookoutToast {
  const doc = container.ownerDocument;
  const host = doc.createElement("ship-lookout-toast");
  setImportant(host, { position: "fixed", inset: "auto 0 0 auto", "z-index": "2147483646", display: "block" });
  const root = host.attachShadow({ mode: "closed" });
  const style = doc.createElement("style");
  style.textContent = GATE_CSS;
  const box = doc.createElement("div");
  box.className = "toast";
  box.setAttribute("role", "status");
  const label = doc.createElement("div");
  box.append(icon(doc, SPYGLASS_ICON), label);
  root.append(style, box);
  container.append(host);
  const toast: LookoutToast = {
    set(t, detail, ok = false) {
      label.replaceChildren(t);
      if (detail) {
        const small = doc.createElement("small");
        small.textContent = detail;
        label.append(small);
      }
      box.classList.toggle("ok", ok);
    },
    remove() {
      host.remove();
    },
  };
  toast.set(text);
  return toast;
}
