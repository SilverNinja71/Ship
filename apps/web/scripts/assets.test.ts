import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ASSETS_DIR, SPRITE_LIST, formatReport, indexJson, scanAssets } from "./assets.js";
import { spriteListMarkdown } from "./spriteList.js";

// The real art folder: whatever the graphics AI has delivered must pass.
describe("public/assets", () => {
  it("has no broken sprites", async () => {
    const report = await scanAssets();
    expect(report.errors, formatReport(report)).toBe(0);
  });

  it("lists every sheet in index.json (run npm run assets -w @ship/web if this fails)", async () => {
    const report = await scanAssets();
    expect(await readFile(join(ASSETS_DIR, "index.json"), "utf8")).toBe(indexJson(report.index));
  });

  it("has a current docs/sprite-list.md (run npm run assets -w @ship/web if this fails)", async () => {
    expect(await readFile(SPRITE_LIST, "utf8")).toBe(spriteListMarkdown());
  });
});

// ---------------------------------------------------------------------------

/** Just enough of a PNG for the size check: the signature and the IHDR chunk. */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

let root = "";
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = "";
});

async function sheet(folder: string, manifest: unknown, files: Record<string, Uint8Array | string>): Promise<void> {
  const dir = join(root, folder);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "manifest.json"), typeof manifest === "string" ? manifest : JSON.stringify(manifest));
  for (const [name, data] of Object.entries(files)) await writeFile(join(dir, name), data);
}

const hull = (id: string, width = 1000) => ({ id, file: `${id}.png`, width, height: 300, anchorX: 500, anchorY: 150 });

describe("scanAssets", () => {
  it("reports complete parts, size mismatches, missing and unlisted files", async () => {
    root = await mkdtemp(join(tmpdir(), "ship-assets-"));
    await sheet(
      "ships/woolly-wanderer",
      {
        version: 1,
        kind: "ship",
        sprites: [hull("hull-back"), hull("hull-front"), { id: "rigging", file: "rigging.png", width: 1200, height: 700, anchorX: 600, anchorY: 700 }],
      },
      { "hull-back.png": png(1000, 300), "hull-front.png": png(999, 300), "sketch.png": png(10, 10) },
    );
    await sheet("flags", { version: 1, kind: "flags", sprites: [{ id: "anchor", file: "anchor.png", width: 120, height: 72, anchorX: 120, anchorY: 0 }] }, { "anchor.png": png(120, 72) });

    const report = await scanAssets(root);
    expect(report.index).toEqual({ version: 1, sheets: ["flags", "ships/woolly-wanderer"] });
    const [flags, woolly] = report.sheets;
    expect(flags.problems).toEqual([]);
    expect(flags.progress.find((g) => g.group === "anchor")).toEqual({ group: "anchor", size: 1, missing: [] });
    expect(woolly.problems.map((p) => p.message)).toEqual([
      "hull-front.png is 999 × 300 pixels, but the manifest says 1000 × 300.",
      "rigging.png doesn't exist.",
      "sketch.png isn't listed in manifest.json, so the app won't use it.",
    ]);
    expect(woolly.progress.find((g) => g.group === "hull")).toEqual({ group: "hull", size: 3, missing: ["rigging", "hull-front"] });
    expect(report).toMatchObject({ errors: 2, warnings: 1 });
    expect(formatReport(report)).toContain("✓ drawn from sprites: anchor");
    expect(formatReport(report)).toContain("· hull still needs rigging, hull-front");
  });

  it("flags unreadable manifests and unknown folders", async () => {
    root = await mkdtemp(join(tmpdir(), "ship-assets-"));
    await sheet("props", "{ not json", {});
    await sheet("boats/dinghy", { version: 1, kind: "ship", sprites: [] }, {});
    const report = await scanAssets(root);
    expect(report.sheets.map((s) => [s.folder, s.problems.map((p) => p.level)])).toEqual([
      ["boats/dinghy", ["warning"]],
      ["props", ["error"]],
    ]);
  });

  it("says plainly when there's no art yet", async () => {
    root = await mkdtemp(join(tmpdir(), "ship-assets-"));
    expect(formatReport(await scanAssets(root))).toBe("No sprites yet: every part uses the built-in procedural art.");
  });
});
