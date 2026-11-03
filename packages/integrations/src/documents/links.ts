// Links pasted into the Fleet Log. YouTube videos and web pages go to Gemini.
// Google Docs, Slides and Sheets, which Gemini can't open, go through the
// sailor's Google Drive connection instead.

import type { FetchLike, ImportResult, NoteDocument } from "@ship/shared-types";
import { GOOGLE_DRIVE_FILES_URL, exportGoogleDocText } from "../googleDrive.js";
import { requestJson, withQuery } from "../http.js";
import { describeGeminiFailure, readWebLinkWithGemini, readYouTubeWithGemini } from "./geminiNotes.js";
import type { GeminiNotes, GeminiReader } from "./geminiNotes.js";
import { splitLongPage } from "./pages.js";

export type ParsedLink =
  | { kind: "youtube"; url: string; videoId: string }
  /** A YouTube channel or playlist, rather than one video. */
  | { kind: "youtube-other"; url: string }
  | { kind: "google"; url: string; fileId: string; exportAs: string }
  /** An uploaded file in Drive, which has no text export. */
  | { kind: "drive-file"; url: string }
  | { kind: "web"; url: string };

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "www.youtube-nocookie.com"]);
const VIDEO_ID = /^[\w-]{6,20}$/;
const GOOGLE_FILE = /^\/(document|presentation|spreadsheets)(?:\/u\/\d+)?\/d\/([\w-]{20,})/;

/** Tolerates a missing https:// and punctuation picked up when copying. Null if it isn't a usable web address. */
export function parseLink(text: string): ParsedLink | null {
  const trimmed = text.trim().replace(/[),.;:'"]+$/, "");
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password || !url.hostname.includes(".")) return null;

  const host = url.hostname.toLowerCase();
  if (host === "youtu.be" || YOUTUBE_HOSTS.has(host)) {
    const [first, second] = url.pathname.split("/").filter(Boolean);
    const id = host === "youtu.be" ? first : first === "watch" ? url.searchParams.get("v") : ["shorts", "live", "embed", "v"].includes(first ?? "") ? second : null;
    if (id && VIDEO_ID.test(id)) return { kind: "youtube", url: `https://www.youtube.com/watch?v=${id}`, videoId: id };
    return { kind: "youtube-other", url: url.href };
  }
  if (host === "docs.google.com") {
    const match = GOOGLE_FILE.exec(url.pathname);
    if (match) return { kind: "google", url: url.href, fileId: match[2], exportAs: match[1] === "spreadsheets" ? "text/csv" : "text/plain" };
  }
  if (host === "drive.google.com" && url.pathname.startsWith("/file/")) return { kind: "drive-file", url: url.href };
  return { kind: "web", url: url.href };
}

export interface ImportLinkOptions {
  fetch: FetchLike;
  /** Null when the sailor hasn't added a Gemini key. */
  gemini: GeminiReader | null;
  /** Null when Google Drive isn't connected. */
  googleToken?: string | null;
}

const NEEDS_KEY = "Reading links needs a Gemini key. Add one in Settings, then try again.";
const AI_WROTE_THIS = "Gemini wrote these notes, so check anything important against the original.";

const empty = (): ImportResult => ({ notes: [], decks: [], cards: [], assignments: [], warnings: [] });

function linkNote(id: string, title: string, url: string, pages: NoteDocument["pages"]): NoteDocument {
  return { id, source: "file", title, subject: null, created: null, modified: null, pages, url };
}

/** The video's real title, and an early answer for a video that doesn't exist. */
async function youtubeTitle(fetch: FetchLike, url: string): Promise<string | null> {
  try {
    const res = await fetch(withQuery("https://www.youtube.com/oembed", { url, format: "json" }));
    if (res.status === 404) throw new Error("YouTube can't find that video.");
    if (!res.ok) return null; // private, or with embedding turned off: let Gemini decide
    const body = await res.json();
    const title = typeof body === "object" && body !== null ? (body as { title?: unknown }).title : null;
    return typeof title === "string" && title.trim() ? title.trim() : null;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("YouTube")) throw e;
    return null;
  }
}

async function importGoogleFile(link: Extract<ParsedLink, { kind: "google" }>, options: ImportLinkOptions, result: ImportResult): Promise<void> {
  const token = options.googleToken;
  if (!token) {
    result.warnings.push("Gemini can't open Google Docs, Slides or Sheets. Connect Google Drive under Connections, or download it as a PDF and upload that.");
    return;
  }
  const text = await exportGoogleDocText(options.fetch, token, link.fileId, link.exportAs);
  const paragraphs = text.split(/\r?\n\s*\r?\n|\r?\n/).map((p) => p.trim()).filter(Boolean);
  const pages = splitLongPage(paragraphs).map((page, i) => ({ id: `${i + 1}`, text: page.join("\n") }));
  if (pages.length === 0) {
    result.warnings.push("It has no text to read, so nothing was imported.");
    return;
  }
  let title = "Google file";
  try {
    const { data } = await requestJson(options.fetch, withQuery(`${GOOGLE_DRIVE_FILES_URL}/${encodeURIComponent(link.fileId)}`, { fields: "name" }), { method: "GET", headers: { Authorization: `Bearer ${token}` } });
    const name = typeof data === "object" && data !== null ? (data as { name?: unknown }).name : null;
    if (typeof name === "string" && name.trim()) title = name.trim();
  } catch {
    // The text is what matters; a plain title will do.
  }
  result.notes.push(linkNote(`google:${link.fileId}`, title, link.url, pages));
}

function addGeminiNote(result: ImportResult, id: string, title: string | null, url: string, notes: GeminiNotes): void {
  result.notes.push(linkNote(id, title ?? notes.title ?? new URL(url).hostname, url, notes.pages));
  result.warnings.push(AI_WROTE_THIS);
}

/** Never throws; problems come back as warnings. */
export async function importLink(text: string, options: ImportLinkOptions): Promise<ImportResult> {
  const result = empty();
  const link = parseLink(text);
  if (!link) {
    result.warnings.push("That isn't a web address.");
    return result;
  }
  try {
    switch (link.kind) {
      case "youtube-other":
        result.warnings.push("That's a channel or playlist. Paste a link to one video.");
        break;
      case "drive-file":
        result.warnings.push("That's a file stored in Google Drive, which can't be read from a link. Download it and upload the file instead.");
        break;
      case "google":
        await importGoogleFile(link, options, result);
        break;
      case "youtube": {
        const title = await youtubeTitle(options.fetch, link.url);
        if (!options.gemini) result.warnings.push(NEEDS_KEY);
        else addGeminiNote(result, `youtube:${link.videoId}`, title, link.url, await readYouTubeWithGemini(options.gemini, link.url));
        break;
      }
      case "web":
        if (!options.gemini) result.warnings.push(NEEDS_KEY);
        else addGeminiNote(result, `link:${link.url}`, null, link.url, await readWebLinkWithGemini(options.gemini, link.url));
        break;
    }
  } catch (e) {
    result.warnings.push(link.kind === "google" ? `Google wouldn't share it. Check that you can open it, and reconnect Google Drive if needed. (${describeGeminiFailure(e)})` : describeGeminiFailure(e));
  }
  return result;
}
