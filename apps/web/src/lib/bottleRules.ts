// Bottle Bay's own rules, with no database in sight: cleaning links so they
// can't identify the sharer, spotting personal details before they go out,
// and turning a draft into a bottle that fits the limits the database
// rules (firestore.rules) also enforce.

import { BOTTLE_LIMITS } from "@ship/shared-types";
import type { Bottle, BottleCard, BottleKind, BottleSourceType } from "@ship/shared-types";

/** Query parameters that track who shared a link or where it was clicked. */
const TRACKING = /^(utm_[a-z_]+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|igshid|igsh|yclid|twclid|ttclid|_hsenc|_hsmi|mkt_tok|ref_src|ref_url|share_id|sharer|sender|feature)$/i;
/** On these sites `si` (and Spotify's `context`) is a code that points back at the person who shared. */
const SHARER_ID_HOSTS = /(^|\.)(youtube\.com|youtu\.be|spotify\.com|instagram\.com|tiktok\.com)$/i;

export type CleanUrl = { ok: true; url: string; removed: string[] } | { ok: false; reason: string };

/** An https link with tracking and sharer codes taken out, or why it can't be shared. */
export function cleanShareUrl(raw: string): CleanUrl {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "That doesn't look like a web address." };
  }
  if (url.protocol === "http:") return { ok: false, reason: "Only secure (https://) links can go in a bottle." };
  if (url.protocol !== "https:") return { ok: false, reason: "Only web links (https://) can go in a bottle." };
  if (url.username || url.password) return { ok: false, reason: "That link has a login inside it. Share the plain address instead." };
  const removed: string[] = [];
  for (const key of [...url.searchParams.keys()]) {
    const sharer = SHARER_ID_HOSTS.test(url.hostname) && /^(si|context|is_from_webapp|sender_device)$/i.test(key);
    if (TRACKING.test(key) || sharer) {
      url.searchParams.delete(key);
      removed.push(key);
    }
  }
  const href = url.href;
  if (href.length > BOTTLE_LIMITS.url) return { ok: false, reason: "That link is too long." };
  return { ok: true, url: href, removed: [...new Set(removed)] };
}

export function sourceTypeOf(url: string): BottleSourceType {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "other";
  }
  const host = u.hostname.replace(/^www\./, "");
  if (/(^|\.)(youtube\.com|youtu\.be|vimeo\.com)$/.test(host)) return "video";
  if (/\.pdf$/i.test(u.pathname)) return "pdf";
  if (/(^|\.)(openlibrary\.org|gutenberg\.org|archive\.org)$/.test(host) || /^books\.google\./.test(host)) return "book";
  if (/(^|\.)(wikipedia\.org|medium\.com|substack\.com|nature\.com|sciencedirect\.com|arxiv\.org|nytimes\.com|bbc\.co\.uk|bbc\.com)$/.test(host)) return "article";
  return "website";
}

const EMAIL_WARNING = "It has an email address in it.";
const PHONE_WARNING = "It has something that looks like a phone number.";
const EMAIL = /[\w.+-]+@([\w-]+\.[\w.-]+)/g;

// Ways to reach someone outside Ship. App names that are also everyday words (the Apple of
// Discord, the Zimmermann Telegram, a snap election, "snap" in physics) count only next to a
// word that points at an account; the others count anywhere, as whole words.
const SOCIAL_APP = /\b(snapchat|snap ?chat|instagram|insta|tiktok|tik tok|whatsapp|whats app)\b/i;
const SOCIAL_WORD =
  /\b(?:(?:my|our|on|via|add me on|find me on|message me on|dm me on|join (?:my|our))\s+(?:discord|telegram|snap)\b|(?:discord|telegram|snap)\s*(?:@|(?:user ?name|name|handle|id|tag|server|group|channel|account|code)\b))/i;
const ASK_TO_CONTACT = /\b(?:add me|dm me|text me)\b/i;
const INVITE_LINK =
  /\bdiscord(?:app)?\.(?:gg|com\/invite)\/|(?:^|[^\w.])(?:t|wa)\.me\b|\bchat\.whatsapp\.com\b|\bsnapchat\.com\/add\b|\binstagram\.com\/[\w.]/i;
