import { describe, expect, it } from "vitest";
import { GEMINI_API_BASE } from "../gemini.js";
import { importFileAsync } from "../importFile.js";
import { fakeFetch } from "../testing/fakeFetch.js";
import type { FakeReply } from "../testing/fakeFetch.js";
import { MAX_INLINE_BYTES, bytesToBase64, describeGeminiFailure, pagesFromNotes } from "./geminiNotes.js";
import { importLink, parseLink } from "./links.js";

const NOTES = "# Cell energy\nATP: the cell's energy currency\n\n# Glycolysis\n- Happens in the **cytoplasm**";
const retrieved = (status: string) => ({ urlContextMetadata: { urlMetadata: [{ retrievedUrl: "https://example.com/a", urlRetrievalStatus: status }] } });
const answer = (text: string, extra: object = {}): FakeReply => ({ body: { candidates: [{ content: { parts: [{ text }] }, ...extra }] } });
const isGemini = (url: string) => url.startsWith(GEMINI_API_BASE);

/** A fake Gemini, plus YouTube's title lookup. */
function services(gemini: FakeReply, oembed: FakeReply = { body: { title: "Real Video Title" } }) {
  return fakeFetch((url) => (isGemini(url) ? gemini : url.startsWith("https://www.youtube.com/oembed") ? oembed : undefined));
}
const reader = (fetch: ReturnType<typeof services>) => ({ fetch, apiKey: "test-key", model: "gemini-flash-latest" });
const sent = (fetch: ReturnType<typeof services>) => {
  const call = fetch.calls.find((c) => isGemini(c.url));
  return { call, body: JSON.parse(call?.init?.body ?? "{}") };
};

describe("parseLink", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s&list=abc", "dQw4w9WgXcQ"],
    ["youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ).", "dQw4w9WgXcQ"],
  ])("finds the video in %s", (text, videoId) => {
    expect(parseLink(text)).toEqual({ kind: "youtube", url: `https://www.youtube.com/watch?v=${videoId}`, videoId });
  });

  it("tells channels and playlists apart from videos", () => {
    expect(parseLink("https://www.youtube.com/@somechannel")?.kind).toBe("youtube-other");
    expect(parseLink("https://www.youtube.com/playlist?list=PL123")?.kind).toBe("youtube-other");
  });

  it("recognizes Google's files", () => {
    const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz";
    expect(parseLink(`https://docs.google.com/document/d/${id}/edit`)).toMatchObject({ kind: "google", fileId: id, exportAs: "text/plain" });
    expect(parseLink(`https://docs.google.com/presentation/u/1/d/${id}/edit#slide=id.p`)).toMatchObject({ kind: "google", fileId: id, exportAs: "text/plain" });
    expect(parseLink(`https://docs.google.com/spreadsheets/d/${id}/edit`)).toMatchObject({ kind: "google", fileId: id, exportAs: "text/csv" });
    expect(parseLink(`https://drive.google.com/file/d/${id}/view`)?.kind).toBe("drive-file");
    // A published page is an ordinary public web page.
    expect(parseLink("https://docs.google.com/document/d/e/2PACX-abc/pub")?.kind).toBe("web");
  });

  it("treats everything else as a web page, adding https:// when it's missing", () => {
    expect(parseLink("example.com/notes.pdf")).toEqual({ kind: "web", url: "https://example.com/notes.pdf" });
    expect(parseLink("http://example.com/a?b=c")).toEqual({ kind: "web", url: "http://example.com/a?b=c" });
  });

  it("refuses anything that isn't a public web address", () => {
    for (const bad of ["", "not a link", "javascript:alert(1)", "file:///etc/passwd", "ftp://example.com/a", "https://user:pw@example.com/", "localhost:8080", "hello"]) {
      expect(parseLink(bad)).toBeNull();
    }
  });
});

describe("pagesFromNotes", () => {
  it("keeps the title with the first topic, and makes one page per topic", () => {
    expect(pagesFromNotes("# Cell energy\n## ATP\nATP: energy currency\n\n### Glycolysis\n- In the cytoplasm")).toEqual({
      title: "Cell energy",
      pages: [
        { id: "1", text: "# Cell energy\n# ATP\nATP: energy currency" },
        { id: "2", text: "# Glycolysis\n- In the cytoplasm" },
      ],
    });
  });

  it("copes with code fences, bold titles and notes with no headings", () => {
    expect(pagesFromNotes("```markdown\n# **Bold title**\nSome text\n```").title).toBe("Bold title");
    expect(pagesFromNotes("Just some words")).toEqual({ title: null, pages: [{ id: "1", text: "Just some words" }] });
  });

  it("cuts up a very long topic", () => {
    const long = pagesFromNotes(`# Long\n${Array.from({ length: 200 }, (_, i) => `- Point ${i} ${"word ".repeat(10)}`).join("\n")}`);
    expect(long.pages.length).toBeGreaterThan(1);
  });
});

