// Google Drive v3 for the Captain's Library: list files and pull plain text
// out of Google Docs (and Slides) via export. Takes an OAuth access token;
// getting one (the Google Identity Services popup, with the user's own
// client ID) is the web app's job.

import type { FetchLike, IntegrationSettings, LibraryItem } from "@ship/shared-types";
import { bearer, getCursorPaged, mapWithConcurrency, requestText, withQuery } from "./http.js";
import { asDict, asId, asText, systemClock } from "./values.js";
import type { Clock } from "./values.js";
import { parseDateString } from "./time.js";

/** Read-only access to file contents; enough for listing and Docs export. */
export const GOOGLE_DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

export const GOOGLE_DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";

export const GOOGLE_MIME = {
  doc: "application/vnd.google-apps.document",
  slides: "application/vnd.google-apps.presentation",
  sheet: "application/vnd.google-apps.spreadsheet",
  folder: "application/vnd.google-apps.folder",
  pdf: "application/pdf",
} as const;

const SERVICE = "Google Drive";
const FILE_FIELDS = "id,name,mimeType,webViewLink,modifiedTime";

export interface DriveQueryOptions {
  /** Only files directly inside this folder. */
  folderId?: string;
  mimeTypes?: readonly string[];
  nameContains?: string;
  includeTrashed?: boolean;
  includeFolders?: boolean;
}

/** Drive's query strings quote values with single quotes and escape `'` and `\`. */
function quote(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

/** Builds a Drive `q` string, e.g. Docs in a folder that aren't trashed. */
export function driveQuery(options: DriveQueryOptions = {}): string {
  const clauses: string[] = [];
  if (!options.includeTrashed) clauses.push("trashed = false");
  if (options.folderId) clauses.push(`${quote(options.folderId)} in parents`);
  if (options.nameContains) clauses.push(`name contains ${quote(options.nameContains)}`);
  if (options.mimeTypes?.length) {
    clauses.push(`(${options.mimeTypes.map((m) => `mimeType = ${quote(m)}`).join(" or ")})`);
  } else if (!options.includeFolders) {
    clauses.push(`mimeType != ${quote(GOOGLE_MIME.folder)}`);
  }
  return clauses.join(" and ");
}

export interface DriveListOptions {
  /** A Drive query; defaults to `driveQuery()` (every non-trashed file). */
  q?: string;
  pageSize?: number;
  maxPages?: number;
  orderBy?: string;
  /** Include files from shared drives the user belongs to (school drives). */
  includeSharedDrives?: boolean;
}

export function mapDriveFile(raw: unknown): LibraryItem | null {
  const file = asDict(raw);
  const id = asId(file?.["id"]);
  if (!file || !id) return null;
  const modified = asText(file["modifiedTime"]);
  return {
    id: `google-drive:${id}`,
    source: "google-drive",
    title: asText(file["name"]) ?? "Untitled",
    mimeType: asText(file["mimeType"]) ?? "application/octet-stream",
    url: asText(file["webViewLink"]) ?? `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`,
    modifiedAt: modified ? parseDateString(modified) : null,
    text: null,
  };
}

/** Drive v3 files.list, following `nextPageToken`. Items come back with `text: null`. */
export async function listDriveFiles(
  fetch: FetchLike,
  accessToken: string,
  options: DriveListOptions = {},
): Promise<LibraryItem[]> {
  const shared = options.includeSharedDrives ?? true;
  const raw = await getCursorPaged(
    fetch,
    (pageToken) =>
      withQuery(GOOGLE_DRIVE_FILES_URL, {
        q: options.q ?? driveQuery(),
        fields: `nextPageToken,files(${FILE_FIELDS})`,
        pageSize: options.pageSize ?? 100,
        orderBy: options.orderBy ?? "modifiedTime desc",
        pageToken,
        supportsAllDrives: shared ? "true" : null,
        includeItemsFromAllDrives: shared ? "true" : null,
      }),
    { method: "GET", headers: bearer(accessToken) },
    { service: SERVICE, maxPages: options.maxPages ?? 10, itemsKey: "files", cursorKey: "nextPageToken" },
  );
  return raw.map(mapDriveFile).filter((item): item is LibraryItem => item !== null);
}

/** The text export format for a Google-native file, or null if it has none worth reading. */
export function textExportMimeType(mimeType: string): string | null {
  if (mimeType === GOOGLE_MIME.doc || mimeType === GOOGLE_MIME.slides) return "text/plain";
  if (mimeType === GOOGLE_MIME.sheet) return "text/csv";
  return null;
}

/** Exports a Google Doc (or Slides deck) as plain text. Drive caps exports at 10 MB. */
export async function exportGoogleDocText(
  fetch: FetchLike,
  accessToken: string,
  fileId: string,
  mimeType = "text/plain",
): Promise<string> {
  const url = withQuery(`${GOOGLE_DRIVE_FILES_URL}/${encodeURIComponent(fileId)}/export`, { mimeType });
  const text = await requestText(fetch, url, { method: "GET", headers: bearer(accessToken) }, SERVICE);
  return text.replace(/^﻿/, "");
}

/** Downloads an uploaded plain-text file (text/plain, text/markdown, ...). */
export async function downloadDriveText(fetch: FetchLike, accessToken: string, fileId: string): Promise<string> {
  const url = withQuery(`${GOOGLE_DRIVE_FILES_URL}/${encodeURIComponent(fileId)}`, { alt: "media" });
  const text = await requestText(fetch, url, { method: "GET", headers: bearer(accessToken) }, SERVICE);
  return text.replace(/^﻿/, "");
}

const remoteId = (item: LibraryItem) => item.id.replace(/^google-drive:/, "");

/** Lists files and (optionally) fills `text` for Docs, Slides and plain-text files. */
export async function fetchDriveLibrary(
  fetch: FetchLike,
  accessToken: string,
  options: DriveListOptions & { includeText?: boolean; concurrency?: number } = {},
): Promise<{ items: LibraryItem[]; warnings: string[] }> {
  const items = await listDriveFiles(fetch, accessToken, options);
  const warnings: string[] = [];
  if (!options.includeText) return { items, warnings };
  const withText = await mapWithConcurrency(items, options.concurrency ?? 4, async (item) => {
    const exportAs = textExportMimeType(item.mimeType);
    const isPlain = item.mimeType.startsWith("text/");
    if (!exportAs && !isPlain) return item;
    try {
      const text = exportAs
        ? await exportGoogleDocText(fetch, accessToken, remoteId(item), exportAs)
        : await downloadDriveText(fetch, accessToken, remoteId(item));
      return { ...item, text };
    } catch (e) {
      warnings.push(`Couldn't read the text of "${item.title}" (${e instanceof Error ? e.message : String(e)}).`);
      return item;
    }
  });
  return { items: withText, warnings };
}

export type GoogleDriveSettings = NonNullable<IntegrationSettings["googleDrive"]>;

/** Like fetchDriveLibrary, but checks the stored token first so an expired one asks for sign-in. */
export async function syncGoogleDrive(
  fetch: FetchLike,
  settings: GoogleDriveSettings,
  options: DriveListOptions & { includeText?: boolean; concurrency?: number; now?: Clock } = {},
): Promise<{ items: LibraryItem[]; warnings: string[] }> {
  const now = (options.now ?? systemClock)();
  if (!settings.accessToken) throw new Error("Sign in to Google Drive first.");
  if (settings.expiresAt !== null && settings.expiresAt <= now) {
    throw new Error("Your Google Drive sign-in expired. Sign in again.");
  }
  return fetchDriveLibrary(fetch, settings.accessToken, options);
}
