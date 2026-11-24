// Bottle Bay: study sources and flashcard decks that sailors choose to share,
// anonymously. A bottle carries no name, email or account id; only the
// sharer's own account keeps a private note that it's theirs
// (users/{uid}/shared/{bottleId}), so they can take it back.
//
// Stored in Firestore as bottles/{id}, with a deck's cards in
// bottles/{id}/deck/cards so that browsing never downloads whole decks.

export type BottleKind = "source" | "deck";

export type BottleSourceType = "website" | "video" | "pdf" | "article" | "book" | "other";

export type BottleReportReason = "spam" | "wrong" | "unkind" | "personal";

/** One card in a shared deck: f(ront) and b(ack), short keys to keep big decks small. */
export interface BottleCard {
  f: string;
  b: string;
}

/** A bottle as everyone sees it. */
export interface Bottle {
  id: string;
  kind: BottleKind;
  title: string;
  /** https only, with tracking and sharer ids removed. Null for a deck. */
  url: string | null;
  sourceType: BottleSourceType | null;
  subject: string;
  /** The subject lowercased, for finding bottles by subject. */
  subjectKey: string;
  tags: string[];
  description: string;
  /** Decks: how many cards, and the first few to preview. */
  cardCount: number;
  preview: BottleCard[];
  /** When it was set afloat (ms). Shown as a date only. */
  at: number;
  reports: number;
}

/** The limits the app and the database rules both hold bottles to. */
export const BOTTLE_LIMITS = {
  title: 200,
  url: 2000,
  subject: 60,
  tags: 8,
  tag: 30,
  description: 500,
  cards: 300,
  cardSide: 500,
  preview: 3,
  /** A bottle with this many reports is hidden from everyone. */
  hideAtReports: 3,
  /** Seconds between two bottles from the same account. */
  cooldownSeconds: 20,
  /** Seconds between two bottle reports from the same account, so a few accounts can't hide the whole bay at once. */
  reportCooldownSeconds: 30,
} as const;
