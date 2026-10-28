// Builds The Lookout into dist/: esbuild bundles each entry point (workspace
// packages included), then the manifest, the HTML/CSS pages and freshly
// drawn PNG icons are copied in. `node build.mjs --watch` keeps rebuilding.

import * as esbuild from "esbuild";
import { watch as watchFs } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");
const watching = process.argv.includes("--watch");

const common = {
  absWorkingDir: root,
  bundle: true,
  outdir: dist,
  target: "chrome120",
  platform: "browser",
  legalComments: "none",
  sourcemap: watching ? "inline" : false,
  logLevel: "info",
};

const builds = [
  // The service worker is an ES module ("type": "module" in the manifest).
  { ...common, format: "esm", entryPoints: { background: "src/background/index.ts" } },
  // Content scripts and pages are classic scripts.
  {
    ...common,
    format: "iife",
    entryPoints: {
      "content/bridge": "src/content/bridge.ts",
      "content/guard": "src/content/guard.ts",
      popup: "src/popup/main.ts",
      options: "src/options/main.ts",
      "dev/gate": "src/dev/gate.ts",
      "dev/popup": "src/dev/popup.ts",
      "dev/options": "src/dev/options.ts",
    },
  },
];

// --- PNG icons: a brass ship's wheel on a navy disc, drawn per pixel. ---

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA, no interlace
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const NAVY = [27, 42, 74];
const BRASS = [201, 160, 78];
const GOLD = [232, 199, 112];
const CREAM = [251, 243, 228];

/** The colour at a point of the unit square (centre 0.5, 0.5), or null outside the disc. */
function iconColor(x, y, small) {
  const dx = x - 0.5;
  const dy = y - 0.5;
  const r = Math.hypot(dx, dy);
  if (r > 0.49) return null;
  if (r > 0.455) return CREAM;
  const w = small ? 1.6 : 1; // thicker strokes so 16 px still reads
  const angle = Math.atan2(dy, dx);
  // Eight spokes with round handles poking past the rim.
  const spoke = Math.PI / 4;
  const offset = Math.abs(((angle + spoke / 2 + Math.PI * 2) % spoke) - spoke / 2);
  const spokeDist = Math.sin(offset) * r;
  for (let i = 0; i < 8; i++) {
    const a = i * spoke;
    if (Math.hypot(dx - Math.cos(a) * 0.37, dy - Math.sin(a) * 0.37) < 0.045 * w) return GOLD;
  }
  if (r < 0.085 * w) return r < 0.035 * w ? NAVY : GOLD;
  if (Math.abs(r - 0.255) < 0.035 * w) return BRASS;
  if (r < 0.37 && spokeDist < 0.022 * w) return BRASS;
  return NAVY;
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const ss = 4; // 4x4 supersampling for smooth edges
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = iconColor((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size, size <= 32);
          if (!c) continue;
          r += c[0];
          g += c[1];
          b += c[2];
          a++;
        }
      }
      const i = (py * size + px) * 4;
      if (a) rgba.set([Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round((a / (ss * ss)) * 255)], i);
    }
  }
  return encodePng(size, rgba);
}

async function copyStatic() {
  await cp(join(root, "static"), dist, { recursive: true });
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  manifest.version = pkg.version;
  await writeFile(join(dist, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await mkdir(join(dist, "icons"), { recursive: true });
  for (const size of [16, 32, 48, 128]) await writeFile(join(dist, "icons", `icon${size}.png`), drawIcon(size));
  // Dev copies of the popup and options pages: same markup, one folder down, running the dev bundles.
  for (const page of ["popup.html", "options.html"]) {
    const html = await readFile(join(root, "static", page), "utf8");
    const dev = html.replace('href="lookout.css"', 'href="../lookout.css"').replaceAll('src="icons/', 'src="../icons/');
    await writeFile(join(dist, "dev", page), dev);
  }
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

if (!watching) {
  await Promise.all(builds.map((options) => esbuild.build(options)));
  await copyStatic();
  console.log('The Lookout is built in dist/. Load it from chrome://extensions with "Load unpacked".');
} else {
  const contexts = await Promise.all(builds.map((options) => esbuild.context(options)));
  await copyStatic();
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  let pending = null;
  const recopy = () => {
    clearTimeout(pending);
    pending = setTimeout(
      () =>
        copyStatic().then(
          () => console.log("[lookout] static files copied"),
          (e) => console.error(e),
        ),
      100,
    );
  };
  watchFs(join(root, "static"), { recursive: true }, recopy);
  watchFs(join(root, "manifest.json"), recopy);
  console.log("[lookout] watching for changes (Ctrl+C to stop)");
  const stop = async () => {
    await Promise.all(contexts.map((ctx) => ctx.dispose()));
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
