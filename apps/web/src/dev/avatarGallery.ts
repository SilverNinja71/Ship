// Dev-only gallery for the sailor artwork (dev/avatars.html). Draws a sheet
// per catalog (skin, hair, hats, coats, accessories, tools, desks), the three
// states, the break activities, galley tables, a ghost, previews and one
// station at the Captain's Quarters zoom. Silent: no audio anywhere.

import type { AvatarLoadout, AvatarState, DeskId } from "@ship/shared-types";
import { ACCESSORIES, COATS, COAT_COLORS, DEFAULT_AVATAR, DESKS, HAIR_COLORS, HAIR_STYLES, HATS, SKIN_TONES, STUDY_TOOLS } from "@ship/ship-theme-kit";
import { drawAvatarPreview, drawGalleyTable, drawStudyStation } from "../ship-engine/AvatarRenderer.js";
import { breakActivityAt, BREAK_SEGMENT, type BreakActivity } from "../ship-engine/avatar/pose.js";
import { hashString } from "../ship-engine/draw.js";
import { STILL_FRAME, type Ctx, type FrameInfo } from "../ship-engine/types.js";

const params = new URLSearchParams(location.search);
const still = params.has("still");
const fixedT = params.has("t") ? Number(params.get("t")) : null;
const only = params.get("only");
const PX = Number(params.get("px") ?? 0.58);

const look = (name: string, over: Partial<AvatarLoadout>): AvatarLoadout => ({ ...DEFAULT_AVATAR, name, ...over });

const CREW: AvatarLoadout[] = [
  DEFAULT_AVATAR,
  look("Mira", { skin: "umber", hair: "curls", hairColor: "#2B1D14", hat: "flower-crown", coat: "hoodie", coatColor: "#1F8A8A", accessory: "glasses", tool: "laptop" }),
  look("Jun", { skin: "porcelain", hair: "bob", hairColor: "#3B5BA9", hat: "beanie", coat: "flannel", coatColor: "#3F7A4A", accessory: "scarf", tool: "tablet" }),
  look("Kai", { skin: "bronze", hair: "spiky", hairColor: "#D9534F", hat: "aviator-cap", coat: "flight-jacket", coatColor: "#5A3A22", accessory: "aviator-goggles", tool: "mech-keyboard" }),
  look("Ines", { skin: "honey", hair: "braids", hairColor: "#8B5A2B", hat: "tricorn", coat: "pirate-coat", coatColor: "#C2524A", accessory: "parrot", tool: "quill-logbook" }),
  look("Theo", { skin: "ebony", hair: "buzz", hairColor: "#2B1D14", hat: "captain-cap", coat: "marine-uniform", coatColor: "#2E5E8B", accessory: "earring", tool: "laptop" }),
  look("Sol", { skin: "sand", hair: "bun", hairColor: "#E6C27A", hat: "laurel-wreath", coat: "toga", coatColor: "#6B4C9A", accessory: "none", tool: "tablet" }),
  look("Noor", { skin: "peach", hair: "long", hairColor: "#F2A7C3", hat: "bandana", coat: "vest", coatColor: "#D9822B", accessory: "eyepatch", tool: "mech-keyboard" }),
  look("Pip", { skin: "porcelain", hair: "ponytail", hairColor: "#C68642", hat: "marine-cap", coat: "striped-shirt", coatColor: "#2E5E8B", accessory: "parrot", tool: "quill-logbook" }),
];

interface Cell {
  label: string;
  draw(ctx: Ctx, frame: FrameInfo, x: number, floor: number): void;
  /** Cell width in station units (default a station). */
  w?: number;
}

interface Sheet {
  id: string;
  title: string;
  cells: Cell[];
  cols: number;
  /** Units to pixels. */
  px?: number;
  /** Cell height in station units. */
  h?: number;
  background?: "deck" | "stripes" | "cabin";
}

const station = (avatar: AvatarLoadout, state: AvatarState = "SAILING_FOCUS", desk: DeskId = "captains-desk", extra: { opacity?: number; seed?: number; dt?: number } = {}): Cell["draw"] =>
  (ctx, frame, x, floor) =>
    drawStudyStation(ctx, { avatar, state, desk, at: { x, y: floor }, opacity: extra.opacity, seed: extra.seed }, extra.dt ? { ...frame, t: frame.t + extra.dt } : frame);

