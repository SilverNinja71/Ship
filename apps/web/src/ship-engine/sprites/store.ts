// Loads the graphics AI's sprites from public/assets/. index.json lists the
// folders that have art; a folder's manifest and images load the first time
// something asks for that sheet, and the sheet appears only once all of its
// images are in, so a part never shows half-loaded. Until then (and forever,
// for parts with no art yet) every drawing function falls back to the
// procedural art.

import { SPRITE_INDEX_FILE, SPRITE_MANIFEST_FILE } from "@ship/shared-types";
import type { SpriteManifest, SpriteRef } from "@ship/shared-types";
import { sheetSpecFor, validateManifest } from "@ship/ship-theme-kit";

export interface Sprite extends SpriteRef {
  image: CanvasImageSource;
}

export interface SpriteSheet {
  folder: string;
  manifest: SpriteManifest;
  sprites: ReadonlyMap<string, Sprite>;
}

export interface SpriteIO {
  fetchJson(url: string): Promise<unknown>;
  loadImage(url: string): Promise<CanvasImageSource>;
  warn(message: string): void;
}

export class SpriteStore {
  /** Bumps whenever a sheet arrives, so caches (ship layouts, sailor checks) know to refresh. */
  version = 0;
  private listed: ReadonlySet<string> | null = null;
  private started: Promise<void> | null = null;
  private readonly sheets = new Map<string, SpriteSheet>();
  private readonly requested = new Set<string>();
  private readonly pending = new Set<Promise<void>>();

  constructor(
    private readonly base: string,
    private readonly io: SpriteIO,
  ) {}

  /** Reads index.json once. With no index (or an empty one) nothing else is ever fetched. */
  start(): Promise<void> {
    this.started ??= this.io.fetchJson(this.base + SPRITE_INDEX_FILE).then(
      (index) => {
        const sheets = isRecord(index) && Array.isArray(index.sheets) ? index.sheets.filter((s): s is string => typeof s === "string") : [];
        this.listed = new Set(sheets);
      },
      () => {
        this.listed = new Set();
      },
    );
    return this.started;
  }

  /** The sheet in `folder`, if it has art and has finished loading. Asking starts the load. */
  sheet(folder: string): SpriteSheet | undefined {
    const hit = this.sheets.get(folder);
    if (hit || !this.listed?.has(folder) || this.requested.has(folder)) return hit;
    // A folder is fetched once, even if it fails, so a broken sheet isn't retried every frame.
    this.requested.add(folder);
    const job: Promise<void> = this.load(folder).finally(() => this.pending.delete(job));
    this.pending.add(job);
    return undefined;
  }

  sprite(folder: string, id: string): Sprite | undefined {
    return this.sheet(folder)?.sprites.get(id);
  }

  /** Puts a sheet in directly (tests, galleries). */
  add(folder: string, manifest: SpriteManifest, images: ReadonlyMap<string, CanvasImageSource>): void {
    const sprites = new Map<string, Sprite>();
    for (const ref of manifest.sprites) {
      const image = images.get(ref.id);
      if (image) sprites.set(ref.id, { ...ref, image });
    }
    this.sheets.set(folder, { folder, manifest, sprites });
    this.version++;
  }

  /** Forgets every sheet (tests). */
  clear(): void {
    this.sheets.clear();
    this.requested.clear();
    this.version++;
  }

  /** Loads every sheet that has art (galleries; the app loads sheets as it needs them). */
  async preloadAll(): Promise<void> {
    await this.start();
    for (const folder of this.listed ?? []) this.sheet(folder);
    await this.idle();
  }

  /** Resolves once nothing is loading (screenshots and tests). */
  async idle(): Promise<void> {
    await this.started;
    while (this.pending.size > 0) await Promise.all([...this.pending]);
  }

  private async load(folder: string): Promise<void> {
    const dir = `${this.base}${folder}/`;
    try {
      const manifest = (await this.io.fetchJson(dir + SPRITE_MANIFEST_FILE)) as SpriteManifest;
      const problems = validateManifest(manifest, sheetSpecFor(folder));
      for (const p of problems) this.io.warn(`Sprites ${folder}${p.sprite ? ` (${p.sprite})` : ""}: ${p.message}`);
      if (problems.some((p) => p.level === "error" && !p.sprite)) return;
      const broken = new Set(problems.filter((p) => p.level === "error").map((p) => p.sprite));
      const refs = manifest.sprites.filter((s) => !broken.has(s.id));
      const loaded = await Promise.allSettled(refs.map((s) => this.io.loadImage(dir + s.file)));
      const images = new Map<string, CanvasImageSource>();
      loaded.forEach((r, i) => {
        if (r.status === "fulfilled") images.set(refs[i].id, r.value);
        else this.io.warn(`Sprites ${folder}: couldn't load ${refs[i].file}.`);
      });
      this.add(folder, { ...manifest, sprites: refs }, images);
    } catch {
      this.io.warn(`Sprites ${folder}: couldn't read its ${SPRITE_MANIFEST_FILE}.`);
    }
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

const browserIO: SpriteIO = {
  async fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  },
  async loadImage(url) {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  },
  warn: (message) => console.warn(message),
};

/** The app's sprites, served from public/assets/. Nothing loads until start() is called. */
export const sprites = new SpriteStore(`${import.meta.env?.BASE_URL ?? "/"}assets/`, browserIO);
