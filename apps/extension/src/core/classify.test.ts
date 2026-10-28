import { describe, expect, it } from "vitest";
import { classifyUrl, matchBlocklist, normalizeSiteEntry, originPatternsFor } from "./classify.js";

const yt = (path: string, host = "www.youtube.com") => classifyUrl(`https://${host}${path}`, []);

describe("classifyUrl: YouTube", () => {
  it.each(["/", "/?feature=ytca", "/index"])("always blocks the home feed (%s)", (path) => {
    expect(yt(path)).toEqual({ kind: "youtube-blocked", site: "youtube.com", label: "the YouTube home feed" });
  });

  it.each(["/shorts", "/shorts/aBcDeFgHiJk", "/@somechannel/shorts", "/channel/UC123/shorts"])("always blocks Shorts (%s)", (path) => {
    expect(yt(path)).toMatchObject({ kind: "youtube-blocked", label: "YouTube Shorts" });
  });

  it.each([
    ["/feed/subscriptions", "your subscriptions feed"],
    ["/feed/trending", "Trending"],
    ["/feed/explore", "Explore"],
    ["/feed/history", "your watch history"],
    ["/feed/storefront", "a YouTube feed"],
    ["/gaming", "YouTube Gaming"],
    ["/hashtag/funny", "a hashtag feed"],
  ])("always blocks feeds (%s)", (path, label) => {
    expect(yt(path)).toEqual({ kind: "youtube-blocked", site: "youtube.com", label });
  });

  it("reads the video id from watch pages, keeping its case", () => {
    expect(yt("/watch?v=dQw4w9WgXcQ&t=42s")).toEqual({ kind: "youtube-watch", site: "youtube.com", videoId: "dQw4w9WgXcQ" });
    expect(yt("/watch?v=dQw4w9WgXcQ", "m.youtube.com")).toMatchObject({ kind: "youtube-watch", videoId: "dQw4w9WgXcQ" });
    expect(yt("/live/AbCdEfGhIjK")).toMatchObject({ kind: "youtube-watch", videoId: "AbCdEfGhIjK" });
    expect(yt("/watch?v=dQw4w9WgXcQ", "youtube.com")).toMatchObject({ kind: "youtube-watch" });
  });

  it("lets search, channels, playlists and malformed watch URLs through", () => {
    for (const path of ["/results?search_query=enzymes", "/@CrashCourse", "/playlist?list=PL123", "/watch", "/watch?v=short", "/watch?v=<script>xx"]) {
      expect(yt(path).kind).toBe("youtube-other");
    }
  });

  it("ignores hosts that only look like YouTube", () => {
    for (const host of ["music.youtube.com", "youtube.com.evil.example", "notyoutube.com", "www.youtube.co"]) {
      expect(yt("/", host)).toEqual({ kind: "none" });
    }
  });

  it("ignores non-web URLs and junk", () => {
    expect(classifyUrl("chrome://extensions", ["extensions"])).toEqual({ kind: "none" });
    expect(classifyUrl("not a url", [])).toEqual({ kind: "none" });
  });
});

describe("blocklist", () => {
  it.each([
    ["reddit.com", "reddit.com"],
    ["  https://www.Reddit.com/r/aww?x=1 ", "reddit.com"],
    ["*.reddit.com", "reddit.com"],
    ["reddit.com.", "reddit.com"],
    ["reddit.com:443/path", "reddit.com"],
    ["old.reddit.com", "old.reddit.com"],
    ["bücher.example", "xn--bcher-kva.example"],
  ])("normalizes %j to %j", (input, site) => {
    expect(normalizeSiteEntry(input)).toBe(site);
  });

  it.each(["", "reddit", "localhost", "127.0.0.1", "http://", "a b.com", "-bad.com"])("refuses %j", (input) => {
    expect(normalizeSiteEntry(input)).toBeNull();
  });

  const list = ["reddit.com", "x.com", "news.example.org"];

  it("matches the site and its subdomains", () => {
    expect(matchBlocklist("reddit.com", list)).toBe("reddit.com");
    expect(matchBlocklist("old.reddit.com", list)).toBe("reddit.com");
    expect(matchBlocklist("WWW.Reddit.COM.", list)).toBe("reddit.com");
    expect(matchBlocklist("a.b.news.example.org", list)).toBe("news.example.org");
  });

  it("doesn't match lookalikes", () => {
    for (const host of ["notreddit.com", "reddit.com.evil.com", "reddit.co", "evilreddit.com", "xx.com", "example.org", "reddit-com.net"]) {
      expect(matchBlocklist(host, list)).toBeNull();
    }
  });

  it("prefers the longest matching entry", () => {
    expect(matchBlocklist("a.news.example.org", ["example.org", "news.example.org"])).toBe("news.example.org");
  });

  it("is checked before YouTube's own rules, so listing youtube.com blocks all of it", () => {
    expect(classifyUrl("https://old.reddit.com/r/aww", list)).toEqual({ kind: "blocklist", site: "reddit.com" });
    expect(classifyUrl("https://www.youtube.com/results?q=x", ["youtube.com"])).toEqual({ kind: "blocklist", site: "youtube.com" });
  });

  it("builds host patterns for the site and its subdomains", () => {
    expect(originPatternsFor("reddit.com")).toEqual(["*://reddit.com/*", "*://*.reddit.com/*"]);
  });
});
