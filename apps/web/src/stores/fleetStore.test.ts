import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NoteDocument } from "@ship/shared-types";
import { mergeNotes, useFleet } from "./fleetStore.js";

// The stores persist to localStorage, which Node doesn't have; they just warn and carry on.
vi.spyOn(console, "warn").mockImplementation(() => {});

const note = (id: string, title: string, text = "Words"): NoteDocument => ({ id, source: "file", title, subject: null, created: null, modified: null, pages: [{ id: "1", text }] });

beforeEach(() => useFleet.setState({ notes: [], assignments: [] }));

describe("mergeNotes", () => {
  it("replaces notes with the same id and sorts them the way a person would", () => {
    const merged = mergeNotes([note("a", "Lecture 10"), note("b", "Lecture 2", "old")], [note("b", "Lecture 2", "new"), note("c", "lecture 1")]);
    expect(merged.map((n) => n.title)).toEqual(["lecture 1", "Lecture 2", "Lecture 10"]);
    expect(merged[1].pages[0].text).toBe("new");
  });
});

describe("importFiles", () => {
  it("keeps uploads as notes, and reports each file's problems by name", async () => {
    const summary = await useFleet.getState().importFiles([
      { name: "Week 1.txt", data: "Cells have a nucleus." },
      { name: "old.ppt", data: new Uint8Array([0xd0, 0xcf]) },
    ]);
    expect(summary).toMatchObject({ files: 2, notes: 1 });
    expect(useFleet.getState().notes.map((n) => n.title)).toEqual(["Week 1"]);
    expect(summary.warnings).toHaveLength(1);
    expect(summary.warnings[0]).toMatch(/^old\.ppt: Ship can't read \.ppt files/);
  });

  it("removes a note", async () => {
    useFleet.setState({ notes: [note("a", "One"), note("b", "Two")] });
    useFleet.getState().removeNote("a");
    expect(useFleet.getState().notes.map((n) => n.id)).toEqual(["b"]);
  });
});