describe("bytesToBase64", () => {
  it("encodes bytes, including files too long for one conversion step", () => {
    expect(bytesToBase64(new Uint8Array([72, 105]))).toBe("SGk=");
    expect(atob(bytesToBase64(new Uint8Array(100_000).fill(65)))).toHaveLength(100_000);
  });
});

describe("importLink: YouTube", () => {
  const VIDEO = "https://youtu.be/dQw4w9WgXcQ";

  it("sends the video to Gemini with the key in a header, and uses the video's real title", async () => {
    const fetch = services(answer(NOTES));
    const { notes, warnings } = await importLink(VIDEO, { fetch, gemini: reader(fetch) });
    const { call, body } = sent(fetch);
    expect(call?.url).not.toContain("test-key");
    expect(call?.init?.headers?.["x-goog-api-key"]).toBe("test-key");
    expect(body.contents[0].parts[0]).toEqual({ fileData: { fileUri: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } });
    expect(body.systemInstruction.parts[0].text).toContain("UNREADABLE");
    expect(notes[0]).toMatchObject({ id: "youtube:dQw4w9WgXcQ", source: "file", title: "Real Video Title", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    expect(notes[0].pages).toHaveLength(2);
    expect(warnings[0]).toMatch(/check anything important/);
  });

  it("falls back on Gemini's title if YouTube's lookup fails", async () => {
    const fetch = services(answer(NOTES), { status: 401, body: "Unauthorized" });
    expect((await importLink(VIDEO, { fetch, gemini: reader(fetch) })).notes[0].title).toBe("Cell energy");
  });

  it("stops early on a video that doesn't exist, without spending Gemini's quota", async () => {
    const fetch = services(answer(NOTES), { status: 404, body: "Not Found" });
    const { notes, warnings } = await importLink(VIDEO, { fetch, gemini: reader(fetch) });
    expect(notes).toEqual([]);
    expect(warnings).toEqual(["YouTube can't find that video."]);
    expect(fetch.calls.some((c) => isGemini(c.url))).toBe(false);
  });

  it("makes no note when Gemini can't watch it", async () => {
    const fetch = services(answer("UNREADABLE"));
    const { notes, warnings } = await importLink(VIDEO, { fetch, gemini: reader(fetch) });
    expect(notes).toEqual([]);
    expect(warnings[0]).toMatch(/Only public videos work/);
  });

  it("asks for a key when there isn't one, and for one video rather than a playlist", async () => {
    const fetch = services(answer(NOTES));
    expect((await importLink(VIDEO, { fetch, gemini: null })).warnings[0]).toMatch(/needs a Gemini key/);
    expect((await importLink("https://www.youtube.com/playlist?list=PL1", { fetch, gemini: reader(fetch) })).warnings[0]).toMatch(/one video/);
  });
});

describe("importLink: web pages", () => {
  const PAGE = "https://example.com/a";

  it("asks Gemini to open the page, and accepts notes only once it says it did", async () => {
    const fetch = services(answer(NOTES, retrieved("URL_RETRIEVAL_STATUS_SUCCESS")));
    const { notes } = await importLink(PAGE, { fetch, gemini: reader(fetch) });
    const { body } = sent(fetch);
    expect(body.tools).toEqual([{ urlContext: {} }]);
    expect(body.contents[0].parts[0].text).toContain(PAGE);
    expect(notes[0]).toMatchObject({ id: `link:${PAGE}`, title: "Cell energy", url: PAGE });
  });

  it.each([
    ["URL_RETRIEVAL_STATUS_ERROR", /couldn't open it/],
    ["URL_RETRIEVAL_STATUS_PAYWALL", /paywall/],
    ["URL_RETRIEVAL_STATUS_UNSAFE", /unsafe/],
  ])("throws away confident-sounding notes when the status is %s", async (status, message) => {
    const fetch = services(answer(NOTES, retrieved(status)));
    const { notes, warnings } = await importLink(PAGE, { fetch, gemini: reader(fetch) });
    expect(notes).toEqual([]);
    expect(warnings[0]).toMatch(message);
  });

  it("throws away notes when Gemini doesn't say whether it opened the page at all", async () => {
    const fetch = services(answer(NOTES));
    const { notes, warnings } = await importLink(PAGE, { fetch, gemini: reader(fetch) });
    expect(notes).toEqual([]);
    expect(warnings[0]).toMatch(/couldn't open it/);
  });

  it("explains a used-up limit and a bad key", async () => {
    for (const [status, message] of [
      [429, /limit for now/],
      [403, /Check your key/],
    ] as const) {
      const fetch = services({ status, body: { error: { message: "nope" } } });
      expect((await importLink(PAGE, { fetch, gemini: reader(fetch) })).warnings[0]).toMatch(message);
    }
  });

  it("explains something that isn't a link", async () => {
    const fetch = services(answer(NOTES));
    expect((await importLink("not a link", { fetch, gemini: reader(fetch) })).warnings).toEqual(["That isn't a web address."]);
    expect(fetch.calls).toEqual([]);
  });
});

describe("importLink: Google's files", () => {
  const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz";
  const DOC = `https://docs.google.com/document/d/${ID}/edit`;

  it("goes through Drive when it's connected, not Gemini", async () => {
    const fetch = fakeFetch((url) => (url.includes("/export") ? { body: "﻿First line\n\nSecond line" } : url.includes(ID) ? { body: { name: "Essay draft" } } : undefined));
    const { notes, warnings } = await importLink(DOC, { fetch, gemini: { fetch, apiKey: "k", model: "m" }, googleToken: "drive-token" });
    expect(warnings).toEqual([]);
    expect(notes[0]).toMatchObject({ id: `google:${ID}`, title: "Essay draft", url: DOC, pages: [{ id: "1", text: "First line\nSecond line" }] });
    expect(fetch.calls.every((c) => !isGemini(c.url))).toBe(true);
    expect(fetch.calls[0].init?.headers?.Authorization).toBe("Bearer drive-token");
  });

  it("says what to do when Drive isn't connected, or won't share it", async () => {
    const fetch = fakeFetch(() => ({ status: 404, body: "gone" }));
    expect((await importLink(DOC, { fetch, gemini: null })).warnings[0]).toMatch(/Connect Google Drive/);
    expect((await importLink(DOC, { fetch, gemini: null, googleToken: "t" })).warnings[0]).toMatch(/Google wouldn't share it/);
    expect((await importLink(`https://drive.google.com/file/d/${ID}/view`, { fetch, gemini: null })).warnings[0]).toMatch(/Download it/);
  });
});

describe("images", () => {
  const PHOTO = new Uint8Array([1, 2, 3, 4]);

  it("sends the picture to Gemini and keeps its notes under the file's name", async () => {
    const fetch = services(answer(NOTES));
    const { notes, warnings } = await importFileAsync("Board photo.JPG", PHOTO, { gemini: reader(fetch) });
    const { body } = sent(fetch);
    expect(body.contents[0].parts[0]).toEqual({ inlineData: { mimeType: "image/jpeg", data: "AQIDBA==" } });
    expect(notes[0]).toMatchObject({ source: "file", title: "Board photo" });
    expect(notes[0].id).toMatch(/^image:/);
    expect(notes[0].pages).toHaveLength(2);
    expect(warnings[0]).toMatch(/misread/);
  });

  it("gives the same picture the same id, even though Gemini's words may differ", async () => {
    const one = services(answer("First reading"));
    const two = services(answer("Second reading"));
    const a = await importFileAsync("a.png", PHOTO, { gemini: reader(one) });
    const b = await importFileAsync("b.png", PHOTO, { gemini: reader(two) });
    expect(a.notes[0].id).toBe(b.notes[0].id);
  });

  it("explains a missing key, a huge file, an unreadable picture and other formats", async () => {
    const fetch = services(answer("UNREADABLE"));
    expect((await importFileAsync("a.png", PHOTO)).warnings[0]).toMatch(/needs a Gemini key/);
    expect((await importFileAsync("a.png", new Uint8Array(MAX_INLINE_BYTES + 1), { gemini: reader(fetch) })).warnings[0]).toMatch(/too big/);
    expect((await importFileAsync("a.webp", PHOTO, { gemini: reader(fetch) })).warnings[0]).toMatch(/anything to read/);
    expect((await importFileAsync("a.gif", PHOTO, { gemini: reader(fetch) })).warnings[0]).toMatch(/PNG or JPEG/);
  });
});

describe("describeGeminiFailure", () => {
  it("passes other errors through as words", () => {
    expect(describeGeminiFailure(new Error("Boom"))).toBe("Boom");
    expect(describeGeminiFailure("odd")).toBe("odd");
  });
});
