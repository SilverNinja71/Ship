// Parchment's flashcards: `study.json` = { decks, cards, pageSchedules,
// reviewLog }, written by Swift's JSONEncoder. Its default date encoding is a
// bare number of seconds since 2001-01-01. Parchment's ReviewSchedule uses
// the same SM-2 fields and 1–5 scale as Ship, so schedules carry over.
//
// Key names inside decks and cards are guesses, so lookups accept a few
// spellings (and ignore case and underscores).

import { newReviewSchedule } from "@ship/shared-types";
import type { Deck, Flashcard, ImportResult, ReviewSchedule } from "@ship/shared-types";
import { toEpochMs } from "../time.js";
import type { NumericDateEncoding } from "../time.js";
import { asArray, asDict, asId, asNumber, asText, isDict, pickLoose, systemClock } from "../values.js";
import type { Clock, Dict } from "../values.js";

export interface ParchmentStudyOptions {
  now?: Clock;
  /** How bare-number dates are encoded. Swift's default is "apple-seconds". */
  numericDates?: NumericDateEncoding;
}

/** True for JSON that has Parchment's study-file keys. */
export function looksLikeParchmentStudy(value: unknown): boolean {
  const d = asDict(value);
  const isCollection = (v: unknown) => Array.isArray(v) || isDict(v);
  return d !== null && (isCollection(d["cards"]) || isCollection(d["decks"]));
}

/**
 * A collection may be a JSON array, an object keyed by id, or (Swift encodes
 * `[UUID: Value]` this way) a flat array alternating key, value, key, value.
 */
function entries(value: unknown): { key: string | null; value: unknown }[] {
  if (Array.isArray(value)) {
    const alternating =
      value.length >= 2 &&
      value.length % 2 === 0 &&
      value.every((v, i) => (i % 2 === 0 ? typeof v === "string" : isDict(v)));
    if (alternating) {
      const out: { key: string | null; value: unknown }[] = [];
      for (let i = 0; i < value.length; i += 2) out.push({ key: value[i] as string, value: value[i + 1] });
      return out;
    }
    return value.map((v) => ({ key: null, value: v }));
  }
  const dict = asDict(value);
  return dict ? Object.entries(dict).map(([key, v]) => ({ key, value: v })) : [];
}

const CARD_FRONT = ["front", "question", "prompt", "term", "frontText"];
const CARD_BACK = ["back", "answer", "response", "definition", "backText"];
const CREATED = ["created", "createdAt", "creationDate", "dateCreated", "added", "addedAt"];

function readSchedule(source: Dict, numeric: NumericDateEncoding, lastFromLog: number | null): ReviewSchedule {
  const nested = asDict(pickLoose(source, ["schedule", "reviewSchedule", "review", "srs", "sm2"]));
  const s = nested ?? source;
  const fresh = newReviewSchedule();
  const ease = asNumber(pickLoose(s, ["ease", "easeFactor", "ef", "easiness"]));
  const intervalDays = asNumber(pickLoose(s, ["interval", "intervalDays", "intervalInDays"]));
  const intervalSeconds = asNumber(pickLoose(s, ["intervalSeconds"]));
  const repetitions = asNumber(pickLoose(s, ["repetitions", "reps", "repetition", "streak"]));
  const lapses = asNumber(pickLoose(s, ["lapses", "lapseCount", "failures"]));
  const due = toEpochMs(pickLoose(s, ["due", "dueDate", "dueAt", "nextReview", "nextReviewDate", "nextDue"]), numeric);
  const last = toEpochMs(
    pickLoose(s, ["lastReviewed", "lastReview", "lastReviewDate", "lastReviewedAt", "reviewedAt"]),
    numeric,
  );
  const stability = asNumber(pickLoose(s, ["stability"]));
  const difficulty = asNumber(pickLoose(s, ["difficulty"]));
  const nothingKnown = [ease, intervalDays, intervalSeconds, repetitions, lapses, due, last].every((v) => v === null);
  if (nothingKnown) return { ...fresh, lastReviewed: lastFromLog };

  const schedule: ReviewSchedule = {
    ease: ease !== null ? Math.max(1.3, ease) : fresh.ease,
    interval: intervalDays ?? (intervalSeconds !== null ? intervalSeconds / 86400 : fresh.interval),
    repetitions: repetitions !== null ? Math.max(0, Math.round(repetitions)) : fresh.repetitions,
    lapses: lapses !== null ? Math.max(0, Math.round(lapses)) : fresh.lapses,
    due: due ?? fresh.due,
    lastReviewed: last ?? lastFromLog,
  };
  if (stability !== null) schedule.stability = stability;
  if (difficulty !== null) schedule.difficulty = difficulty;
  return schedule;
}

