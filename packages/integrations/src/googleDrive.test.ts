import { describe, expect, it } from "vitest";
import { GOOGLE_MIME, driveQuery, fetchDriveLibrary, listDriveFiles, syncGoogleDrive } from "./googleDrive.js";
import { fakeFetch } from "./testing/fakeFetch.js";

const files = [
  { id: "doc1", name: "Syllabus", mimeType: GOOGLE_MIME.doc, webViewLink: "https://docs.google.com/document/d/doc1/edit", modifiedTime: "2026-10-01T12:00:00.000Z" },
  { id: "pdf1", name: "Slides.pdf", mimeType: GOOGLE_MIME.pdf, modifiedTime: "2026-09-15T08:00:00Z" },
  { id: "txt1", name: "notes.txt", mimeType: "text/plain" },
  { id: "doc2", name: "Locked doc", mimeType: GOOGLE_MIME.doc },
];

function driveFetch() {
  return fakeFetch((url) => {
    const u = new URL(url);
    if (u.pathname === "/drive/v3/files") {
      const token = u.searchParams.get("pageToken");
      if (!token) return { body: { files: files.slice(0, 2), nextPageToken: "next-1" } };
      if (token === "next-1") return { body: { files: files.slice(2) } };
    }
    if (u.pathname === "/drive/v3/files/doc1/export") return { body: "﻿Week 1: cells" };
    if (u.pathname === "/drive/v3/files/doc2/export") return { status: 403, body: { error: { message: "The user does not have sufficient permissions." } } };
    if (u.pathname === "/drive/v3/files/txt1" && u.searchParams.get("alt") === "media") return { body: "plain notes" };
    return undefined;
  });
}

describe("driveQuery", () => {
  it("builds and escapes queries", () => {
    expect(driveQuery()).toBe("trashed = false and mimeType != 'application/vnd.google-apps.folder'");
    expect(driveQuery({ folderId: "F1", mimeTypes: [GOOGLE_MIME.doc, GOOGLE_MIME.pdf], nameContains: "Bob's \\ notes" })).toBe(
      "trashed = false and 'F1' in parents and name contains 'Bob\\'s \\\\ notes' and " +
        "(mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/pdf')",
    );
  });
});

describe("listDriveFiles", () => {
  it("follows nextPageToken and maps to LibraryItems", async () => {
    const fetch = driveFetch();
    const items = await listDriveFiles(fetch, "ya29.token");
    expect(items).toHaveLength(4);
    expect(items[0]).toEqual({
      id: "google-drive:doc1",
      source: "google-drive",
      title: "Syllabus",
      mimeType: GOOGLE_MIME.doc,
      url: "https://docs.google.com/document/d/doc1/edit",
      modifiedAt: Date.parse("2026-10-01T12:00:00.000Z"),
      text: null,
    });
    expect(items[1]?.url).toBe("https://drive.google.com/file/d/pdf1/view");
    const first = new URL(fetch.calls[0]!.url);
    expect(first.searchParams.get("q")).toBe(driveQuery());
    expect(first.searchParams.get("fields")).toBe("nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime)");
    expect(first.searchParams.get("pageSize")).toBe("100");
    expect(first.searchParams.get("supportsAllDrives")).toBe("true");
    expect(new URL(fetch.calls[1]!.url).searchParams.get("pageToken")).toBe("next-1");
    expect(fetch.calls[0]?.init?.headers?.["Authorization"]).toBe("Bearer ya29.token");
  });
});

describe("fetchDriveLibrary", () => {
  it("exports Docs and downloads text files, warning on failures", async () => {
    const fetch = driveFetch();
    const { items, warnings } = await fetchDriveLibrary(fetch, "tok", { includeText: true });
    expect(items.map((i) => i.text)).toEqual(["Week 1: cells", null, "plain notes", null]);
    expect(warnings).toEqual([
      'Couldn\'t read the text of "Locked doc" (Google Drive failed with HTTP 403: The user does not have sufficient permissions.).',
    ]);
    const exportCall = fetch.calls.find((c) => c.url.includes("/doc1/export"));
    expect(new URL(exportCall!.url).searchParams.get("mimeType")).toBe("text/plain");
  });
});

describe("syncGoogleDrive", () => {
  it("refuses a missing or expired token before calling Drive", async () => {
    const fetch = driveFetch();
    await expect(syncGoogleDrive(fetch, { clientId: "c", accessToken: null, expiresAt: null })).rejects.toThrow(/Sign in/);
    await expect(
      syncGoogleDrive(fetch, { clientId: "c", accessToken: "t", expiresAt: 1_000 }, { now: () => 2_000 }),
    ).rejects.toThrow(/expired/);
    expect(fetch.calls).toHaveLength(0);
    const ok = await syncGoogleDrive(fetch, { clientId: "c", accessToken: "t", expiresAt: 5_000 }, { now: () => 2_000 });
    expect(ok.items).toHaveLength(4);
  });
});
