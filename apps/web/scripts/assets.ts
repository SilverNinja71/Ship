// Checks the graphics AI's sprites in public/assets/ and rebuilds index.json,
// the list of folders the app loads art from, and docs/sprite-list.md.
//
//   npm run assets -w @ship/web              check everything and rewrite both files
//   npm run assets -w @ship/web -- --check   check only; also fails if either file is out of date
//
// Every folder with a manifest.json is a sheet. A sheet passes when its
// manifest passes validateManifest and every image it lists exists at the size
// it claims. It also reports which parts are complete, since the app switches
// a part from procedural art to sprites only once its whole set is in.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SPRITE_INDEX_FILE, SPRITE_MANIFEST_FILE } from "@ship/shared-types";
import type { SpriteIndex } from "@ship/shared-types";
import { DEFAULT_AVATAR, missingAvatarSprites, sheetProgress, sheetSpecFor, validateManifest } from "@ship/ship-theme-kit";
import type { GroupProgress, SpriteProblem } from "@ship/ship-theme-kit";
import { spriteListMarkdown } from "./spriteList.js";

export const ASSETS_DIR = fileURLToPath(new URL("../public/assets/", import.meta.url));
export const SPRITE_LIST = fileURLToPath(new URL("../../../docs/sprite-list.md", import.meta.url));

export interface SheetReport {
  folder: string;
  title: string;
  problems: SpriteProblem[];
  /** Per part group, what's still missing. */
  progress: GroupProgress[];
  /** Usable sprite ids. */
  have: string[];
}

export interface AssetReport {
  sheets: SheetReport[];
  index: SpriteIndex;
  errors: number;
  warnings: number;
}

const IMAGES = new Set([".png", ".webp", ".svg"]);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const posix = (p: string) => p.split(sep).join("/");

export async function scanAssets(root = ASSETS_DIR): Promise<AssetReport> {
  const folders = (await findSheets(root)).sort();
  const sheets: SheetReport[] = [];
  for (const folder of folders) sheets.push(await checkSheet(root, folder));
  const all = sheets.flatMap((s) => s.problems);
  return {
    sheets,
    index: { version: 1, sheets: folders },
    errors: all.filter((p) => p.level === "error").length,
    warnings: all.filter((p) => p.level === "warning").length,
  };
}

/** Folders under root that hold a manifest.json, as posix paths relative to root. */
async function findSheets(root: string, dir = root): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const found: string[] = [];
  if (dir !== root && entries.some((e) => e.isFile() && e.name === SPRITE_MANIFEST_FILE)) found.push(posix(relative(root, dir)));
  for (const e of entries) if (e.isDirectory()) found.push(...(await findSheets(root, join(dir, e.name))));
  return found;
}

async function checkSheet(root: string, folder: string): Promise<SheetReport> {
  const dir = join(root, folder);
  const spec = sheetSpecFor(folder);
  const problems: SpriteProblem[] = [];
  const report: SheetReport = { folder, title: spec?.title ?? folder, problems, progress: [], have: [] };
  if (!spec) {
    problems.push({
      level: "warning",
      message: `Ship has no sheet called "${folder}". Sheets live in ships/<ship-id>, sails, figureheads, flags, props, avatars and environment/<environment-id>.`,
    });
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(await readFile(join(dir, SPRITE_MANIFEST_FILE), "utf8"));
  } catch (e) {
    problems.push({ level: "error", message: `${SPRITE_MANIFEST_FILE} isn't valid JSON: ${(e as Error).message}` });
    return report;
  }
  problems.push(...validateManifest(manifest, spec));

  const listed = new Set<string>();
  const sprites = isRecord(manifest) && Array.isArray(manifest.sprites) ? manifest.sprites.filter(isRecord) : [];
  for (const s of sprites) {
    if (typeof s.id !== "string" || typeof s.file !== "string") continue;
    listed.add(s.file);
    const size = await imageSize(join(dir, s.file));
    if (size === "missing") problems.push({ level: "error", sprite: s.id, message: `${s.file} doesn't exist.` });
    else if (size && (size.width !== s.width || size.height !== s.height)) {
      problems.push({ level: "error", sprite: s.id, message: `${s.file} is ${size.width} × ${size.height} pixels, but the manifest says ${String(s.width)} × ${String(s.height)}.` });
    }
  }
  for (const file of await imagesIn(dir)) {
    if (!listed.has(file)) problems.push({ level: "warning", message: `${file} isn't listed in ${SPRITE_MANIFEST_FILE}, so the app won't use it.` });
  }

  if (spec) {
    const broken = new Set(problems.filter((p) => p.level === "error").map((p) => p.sprite));
    if (!problems.some((p) => p.level === "error" && !p.sprite)) {
      report.have = sprites.filter((s) => typeof s.id === "string" && !broken.has(s.id)).map((s) => s.id as string);
      report.progress = sheetProgress(spec, new Set(report.have));
    }
  }
  return report;
}

