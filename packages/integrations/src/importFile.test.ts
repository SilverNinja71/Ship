import { describe, expect, it } from "vitest";
import { decodeText, importFile } from "./importFile.js";
import { writeBplist } from "./testing/bplistWriter.js";

const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};
const opts = () => ({ now: () => 5, newId: ids() });

describe("importFile", () => {
  it("reads .parchment notebooks", () => {
    const bytes = writeBplist({
      magic: "parchment-archive",
      version: 1,
      notebook: { id: "N1", title: "Bio", pages: [{ id: "p", textBlocks: [{ text: "Cells" }] }] },
      drawings: {},
    });
    const result = importFile("Bio.parchment", bytes, opts());
    expect(result.notes).toEqual([
      { id: "parchment:N1", source: "parchment", title: "Bio", subject: null, created: null, modified: null, pages: [{ id: "p", text: "Cells" }] },
    ]);
    expect(result.cards).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("sniffs a bplist even without the extension", () => {
    const bytes = writeBplist({ magic: "parchment-archive", version: 1, notebook: { pages: [] } });
    expect(importFile("download", bytes, opts()).notes).toHaveLength(1);
  });

  it("reads study.json", () => {
    const json = JSON.stringify({ decks: [{ id: "D", name: "Deck", created: 0 }], cards: [{ id: "C", deckId: "D", front: "f", back: "b" }], pageSchedules: [], reviewLog: [] });
    const result = importFile("study.json", new TextEncoder().encode(json), opts());
    expect(result.decks.map((d) => d.id)).toEqual(["parchment:D"]);
    expect(result.cards.map((c) => c.id)).toEqual(["parchment:C"]);
    expect(result.assignments).toEqual([]);
  });

  it("refuses other JSON", () => {
    expect(importFile("package.json", '{"name":"x"}', opts()).warnings).toEqual([
      "package.json isn't a Parchment study file, so nothing was imported.",
    ]);
  });

  it("reads CSV and TSV decks named after the file", () => {
    const csv = importFile("Spanish Vocab.csv", "front,back\nperro,dog\n", opts());
    expect(csv.decks).toEqual([{ id: "id1", name: "Spanish Vocab", subject: null, created: 5, source: "csv" }]);
    expect(csv.cards.map((c) => c.back)).toEqual(["dog"]);
    // .tsv forces tabs even when commas would also split the rows.
    const tsv = importFile("v.tsv", "a, b\tc\n", opts());
    expect(tsv.cards.map((c) => [c.front, c.back])).toEqual([["a, b", "c"]]);
  });

  it("reads .ics files as assignments", () => {
    const ics = "BEGIN:VCALENDAR\r\nBEGIN:VTODO\r\nUID:1\r\nSUMMARY:Essay\r\nEND:VTODO\r\nEND:VCALENDAR\r\n";
    expect(importFile("lodestar.ics", ics, opts()).assignments[0]).toMatchObject({ id: "lodestar:1", source: "lodestar" });
    expect(importFile("feed.ics", ics, { ...opts(), icsSource: "canvas" }).assignments[0]?.source).toBe("canvas");
  });

  it("treats tab-separated .txt as cards and prose as a note", () => {
    const cards = importFile("quizlet.txt", "perro\tdog\ngato\tcat\n", opts());
    expect(cards.cards).toHaveLength(2);
    expect(cards.notes).toEqual([]);

    const prose = importFile("journal.txt", "Today, I studied cells, and then, rested.\nMore, commas, here.", opts());
    expect(prose.cards).toEqual([]);
    expect(prose.notes).toEqual([
      {
        id: "id1",
        source: "paper",
        title: "journal",
        subject: null,
        created: null,
        modified: null,
        pages: [{ id: "1", text: "Today, I studied cells, and then, rested.\nMore, commas, here." }],
      },
    ]);
  });

  it("imports Paper exports as notes when asked", () => {
    const result = importFile("sketch.txt", "perro\tdog\n", { ...opts(), paper: true });
    expect(result.cards).toEqual([]);
    expect(result.notes[0]).toMatchObject({ source: "paper", title: "sketch" });
    expect(importFile("ideas.md", "# Ideas", opts()).notes[0]?.pages).toEqual([{ id: "1", text: "# Ideas" }]);
  });

  it("turns broken files into warnings instead of throwing", () => {
    expect(importFile("bad.parchment", new Uint8Array([1, 2, 3]), opts()).warnings[0]).toMatch(/^Couldn't read bad.parchment:/);
    expect(importFile("bad.json", "{nope", opts()).warnings[0]).toMatch(/^Couldn't read bad.json:/);
    expect(importFile("photo.png", new Uint8Array([0x89]), opts()).warnings).toEqual(["Ship doesn't know how to import .png files."]);
  });
});

describe("decodeText", () => {
  it("honors byte-order marks", () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69]))).toBe("hi");
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x68, 0x00, 0xe9, 0x00]))).toBe("hé");
    expect(decodeText(new Uint8Array([0xfe, 0xff, 0x00, 0x68, 0x00, 0xe9]))).toBe("hé");
    expect(decodeText("﻿plain")).toBe("plain");
  });
});
