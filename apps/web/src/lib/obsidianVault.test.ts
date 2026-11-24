import { describe, expect, it } from "vitest";
import type { NoteDocument } from "@ship/shared-types";
import { DEFAULT_VAULT_OPTIONS, emptyManifest, syncVault } from "./obsidianVault.js";
import type { VaultDirHandle, VaultFileHandle, VaultOutbox } from "./obsidianVault.js";

/** An in-memory vault folder with the File System Access shape. */
class MemoryDir implements VaultDirHandle {
  readonly kind = "directory" as const;
  children = new Map<string, MemoryDir | MemoryFile>();
  constructor(readonly name: string) {}
  async *entries(): AsyncIterable<[string, VaultFileHandle | VaultDirHandle]> {
    for (const entry of this.children) yield entry;
  }
  async getDirectoryHandle(name: string, o?: { create?: boolean }) {
    let d = this.children.get(name);
    if (!d && o?.create) this.children.set(name, (d = new MemoryDir(name)));
    if (!(d instanceof MemoryDir)) throw new Error(`NotFoundError: ${name}`);
    return d;
  }
  async getFileHandle(name: string, o?: { create?: boolean }) {
    let f = this.children.get(name);
    if (!f && o?.create) this.children.set(name, (f = new MemoryFile(name, "")));
    if (!(f instanceof MemoryFile)) throw new Error(`NotFoundError: ${name}`);
    return f;
  }
  async removeEntry(name: string) {
    if (!this.children.delete(name)) throw new Error(`NotFoundError: ${name}`);
  }
  /** Test helpers: write and read by path. */
  put(path: string, text: string, modified = 1) {
    const parts = path.split("/");
    let d: MemoryDir = this;
    for (const p of parts.slice(0, -1)) d = (d.children.get(p) as MemoryDir) ?? (d.children.set(p, new MemoryDir(p)).get(p) as MemoryDir);
    d.children.set(parts.at(-1)!, new MemoryFile(parts.at(-1)!, text, modified));
  }
  read(path: string): string | null {
    let node: MemoryDir | MemoryFile | undefined = this;
    for (const p of path.split("/")) node = node instanceof MemoryDir ? node.children.get(p) : undefined;
    return node instanceof MemoryFile ? node.text : null;
  }
}

let clock = 1000;
class MemoryFile implements VaultFileHandle {
  readonly kind = "file" as const;
  constructor(
    readonly name: string,
    public text: string,
    public modified = clock++,
  ) {}
  async getFile() {
    return { text: async () => this.text, lastModified: this.modified, size: this.text.length };
  }
  async createWritable() {
    let buffer = "";
    return {
      write: async (d: string) => void (buffer += d),
      close: async () => {
        this.text = buffer;
        this.modified = clock++;
      },
    };
  }
}

const emptyOutbox = (): VaultOutbox => ({ clips: [], planner: null, kanban: null, decks: [], notes: [] });
const note = (id: string, title: string, text: string, extra: Partial<NoteDocument> = {}): NoteDocument => ({ id, source: "clip", title, subject: null, created: null, modified: null, pages: [{ id: "1", text }], ...extra });

