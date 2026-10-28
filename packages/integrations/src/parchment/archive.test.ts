import { describe, expect, it } from "vitest";
import { PlistUid } from "./bplist.js";
import { parseParchmentArchive, resolveKeyedArchive } from "./archive.js";
import { writeBplist } from "../testing/bplistWriter.js";
import type { Writable } from "../testing/bplistWriter.js";

const created = new Date(Date.UTC(2026, 8, 1, 9, 0));
const modified = new Date(Date.UTC(2026, 9, 20, 18, 45));

function fakeArchive(overrides: Record<string, Writable> = {}): Record<string, Writable> {
  return {
    magic: "parchment-archive",
    version: 2,
    notebook: {
      id: "8A1F0C2E-1111-4E5B-9C3D-ABCDEF012345",
      title: "Cell Biology",
      subject: "BIO 110",
      created,
      modified,
      pages: [
        {
          id: "P1",
          // Stored out of order; CGRect encodes as [[x, y], [w, h]].
          textBlocks: [
            { id: "T2", text: "ATP is the energy currency.", frame: [[40, 300], [500, 80]] },
            { id: "T1", text: "Mitochondria", frame: [[40, 60], [500, 40]] },
          ],
        },
        { id: "P2", textBlocks: [], drawing: new Uint8Array([1, 2, 3]) },
        { id: "P3", textBlocks: [{ text: "Unicode survives: café, 細胞, 🧬" }] },
      ],
    },
    drawings: { P2: new Uint8Array([9, 9, 9, 9]) },
    pdf: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    coverImage: new Uint8Array([0x89, 0x50]),
    ...overrides,
  };
}

describe("parseParchmentArchive", () => {
  it("reads a PropertyListEncoder-style archive", () => {
    const { note, version, warnings } = parseParchmentArchive(writeBplist(fakeArchive()));
    expect(version).toBe(2);
    expect(note).toEqual({
      id: "parchment:8A1F0C2E-1111-4E5B-9C3D-ABCDEF012345",
      source: "parchment",
      title: "Cell Biology",
      subject: "BIO 110",
      created: created.getTime(),
      modified: modified.getTime(),
      pages: [
        { id: "P1", text: "Mitochondria\n\nATP is the energy currency." },
        { id: "P3", text: "Unicode survives: café, 細胞, 🧬" },
      ],
    });
    expect(warnings.some((w) => w.includes("Handwriting that was never converted to text"))).toBe(true);
    expect(warnings.some((w) => w.includes("1 page(s) had no typed text"))).toBe(true);
    expect(warnings.some((w) => w.includes("PDF"))).toBe(true);
  });

  it("accepts guessed field spellings", () => {
    const bytes = writeBplist({
      magic: "parchment-archive",
      version: 1,
      notebook: {
        uuid: "N-2",
        name: "History",
        subject: { name: "HIST 201" },
        createdAt: created,
        updatedAt: modified,
        pages: [{ uuid: "A", textBlocks: [{ string: "Treaty of Westphalia" }, { text: ["Peace ", "of 1648"] }] }],
      },
      drawings: [],
    });
    const { note, warnings } = parseParchmentArchive(bytes);
    expect(note.id).toBe("parchment:N-2");
    expect(note.title).toBe("History");
    expect(note.subject).toBe("HIST 201");
    expect(note.created).toBe(created.getTime());
    expect(note.modified).toBe(modified.getTime());
    // Without positions for every block, the stored order is kept.
    expect(note.pages).toEqual([{ id: "A", text: "Treaty of Westphalia\n\nPeace of 1648" }]);
    expect(warnings).toEqual([]);
  });

  it("falls back to the file name and an injected id", () => {
    const bytes = writeBplist({ magic: "parchment-archive", version: 1, notebook: { pages: [] }, drawings: {} });
    const { note, warnings } = parseParchmentArchive(bytes, { fileName: "Week 3 Notes.parchment", newId: () => "fixed" });
    expect(note.id).toBe("parchment:fixed");
    expect(note.title).toBe("Week 3 Notes");
    expect(note.subject).toBeNull();
    expect(note.created).toBeNull();
    expect(warnings).toContain("The notebook has no pages.");
  });

  it("warns about a missing or wrong signature but still reads", () => {
    const missing = parseParchmentArchive(writeBplist({ notebook: { title: "X", pages: [] } }));
    expect(missing.note.title).toBe("X");
    expect(missing.warnings[0]).toMatch(/no Parchment signature/);
    const wrong = parseParchmentArchive(writeBplist(fakeArchive({ magic: "other-archive" })));
    expect(wrong.warnings[0]).toMatch(/Unexpected file signature "other-archive"/);
  });

  it("rejects files that aren't notebooks", () => {
    expect(() => parseParchmentArchive(new TextEncoder().encode("hello"))).toThrow(/doesn't look like/);
    expect(() => parseParchmentArchive(new TextEncoder().encode("PK\u0003\u0004..."))).toThrow(/zip/);
    expect(() => parseParchmentArchive(new TextEncoder().encode('<?xml version="1.0"?><plist/>'))).toThrow(/XML/);
    expect(() => parseParchmentArchive(writeBplist(["not", "a", "dict"]))).toThrow(/no notebook/);
    expect(() => parseParchmentArchive(writeBplist({ magic: "parchment-archive", version: 1 }))).toThrow(/no notebook/);
  });

  it("reads an NSKeyedArchiver archive on a best-effort basis", () => {
    const u = (n: number) => new PlistUid(n);
    const objects: Writable[] = [
      "$null",
      // 1: the archive root
      { "NS.keys": [u(2), u(3), u(4), u(5)], "NS.objects": [u(6), u(7), u(8), u(0)], $class: u(20) },
      "magic",
      "version",
      "notebook",
      "pdf",
      "parchment-archive",
      3,
      // 8: the notebook, an NSCoding-style object
      { title: u(9), subject: u(10), created: u(11), pages: u(12), $class: u(21) },
      "Physics",
      { "NS.string": "PHYS 150" },
      { "NS.time": (created.getTime() - Date.UTC(2001, 0, 1)) / 1000 },
      { "NS.objects": [u(13)] },
      { id: u(14), textBlocks: u(15) },
      "page-1",
      { "NS.objects": [u(16)] },
      { text: u(17) },
      "F = ma",
    ];
    const bytes = writeBplist({ $archiver: "NSKeyedArchiver", $version: 100000, $top: { root: u(1) }, $objects: objects });
    const { note, warnings } = parseParchmentArchive(bytes);
    expect(note.title).toBe("Physics");
    expect(note.subject).toBe("PHYS 150");
    expect(note.created).toBe(created.getTime());
    expect(note.pages).toEqual([{ id: "page-1", text: "F = ma" }]);
    expect(warnings[0]).toMatch(/NSKeyedArchiver/);
  });

  it("drops back-references when resolving a cyclic keyed archive", () => {
    const u = (n: number) => new PlistUid(n);
    const resolved = resolveKeyedArchive({
      $top: { root: u(1) },
      $objects: ["$null", { name: "loop", self: u(1) }],
    });
    expect(resolved).toEqual({ name: "loop", self: null });
  });

  it("reads a JSON-encoded notebook as a fallback", () => {
    const json = JSON.stringify({ magic: "parchment-archive", version: 1, notebook: { id: "J", title: "Chem", pages: [{ id: "1", textBlocks: [{ text: "Moles" }] }] } });
    const { note } = parseParchmentArchive(new TextEncoder().encode(json));
    expect(note.pages).toEqual([{ id: "1", text: "Moles" }]);
  });
});
