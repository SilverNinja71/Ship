import { describe, expect, it } from "vitest";
import { BOTTLE_LIMITS } from "@ship/shared-types";
import { bottleNoteMarkdown, checkDraft, cleanShareUrl, cleanTags, personalInfoWarnings, sourceTypeOf, visibleBottles } from "./bottleRules.js";

describe("cleaning links before they go in a bottle", () => {
  it("removes tracking codes and the code that points back at the sharer", () => {
    const r = cleanShareUrl("https://youtu.be/abc123?si=SHARER&t=42&utm_source=ig");
    expect(r).toEqual({ ok: true, url: "https://youtu.be/abc123?t=42", removed: ["si", "utm_source"] });
    expect(cleanShareUrl("https://example.edu/notes?si=keep&fbclid=x")).toMatchObject({ ok: true, url: "https://example.edu/notes?si=keep" });
  });

  it("only takes plain https links", () => {
    expect(cleanShareUrl("http://example.com")).toMatchObject({ ok: false });
    expect(cleanShareUrl("javascript:alert(1)")).toMatchObject({ ok: false });
    expect(cleanShareUrl("https://me:secret@example.com")).toMatchObject({ ok: false });
    expect(cleanShareUrl("not a link")).toMatchObject({ ok: false });
  });

  it("sorts sources by what they are", () => {
    expect(sourceTypeOf("https://www.youtube.com/watch?v=x")).toBe("video");
    expect(sourceTypeOf("https://school.edu/handout.PDF")).toBe("pdf");
    expect(sourceTypeOf("https://en.wikipedia.org/wiki/Cell")).toBe("article");
    expect(sourceTypeOf("https://www.khanacademy.org/science")).toBe("website");
  });
});

describe("spotting personal details", () => {
  it("warns about emails, phone numbers, addresses, names and personal cloud files", () => {
    expect(personalInfoWarnings(["Ask me at ana@school.edu"], null)).toHaveLength(1);
    expect(personalInfoWarnings(["Call 555-123-4567"], null)).toHaveLength(1);
    expect(personalInfoWarnings(["Meet at 12 Oak Street"], null)).toHaveLength(1);
    expect(personalInfoWarnings(["Hi, my name is Ana Lopez"], null)).toHaveLength(1);
    expect(personalInfoWarnings([], "https://docs.google.com/document/d/abc/edit")).toHaveLength(1);
    expect(personalInfoWarnings(["Cells make ATP in 1953 and 2026"], "https://en.wikipedia.org/wiki/Cell")).toEqual([]);
  });
});

describe("making a bottle from a draft", () => {
  it("makes a clean source bottle", () => {
    const r = checkDraft({ kind: "source", title: "  Krebs cycle   explained ", url: "https://youtu.be/k?si=me", subject: " Biology ", tags: "bio, #Unit-2 bio", description: "Clear 8-minute video." });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bottle).toEqual({
      kind: "source",
      title: "Krebs cycle explained",
      url: "https://youtu.be/k",
      sourceType: "video",
      subject: "Biology",
      subjectKey: "biology",
      tags: ["bio", "unit-2"],
      description: "Clear 8-minute video.",
      cardCount: 0,
      preview: [],
      reports: 0,
    });
    expect(r.removedParams).toEqual(["si"]);
  });

  it("makes a deck bottle with a preview, dropping half-empty cards", () => {
    const cards = [{ front: "ATP?", back: "Energy" }, { front: "", back: "x" }, ...Array.from({ length: 5 }, (_, i) => ({ front: `Q${i}`, back: `A${i}` }))];
    const r = checkDraft({ kind: "deck", title: "Cells", subject: "Bio", tags: [], description: "", cards });
    expect(r.ok && r.bottle.cardCount).toBe(6);
    expect(r.ok && r.bottle.preview).toHaveLength(BOTTLE_LIMITS.preview);
    expect(r.ok && r.bottle.url).toBeNull();
  });

  it("says what to fix", () => {
    const r = checkDraft({ kind: "source", title: "", url: "http://x.com", subject: "", tags: "", description: "x".repeat(600) });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.problems).toHaveLength(3);
    expect(checkDraft({ kind: "deck", title: "Empty", subject: "", tags: "", description: "", cards: [] }).ok).toBe(false);
  });

  it("keeps tags short and few", () => {
    expect(cleanTags(Array.from({ length: 12 }, (_, i) => `t${i}`))).toHaveLength(BOTTLE_LIMITS.tags);
  });
});

describe("browsing", () => {
  it("hides bottles with too many reports and shows the newest first", () => {
    const list = visibleBottles([
      { id: "a", reports: 0, at: 1 },
      { id: "b", reports: BOTTLE_LIMITS.hideAtReports, at: 3 },
      { id: "c", reports: 1, at: 2 },
    ]);
    expect(list.map((b) => b.id)).toEqual(["c", "a"]);
  });

  it("turns a source into a note that says where it came from", () => {
    const md = bottleNoteMarkdown({ title: "Cells", url: "https://x.edu/c", description: "Good.", tags: ["bio"], subject: "Biology" });
    expect(md).toContain("[Open the source](https://x.edu/c)");
    expect(md).toContain("> [!info] From Bottle Bay");
    expect(md).toContain("#bio");
  });
});