describe("syncing with a vault", () => {
  it("reads the sailor's notes and their cards, skipping Obsidian's and Ship's folders", async () => {
    const vault = new MemoryDir("Biology");
    vault.put("Cells.md", "# Cells\nPowerhouse::Mitochondria");
    vault.put("Unit 2/Respiration.md", "---\ntags: [bio]\n---\nGlycolysis first.");
    vault.put(".obsidian/app.json", "{}");
    vault.put(".trash/old.md", "old");
    vault.put("Ship/Planner.md", "mine");
    vault.put("cell.png", "png");
    const r = await syncVault(vault, emptyManifest(), emptyOutbox(), DEFAULT_VAULT_OPTIONS);
    expect(r.upserts.map((n) => n.id).sort()).toEqual(["obsidian:Cells.md", "obsidian:Unit 2/Respiration.md"]);
    expect(r.cardSets).toHaveLength(1);
    expect(r.cardSets[0]!.cards.map((c) => [c.front, c.back])).toEqual([["Powerhouse", "Mitochondria"]]);
    expect(r.read).toBe(2);
  });

  it("reads only what changed next time, and notices deletions", async () => {
    const vault = new MemoryDir("v");
    vault.put("A.md", "a::1");
    vault.put("B.md", "b");
    const first = await syncVault(vault, emptyManifest(), emptyOutbox(), DEFAULT_VAULT_OPTIONS);
    vault.put("B.md", "b changed", 99_999);
    vault.children.delete("A.md");
    const second = await syncVault(vault, first.manifest, emptyOutbox(), DEFAULT_VAULT_OPTIONS);
    expect(second.upserts.map((n) => n.id)).toEqual(["obsidian:B.md"]);
    expect(second.removed).toEqual(["obsidian:A.md"]);
    expect(second.removedPaths).toEqual(["A.md"]);
  });

  it("clears a note's cards when its card lines are deleted", async () => {
    const vault = new MemoryDir("v");
    vault.put("A.md", "q::a");
    const first = await syncVault(vault, emptyManifest(), emptyOutbox(), DEFAULT_VAULT_OPTIONS);
    vault.put("A.md", "no more cards", 99_999);
    const second = await syncVault(vault, first.manifest, emptyOutbox(), DEFAULT_VAULT_OPTIONS);
    expect(second.cardSets).toEqual([expect.objectContaining({ path: "A.md", cards: [] })]);
  });

  it("moves clips into Clippings/ without overwriting the sailor's own file", async () => {
    const vault = new MemoryDir("v");
    vault.put("Clippings/Cells guide.md", "the sailor's own clipping");
    const outbox = { ...emptyOutbox(), clips: [note("clip:1", "Cells: guide", "---\ntitle: x\n---\nclipped text")] };
    const r = await syncVault(vault, emptyManifest(), outbox, DEFAULT_VAULT_OPTIONS);
    expect(vault.read("Clippings/Cells guide.md")).toBe("the sailor's own clipping");
    expect(vault.read("Clippings/Cells guide 2.md")).toContain("clipped text");
    expect(r.clipsMoved).toEqual(["clip:1"]);
    // The vault copy comes straight back as a vault note.
    expect(r.upserts.some((n) => n.id === "obsidian:Clippings/Cells guide 2.md")).toBe(true);
  });

  it("writes the planner, decks and (when asked) uploaded notes into Ship/, only when they change", async () => {
    const vault = new MemoryDir("v");
    const outbox: VaultOutbox = {
      clips: [],
      planner: "# Planner\n",
      kanban: "---\n\nkanban-plugin: board\n\n---\n",
      decks: [{ deck: { id: "d", name: "Bio: cells", subject: null, created: 0, source: "manual" }, cards: [{ front: "Q", back: "A" }] }],
      notes: [note("file:1", "Lecture 1", "Cells are small.", { source: "file", url: "https://x.edu/l1.pdf" })],
    };
    const r = await syncVault(vault, emptyManifest(), outbox, { ...DEFAULT_VAULT_OPTIONS, notes: true });
    expect(vault.read("Ship/Planner.md")).toBe("# Planner\n");
    expect(vault.read("Ship/Kanban.md")).toContain("kanban-plugin: board");
    expect(vault.read("Ship/Flashcards/Bio cells.md")).toContain("Q::A");
    expect(vault.read("Ship/Notes/Lecture 1.md")).toContain('source: "https://x.edu/l1.pdf"');
    expect(r.written).toBe(4);
    // Ship's own folder is never read back as the sailor's notes.
    expect(r.upserts).toEqual([]);
    const again = await syncVault(vault, r.manifest, outbox, { ...DEFAULT_VAULT_OPTIONS, notes: true });
    expect(again.written).toBe(0);
  });

  it("never overwrites a clipping, even one Ship wrote earlier", async () => {
    const vault = new MemoryDir("v");
    const first = await syncVault(vault, emptyManifest(), { ...emptyOutbox(), clips: [note("clip:1", "Cells", "first page")] }, DEFAULT_VAULT_OPTIONS);
    await syncVault(vault, first.manifest, { ...emptyOutbox(), clips: [note("clip:2", "Cells", "second page")] }, DEFAULT_VAULT_OPTIONS);
    expect(vault.read("Clippings/Cells.md")).toBe("first page");
    expect(vault.read("Clippings/Cells 2.md")).toBe("second page");
  });

  it("removes a deleted deck's file, unless the sailor edited it", async () => {
    const vault = new MemoryDir("v");
    const deck = (id: string, name: string) => ({ deck: { id, name, subject: null, created: 0, source: "manual" as const }, cards: [{ front: "Q", back: "A" }] });
    const outbox = { ...emptyOutbox(), decks: [deck("a", "Bio"), deck("b", "Chem"), deck("c", "Bio")] };
    const r = await syncVault(vault, emptyManifest(), outbox, DEFAULT_VAULT_OPTIONS);
    expect(vault.read("Ship/Flashcards/Bio 2.md")).toContain("Q::A");
    vault.put("Ship/Flashcards/Chem.md", "my own edits");
    await syncVault(vault, r.manifest, { ...emptyOutbox(), decks: [deck("a", "Bio")] }, DEFAULT_VAULT_OPTIONS);
    expect(vault.read("Ship/Flashcards/Bio.md")).toContain("Q::A");
    expect(vault.read("Ship/Flashcards/Bio 2.md")).toBeNull();
    expect(vault.read("Ship/Flashcards/Chem.md")).toBe("my own edits");
  });

  it("leaves out what the options switch off", async () => {
    const vault = new MemoryDir("v");
    const outbox = { ...emptyOutbox(), planner: "p", clips: [note("clip:1", "c", "x")] };
    const r = await syncVault(vault, emptyManifest(), outbox, { clippings: false, planner: false, kanban: false, decks: false, notes: false });
    expect(r.written).toBe(0);
    expect(r.clipsMoved).toEqual([]);
    expect(vault.children.size).toBe(0);
  });
});
