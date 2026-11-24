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

/** Things in a bottle that could point back at a person. Warnings, not refusals: the sailor decides. */
export function personalInfoWarnings(texts: readonly string[], url: string | null): string[] {
  const all = texts.join("\n");
  const warnings: string[] = [];
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(all)) warnings.push("It has an email address in it.");
  if (/(?:\+?\d[\s().-]?){9,}\d/.test(all.replace(/\b(19|20)\d{2}\b/g, ""))) warnings.push("It has something that looks like a phone number.");
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
