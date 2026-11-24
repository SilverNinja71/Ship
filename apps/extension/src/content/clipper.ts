// The Web Clipper's page side. The popup injects this into the page the sailor
// is looking at (only when they click "Clip this page"; the activeTab
// permission allows exactly that tab, exactly then), then calls
// __shipClipPage(). It reads the article the way a browser's reader view does
// (Mozilla's Readability), or just the selected text when there is some, and
// turns it into Markdown with Turndown. Nothing here changes the page.

import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

export interface PageClip {
  title: string;
  url: string;
  /** The article (or selection) as Markdown. */
  content: string;
  author: string | null;
  published: string | null;
  description: string | null;
  siteName: string | null;
  /** True when only the selected text was clipped. */
  selection: boolean;
  words: number;
}

declare global {
  var __shipClipPage: (() => PageClip) | undefined;
}

function meta(...names: string[]): string | null {
  for (const name of names) {
    const content = document.querySelector(`meta[property="${name}"], meta[name="${name}"], meta[itemprop="${name}"]`)?.getAttribute("content")?.trim();
    if (content) return content;
  }
  return null;
}

/** The selection as HTML, or null when nothing (or only spaces) is selected. */
function selectionHtml(): string | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.toString().trim()) return null;
  const box = document.createElement("div");
  for (let i = 0; i < sel.rangeCount; i++) box.append(sel.getRangeAt(i).cloneContents());
  return box.innerHTML;
}

/** Parsed into an inert document: nothing in it runs or loads. */
function inert(html: string): HTMLElement {
  return new DOMParser().parseFromString(html, "text/html").body;
}

/** Links and images point at the real page, not at the clip. */
function absolutize(root: HTMLElement): void {
  const fix = (el: Element, attr: string) => {
    const value = el.getAttribute(attr);
    if (!value) return;
    try {
      el.setAttribute(attr, new URL(value, document.baseURI).href);
    } catch {
      el.removeAttribute(attr);
    }
  };
  for (const a of root.querySelectorAll("a[href]")) fix(a, "href");
  for (const img of root.querySelectorAll("img")) {
    // Lazy-loading sites keep the real picture in data-src.
    const lazy = img.getAttribute("data-src") ?? img.getAttribute("data-original");
    if (lazy && !img.getAttribute("src")?.startsWith("http")) img.setAttribute("src", lazy);
    fix(img, "src");
    img.removeAttribute("srcset");
  }
}

function toMarkdown(root: HTMLElement): string {
  const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-", emDelimiter: "*", hr: "---" });
  turndown.use(gfm);
  turndown.remove(["script", "style", "noscript", "iframe", "form", "button", "input", "select", "textarea", "canvas", "video", "audio"]);
  turndown.remove((node) => node.nodeName.toLowerCase() === "svg");
  // Images with no address, or tracking pixels, add nothing.
  turndown.addRule("emptyImages", {
    filter: (node) => node.nodeName === "IMG" && !/^https?:/i.test((node as HTMLImageElement).getAttribute("src") ?? ""),
    replacement: () => "",
  });
  return turndown
    .turndown(root)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** "How Cells Make Energy | Bio Garden" becomes "How Cells Make Energy" when that's the page's main heading. */
function cleanTitle(raw: string): string {
  const title = raw.replace(/\s+/g, " ").trim();
  const h1 = document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim();
  return h1 && title.length > h1.length && title.startsWith(h1) && /^\s*[|·•—–:-]/.test(title.slice(h1.length)) ? h1 : title;
}

function clipPage(): PageClip {
  const picked = selectionHtml();
  // Readability edits the document it's given, so it gets a copy.
  const article = picked ? null : new Readability(document.cloneNode(true) as Document, { charThreshold: 300 }).parse();
  const body = inert(picked ?? article?.content ?? (document.querySelector("main, article") ?? document.body).innerHTML);
  absolutize(body);
  const content = toMarkdown(body);
  return {
    title: cleanTitle(meta("og:title", "twitter:title") ?? article?.title ?? document.title ?? "") || location.hostname,
    url: (document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href || location.href).split("#")[0]!,
    content,
    author: article?.byline?.trim() || meta("author", "article:author", "parsely-author") || null,
    published: article?.publishedTime || meta("article:published_time", "datePublished", "date", "pubdate") || document.querySelector("time[datetime]")?.getAttribute("datetime") || null,
    description: meta("description", "og:description", "twitter:description") ?? article?.excerpt ?? null,
    siteName: article?.siteName || meta("og:site_name") || location.hostname.replace(/^www\./, ""),
    selection: picked !== null,
    words: content.split(/\s+/).filter(Boolean).length,
  };
}

globalThis.__shipClipPage = clipPage;