/** A moment between break activities: hands in the lap, looking at the viewer. */
function restTime(): number {
  return (BREAK_SEGMENT + 0.15 - 2.4) / (still ? 0.25 : 1);
}

/** A time that puts `activity` at its peak for this sailor. */
function offsetFor(activity: BreakActivity, seed: number, reducedMotion: boolean, drink?: "boba" | "tea"): number {
  const speed = reducedMotion ? 0.25 : 1;
  for (let k = 0; k < 12; k++) {
    // Peak of segment k is at tb = k*D + 2.6; t = (tb - phase) / speed.
    const t = (k * BREAK_SEGMENT + 2.6 - 2.4) / speed;
    const at = breakActivityAt(t, seed, reducedMotion);
    if (at.activity === activity && (!drink || at.drink === drink)) return t;
  }
  return 0;
}

function sheets(): Sheet[] {
  const out: Sheet[] = [];
  // Rest-pose cells hold that moment when frozen and play on from it when live.
  const rest = restTime() - (fixedT ?? 0);
  out.push({
    id: "skin",
    title: "Skin tones (SAILING_FOCUS)",
    cols: 7,
    cells: SKIN_TONES.map((s, i) => ({ label: s.name, draw: station(look(s.name, { skin: s.id, hair: (["messy", "bob", "curls", "ponytail", "buzz", "braids", "spiky"] as const)[i], hairColor: HAIR_COLORS[i] })) })),
  });
  out.push({
    id: "hair",
    title: "Hair styles (no hat)",
    cols: 9,
    cells: HAIR_STYLES.map((h, i) => ({ label: h.name, draw: station(look(h.name, { hair: h.id, hat: "none", hairColor: HAIR_COLORS[(i * 3) % HAIR_COLORS.length], skin: SKIN_TONES[i % 7].id }), "SHORE_LEAVE_BREAK", "captains-desk", { dt: rest }) })),
  });
  out.push({
    id: "hair-hat",
    title: "Hair styles under a hat",
    cols: 9,
    cells: HAIR_STYLES.map((h, i) => ({ label: h.name, draw: station(look(h.name, { hair: h.id, hat: (["straw-hat", "tricorn", "captain-cap", "beanie", "bandana", "aviator-cap", "marine-cap", "flower-crown", "laurel-wreath"] as const)[i], hairColor: HAIR_COLORS[(i * 3 + 1) % HAIR_COLORS.length] })) })),
  });
  out.push({
    id: "hats",
    title: "Hats",
    cols: 10,
    cells: HATS.map((h, i) => ({ label: h.name, draw: station(look(h.name, { hat: h.id, hair: HAIR_STYLES[i % 9].id, hairColor: HAIR_COLORS[i % HAIR_COLORS.length] })) })),
  });
  out.push({
    id: "coats",
    title: "Coats",
    cols: 8,
    cells: COATS.map((c, i) => ({ label: c.name, draw: station(look(c.name, { coat: c.id, coatColor: COAT_COLORS[i], hat: "none", hair: "bob", hairColor: HAIR_COLORS[1] }), "SHORE_LEAVE_BREAK", "captains-desk", { dt: rest }) })),
  });
  out.push({
    id: "accessories",
    title: "Accessories",
    cols: 7,
    cells: ACCESSORIES.map((a, i) => ({ label: a.name, draw: station(look(a.name, { accessory: a.id, hat: "none", hair: "messy", coat: "hoodie", coatColor: COAT_COLORS[i] })) })),
  });
  const states: AvatarState[] = ["SAILING_FOCUS", "SHORE_LEAVE_BREAK", "DRIFTING_IDLE"];
  out.push({
    id: "tools",
    title: "Study tools × states",
    cols: 12,
    cells: STUDY_TOOLS.flatMap((tool) => states.map((s) => ({ label: `${tool.name.split(" ")[0]} · ${s.split("_")[0].toLowerCase()}`, draw: station(look(tool.name, { tool: tool.id, hair: "ponytail", hairColor: "#5A3A22" }), s) }))),
  });
  out.push({
    id: "desks",
    title: "Desks",
    cols: 8,
    cells: DESKS.map((d, i) => ({ label: d.name, draw: station(CREW[i % CREW.length], "SAILING_FOCUS", d.id) })),
  });
  out.push({
    id: "states",
    title: "The crew in all three states",
    cols: 9,
    cells: states.flatMap((s) => CREW.map((a) => ({ label: `${a.name} · ${s.split("_")[0].toLowerCase()}`, draw: station(a, s, "captains-desk") }))),
  });
  const rm = still;
  const breakCells: Cell[] = [];
  for (const a of [CREW[0], CREW[1], CREW[4], CREW[6]]) {
    const seed = hashString(a.name);
    for (const [act, drink] of [["sip", "boba"], ["sip", "tea"], ["stretch", undefined], ["spyglass", undefined]] as const) {
      const off = offsetFor(act, seed, rm, drink);
      // Frozen frames show the peak itself; a live page starts there and plays on.
      breakCells.push({ label: `${a.name} · ${act}${drink ? ` ${drink}` : ""}`, draw: (ctx, frame, x, floor) => station(a, "SHORE_LEAVE_BREAK", "captains-desk", { dt: still || fixedT !== null ? off - frame.t : off })(ctx, frame, x, floor) });
    }
  }
  out.push({ id: "break", title: "Break activities (each at its peak)", cols: 8, cells: breakCells });
  out.push({
    id: "zzz",
    title: "Drifting idle, Zzz over time",
    cols: 6,
    cells: [0, 0.5, 1, 1.6, 2.2, 2.8].map((dt, i) => ({ label: `+${dt}s`, draw: station(CREW[i % CREW.length], "DRIFTING_IDLE", "captains-desk", { dt }) })),
  });
  out.push({
    id: "galley",
    title: "Galley tables",
    cols: 3,
    cells: ([
      { label: "two crew", draw: (ctx, frame, x, floor) => drawGalleyTable(ctx, { x, y: floor }, [{ avatar: CREW[1], state: "SAILING_FOCUS" }, { avatar: CREW[3], state: "SAILING_FOCUS" }], frame) },
      { label: "break + empty seat", draw: (ctx, frame, x, floor) => drawGalleyTable(ctx, { x, y: floor }, [{ avatar: CREW[4], state: "SHORE_LEAVE_BREAK" }, null], frame) },
      { label: "idle + ghost (0.45)", draw: (ctx, frame, x, floor) => drawGalleyTable(ctx, { x, y: floor }, [{ avatar: CREW[2], state: "DRIFTING_IDLE" }, { avatar: CREW[7], state: "SAILING_FOCUS", opacity: 0.45 }], frame) },
    ] satisfies Cell[]).map((c) => ({ ...c, w: 190 })),
  });
  out.push({
    id: "ghost",
    title: "Ghost at 0.45 opacity (one piece, over stripes)",
    cols: 4,
    background: "stripes",
    cells: [
      { label: "opaque", draw: station(CREW[4], "SAILING_FOCUS", "map-table") },
      { label: "ghost 0.45", draw: station(CREW[4], "SAILING_FOCUS", "map-table", { opacity: 0.45 }) },
      { label: "ghost idle", draw: station(CREW[1], "DRIFTING_IDLE", "coral-vanity", { opacity: 0.45 }) },
      { label: "ghost break", draw: station(CREW[3], "SHORE_LEAVE_BREAK", "star-chart", { opacity: 0.45 }) },
    ],
  });
  out.push({
    id: "previews",
    title: "Previews (32, 48, 64, 96, 128 px)",
    cols: 1,
    px: 1,
    h: 150,
    cells: [
      {
        label: "",
        w: 1320,
        draw: (ctx, frame, x0, floor) => {
          const sizes = [32, 48, 64, 96, 128];
          let x = x0 - 640;
          for (const [i, a] of [CREW[0], CREW[3], CREW[4]].entries()) {
            for (const size of sizes) {
              ctx.fillStyle = "rgba(42,34,56,0.06)";
              ctx.fillRect(x, floor - 140, size, size);
              drawAvatarPreview(ctx, a, i === 2 ? "SHORE_LEAVE_BREAK" : "SAILING_FOCUS", x + size / 2, floor - 140 + size / 2, size, frame);
              x += size + 10;
            }
            x += 14;
          }
        },
      },
    ],
  });
  out.push({
    id: "big",
    title: "Captain's Quarters zoom (2.5×)",
    cols: 2,
    px: 0.95,
    h: 560,
    background: "cabin",
    cells: [
      { label: "focus", w: 400, draw: (ctx, frame, x, floor) => drawStudyStation(ctx, { avatar: CREW[4], state: "SAILING_FOCUS", desk: "captains-desk", at: { x, y: floor }, scale: 2.5 }, frame) },
      { label: "break", w: 400, draw: (ctx, frame, x, floor) => drawStudyStation(ctx, { avatar: CREW[1], state: "SHORE_LEAVE_BREAK", desk: "coral-vanity", at: { x, y: floor }, scale: 2.5 }, frame) },
    ],
  });
  return only ? out.filter((s) => s.id === only) : out;
}

