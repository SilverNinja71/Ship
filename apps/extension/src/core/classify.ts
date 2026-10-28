// Which kind of page a URL is, as far as guarding goes. YouTube gets its own
// rules (feeds always blocked, watch pages judged); other sites are blocked
// only when they're on the user's list.

export const YOUTUBE_SITE = "youtube.com";
/** The static guard content script runs here; the manifest lists the same hosts. */
export const YOUTUBE_MATCHES = ["https://*.youtube.com/*"];

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

// Dotted DNS names only, the last label starting with a letter (so no IPs).
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export type PageClass =
  /** Home, Shorts and feeds: blocked for the whole focus block. */
  | { kind: "youtube-blocked"; site: string; label: string }
  | { kind: "youtube-watch"; site: string; videoId: string }
  /** Search, channels, playlists: fine, they're how you find a lecture. */
  | { kind: "youtube-other"; site: string }
  | { kind: "blocklist"; site: string }
  | { kind: "none" };

const FEED_LABELS: Record<string, string> = {
  subscriptions: "your subscriptions feed",
  trending: "Trending",
  explore: "Explore",
  history: "your watch history",
  library: "your library",
  you: "your library",
};
const BROWSE_PAGES: Record<string, string> = {
  gaming: "YouTube Gaming",
  trending: "Trending",
  hashtag: "a hashtag feed",
  playables: "YouTube Playables",
};

/** "https://www.Reddit.com/r/x", "*.reddit.com" or "reddit.com." all become "reddit.com"; null if it isn't a site. */
export function normalizeSiteEntry(input: string): string | null {
  let value = input.trim().toLowerCase();
  if (!value) return null;
  if (value.includes("://")) {
    try {
      value = new URL(value).hostname;
    } catch {
      return null;
    }
  } else {
    value = value.split(/[/?#]/)[0] ?? "";
  }
  value = value.replace(/^\*\./, "").replace(/:\d*$/, "").replace(/\.$/, "");
  try {
    // Punycodes international names the same way the browser will.
    value = new URL(`http://${value}`).hostname;
  } catch {
    return null;
  }
  value = value.replace(/^www\./, "");
  return HOSTNAME.test(value) ? value : null;
}

/** The longest list entry that is the host or a parent domain of it ("old.reddit.com" → "reddit.com"). */
export function matchBlocklist(hostname: string, list: readonly string[]): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  let best: string | null = null;
  for (const entry of list) {
    if ((host === entry || host.endsWith(`.${entry}`)) && (!best || entry.length > best.length)) best = entry;
  }
  return best;
}

/** Host permission and content-script patterns for a blocked site and its subdomains. */
export function originPatternsFor(site: string): string[] {
  return [`*://${site}/*`, `*://*.${site}/*`];
}

export function isYouTubeHost(hostname: string): boolean {
  return YOUTUBE_HOSTS.has(hostname.toLowerCase());
}

export function classifyUrl(raw: string, blocklist: readonly string[]): PageClass {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { kind: "none" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { kind: "none" };
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  // An explicit entry wins, so listing youtube.com blocks all of it.
  const listed = matchBlocklist(host, blocklist);
  if (listed) return { kind: "blocklist", site: listed };
  return isYouTubeHost(host) ? classifyYouTube(url) : { kind: "none" };
}

function classifyYouTube(url: URL): PageClass {
  const site = YOUTUBE_SITE;
  const segments = url.pathname.split("/").filter(Boolean);
  const first = (segments[0] ?? "").toLowerCase();
  const second = segments[1] ?? "";
  const blocked = (label: string): PageClass => ({ kind: "youtube-blocked", site, label });

  if (!first || first === "index") return blocked("the YouTube home feed");
  if (first === "shorts") return blocked("YouTube Shorts");
  if (first === "feed") return blocked(FEED_LABELS[second.toLowerCase()] ?? "a YouTube feed");
  const browse = BROWSE_PAGES[first];
  if (browse) return blocked(browse);
  // A channel's Shorts tab is a Shorts feed too.
  const isChannel = first.startsWith("@") || first === "channel" || first === "c" || first === "user";
  if (isChannel && segments.some((s, i) => i > 0 && s.toLowerCase() === "shorts")) return blocked("YouTube Shorts");

  if (first === "watch") {
    const id = url.searchParams.get("v") ?? "";
    return VIDEO_ID.test(id) ? { kind: "youtube-watch", site, videoId: id } : { kind: "youtube-other", site };
  }
  if ((first === "live" || first === "embed" || first === "v") && VIDEO_ID.test(second)) {
    return { kind: "youtube-watch", site, videoId: second };
  }
  return { kind: "youtube-other", site };
}
