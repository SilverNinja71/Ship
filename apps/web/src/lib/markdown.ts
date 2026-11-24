// Markdown the way Obsidian shows it: [[wikilinks]] and ![[embeds]], callouts
// (> [!tip]), task checkboxes, ==highlights==, #tags, %%comments%% hidden,
// heading anchors, and line breaks kept. Raw HTML in a note is shown as text,
// never run, so a clipped page can't put scripts or trackers into Ship.

import MarkdownIt from "markdown-it";
import type { StateCore, StateInline, Token } from "markdown-it";
import { parseFrontmatter } from "@ship/integrations";
import type { PropertyValue } from "@ship/integrations";

/** Obsidian's callout types, folded onto the ones with their own look. */
const CALLOUTS: Record<string, { label: string; icon: string; kind: string }> = {
  note: { label: "Note", icon: "✎", kind: "note" },
  abstract: { label: "Abstract", icon: "☰", kind: "info" },
  summary: { label: "Summary", icon: "☰", kind: "info" },
  tldr: { label: "TL;DR", icon: "☰", kind: "info" },
  info: { label: "Info", icon: "ℹ", kind: "info" },
  todo: { label: "To do", icon: "☐", kind: "info" },
  tip: { label: "Tip", icon: "✦", kind: "tip" },
  hint: { label: "Hint", icon: "✦", kind: "tip" },
  important: { label: "Important", icon: "✦", kind: "tip" },
  success: { label: "Success", icon: "✓", kind: "success" },
  check: { label: "Check", icon: "✓", kind: "success" },
  done: { label: "Done", icon: "✓", kind: "success" },
  question: { label: "Question", icon: "?", kind: "question" },
  help: { label: "Help", icon: "?", kind: "question" },
  faq: { label: "FAQ", icon: "?", kind: "question" },
  warning: { label: "Warning", icon: "!", kind: "warning" },
  caution: { label: "Caution", icon: "!", kind: "warning" },
  attention: { label: "Attention", icon: "!", kind: "warning" },
  failure: { label: "Failure", icon: "✕", kind: "danger" },
  fail: { label: "Fail", icon: "✕", kind: "danger" },
  missing: { label: "Missing", icon: "✕", kind: "danger" },
  danger: { label: "Danger", icon: "⚡", kind: "danger" },
  error: { label: "Error", icon: "⚡", kind: "danger" },
  bug: { label: "Bug", icon: "✕", kind: "danger" },
  example: { label: "Example", icon: "❖", kind: "example" },
  quote: { label: "Quote", icon: "❝", kind: "quote" },
  cite: { label: "Quote", icon: "❝", kind: "quote" },
};

const IMAGE = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;

export function headingSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

/** [[target#heading|alias]] and ![[embed]]. */
function wikilinkRule(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  const embed = state.src.charCodeAt(start) === 0x21; /* ! */
  const open = embed ? start + 1 : start;
  if (state.src.slice(open, open + 2) !== "[[") return false;
  const end = state.src.indexOf("]]", open + 2);
  if (end < 0) return false;
  const inner = state.src.slice(open + 2, end);
  if (!inner.trim() || inner.includes("\n") || inner.includes("[[")) return false;
  if (!silent) {
    const [link = "", alias] = inner.split("|");
    const [target = "", heading] = link.split("#");
    const token = state.push("wikilink", "", 0);
    token.meta = { target: target.trim(), heading: heading?.trim() || null, alias: alias?.trim() || null, embed };
  }
  state.pos = end + 2;
  return true;
}

/** ==highlight==, with Markdown allowed inside. */
function highlightRule(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  if (state.src.slice(start, start + 2) !== "==" || state.src.charCodeAt(start + 2) === 0x3d) return false;
  const end = state.src.indexOf("==", start + 2);
  if (end < 0 || end === start + 2 || end > state.posMax) return false;
  if (!silent) {
    state.push("mark_open", "mark", 1);
    const max = state.posMax;
    state.pos = start + 2;
    state.posMax = end;
    state.md.inline.tokenize(state);
    state.posMax = max;
    state.push("mark_close", "mark", -1);
  }
  state.pos = end + 2;
  return true;
}

/** #tag, as Obsidian reads it: after a space or the start, not all digits. */
function tagRule(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  if (state.src.charCodeAt(start) !== 0x23 /* # */) return false;
  if (start > 0 && !/[\s(]/.test(state.src[start - 1]!)) return false;
  const m = /^#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)/u.exec(state.src.slice(start, state.posMax));
  if (!m || /^\d+$/.test(m[1]!)) return false;
  if (!silent) state.push("tag", "", 0).meta = { tag: m[1] };
  state.pos = start + m[0].length;
  return true;
}

/** > [!type] Title turns a blockquote into a callout. Runs before inline parsing so the title line can be lifted out. */
function calloutRule(state: StateCore): void {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length - 2; i++) {
    if (tokens[i]!.type !== "blockquote_open" || tokens[i + 1]!.type !== "paragraph_open" || tokens[i + 2]!.type !== "inline") continue;
    const inline = tokens[i + 2]!;
    const m = /^\[!([\w-]+)\]([+-]?)[ \t]*(.*)$/m.exec(inline.content.split("\n")[0] ?? "");
    if (!m) continue;
    const type = m[1]!.toLowerCase();
    const def = CALLOUTS[type] ?? { label: type.charAt(0).toUpperCase() + type.slice(1), icon: "✎", kind: "note" };
    tokens[i]!.attrSet("class", `callout callout-${def.kind}`);
    tokens[i]!.attrSet("data-callout", type);
    const title = new state.Token("callout_title", "", 0);
    title.meta = { icon: def.icon, title: m[3]!.trim() || def.label };
    const rest = inline.content.split("\n").slice(1).join("\n");
    if (rest.trim()) {
      inline.content = rest;
      tokens.splice(i + 1, 0, title);
    } else {
      tokens.splice(i + 1, 3, title);
    }
  }
}