interface Mounted {
  sheet: Sheet;
  canvas: HTMLCanvasElement;
  ctx: Ctx;
  cssW: number;
  cssH: number;
  px: number;
  cellW: number;
  cellH: number;
}

function mount(): Mounted[] {
  const host = document.getElementById("sheets")!;
  const dpr = window.devicePixelRatio || 1;
  return sheets().map((sheet) => {
    const px = sheet.px ?? PX;
    const cellW = (sheet.cells[0]?.w ?? 165) * px;
    const cellH = (sheet.h ?? 236) * px + 18;
    const rows = Math.ceil(sheet.cells.length / sheet.cols);
    const cssW = Math.ceil(cellW * Math.min(sheet.cols, sheet.cells.length));
    const cssH = Math.ceil(cellH * rows);
    const section = document.createElement("section");
    section.id = `sheet-${sheet.id}`;
    const h2 = document.createElement("h2");
    h2.textContent = sheet.title;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    section.append(h2, canvas);
    host.append(section);
    const ctx = canvas.getContext("2d")!;
    return { sheet, canvas, ctx, cssW, cssH, px, cellW, cellH };
  });
}

function background(m: Mounted, ctx: Ctx): void {
  const kind = m.sheet.background ?? "deck";
  if (kind === "stripes") {
    ctx.fillStyle = "#BFE0EA";
    ctx.fillRect(0, 0, m.cssW, m.cssH);
    ctx.fillStyle = "#8CC3D6";
    for (let x = -m.cssH; x < m.cssW; x += 22) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 11, 0);
      ctx.lineTo(x + 11 + m.cssH, m.cssH);
      ctx.lineTo(x + m.cssH, m.cssH);
      ctx.fill();
    }
    return;
  }
  const sky = ctx.createLinearGradient(0, 0, 0, m.cssH);
  sky.addColorStop(0, kind === "cabin" ? "#6B4A3A" : "#CFE8F2");
  sky.addColorStop(1, kind === "cabin" ? "#8A6248" : "#EAF4F2");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, m.cssW, m.cssH);
}

