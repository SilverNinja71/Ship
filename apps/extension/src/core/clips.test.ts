import { describe, expect, it } from "vitest";
import { ackClips, enqueueClip, MAX_CLIP_CHARS, MAX_CLIPS, obsidianNewNoteUrl, sanitizeClip } from "./clips.js";

const clip = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: "Cells", url: "https://bio.example/cells", markdown: "# Cells", at: 1, ...extra });

describe("clips", () => {
  it("accepts a good clip and trims it to size", () => {
    expect(sanitizeClip(clip("a", { title: "  Cells \n guide " }))).toEqual({ id: "a", title: "Cells guide", url: "https://bio.example/cells", markdown: "# Cells", at: 1 });
    expect(sanitizeClip(clip("a", { markdown: "x".repeat(MAX_CLIP_CHARS + 5) }))!.markdown).toHaveLength(MAX_CLIP_CHARS);
    expect(sanitizeClip(clip("a", { title: "" }))!.title).toBe("https://bio.example/cells");
  });

  it("refuses clips of pages that aren't web pages, and malformed ones", () => {
    expect(sanitizeClip(clip("a", { url: "javascript:alert(1)" }))).toBeNull();
    expect(sanitizeClip(clip("a", { url: "file:///etc/passwd" }))).toBeNull();
    expect(sanitizeClip(clip("a", { markdown: "  " }))).toBeNull();
    expect(sanitizeClip(clip("", {}))).toBeNull();
    expect(sanitizeClip(clip("a", { at: "now" }))).toBeNull();
    expect(sanitizeClip("clip")).toBeNull();
  });

  it("queues the newest clips and drops acknowledged ones", () => {
    let list = enqueueClip([], sanitizeClip(clip("a"))!);
    list = enqueueClip(list, sanitizeClip(clip("a", { title: "New" }))!);
    expect(list.map((c) => c.title)).toEqual(["New"]);
    for (let i = 0; i < MAX_CLIPS + 3; i++) list = enqueueClip(list, sanitizeClip(clip(`c${i}`))!);
    expect(list).toHaveLength(MAX_CLIPS);
    expect(list[0]!.id).toBe("c3");
    expect(ackClips(list, ["c3", "c4"])).toHaveLength(MAX_CLIPS - 2);
  });

  it("builds Obsidian's new-note link from the clipboard", () => {
    expect(obsidianNewNoteUrl("Cells: a guide", "Clippings/", "My Vault")).toBe("obsidian://new?vault=My%20Vault&file=Clippings%2FCells%3A%20a%20guide&clipboard");
    expect(obsidianNewNoteUrl("Cells", "", "")).toBe("obsidian://new?file=Cells&clipboard");
  });
});
