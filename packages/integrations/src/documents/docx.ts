// Word (.docx): paragraphs live in word/document.xml. Heading styles, bold and
// list items carry over as # headings, **bold** and "- " bullets, which the
// blurt check treats as key ideas.

import { openOfficeFile } from "./officeZip.js";
import type { ReadPart } from "./officeZip.js";
import { BlockCollector, headingLine, renderRuns, splitLongPage } from "./pages.js";
import type { DocumentPage, TextRun } from "./pages.js";
import { scanXml } from "./xml.js";

export interface DocxContents {
  pages: DocumentPage[];
  /** Pictures and drawings, whose contents can't be read. */
  pictures: number;
}

interface Paragraph {
  runs: TextRun[];
  runBold: boolean;
  inRun: boolean;
  heading: boolean;
  listItem: boolean;
  startsPage: boolean;
}

// Fallback repeats a text box's words for old Word versions; moveFrom is text a tracked change moved away.
const SKIPPED = new Set(["mc:Fallback", "w:moveFrom"]);

const isOn = (value: string | undefined) => value !== "0" && value !== "false";

/** Style ids vary by language ("Heading1", "Titre1"), but the names of Word's built-in styles are always English. */
function headingStyleIds(read: ReadPart): Set<string> {
  const ids = new Set<string>();
  const xml = read("word/styles.xml");
  if (!xml) return ids;
  let current: string | null = null;
  scanXml(xml, {
    open(name, attrs) {
      if (name === "w:style") current = attrs["w:styleId"] ?? null;
      else if (name === "w:name" && current && /^(heading [1-9]|title|subtitle)$/i.test(attrs["w:val"] ?? "")) ids.add(current);
    },
  });
  return ids;
}

export function readDocx(bytes: Uint8Array): DocxContents {
  const read = openOfficeFile(bytes, "Word");
  const body = read("word/document.xml");
  if (body === null) throw new Error("It isn't a valid Word file.");
  const headings = headingStyleIds(read);

  const stack: Paragraph[] = [];
  const blocks = new BlockCollector();
  const sections: string[][] = [[]];
  let inText = false;
  let pictures = 0;

  const line = () => {
    if (blocks.blocks.length === 0) return;
    sections.at(-1)?.push(...blocks.blocks.splice(0));
  };

  scanXml(
    body,
    {
      open(name, attrs) {
        const paragraph = stack.at(-1);
        switch (name) {
          case "w:p":
            stack.push({ runs: [], runBold: false, inRun: false, heading: false, listItem: false, startsPage: false });
            break;
          case "w:pStyle":
            if (paragraph && headings.has(attrs["w:val"] ?? "")) paragraph.heading = true;
            break;
          case "w:numPr":
            if (paragraph) paragraph.listItem = true;
            break;
          case "w:r":
            if (paragraph) {
              paragraph.inRun = true;
              paragraph.runBold = false;
            }
            break;
          case "w:b":
            if (paragraph?.inRun) paragraph.runBold = isOn(attrs["w:val"]);
            break;
          case "w:t":
            inText = true;
            break;
          case "w:tab":
          case "w:noBreakHyphen":
            if (paragraph?.inRun) paragraph.runs.push({ text: name === "w:tab" ? " " : "-", bold: paragraph.runBold });
            break;
          case "w:br":
            if (paragraph && attrs["w:type"] === "page") paragraph.startsPage = true;
            else if (paragraph?.inRun) paragraph.runs.push({ text: " ", bold: paragraph.runBold });
            break;
          case "w:lastRenderedPageBreak":
          case "w:pageBreakBefore":
            if (paragraph) paragraph.startsPage = true;
            break;
          case "w:drawing":
          case "w:pict":
            pictures++;
            break;
          case "w:tr":
            blocks.openRow();
            break;
          case "w:tc":
            blocks.openCell();
            break;
        }
      },
      close(name) {
        switch (name) {
          case "w:t":
            inText = false;
            break;
          case "w:r": {
            const paragraph = stack.at(-1);
            if (paragraph) paragraph.inRun = false;
            break;
          }
          case "w:p": {
            const paragraph = stack.pop();
            if (!paragraph) break;
            const text = renderRuns(paragraph.runs);
            if (paragraph.startsPage && !blocks.inTable && (sections.at(-1)?.length ?? 0) > 0) sections.push([]);
            if (text) blocks.add(paragraph.heading ? headingLine(text) : paragraph.listItem ? `- ${text}` : text);
            if (!blocks.inTable) line();
            break;
          }
          case "w:tc":
            blocks.closeCell();
            break;
          case "w:tr":
            blocks.closeRow();
            if (!blocks.inTable) line();
            break;
        }
      },
      text(text) {
        const paragraph = stack.at(-1);
        if (inText && paragraph) paragraph.runs.push({ text, bold: paragraph.runBold });
      },
    },
    SKIPPED,
  );

  const pages = sections
    .flatMap((section) => splitLongPage(section))
    .map((paragraphs, i): DocumentPage => ({ id: `${i + 1}`, text: paragraphs.join("\n\n") }));
  return { pages, pictures };
}
