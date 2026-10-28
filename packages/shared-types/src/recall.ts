// Active recall: flashcards (spaced repetition) and the Captain's Log blurt.
// The 1–5 scale and SM-2 fields match Parchment's ReviewSchedule, so imported
// Parchment cards keep their schedule.

/** 1 Forgot, 2 Wrong, 3 Hard, 4 Good, 5 Easy. */
export type RecallRating = 1 | 2 | 3 | 4 | 5;

export const RECALL_RATINGS: { rating: RecallRating; label: string; color: string }[] = [
  { rating: 1, label: "Forgot", color: "#C2524A" },
  { rating: 2, label: "Wrong", color: "#D9822B" },
  { rating: 3, label: "Hard", color: "#B8862B" },
  { rating: 4, label: "Good", color: "#3F7A4A" },
  { rating: 5, label: "Easy", color: "#2E5E8B" },
];

export type SchedulerKind = "sm2" | "fsrs";

export interface ReviewSchedule {
  /** SM-2 ease factor (starts at 2.5, never below 1.3). */
  ease: number;
  /** Days until the next review once learned. */
  interval: number;
  repetitions: number;
  lapses: number;
  /** Epoch ms. New cards are due immediately (0). */
  due: number;
  /** Epoch ms, or null for a new card. */
  lastReviewed: number | null;
  /** FSRS memory state, present once the FSRS scheduler has seen the card. */
  stability?: number;
  difficulty?: number;
}

/** The schedule every new card starts with: due now, nothing learned yet. */
export function newReviewSchedule(): ReviewSchedule {
  return { ease: 2.5, interval: 0, repetitions: 0, lapses: 0, due: 0, lastReviewed: null };
}

export type DeckSource = "manual" | "parchment" | "csv" | "paper" | "blurt";

export interface Deck {
  id: string;
  name: string;
  subject: string | null;
  created: number;
  source: DeckSource;
}

export interface Flashcard {
  id: string;
  deckId: string;
  front: string;
  back: string;
  created: number;
  schedule: ReviewSchedule;
}

/** A key idea pulled out of reference notes for the blurt check. */
export interface BlurtConcept {
  id: string;
  /** The words that must show up (normalized, e.g. "mitochondria atp"). */
  term: string;
  /** How the term looked in the notes, for display. */
  display: string;
  /** 1 = minor detail, 3 = headline idea. */
  weight: number;
  sentence: string;
}

export interface BlurtConceptResult {
  concept: BlurtConcept;
  status: "mastered" | "partial" | "missed";
  /** 0..1 how much of the concept was found. */
  score: number;
  /** The words in the blurt that matched, if any. */
  matchedWith: string[];
}

/** Mastered is seafoam green, missed is coral red. */
export const BLURT_STATUS_COLORS: Record<BlurtConceptResult["status"], string> = {
  mastered: "#3FB59A",
  partial: "#E0A63A",
  missed: "#E2604F",
};

export interface BlurtResult {
  /** Weighted share of concepts recalled, 0..1. */
  coverage: number;
  concepts: BlurtConceptResult[];
  /** Words in the blurt that matched no concept (possible new ideas or errors). */
  extraTerms: string[];
}
