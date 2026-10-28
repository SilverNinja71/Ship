import { describe, expect, it } from "vitest";
import { newReviewSchedule } from "@ship/shared-types";
import { detectDelimiter, detectHeader, importCsvCards, parseDelimited } from "./csv.js";

const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};
const now = () => 1_000;

describe("parseDelimited", () => {
  it("handles quotes, doubled quotes and embedded delimiters", () => {
    const { rows } = parseDelimited('a,"b, with comma","say ""hi"""\n', ",");
    expect(rows).toEqual([["a", "b, with comma", 'say "hi"']]);
  });

  it("keeps newlines inside quoted fields and accepts CRLF, LF and CR row ends", () => {
    const { rows } = parseDelimited('q1,"line one\r\nline two"\r\nq2,a2\rq3,a3\nq4,a4', ",");
    expect(rows).toEqual([
      ["q1", "line one\r\nline two"],
      ["q2", "a2"],
      ["q3", "a3"],
      ["q4", "a4"],
    ]);
  });

  it("keeps empty fields and a trailing empty quoted field", () => {
    expect(parseDelimited('a,,c\n"",x\ny,""', ",").rows).toEqual([
      ["a", "", "c"],
      ["", "x"],
      ["y", ""],
    ]);
  });

  it("treats a quote in the middle of a field as a literal", () => {
    expect(parseDelimited('5" ruler,length', ",").rows).toEqual([['5" ruler', "length"]]);
  });

  it("flags an unterminated quote", () => {
    const result = parseDelimited('a,"never closed\nb,c', ",");
    expect(result.unterminatedQuote).toBe(true);
    expect(result.rows).toEqual([["a", "never closed\nb,c"]]);
  });
});

describe("detectDelimiter", () => {
  it("finds tabs, semicolons and commas", () => {
    expect(detectDelimiter("perro\tdog\ngato\tcat")).toBe("\t");
    expect(detectDelimiter("Paris;capital, France\nRome;capital, Italy")).toBe(";");
    expect(detectDelimiter("front,back\nq,a\nq2,a2")).toBe(",");
  });

  it("ignores delimiters inside quotes", () => {
    expect(detectDelimiter('"a;b";"c"\n"d;e";"f"')).toBe(";");
    expect(detectDelimiter('"a\tb",c\n"d\te",f')).toBe(",");
  });

  it("prefers tab when answers contain commas", () => {
    expect(detectDelimiter("Mitochondria\tmakes ATP, mostly\nRibosome\tbuilds proteins, from mRNA")).toBe("\t");
  });
});

describe("detectHeader", () => {
  it("recognizes common header names", () => {
    expect(detectHeader(["Front", "Back"])).toEqual({ front: 0, back: 1, deck: null });
    expect(detectHeader(["Deck", "Term", "Definition"])).toEqual({ front: 1, back: 2, deck: 0 });
    expect(detectHeader(["Question", "Answer", "Topic"])).toEqual({ front: 0, back: 1, deck: 2 });
    expect(detectHeader(["perro", "dog"])).toBeNull();
  });
});

describe("importCsvCards", () => {
  it("imports a headed CSV with a deck column", () => {
    const csv = "Deck,Term,Definition\nSpanish,perro,dog\nSpanish,gato,cat\nFrench,chien,dog\n";
    const result = importCsvCards(csv, { now, newId: ids() });
    expect(result.hasHeader).toBe(true);
    expect(result.decks).toEqual([
      { id: "id1", name: "Spanish", subject: null, created: 1_000, source: "csv" },
      { id: "id4", name: "French", subject: null, created: 1_000, source: "csv" },
    ]);
    expect(result.cards).toEqual([
      { id: "id2", deckId: "id1", front: "perro", back: "dog", created: 1_000, schedule: newReviewSchedule() },
      expect.objectContaining({ front: "gato", deckId: "id1" }),
      expect.objectContaining({ front: "chien", deckId: "id4" }),
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("imports headerless TSV into the default deck", () => {
    const result = importCsvCards("﻿perro\tdog\n\ngato\tcat\n", { deckName: "Vocab", now, newId: ids() });
    expect(result.delimiter).toBe("\t");
    expect(result.hasHeader).toBe(false);
    expect(result.decks.map((d) => d.name)).toEqual(["Vocab"]);
    expect(result.cards.map((c) => [c.front, c.back])).toEqual([
      ["perro", "dog"],
      ["gato", "cat"],
    ]);
  });

  it("keeps multi-line answers and trims the ends", () => {
    const result = importCsvCards('"  Krebs cycle  ","Step 1\nStep 2  "', { now, newId: ids() });
    expect(result.cards[0]).toMatchObject({ front: "Krebs cycle", back: "Step 1\nStep 2" });
  });

  it("skips rows without a front or back and warns", () => {
    const result = importCsvCards("q1,a1\nlonely\n,a3\nq4,\n", { now, newId: ids() });
    expect(result.cards).toHaveLength(1);
    expect(result.skippedRows).toBe(3);
    expect(result.warnings).toEqual(["Skipped 3 row(s) without both a front and a back."]);
  });

  it("honors a forced header and delimiter", () => {
    const result = importCsvCards("perro;dog\ngato;cat", { hasHeader: true, delimiter: ";", now, newId: ids() });
    expect(result.cards.map((c) => c.front)).toEqual(["gato"]);
    const noHeader = importCsvCards("Front,Back\nq,a", { hasHeader: false, now, newId: ids() });
    expect(noHeader.cards.map((c) => c.front)).toEqual(["Front", "q"]);
  });

  it("warns on an empty file and an unclosed quote", () => {
    expect(importCsvCards("", { now, newId: ids() }).warnings).toEqual([
      "No flashcards were found. Each row needs a front and a back.",
    ]);
    const open = importCsvCards('q,"a never ends', { now, newId: ids() });
    expect(open.cards).toHaveLength(1);
    expect(open.warnings[0]).toMatch(/never closed/);
  });
});
