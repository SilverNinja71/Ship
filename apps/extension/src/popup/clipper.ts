// The popup's Web Clipper: clip the page (or the selected text) as Markdown,
// in the same shape as Obsidian's own Web Clipper, then save it to Ship's Note
// Nook, send it to Obsidian, copy it or download it. It lives outside the part
// of the popup that redraws every second, so what the sailor types stays put.

import { clipToMarkdown, safeFileName } from "@ship/integrations";
import { obsidianNewNoteUrl } from "../core/clips.js";
import type { PageClip } from "../content/clipper.js";
import type { PopupState } from "../shared/messages.js";
import { sendToBackground } from "../shared/runtime.js";

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(doc: Document, label: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = el(doc, "button", `btn small ${className}`, label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

/** Runs the page-side clipper in the active tab and returns what it read. */
async function clipActiveTab(): Promise<{ clip: PageClip; tabId: number }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/i.test(tab.url ?? "")) throw new Error("Only web pages can be clipped (not browser or extension pages).");
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content/clipper.js"] });
  const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => globalThis.__shipClipPage?.() ?? null });
  const clip = result?.result as PageClip | null | undefined;
  if (!clip?.content) throw new Error("The Lookout couldn't find any text on this page.");
  return { clip, tabId: tab.id };
}

export function startClipper(doc: Document, root: HTMLElement, settings: () => PopupState | null): void {
  const status = el(doc, "p", "small muted clip-status");
  status.setAttribute("aria-live", "polite");
  const say = (text: string, tone: "" | "good" | "bad" = "") => {
    status.className = `small clip-status ${tone || "muted"}`;
    status.textContent = text;
  };

  const idle = () => {
    const clipBtn = button(doc, "✂ Clip this page", "seafoam", () => void run());
    root.replaceChildren(
      el(doc, "p", "clip-title", "Web Clipper"),
      el(doc, "p", "small muted", "Saves the article as Markdown for Ship's Note Nook or Obsidian. Select text first to clip just that part."),
      clipBtn,
      status,
    );
    const run = async () => {
      clipBtn.disabled = true;
      say("Reading the page…");
      try {
        const { clip, tabId } = await clipActiveTab();
        editor(clip, tabId);
      } catch (e) {
        clipBtn.disabled = false;
        say(e instanceof Error ? e.message : String(e), "bad");
      }
    };
  };

  const editor = (clip: PageClip, tabId: number) => {
    const title = el(doc, "input", "clip-input");
    title.value = clip.title;
    title.setAttribute("aria-label", "Title");
    const tags = el(doc, "input", "clip-input");
    tags.placeholder = "Tags, e.g. biology, unit-2";
    tags.setAttribute("aria-label", "Tags");
    const body = el(doc, "textarea", "clip-body");
    body.value = clip.content;
    body.rows = 9;
    body.setAttribute("aria-label", "Clipped text (Markdown)");

    const markdown = () =>
      clipToMarkdown({
        title: title.value.trim() || clip.title,
        url: clip.url,
        content: body.value,
        author: clip.author,
        published: clip.published,
        description: clip.description,
        siteName: clip.siteName,
        tags: tags.value.split(/[,\s]+/).filter(Boolean),
        created: Date.now(),
      });

    const save = async () => {
      const reply = await sendToBackground({ t: "save-clip", clip: { id: crypto.randomUUID(), title: title.value.trim() || clip.title, url: clip.url, markdown: markdown(), at: Date.now() } });
      if (!reply) return say("The Lookout couldn't keep that clip.", "bad");
      say(reply.waiting > 1 ? `Saved. Ship picks up ${reply.waiting} clips next time it's open.` : "Saved. It's in the Note Nook as soon as Ship is open.", "good");
    };
    const toObsidian = async () => {
      const s = settings();
      try {
        // Copied first: a whole article doesn't fit in a link, so Obsidian reads it from the clipboard.
        await navigator.clipboard.writeText(markdown());
        await chrome.tabs.update(tabId, { url: obsidianNewNoteUrl(safeFileName(title.value || clip.title), s?.clipFolder ?? "Clippings", s?.obsidianVault ?? "") });
        say("Sent. Obsidian opens with the new note (it needs to be installed).", "good");
      } catch (e) {
        say(`Couldn't send it: ${e instanceof Error ? e.message : String(e)}`, "bad");
      }
    };
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(markdown());
        say("Copied as Markdown.", "good");
      } catch {
        say("The browser wouldn't copy it.", "bad");
      }
    };
    const download = () => {
      const url = URL.createObjectURL(new Blob([markdown()], { type: "text/markdown;charset=utf-8" }));
      const a = el(doc, "a");
      a.href = url;
      a.download = `${safeFileName(title.value || clip.title)}.md`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    };

    const info = [clip.siteName, clip.author, `${clip.words} words`, clip.selection ? "selection" : null].filter(Boolean).join(" · ");
    const primary = el(doc, "div", "clip-actions");
    primary.append(button(doc, "Save to Ship", "seafoam", () => void save()), button(doc, "Send to Obsidian", "obsidian", () => void toObsidian()));
    const secondary = el(doc, "div", "clip-actions");
    secondary.append(button(doc, "Copy", "ghost", () => void copy()), button(doc, "Download .md", "ghost", download), button(doc, "Start over", "ghost", idle));
    root.replaceChildren(el(doc, "p", "clip-title", "Web Clipper"), title, el(doc, "p", "small muted", info), body, tags, primary, secondary, status);
    say("");
  };

  idle();
}
