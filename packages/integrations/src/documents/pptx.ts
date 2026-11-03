// PowerPoint (.pptx): one page per slide, in the order the deck shows them.
// Titles become # headings, body text becomes "- " bullets, and speaker notes
// and SmartArt text are included since lecturers often put the detail there.

import { openOfficeFile, relationshipsOf } from "./officeZip.js";
import type { ReadPart } from "./officeZip.js";
import { BlockCollector, headingLine, renderRuns } from "./pages.js";
import type { DocumentPage, TextRun } from "./pages.js";
import { scanXml } from "./xml.js";

export interface PptxContents {
  pages: DocumentPage[];
  slides: number;
  /** Slides with no words on them, usually just a picture. */
  blankSlides: number;
}

// a:fld holds slide numbers and dates; Fallback repeats content for old PowerPoint versions.
const SKIPPED = new Set(["mc:Fallback", "a:fld"]);
const NOT_CONTENT = new Set(["sldNum", "ftr", "hdr", "dt", "sldImg"]);
const TITLES = new Set(["title", "ctrTitle"]);

const isOn = (value: string | undefined) => value === "1" || value === "true";

/** Slide paths in deck order. */
function slidePaths(read: ReadPart): string[] {
  const rels = new Map(relationshipsOf(read, "ppt/presentation.xml").map((r) => [r.id, r.path]));
  const ordered: string[] = [];
  scanXml(read("ppt/presentation.xml") ?? "", {
    open(name, attrs) {
      const path = name === "p:sldId" ? rels.get(attrs["r:id"] ?? "") : undefined;
      if (path) ordered.push(path);
    },
  });
  return ordered;
}

interface PartText {
  titles: string[];
  lines: string[];
}

function readTextPart(xml: string, options: { bullets: boolean; onlyBody?: boolean }): PartText {
  const titles: string[] = [];
  const blocks = new BlockCollector();
  // null while outside a shape; a shape with no placeholder is a plain text box.
  const shapes: { placeholder: string | null }[] = [];
  let runs: TextRun[] | null = null;
  let bold = false;
  let inRun = false;
  let inText = false;
  let bullet = true;

  scanXml(
    xml,
    {
      open(name, attrs) {
        switch (name) {
          case "p:sp":
            shapes.push({ placeholder: null });
            break;
          case "p:ph": {
            const shape = shapes.at(-1);
            if (shape) shape.placeholder = attrs.type ?? "body";
            break;
          }
          case "a:p":
            runs = [];
            bullet = true;
            break;
          case "a:buNone":
            bullet = false;
            break;
          case "a:r":
            inRun = true;
            bold = false;
            break;
          case "a:rPr":
            if (inRun) bold = isOn(attrs.b);
            break;
          case "a:t":
            inText = true;
            break;
          case "a:br":
            runs?.push({ text: " ", bold: false });
            break;
          case "a:tr":
            blocks.openRow();
            break;
          case "a:tc":
            blocks.openCell();
            break;
        }
      },
      close(name) {
        switch (name) {
          case "p:sp":
            shapes.pop();
            break;
          case "a:r":
            inRun = false;
            break;
          case "a:t":
            inText = false;
            break;
          case "a:tr":
            blocks.closeRow();
            break;
          case "a:tc":
            blocks.closeCell();
            break;
          case "a:p": {
            const text = runs ? renderRuns(runs) : "";
            runs = null;
            if (!text) break;
            const placeholder = shapes.at(-1)?.placeholder ?? null;
            if (placeholder && NOT_CONTENT.has(placeholder)) break;
            if (options.onlyBody && placeholder !== "body") break;
            if (placeholder && TITLES.has(placeholder)) titles.push(text);
            else blocks.add(options.bullets && placeholder === "body" && bullet && !blocks.inTable ? `- ${text}` : text);
            break;
          }
        }
      },
      text(text) {
        if (inText && runs) runs.push({ text, bold });
      },
    },
    SKIPPED,
  );
  return { titles, lines: blocks.blocks };
}

function slideText(read: ReadPart, path: string): string {
  const xml = read(path);
  if (xml === null) return "";
  const { titles, lines } = readTextPart(xml, { bullets: true });
  const out: string[] = [];
  if (titles.length > 0) out.push(headingLine(titles.join(" ")));
  out.push(...lines);

  const speakerNotes: string[] = [];
  for (const rel of relationshipsOf(read, path)) {
    const related = rel.type.endsWith("/notesSlide") || rel.type.endsWith("/diagramData") ? read(rel.path) : null;
    if (related === null) continue;
    if (rel.type.endsWith("/diagramData")) out.push(...readTextPart(related, { bullets: false }).lines.map((l) => `- ${l}`));
    else speakerNotes.push(...readTextPart(related, { bullets: false, onlyBody: true }).lines);
  }
  const slide = out.join("\n");
  return speakerNotes.length > 0 ? [slide, speakerNotes.join("\n")].filter(Boolean).join("\n\n") : slide;
}

export function readPptx(bytes: Uint8Array): PptxContents {
  const read = openOfficeFile(bytes, "PowerPoint");
  const paths = slidePaths(read);
  if (read("ppt/presentation.xml") === null) throw new Error("It isn't a valid PowerPoint file.");
  const pages: DocumentPage[] = [];
  paths.forEach((path, i) => {
    const text = slideText(read, path);
    if (text) pages.push({ id: `${i + 1}`, text });
  });
  return { pages, slides: paths.length, blankSlides: paths.length - pages.length };
}
