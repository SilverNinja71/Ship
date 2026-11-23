import { describe, expect, it } from "vitest";
import {
  cardsForVaultNote,
  clipToMarkdown,
  deckToMarkdown,
  inlineCards,
  isVaultNotePath,
  noteFromMarkdown,
  noteTags,
  parseFrontmatter,
  resolveWikilink,
  safeFileName,
  splitMarkdownPages,
  wikilinks,
  writeFrontmatter,
} from "./index.js";

const clipped = `---
title: "How cells make energy: a guide"
source: "https://example.com/cells"
author:
  - "[[Dana Lee]]"
published: 2026-10-02
created: 2026-11-23
description: "A friendly walk through respiration."
tags:
  - "clippings"
  - biology
---
# Respiration

Mitochondria make most of the cell's ATP. See [[Krebs cycle]] and #unit/2.
`;

describe("properties", () => {
  it("reads what Obsidian and Web Clipper write", () => {
    const { properties, body } = parseFrontmatter(clipped);
    expect(properties).toEqual({
      title: "How cells make energy: a guide",
      source: "https://example.com/cells",
      author: ["[[Dana Lee]]"],
      published: "2026-10-02",
      created: "2026-11-23",
      description: "A friendly walk through respiration.",
      tags: ["clippings", "biology"],
    });
    expect(body.startsWith("# Respiration")).toBe(true);
    expect(parseFrontmatter("no properties here").properties).toEqual({});
    expect(parseFrontmatter("---\ntags: [a, 'b c']\n---\nx").properties.tags).toEqual(["a", "b c"]);
  });

  it("writes them back so they read the same", () => {
    const props = { title: 'Say "hi": now', tags: ["a", "b"], empty: "", gone: null, n: "2026-01-01" };
    expect(parseFrontmatter(`${writeFrontmatter(props)}body`).properties).toEqual({ title: 'Say "hi": now', tags: ["a", "b"], n: "2026-01-01" });
  });
});

describe("reading a vault", () => {
  it("keeps to the sailor's own Markdown notes", () => {
    expect(isVaultNotePath("Biology/Cells.md")).toBe(true);
    expect(isVaultNotePath(".obsidian/workspace.md")).toBe(false);
    expect(isVaultNotePath("Notes/.trash/old.md")).toBe(false);
    expect(isVaultNotePath("Ship/Planner.md")).toBe(false);
    expect(isVaultNotePath("Pictures/cell.png")).toBe(false);
  });

  it("turns a file into a note, using its title, folder and source", () => {
    const note = noteFromMarkdown("Clippings/cells.md", clipped, 123);
    expect(note).toMatchObject({ id: "obsidian:Clippings/cells.md", source: "obsidian", title: "How cells make energy: a guide", subject: "Clippings", modified: 123, url: "https://example.com/cells" });
    expect(note.pages[0]!.text.startsWith("# Respiration")).toBe(true);
    expect(note.created).toBe(Date.parse("2026-11-23"));
    expect(noteFromMarkdown("Plain.md", "Hello", null)).toMatchObject({ title: "Plain", subject: null, pages: [{ id: "1", text: "Hello" }] });
  });

  it("splits long notes at their headings, but not inside code", () => {
    const long = `# One\n${"a ".repeat(2500)}\n\`\`\`\n# not a heading\n\`\`\`\n## Two\n${"b ".repeat(2500)}`;
    const pages = splitMarkdownPages(long);
    expect(pages.map((p) => p.text.split("\n")[0])).toEqual(["# One", "## Two"]);
  });

  it("finds links, embeds and tags, skipping code", () => {
    const md = "See [[Krebs cycle]], [[Bio/ATP|energy]], [[Cells#Organelles]] and ![[diagram.png]]. `[[not a link]]` #bio #2024 a#b";
    expect(wikilinks(md)).toEqual([
      { target: "Krebs cycle", heading: null, alias: null, embed: false },
      { target: "Bio/ATP", heading: null, alias: "energy", embed: false },
      { target: "Cells", heading: "Organelles", alias: null, embed: false },
      { target: "diagram.png", heading: null, alias: null, embed: true },
    ]);
    expect(noteTags(clipped).sort()).toEqual(["biology", "clippings", "unit/2"]);
    expect(noteTags(md)).toEqual(["bio"]);
  });

  it("follows a link to a note by title or path, in any case", () => {
    const notes = [
      { id: "obsidian:Bio/ATP.md", title: "ATP" },
      { id: "obsidian:Clippings/c.md", title: "How cells make energy" },
      { id: "file:1", title: "Lecture 1" },
    ];
    expect(resolveWikilink("atp", notes)?.id).toBe("obsidian:Bio/ATP.md");
    expect(resolveWikilink("Bio/ATP", notes)?.id).toBe("obsidian:Bio/ATP.md");
    expect(resolveWikilink("c", notes)?.id).toBe("obsidian:Clippings/c.md");
    expect(resolveWikilink("lecture 1", notes)?.id).toBe("file:1");
    expect(resolveWikilink("Nope", notes)).toBeNull();
  });
});