// "@name" not inside an email (no letter just before the @), and not code: Java's @Override,
// Python's @staticmethod, CSS's @media, or anything called like a function, as in @app.route(...).
const HANDLE = /(?:^|[^\w@.+-])@([A-Za-z_][\w.]{1,29})(?![\w.]*\()/g;
const CODE_ANNOTATIONS = new Set([
  "override", "deprecated", "suppresswarnings", "functionalinterface", "safevarargs", "test", "param", "return", "returns", "throws",
  "author", "see", "since", "version", "link", "inheritdoc", "staticmethod", "classmethod", "property", "abstractmethod", "dataclass",
  "media", "import", "keyframes", "font-face", "supports", "page", "charset", "namespace", "layer", "container", "apply", "tailwind", "interface",
]);

function contactWarnings(all: string): string[] {
  const warnings: string[] = [];
  if (SOCIAL_APP.test(all) || SOCIAL_WORD.test(all)) warnings.push("It names a chat or social app, which could be a way to find someone.");
  if (ASK_TO_CONTACT.test(all)) warnings.push("It asks people to get in touch (like \"add me\" or \"DM me\").");
  if ([...all.matchAll(HANDLE)].some((m) => !CODE_ANNOTATIONS.has(m[1]!.toLowerCase()))) warnings.push("It has something that looks like a username (@name).");
  if (INVITE_LINK.test(all)) warnings.push("It has an invite or profile link for a chat or social app.");
  return warnings;
}

// RFC 2606's made-up domains: an example address in a lesson isn't anyone's.
const EXAMPLE_DOMAIN = /(^|\.)(example\.(com|org|net)|example|test|invalid|localhost)$/i;

const PHONE_CONTEXT = /\b(?:call|text|phone|cell|mobile|tel|number is|whatsapp|ring|reach me)\b[^\d\n]{0,20}$/i;

/**
 * Phone numbers, strictly enough to block on: 10–15 digits written the way phone numbers are,
 * so numbers from a lesson don't count: a decimal (1.602176634, pi's digits), thousands
 * (1 000 000 000), or a bare run (2147483647) unless it starts with 0 or follows "call me",
 * "my number is" and the like.
 */
function hasPhoneNumber(all: string): boolean {
  const text = all.replace(/\b(19|20)\d{2}\b/g, "");
  for (const m of text.matchAll(/\+?\(?\d[\d \t().-]{8,}\d/g)) {
    const raw = m[0];
    const groups = raw.split(/\D+/).filter(Boolean);
    const digits = groups.join("").length;
    if (digits < 10 || digits > 15) continue;
    if (/^\+\d|^\(\d{1,4}\)/.test(raw)) return true;
    if (groups.length === 1) {
      if (raw.startsWith("0") || PHONE_CONTEXT.test(text.slice(Math.max(0, m.index - 40), m.index))) return true;
      continue;
    }
    if (groups.length === 2 && /^\d{1,3}\.\d+$/.test(raw)) continue;
    if (groups.slice(1).every((g) => g.length === 3)) continue;
    if (groups.slice(1).every((g) => g.length >= 2)) return true;
  }
  return false;
}

/**
 * Contact details: a social or chat app, a username, an invite link, "add me", a real email
 * address or a phone number. Study Rooms refuses a skipper's own deck that has any of these
 * (ROOM_DECK_CONTACT_PROBLEM); Bottle Bay only warns.
 */
export function hasContactDetails(texts: readonly string[]): string[] {
  const all = texts.join("\n");
  const warnings: string[] = [];
  if ([...all.matchAll(EMAIL)].some((m) => !EXAMPLE_DOMAIN.test(m[1]!.replace(/\.+$/, "")))) warnings.push(EMAIL_WARNING);
  if (hasPhoneNumber(all)) warnings.push(PHONE_WARNING);
  return [...warnings, ...contactWarnings(all)];
}

/** What a skipper sees when their own deck has contact details in it. */
export const ROOM_DECK_CONTACT_PROBLEM = "Room decks can't hold contact details: remove them first.";

/** Things in a bottle that could point back at a person. Warnings, not refusals: the sailor decides. */
export function personalInfoWarnings(texts: readonly string[], url: string | null): string[] {
  const all = texts.join("\n");
  const warnings: string[] = [];
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(all)) warnings.push(EMAIL_WARNING);
  if (/(?:\+?\d[\s().-]?){9,}\d/.test(all.replace(/\b(19|20)\d{2}\b/g, ""))) warnings.push(PHONE_WARNING);
  if (/\b\d{1,5}\s+\w+(\s\w+)?\s+(street|st|avenue|ave|road|rd|lane|ln|drive|dr|boulevard|blvd)\b/i.test(all)) warnings.push("It has something that looks like a street address.");
  if (/\b(my name is|i am|i'm)\s+[A-Z][a-z]+\s+[A-Z][a-z]+/.test(all)) warnings.push("It may say someone's full name.");
  if (url) {
    const host = (() => {
      try {
        return new URL(url).hostname;
      } catch {
        return "";
      }
    })();
    if (/(^|\.)(docs\.google\.com|drive\.google\.com|onedrive\.live\.com|1drv\.ms|sharepoint\.com|dropbox\.com|icloud\.com|notion\.site|box\.com)$/.test(host))
      warnings.push("It links to a file in someone's own cloud storage. People who open it may see the owner's name.");
    if (/(^|\.)instructure\.com$|canvas\./.test(host)) warnings.push("It's a school (Canvas) link: others usually can't open it, and it names the school.");
  }
  // The link too: a Discord invite or an Instagram profile is a way to reach its owner.
  warnings.push(...contactWarnings(url ? `${all}\n${url}` : all));
  return warnings;
}

export const subjectKey = (subject: string) => subject.trim().toLowerCase().replace(/\s+/g, " ").slice(0, BOTTLE_LIMITS.subject);

/** Tags typed as "bio, unit-2 #exam" become ["bio", "unit-2", "exam"]. */
export function cleanTags(raw: string | readonly string[]): string[] {
  const list = typeof raw === "string" ? raw.split(/[,\s]+/) : raw;
  const tags = list.map((t) => t.replace(/^#+/, "").trim().toLowerCase().slice(0, BOTTLE_LIMITS.tag)).filter(Boolean);
  return [...new Set(tags)].slice(0, BOTTLE_LIMITS.tags);
}

export interface BottleDraft {
  kind: BottleKind;
  title: string;
  url?: string;
  subject: string;
  tags: string | readonly string[];
  description: string;
  cards?: readonly { front: string; back: string }[];
}

/** What gets written to the database (bottles/{id}), before the server fills in the time. */
export type BottleData = Omit<Bottle, "id" | "at">;

export type BottleCheck = { ok: true; bottle: BottleData; cards: BottleCard[]; removedParams: string[]; warnings: string[] } | { ok: false; problems: string[] };

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** Checks a draft and makes it into a bottle, or lists what to fix. */
export function checkDraft(draft: BottleDraft): BottleCheck {
  const problems: string[] = [];
  const title = squash(draft.title);
  const subject = squash(draft.subject);
  const description = draft.description.trim();
  if (!title) problems.push("Give it a title.");
  if (title.length > BOTTLE_LIMITS.title) problems.push(`Keep the title under ${BOTTLE_LIMITS.title} characters.`);
  if (subject.length > BOTTLE_LIMITS.subject) problems.push(`Keep the subject under ${BOTTLE_LIMITS.subject} characters.`);
  if (description.length > BOTTLE_LIMITS.description) problems.push(`Keep the description under ${BOTTLE_LIMITS.description} characters.`);

  let url: string | null = null;
  let removedParams: string[] = [];
  let cards: BottleCard[] = [];
  if (draft.kind === "source") {
    const clean = cleanShareUrl(draft.url ?? "");
    if (clean.ok) {
      url = clean.url;
      removedParams = clean.removed;
    } else problems.push(clean.reason);
  } else {
    cards = (draft.cards ?? [])
      .map((c) => ({ f: c.front.trim().slice(0, BOTTLE_LIMITS.cardSide), b: c.back.trim().slice(0, BOTTLE_LIMITS.cardSide) }))
      .filter((c) => c.f && c.b);
    if (!cards.length) problems.push("That deck has no cards with both sides filled in.");
    if (cards.length > BOTTLE_LIMITS.cards) problems.push(`A bottle holds up to ${BOTTLE_LIMITS.cards} cards; this deck has ${cards.length}.`);
  }
  if (problems.length) return { ok: false, problems };

  const bottle: BottleData = {
    kind: draft.kind,
    title,
    url,
    sourceType: url ? sourceTypeOf(url) : null,
    subject,
    subjectKey: subjectKey(subject),
    tags: cleanTags(draft.tags),
    description,
    cardCount: cards.length,
    preview: cards.slice(0, BOTTLE_LIMITS.preview),
    reports: 0,
  };
  const warnings = personalInfoWarnings([title, subject, description, ...bottle.tags, ...cards.flatMap((c) => [c.f, c.b])], url);
  return { ok: true, bottle, cards, removedParams, warnings };
}

/** Bottles anyone should see: not hidden by reports, newest first. */
export function visibleBottles<T extends Pick<Bottle, "reports" | "at">>(bottles: readonly T[]): T[] {
  return bottles.filter((b) => b.reports < BOTTLE_LIMITS.hideAtReports).sort((a, b) => b.at - a.at);
}

/** A source bottle as a note for the Note Nook, in Obsidian's style. */
export function bottleNoteMarkdown(b: Pick<Bottle, "title" | "url" | "description" | "tags" | "subject">): string {
  const lines = [`# ${b.title}`, ""];
  if (b.description) lines.push(b.description, "");
  if (b.url) lines.push(`[Open the source](${b.url})`, "");
  lines.push("> [!info] From Bottle Bay", "> Shared anonymously by another sailor. Check it before you rely on it.");
  if (b.tags.length) lines.push("", b.tags.map((t) => `#${t.replace(/[^\p{L}\p{N}_/-]/gu, "-")}`).join(" "));
  return lines.join("\n");
}
