// Flashcard decks and the Captain's Log blurt history.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { newReviewSchedule } from "@ship/shared-types";
import type { BlurtGrader, Deck, Flashcard, ImportResult, RecallRating } from "@ship/shared-types";
import { dueCards, nextSchedule } from "@ship/active-recall-engine";
import { newId } from "../lib/ids.js";
import { shipStorage, storageKey } from "../lib/storage.js";
import { useSettings } from "./settingsStore.js";

export interface ReviewLogEntry {
  cardId: string;
  at: number;
  rating: RecallRating;
}

export interface BlurtSession {
  id: string;
  at: number;
  title: string;
  notes: string;
  blurt: string;
  coverage: number;
  /** Missing on entries from before Gemini grading: those were graded offline. */
  gradedBy?: BlurtGrader;
}

export interface RecallState {
  decks: Deck[];
  cards: Flashcard[];
  reviewLog: ReviewLogEntry[];
  blurts: BlurtSession[];
  addDeck(name: string, subject?: string | null): Deck;
  renameDeck(id: string, name: string): void;
  deleteDeck(id: string): void;
  addCard(deckId: string, front: string, back: string): Flashcard | null;
  updateCard(id: string, patch: Pick<Partial<Flashcard>, "front" | "back">): void;
  deleteCard(id: string): void;
  review(cardId: string, rating: RecallRating, now?: number): void;
  /** Merges imported decks and cards; ones with a known id replace the old copy. Returns how many cards were new. */
  importCards(result: Pick<ImportResult, "decks" | "cards">): { decks: number; cards: number };
  saveBlurt(session: Omit<BlurtSession, "id" | "at">): void;
}

const MAX_LOG = 5000;
const MAX_BLURTS = 100;

export const useRecall = create<RecallState>()(
  persist(
    (set, get) => ({
      decks: [],
      cards: [],
      reviewLog: [],
      blurts: [],

      addDeck: (name, subject = null) => {
        const deck: Deck = { id: newId("deck"), name: name.trim() || "Untitled deck", subject, created: Date.now(), source: "manual" };
        set({ decks: [...get().decks, deck] });
        return deck;
      },

      renameDeck: (id, name) => set({ decks: get().decks.map((d) => (d.id === id ? { ...d, name: name.trim() || d.name } : d)) }),

      deleteDeck: (id) => set({ decks: get().decks.filter((d) => d.id !== id), cards: get().cards.filter((c) => c.deckId !== id) }),

      addCard: (deckId, front, back) => {
        if (!front.trim() || !back.trim()) return null;
        const card: Flashcard = { id: newId("card"), deckId, front: front.trim(), back: back.trim(), created: Date.now(), schedule: newReviewSchedule() };
        set({ cards: [...get().cards, card] });
        return card;
      },

      updateCard: (id, patch) => set({ cards: get().cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) }),

      deleteCard: (id) => set({ cards: get().cards.filter((c) => c.id !== id) }),

      review: (cardId, rating, now = Date.now()) => {
        const kind = useSettings.getState().scheduler;
        set({
          cards: get().cards.map((c) => (c.id === cardId ? { ...c, schedule: nextSchedule(c.schedule, rating, now, { kind }) } : c)),
          reviewLog: [...get().reviewLog, { cardId, at: now, rating }].slice(-MAX_LOG),
        });
      },

      importCards: ({ decks, cards }) => {
        const deckIds = new Set(get().decks.map((d) => d.id));
        const cardIds = new Set(get().cards.map((c) => c.id));
        const newDecks = decks.filter((d) => !deckIds.has(d.id)).length;
        const newCards = cards.filter((c) => !cardIds.has(c.id)).length;
        const incomingDecks = new Map(decks.map((d) => [d.id, d]));
        const incomingCards = new Map(cards.map((c) => [c.id, c]));
        set({
          decks: [...get().decks.map((d) => incomingDecks.get(d.id) ?? d), ...decks.filter((d) => !deckIds.has(d.id))],
          cards: [...get().cards.map((c) => incomingCards.get(c.id) ?? c), ...cards.filter((c) => !cardIds.has(c.id))],
        });
        return { decks: newDecks, cards: newCards };
      },

      saveBlurt: (session) => set({ blurts: [...get().blurts, { ...session, id: newId("blurt"), at: Date.now() }].slice(-MAX_BLURTS) }),
    }),
    { name: storageKey("recall"), storage: shipStorage, version: 1 },
  ),
);

export function dueNow(cards: readonly Flashcard[], now = Date.now(), limit?: number): Flashcard[] {
  return dueCards(cards, now, limit);
}