describe("flashcards in notes", () => {
  const md = "---\ntags: [flashcards]\n---\n- Powerhouse of the cell::Mitochondria\nATP:::Adenosine triphosphate <!--SR:!2026-11-30,3,250-->\n```\ncode::not a card\n```\nhttps://x.com::nope\nJust a sentence.";

  it("reads question::answer lines, both-ways ::: ones, and skips code", () => {
    expect(inlineCards(md)).toEqual([
      { front: "Powerhouse of the cell", back: "Mitochondria", reversed: false },
      { front: "ATP", back: "Adenosine triphosphate", reversed: true },
    ]);
  });

  it("makes a deck with ids that stay the same from one sync to the next", () => {
    const a = cardsForVaultNote("Bio/Cells.md", md, 1)!;
    const b = cardsForVaultNote("Bio/Cells.md", md, 2)!;
    expect(a.deck).toMatchObject({ id: "obsidian:Bio/Cells.md", name: "Cells", source: "obsidian" });
    expect(a.cards.map((c) => [c.front, c.back])).toEqual([
      ["Powerhouse of the cell", "Mitochondria"],
      ["ATP", "Adenosine triphosphate"],
      ["Adenosine triphosphate", "ATP"],
    ]);
    expect(a.cards.map((c) => c.id)).toEqual(b.cards.map((c) => c.id));
    expect(cardsForVaultNote("x.md", "no cards", 1)).toBeNull();
  });

  it("writes a deck the plugin can read back", () => {
    const md2 = deckToMarkdown({ name: "Cells" }, [{ front: "Two\nlines", back: "A::B" }]);
    expect(inlineCards(md2)).toEqual([{ front: "Two lines", back: "A: :B", reversed: false }]);
    expect(md2).toContain("# Cells");
  });
});

describe("clippings", () => {
  it("match Obsidian Web Clipper's default note", () => {
    const md = clipToMarkdown({
      title: "Cells: a guide",
      url: "https://example.com/cells",
      content: "# Cells\n\nText.",
      author: "Dana Lee",
      published: "2026-10-02T10:00:00Z",
      description: "  A friendly\nguide. ",
      tags: ["#biology", "clippings"],
      created: Date.parse("2026-11-23T12:00:00Z"),
    });
    const { properties, body } = parseFrontmatter(md);
    expect(properties).toEqual({
      title: "Cells: a guide",
      source: "https://example.com/cells",
      author: ["Dana Lee"],
      published: "2026-10-02",
      created: "2026-11-23",
      description: "A friendly guide.",
      tags: ["clippings", "biology"],
    });
    expect(body).toBe("# Cells\n\nText.\n");
  });

  it("make titles safe as file names", () => {
    expect(safeFileName('Why? "Cells": a/b | c #1 [x]')).toBe("Why Cells a b c 1 x");
    expect(safeFileName("...")).toBe("Untitled");
  });
});
