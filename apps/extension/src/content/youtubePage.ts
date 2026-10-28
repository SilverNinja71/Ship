// Reads a YouTube watch page into a VideoInspection. YouTube is a single-page
// app: after an in-page navigation the <meta> tags still describe the first
// video, so the rendered watch metadata comes first and the meta tags are
// only trusted when the canonical link names this video.

import type { VideoInspection } from "@ship/shared-types";

/** "(3) Enzyme Kinetics - YouTube" becomes "Enzyme Kinetics". */
export function cleanYouTubeTitle(documentTitle: string): string {
  return documentTitle
    .replace(/^\(\d+\+?\)\s*/, "")
    .replace(/\s*-\s*YouTube$/, "")
    .trim();
}

export function collapse(text: string | null | undefined, max: number): string {
  return (text ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

const firstText = (doc: Document, selectors: string[]) => {
  for (const sel of selectors) {
    const t = collapse(doc.querySelector(sel)?.textContent, 300);
    if (t) return t;
  }
  return "";
};

const meta = (doc: Document, selector: string) => collapse(doc.querySelector(selector)?.getAttribute("content"), 2000);

/** True once the rendered page shows this video, so reading it now won't pick up the previous one. */
export function watchPageReady(doc: Document, videoId: string): boolean {
  const flexy = doc.querySelector("ytd-watch-flexy");
  if (flexy) return flexy.getAttribute("video-id") === videoId && !!firstText(doc, ["ytd-watch-metadata h1"]);
  // Mobile and other layouts: settle for the tab title.
  return cleanYouTubeTitle(doc.title).length > 0;
}

export function readInspection(doc: Document, videoId: string): VideoInspection {
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "";
  const metaIsCurrent = canonical.includes(videoId);

  let title = firstText(doc, ["ytd-watch-metadata h1", "#title h1", "h1.title"]);
  if (!title && metaIsCurrent) title = meta(doc, 'meta[name="title"]') || meta(doc, 'meta[property="og:title"]');
  if (!title) title = cleanYouTubeTitle(doc.title);

  let channel = firstText(doc, ["ytd-watch-metadata ytd-channel-name a", "#owner ytd-channel-name a", "#upload-info #channel-name a"]);
  if (!channel && metaIsCurrent) channel = collapse(doc.querySelector('span[itemprop="author"] link[itemprop="name"]')?.getAttribute("content"), 120);

  let description = collapse(doc.querySelector("ytd-watch-metadata #description-inline-expander, ytd-watch-metadata #description")?.textContent, 2000);
  if (!description && metaIsCurrent) description = meta(doc, 'meta[name="description"]') || meta(doc, 'meta[property="og:description"]');

  return {
    videoId,
    title,
    channel,
    description,
    // Transcripts need YouTube's signed caption URLs; title, description and thumbnail are enough to judge.
    transcriptExcerpt: null,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
  };
}