/** A PNG's size from its header; null for formats we don't measure (WebP, SVG). */
async function imageSize(path: string): Promise<{ width: number; height: number } | "missing" | null> {
  let bytes: Uint8Array;
  try {
    bytes = await readFile(path);
  } catch {
    return "missing";
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || !png.every((b, i) => bytes[i] === b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Image files in a sheet's folder (and its subfolders that aren't sheets themselves). */
async function imagesIn(dir: string, base = dir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  if (dir !== base && entries.some((e) => e.name === SPRITE_MANIFEST_FILE)) return [];
  const files: string[] = [];
  for (const e of entries) {
    if (e.isDirectory()) files.push(...(await imagesIn(join(dir, e.name), base)));
    else if (IMAGES.has(extname(e.name).toLowerCase())) files.push(posix(relative(base, join(dir, e.name))));
  }
  return files;
}

export function indexJson(index: SpriteIndex): string {
  return `${JSON.stringify(index, null, 2)}\n`;
}

export function formatReport(report: AssetReport): string {
  if (report.sheets.length === 0) return "No sprites yet: every part uses the built-in procedural art.";
  const lines: string[] = [];
  for (const sheet of report.sheets) {
    lines.push(`${sheet.folder} (${sheet.title})`);
    const done = sheet.progress.filter((g) => g.missing.length === 0).map((g) => g.group);
    const partial = sheet.progress.filter((g) => g.missing.length > 0 && g.missing.length < g.size);
    const none = sheet.progress.filter((g) => g.missing.length === g.size).map((g) => g.group);
    if (sheet.folder === "avatars") {
      // Layers only count once a whole outfit is in, so report the starter sailor rather than each layer.
      const have = new Set(sheet.have);
      const starter = missingAvatarSprites(DEFAULT_AVATAR, (id) => have.has(id));
      lines.push(`  ${done.length} of ${sheet.progress.length} layers delivered.`);
      lines.push(starter.length === 0 ? "  ✓ the starter sailor is complete and drawn from sprites" : `  · the starter sailor still needs ${starter.join(", ")}`);
    } else {
      if (done.length) lines.push(`  ✓ drawn from sprites: ${done.join(", ")}`);
      for (const g of partial) lines.push(`  · ${g.group} still needs ${g.missing.join(", ")}`);
      if (none.length) lines.push(`  · not delivered yet: ${none.join(", ")}`);
    }
    for (const p of sheet.problems) lines.push(`  ${p.level === "error" ? "✗ error" : "! warning"}${p.sprite ? ` (${p.sprite})` : ""}: ${p.message}`);
  }
  lines.push("", `${report.sheets.length} sheet(s), ${report.errors} error(s), ${report.warnings} warning(s).`);
  return lines.join("\n");
}

async function main(): Promise<void> {
  const checkOnly = process.argv.includes("--check");
  const report = await scanAssets();
  console.log(formatReport(report));
  const outputs: [path: string, text: string][] = [
    [join(ASSETS_DIR, SPRITE_INDEX_FILE), indexJson(report.index)],
    [SPRITE_LIST, spriteListMarkdown()],
  ];
  for (const [path, want] of outputs) {
    const have = await readFile(path, "utf8").catch(() => "");
    if (have === want) continue;
    if (checkOnly) {
      console.error(`\n${relative(process.cwd(), path)} is out of date: run "npm run assets -w @ship/web".`);
      process.exitCode = 1;
    } else {
      await writeFile(path, want);
      console.log(`Wrote ${relative(process.cwd(), path)}.`);
    }
  }
  if (report.errors > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
