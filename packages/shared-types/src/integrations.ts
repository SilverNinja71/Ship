// The Fleet Log: what Canvas, Todoist, Lodestar, Google Drive, Parchment and
// Paper turn into once Ship has read them.

import type { Deck, Flashcard } from "./recall.js";

export type IntegrationId = "canvas" | "todoist" | "lodestar" | "google-drive" | "parchment" | "paper";

export type AssignmentKind = "assignment" | "quiz" | "exam" | "discussion" | "task" | "reading";

/** One thing to do with a date: a Canvas assignment, a Todoist task, a Lodestar task. */
export interface Assignment {
  /** Stable across syncs: `${source}:${remoteId}`. */
  id: string;
  source: IntegrationId;
  remoteId: string;
  title: string;
  course: string | null;
  /** CSS color for the course (Canvas custom colors / Better Canvas). */
  courseColor: string | null;
  /** Epoch ms, or null when there is no due date. */
  dueAt: number | null;
  kind: AssignmentKind;
  /** Share of the course grade this assignment's group carries, 0..100. */
  groupWeight: number | null;
  pointsPossible: number | null;
  url: string | null;
  completed: boolean;
  /** Todoist / Lodestar priority, 1 (low) .. 4 (urgent). */
  priority: number | null;
}

/** A file in the Captain's Library (Google Drive syllabi, slides, PDFs). */
export interface LibraryItem {
  id: string;
  source: IntegrationId;
  title: string;
  mimeType: string;
  url: string | null;
  modifiedAt: number | null;
  /** Plain text when we could get it (Google Docs export, Parchment pages). */
  text: string | null;
}

/** A notebook's readable text, e.g. from a `.parchment` archive. */
export interface NoteDocument {
  id: string;
  source: IntegrationId;
  title: string;
  subject: string | null;
  created: number | null;
  modified: number | null;
  pages: { id: string; text: string }[];
}

/** Everything an import of a file can produce. */
export interface ImportResult {
  notes: NoteDocument[];
  decks: Deck[];
  cards: Flashcard[];
  /** Dated items, e.g. from an .ics calendar export. */
  assignments: Assignment[];
  warnings: string[];
}

export interface IntegrationSettings {
  canvas: { baseUrl: string; token: string } | null;
  todoist: { token: string } | null;
  lodestar: { origin: string; token: string } | null;
  googleDrive: { clientId: string; accessToken: string | null; expiresAt: number | null } | null;
}

export interface IntegrationStatus {
  id: IntegrationId;
  connected: boolean;
  lastSyncAt: number | null;
  error: string | null;
}

/**
 * Integrations never call `fetch` directly; they take one of these, so the
 * web app can route requests through the crew server's relay (Canvas has no
 * CORS) and tests can fake the network.
 */
export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

/**
 * The crew server's relay, for APIs that block browser requests (Canvas).
 * POST {RELAY_PATH} with a RelayRequest; it answers with a RelayResponse.
 * It only forwards to hosts on its allowlist and only accepts localhost pages.
 */
export const RELAY_PATH = "/relay";

export interface RelayRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface RelayResponse {
  status: number;
  /** Only a few headers survive the relay: content-type and link (Canvas paging). */
  headers: Record<string, string>;
  body: string;
}