/** - [ ] and - [x] list items get a checkbox. Also before inline parsing, to take the marker out of the text. */
function taskRule(state: StateCore): void {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length - 2; i++) {
    if (tokens[i]!.type !== "list_item_open" || tokens[i + 1]!.type !== "paragraph_open" || tokens[i + 2]!.type !== "inline") continue;
    const inline = tokens[i + 2]!;
    const m = /^\[([ xX/-])\][ \t]+/.exec(inline.content);
    if (!m) continue;
    inline.content = inline.content.slice(m[0].length);
    tokens[i]!.meta = { task: m[1] !== " " };
    tokens[i]!.attrJoin("class", "task-list-item");
  }
}

/** Ids on headings, so a [[Note#Heading]] link can scroll to one. */
function headingIds(state: StateCore): void {
  const seen = new Map<string, number>();
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i]!.type !== "heading_open") continue;
    const base = headingSlug(tokens[i + 1]!.content) || "section";
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    tokens[i]!.attrSet("id", n ? `${base}-${n}` : base);
  }
}

function build(): MarkdownIt {
  const md = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: false });
  md.inline.ruler.before("link", "wikilink", wikilinkRule);
  md.inline.ruler.before("emphasis", "highlight", highlightRule);
  md.inline.ruler.after("entity", "tag", tagRule);
  md.core.ruler.after("block", "callouts", calloutRule);
  md.core.ruler.after("callouts", "tasks", taskRule);
  md.core.ruler.after("inline", "heading_ids", headingIds);

  const esc = md.utils.escapeHtml;
  md.renderer.rules.wikilink = (tokens: Token[], idx: number) => {
    const { target, heading, alias, embed } = tokens[idx]!.meta as { target: string; heading: string | null; alias: string | null; embed: boolean };
    const label = alias ?? (heading ? `${target}${target ? " › " : ""}${heading}` : target);
    if (embed && IMAGE.test(target)) return `<span class="md-embed" data-embed="${esc(target)}">▣ ${esc(alias ?? target)}</span>`;
    return `<a href="#" class="md-wikilink${embed ? " md-embed-link" : ""}" data-wikilink="${esc(target)}"${heading ? ` data-heading="${esc(heading)}"` : ""}>${embed ? "↪ " : ""}${esc(label)}</a>`;
  };
  md.renderer.rules.tag = (tokens: Token[], idx: number) => {
    const tag = (tokens[idx]!.meta as { tag: string }).tag;
    return `<a href="#" class="md-tag" data-tag="${esc(tag)}">#${esc(tag)}</a>`;
  };
  md.renderer.rules.callout_title = (tokens: Token[], idx: number) => {
    const { icon, title } = tokens[idx]!.meta as { icon: string; title: string };
    return `<div class="callout-title"><span aria-hidden="true">${esc(icon)}</span> ${md.renderInline(title)}</div>`;
  };
  const listItem = md.renderer.rules.list_item_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.list_item_open = (tokens, idx, options, env, self) => {
    const html = listItem(tokens, idx, options, env, self);
    const meta = tokens[idx]!.meta as { task?: boolean } | null;
    return meta && typeof meta.task === "boolean" ? `${html}<input type="checkbox" class="md-task" disabled${meta.task ? " checked" : ""}> ` : html;
  };
  const linkOpen = md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const href = tokens[idx]!.attrGet("href") ?? "";
    if (/^https?:/i.test(href)) {
      tokens[idx]!.attrSet("target", "_blank");
      tokens[idx]!.attrSet("rel", "noopener noreferrer");
    }
    return linkOpen(tokens, idx, options, env, self);
  };
  const image = md.renderer.rules.image!;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    tokens[idx]!.attrSet("loading", "lazy");
    tokens[idx]!.attrSet("referrerpolicy", "no-referrer");
    return image(tokens, idx, options, env, self);
  };
  return md;
}

let renderer: MarkdownIt | null = null;

/** %%comments%% are Obsidian's private notes to self: hidden, as in reading view. Code is left alone. */
function stripComments(markdown: string): string {
  return markdown.replace(/(```[\s\S]*?```|`[^`\n]*`)|%%[\s\S]*?%%/g, (whole, code: string | undefined) => code ?? "");
}

export interface RenderedNote {
  html: string;
  properties: Record<string, PropertyValue>;
}

/** A note's Markdown as safe HTML, with its properties block read out separately. */
export function renderMarkdown(markdown: string): RenderedNote {
  renderer ??= build();
  const { properties, body } = parseFrontmatter(markdown);
  return { html: renderer.render(stripComments(body)), properties };
}