/** Latest review time per card id, from the review log. */
function lastReviews(log: unknown, numeric: NumericDateEncoding): Map<string, number> {
  const latest = new Map<string, number>();
  for (const { value } of entries(log)) {
    const entry = asDict(value);
    const cardId = asId(pickLoose(entry, ["cardId", "card"]));
    const at = toEpochMs(pickLoose(entry, ["date", "reviewedAt", "timestamp", "reviewed", "at"]), numeric);
    if (cardId && at !== null && at > (latest.get(cardId) ?? -Infinity)) latest.set(cardId, at);
  }
  return latest;
}

/** Maps a parsed (or raw string) study.json to Ship decks and cards. Ids are `parchment:<Parchment id>`. */
export function parseParchmentStudy(input: unknown, options: ParchmentStudyOptions = {}): ImportResult {
  const now = options.now ?? systemClock;
  const numeric = options.numericDates ?? "apple-seconds";
  const json: unknown = typeof input === "string" ? JSON.parse(input.replace(/^﻿/, "")) : input;
  const root = asDict(json);
  const warnings: string[] = [];
  if (!root) return { notes: [], decks: [], cards: [], assignments: [], warnings: ["The study file isn't a JSON object."] };

  const decks: Deck[] = [];
  const deckIds = new Map<string, string>();
  const inlineCards: unknown[] = [];
  let skippedDecks = 0;

  for (const { key, value } of entries(root["decks"])) {
    const deck = asDict(value);
    const remoteId = asId(pickLoose(deck, ["id", "uuid"])) ?? key;
    if (!deck || !remoteId || deckIds.has(remoteId)) {
      skippedDecks++;
      continue;
    }
    const id = `parchment:${remoteId}`;
    deckIds.set(remoteId, id);
    decks.push({
      id,
      name: asText(pickLoose(deck, ["name", "title"])) ?? "Parchment deck",
      subject: asText(pickLoose(deck, ["subject", "course"])),
      created: toEpochMs(pickLoose(deck, CREATED), numeric) ?? now(),
      source: "parchment",
    });
    // Some layouts may nest cards inside their deck.
    for (const c of entries(pickLoose(deck, ["cards"]))) {
      const card = asDict(c.value);
      if (card) inlineCards.push(pickLoose(card, ["deckId", "deck"]) === undefined ? { ...card, deckId: remoteId } : card);
    }
  }

  const reviewed = lastReviews(root["reviewLog"], numeric);
  const cards: Flashcard[] = [];
  const cardIds = new Set<string>();
  let skippedCards = 0;
  let fallbackDeck: Deck | null = null;

  const allCards = [...entries(root["cards"]), ...inlineCards.map((value) => ({ key: null, value }))];
  for (const { key, value } of allCards) {
    const card = asDict(value);
    const front = asText(pickLoose(card, CARD_FRONT));
    const back = asText(pickLoose(card, CARD_BACK));
    const remoteId = asId(pickLoose(card, ["id", "uuid"])) ?? key;
    if (!card || !front || !back || !remoteId || cardIds.has(remoteId)) {
      skippedCards++;
      continue;
    }
    cardIds.add(remoteId);
    const deckRemoteId = asId(pickLoose(card, ["deckId", "deck"]));
    let deckId = deckRemoteId ? deckIds.get(deckRemoteId) : undefined;
    if (!deckId) {
      if (!fallbackDeck) {
        fallbackDeck = { id: "parchment:unfiled", name: "Parchment cards", subject: null, created: now(), source: "parchment" };
        decks.push(fallbackDeck);
        warnings.push(`Some cards had no matching deck; they were put in "${fallbackDeck.name}".`);
      }
      deckId = fallbackDeck.id;
    }
    cards.push({
      id: `parchment:${remoteId}`,
      deckId,
      front,
      back,
      created: toEpochMs(pickLoose(card, CREATED), numeric) ?? now(),
      schedule: readSchedule(card, numeric, reviewed.get(remoteId) ?? null),
    });
  }

  if (skippedDecks > 0) warnings.push(`Skipped ${skippedDecks} deck(s) without an id, or repeated.`);
  if (skippedCards > 0) warnings.push(`Skipped ${skippedCards} card(s) missing a front, back or id, or repeated.`);
  const pageSchedules = entries(root["pageSchedules"]).length;
  if (pageSchedules > 0) {
    warnings.push(`${pageSchedules} page review schedule(s) weren't imported; Ship reviews cards, not pages.`);
  }
  if (cards.length === 0) warnings.push("No flashcards were found in the study file.");
  return { notes: [], decks, cards, assignments: [], warnings };
}