function render(list: Mounted[], frame: FrameInfo): void {
  const dpr = window.devicePixelRatio || 1;
  for (const m of list) {
    const { ctx, sheet, px, cellW, cellH } = m;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, m.cssW, m.cssH);
    background(m, ctx);
    sheet.cells.forEach((cell, i) => {
      const col = i % sheet.cols;
      const row = Math.floor(i / sheet.cols);
      const cx = col * cellW + cellW / 2;
      const floor = row * cellH + cellH - 22;
      if ((sheet.background ?? "deck") === "deck") {
        ctx.fillStyle = "#C7A07A";
        ctx.fillRect(col * cellW, floor - 2, cellW, 8);
        ctx.fillStyle = "#A9825F";
        ctx.fillRect(col * cellW, floor + 6, cellW, 2);
      }
      ctx.save();
      ctx.translate(cx, floor);
      ctx.scale(px, px);
      try {
        cell.draw(ctx, frame, 0, 0);
      } catch (err) {
        console.error(sheet.id, cell.label, err);
      }
      ctx.restore();
      if (cell.label) {
        ctx.fillStyle = "#2A2238";
        ctx.font = "11px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(cell.label, cx, floor + 17);
      }
    });
  }
}

const list = mount();
let start: number | null = null;
let last = 0;
function tick(now: number): void {
  start ??= now;
  const t = (now - start) / 1000;
  render(list, { t, dt: Math.min(0.05, t - last), reducedMotion: false, wind: 0.5 });
  last = t;
  requestAnimationFrame(tick);
}
if (still) {
  render(list, STILL_FRAME);
  document.body.dataset.ready = "1";
} else if (fixedT !== null) {
  render(list, { t: fixedT, dt: 0, reducedMotion: false, wind: 0.5 });
  document.body.dataset.ready = "1";
} else {
  requestAnimationFrame((now) => {
    tick(now);
    document.body.dataset.ready = "1";
  });
}
