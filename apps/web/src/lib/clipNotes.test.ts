import { describe, expect, it } from "vitest";
import { clipToMarkdown } from "@ship/integrations";
import { noteFromClip } from "./clipNotes.js";

describe("clips as notes", () => {
  it("reads a Web Clipper note: properties kept, text without them", () => {
    const markdown = clipToMarkdown({ title: "Cells: a guide", url: "https://bio.example/cells", content: "# Cells\n\nSmall.", author: "Ana", tags: ["bio"], created: Date.UTC(2026, 10, 23) });
    const note = noteFromClip({ id: "abc", title: "Cells: a guide", url: "https://bio.example/cells", markdown, at: 5 })!;
    expect(note).toMatchObject({ id: "clip:abc", source: "clip", title: "Cells: a guide", subject: "Clippings", url: "https://bio.example/cells", modified: 5 });
    expect(note.pages.map((p) => p.text).join("")).toBe("# Cells\n\nSmall.");
    expect(note.properties).toMatchObject({ author: ["Ana"], tags: ["clippings", "bio"], source: "https://bio.example/cells" });
  });

  it("refuses anything that isn't a clip of a web page", () => {
    expect(noteFromClip({ id: "a", url: "javascript:alert(1)", markdown: "x", at: 1 })).toBeNull();
    expect(noteFromClip({ id: "", url: "https://x.example", markdown: "x", at: 1 })).toBeNull();
    expect(noteFromClip({ id: "a", url: "https://x.example", markdown: " ", at: 1 })).toBeNull();
    expect(noteFromClip(null)).toBeNull();
  });
});
