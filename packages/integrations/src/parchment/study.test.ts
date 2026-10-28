import { describe, expect, it } from "vitest";
import { newReviewSchedule } from "@ship/shared-types";
import { looksLikeParchmentStudy, parseParchmentStudy } from "./study.js";

const REF = Date.UTC(2001, 0, 1);
/** Seconds since 2001-01-01, as Swift's JSONEncoder writes dates by default. */
const swift = (iso: string) => (Date.parse(iso) - REF) / 1000;
const NOW = Date.UTC(2026, 9, 28);
const now = () => NOW;

describe("parseParchmentStudy", () => {
  it("maps decks and cards and converts 2001-based dates", () => {
    const study = {
      decks: [{ id: "D1", name: "Organelles", subject: "BIO 110", created: swift("2026-09-01T10:00:00Z") }],
      cards: [
        {
          id: "C1",
          deckID: "D1",
          front: "Powerhouse of the cell?",
          back: "Mitochondria",
          created: swift("2026-09-02T10:00:00Z"),
          schedule: {
            ease: 2.36,
            interval: 6,
            repetitions: 2,
            lapses: 1,
            due: swift("2026-10-30T08:00:00Z"),
            lastReviewed: swift("2026-10-24T08:00:00Z"),
          },
        },
        { id: "C2", deckID: "D1", question: "Site of photosynthesis?", answer: "Chloroplast" },
      ],
      pageSchedules: [{ pageID: "P1", due: swift("2026-11-01T00:00:00Z") }],
      reviewLog: [
        { cardID: "C2", rating: 4, date: swift("2026-10-01T12:00:00Z") },
        { cardID: "C2", rating: 5, date: swift("2026-10-05T12:00:00Z") },
      ],
    };
    const result = parseParchmentStudy(JSON.stringify(study), { now });

    expect(result.decks).toEqual([
      { id: "parchment:D1", name: "Organelles", subject: "BIO 110", created: Date.parse("2026-09-01T10:00:00Z"), source: "parchment" },
    ]);
    expect(result.cards).toHaveLength(2);
    expect(result.cards[0]).toEqual({
      id: "parchment:C1",
      deckId: "parchment:D1",
      front: "Powerhouse of the cell?",
      back: "Mitochondria",
      created: Date.parse("2026-09-02T10:00:00Z"),
      schedule: {
        ease: 2.36,
        interval: 6,
        repetitions: 2,
        lapses: 1,
        due: Date.parse("2026-10-30T08:00:00Z"),
        lastReviewed: Date.parse("2026-10-24T08:00:00Z"),
      },
    });
    // No schedule of its own: a fresh one, with lastReviewed taken from the review log.
    expect(result.cards[1]?.front).toBe("Site of photosynthesis?");
    expect(result.cards[1]?.created).toBe(NOW);
    expect(result.cards[1]?.schedule).toEqual({ ...newReviewSchedule(), lastReviewed: Date.parse("2026-10-05T12:00:00Z") });
    expect(result.warnings).toEqual([
      "1 page review schedule(s) weren't imported; Ship reviews cards, not pages.",
    ]);
  });

  it("reads the 2001 reference date itself as 978307200000", () => {
    const result = parseParchmentStudy({ decks: [{ id: "D", name: "x", created: 0 }], cards: [] }, { now });
    expect(result.decks[0]?.created).toBe(978_307_200_000);
  });

  it("accepts ISO dates, flat schedule fields and FSRS state", () => {
    const result = parseParchmentStudy(
      {
        decks: [{ id: "D", title: "Spanish", createdAt: "2026-09-01T00:00:00Z" }],
        cards: [
          {
            id: "C",
            deck_id: "D",
            term: "perro",
            definition: "dog",
            easeFactor: 1.1,
            reps: 3,
            nextReview: "2026-11-02T09:00:00Z",
            stability: 12.5,
            difficulty: 4.2,
          },
        ],
      },
      { now },
    );
    expect(result.decks[0]?.name).toBe("Spanish");
    expect(result.decks[0]?.created).toBe(Date.parse("2026-09-01T00:00:00Z"));
    expect(result.cards[0]?.schedule).toEqual({
      ease: 1.3, // clamped to SM-2's floor
      interval: 0,
      repetitions: 3,
      lapses: 0,
      due: Date.parse("2026-11-02T09:00:00Z"),
      lastReviewed: null,
      stability: 12.5,
      difficulty: 4.2,
    });
  });

  it("handles Swift's [UUID: Value] encoding and decks keyed by id", () => {
    const result = parseParchmentStudy(
      {
        decks: { D9: { name: "Keyed deck" } },
        cards: ["C1", { deckId: "D9", front: "a", back: "b" }, "C2", { deckId: "D9", front: "c", back: "d" }],
      },
      { now },
    );
    expect(result.decks.map((d) => d.id)).toEqual(["parchment:D9"]);
    expect(result.cards.map((c) => c.id)).toEqual(["parchment:C1", "parchment:C2"]);
  });

  it("puts orphan cards in a fallback deck and warns about skipped entries", () => {
    const result = parseParchmentStudy(
      {
        decks: [{ name: "no id" }, "junk"],
        cards: [
          { id: "A", deckId: "missing", front: "q", back: "a" },
          { id: "B", front: "only a front" },
          { id: "A", deckId: "missing", front: "dup", back: "dup" },
          42,
        ],
      },
      { now },
    );
    expect(result.decks).toEqual([{ id: "parchment:unfiled", name: "Parchment cards", subject: null, created: NOW, source: "parchment" }]);
    expect(result.cards.map((c) => c.id)).toEqual(["parchment:A"]);
    expect(result.warnings).toEqual([
      'Some cards had no matching deck; they were put in "Parchment cards".',
      "Skipped 2 deck(s) without an id, or repeated.",
      "Skipped 3 card(s) missing a front, back or id, or repeated.",
    ]);
  });

  it("reads cards nested inside decks", () => {
    const result = parseParchmentStudy({ decks: [{ id: "D", name: "N", cards: [{ id: "X", front: "f", back: "b" }] }] }, { now });
    expect(result.cards).toEqual([expect.objectContaining({ id: "parchment:X", deckId: "parchment:D" })]);
  });

  it("supports other numeric date encodings", () => {
    const result = parseParchmentStudy(
      { decks: [{ id: "D", name: "N", created: 1_790_000_000 }], cards: [] },
      { now, numericDates: "unix-seconds" },
    );
    expect(result.decks[0]?.created).toBe(1_790_000_000_000);
  });

  it("reports a file that isn't an object", () => {
    expect(parseParchmentStudy("[1,2]").warnings).toEqual(["The study file isn't a JSON object."]);
  });

  it("recognizes study-shaped JSON", () => {
    expect(looksLikeParchmentStudy({ decks: [], cards: [] })).toBe(true);
    expect(looksLikeParchmentStudy({ cards: {} })).toBe(true);
    expect(looksLikeParchmentStudy({ notes: [] })).toBe(false);
    expect(looksLikeParchmentStudy([])).toBe(false);
  });
});
