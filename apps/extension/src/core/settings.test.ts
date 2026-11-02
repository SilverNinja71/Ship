import { describe, expect, it } from "vitest";
import { cleanYouTubeTitle, collapse } from "../content/youtubePage.js";
import { formatClock, formatTimeLeft, verdictSourceLabel, verdictSourceShort } from "./labels.js";
import { bytesToBase64 } from "./net.js";
import { customShipOriginPattern, DEFAULT_SETTINGS, isShipTabUrl, normalizeModel, normalizeSettings, normalizeShipUrl, shipTabPatterns } from "./settings.js";

describe("settings", () => {
  it.each([
    ["http://localhost:5173/", "http://localhost:5173"],
    ["localhost:5173", "http://localhost:5173"],
    ["127.0.0.1:5173/app/", "http://127.0.0.1:5173/app"],
    ["ship.example.com", "https://ship.example.com"],
    ["https://ship.example.com/deck", "https://ship.example.com/deck"],
  ])("normalizes the Ship URL %j", (input, url) => {
    expect(normalizeShipUrl(input)).toBe(url);
  });

  it.each(["", "   ", "javascript:alert(1)", "ftp://ship.example.com", "http://user:pw@localhost:5173"])("refuses the Ship URL %j", (input) => {
    expect(normalizeShipUrl(input)).toBeNull();
  });

  it("cleans the model name, falling back to the default", () => {
    expect(normalizeModel(" models/gemini-3.6-flash ")).toBe("gemini-3.6-flash");
    expect(normalizeModel("gemini 3 flash")).toBe("gemini-flash-latest");
    expect(normalizeModel(undefined)).toBe("gemini-flash-latest");
  });

  it("fills defaults and cleans stored settings", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ geminiApiKey: "  k  ", shipUrl: "nope://", blockedSites: ["https://www.Reddit.com/r/x", "reddit.com", "bad", 3] })).toEqual({
      ...DEFAULT_SETTINGS,
      geminiApiKey: "k",
      blockedSites: ["reddit.com"],
    });
  });

  it("finds Ship tabs on the right port, treating localhost and 127.0.0.1 as one", () => {
    const ship = "http://localhost:5173";
    expect(shipTabPatterns(ship)).toEqual(["http://localhost/*", "http://127.0.0.1/*"]);
    expect(isShipTabUrl("http://localhost:5173/deck?x=1", ship)).toBe(true);
    expect(isShipTabUrl("http://127.0.0.1:5173/", ship)).toBe(true);
    expect(isShipTabUrl("http://localhost:3000/", ship)).toBe(false);
    expect(isShipTabUrl("https://localhost:5173/", ship)).toBe(false);
    expect(isShipTabUrl("garbage", ship)).toBe(false);
  });

  it("needs an extra permission only for a Ship outside this computer", () => {
    expect(customShipOriginPattern("http://localhost:5173")).toBeNull();
    expect(customShipOriginPattern("https://ship.example.com/deck")).toBe("https://ship.example.com/*");
  });
});

describe("labels", () => {
  it("always says when the video groups made the call", () => {
    expect(verdictSourceLabel({ source: "heuristic" }, "gemini-flash-latest")).toMatch(/video groups, not Gemini/i);
    expect(verdictSourceLabel({ source: "gemini" }, "gemini-flash-latest")).toBe("Judged by Gemini (gemini-flash-latest)");
    expect(verdictSourceLabel({ source: "cache" }, null)).toMatch(/earlier verdict/);
    expect(verdictSourceShort({ source: "heuristic" })).toMatch(/video groups/);
  });

  it("formats time left", () => {
    expect(formatTimeLeft(23 * 60_000 + 1)).toBe("24 min left");
    expect(formatTimeLeft(45_000)).toBe("45 s left");
    expect(formatTimeLeft(-1)).toBe("time's up");
    expect(formatClock(23 * 60_000 + 41_000)).toBe("23:41");
    expect(formatClock(3_600_000 + 5_000)).toBe("1:00:05");
  });
});

describe("page helpers", () => {
  it("cleans YouTube tab titles", () => {
    expect(cleanYouTubeTitle("(3) Enzyme Kinetics Explained - YouTube")).toBe("Enzyme Kinetics Explained");
    expect(cleanYouTubeTitle("(99+) Title - with dash - YouTube")).toBe("Title - with dash");
    expect(cleanYouTubeTitle("YouTube")).toBe("YouTube");
    expect(collapse("  a \n\t b  ", 10)).toBe("a b");
  });

  it("base64-encodes bytes, even large ones", () => {
    expect(bytesToBase64(new TextEncoder().encode("Ship"))).toBe("U2hpcA==");
    const bytes = new Uint8Array(100_000).map((_, i) => (i * 31) % 256);
    expect(Uint8Array.from(atob(bytesToBase64(bytes)), (c) => c.charCodeAt(0))).toEqual(bytes);
  });
});
