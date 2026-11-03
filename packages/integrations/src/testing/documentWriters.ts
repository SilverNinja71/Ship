// Builds small real PDF, Word and PowerPoint files for tests.

import { strToU8, zipSync } from "fflate";

export function zipParts(parts: Record<string, string>): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(parts).map(([path, xml]) => [path, strToU8(xml)])));
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

export function writeDocx(bodyXml: string, stylesXml = ""): Uint8Array {
  return zipParts({
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${bodyXml}</w:body></w:document>`,
    "word/styles.xml": `<w:styles ${W}>${stylesXml}</w:styles>`,
  });
}

const P = 'xmlns:p="p" xmlns:a="a" xmlns:r="r"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export interface TestSlide {
  /** What goes inside <p:spTree>. */
  shapes: string;
  notes?: string;
  diagram?: string;
}

export const slideShape = (placeholder: string | null, ...paragraphs: string[]) =>
  `<p:sp><p:nvSpPr><p:nvPr>${placeholder ? `<p:ph ${placeholder}/>` : ""}</p:nvPr></p:nvSpPr><p:txBody>${paragraphs.join("")}</p:txBody></p:sp>`;

export const slideText = (text: string, attrs = "") => `<a:p><a:r><a:rPr ${attrs}/><a:t>${text}</a:t></a:r></a:p>`;

/** `order` lists slide file numbers in the order the deck shows them. */
export function writePptx(slides: Record<number, TestSlide>, order: number[]): Uint8Array {
  const parts: Record<string, string> = {
    "ppt/presentation.xml": `<p:presentation ${P}><p:sldIdLst>${order.map((n) => `<p:sldId id="${255 + n}" r:id="rId${n}"/>`).join("")}</p:sldIdLst></p:presentation>`,
    "ppt/_rels/presentation.xml.rels": `<Relationships>${order
      .map((n) => `<Relationship Id="rId${n}" Type="${REL}/slide" Target="slides/slide${n}.xml"/>`)
      .join("")}</Relationships>`,
  };
  for (const [n, slide] of Object.entries(slides)) {
    parts[`ppt/slides/slide${n}.xml`] = `<p:sld ${P}><p:cSld><p:spTree>${slide.shapes}</p:spTree></p:cSld></p:sld>`;
    const rels: string[] = [];
    if (slide.notes) {
      parts[`ppt/notesSlides/notesSlide${n}.xml`] = `<p:notes ${P}><p:cSld><p:spTree>${slide.notes}</p:spTree></p:cSld></p:notes>`;
      rels.push(`<Relationship Id="rId1" Type="${REL}/notesSlide" Target="../notesSlides/notesSlide${n}.xml"/>`);
    }
    if (slide.diagram) {
      parts[`ppt/diagrams/data${n}.xml`] = `<dgm:dataModel xmlns:dgm="d" xmlns:a="a">${slide.diagram}</dgm:dataModel>`;
      rels.push(`<Relationship Id="rId2" Type="${REL}/diagramData" Target="../diagrams/data${n}.xml"/>`);
    }
    if (rels.length > 0) parts[`ppt/slides/_rels/slide${n}.xml.rels`] = `<Relationships>${rels.join("")}</Relationships>`;
  }
  return zipParts(parts);
}

export interface TestPdfLine {
  text: string;
  y: number;
  x?: number;
  size?: number;
}

/** A real PDF in Helvetica. A page with no lines has no text, like a scan. */
export function writePdf(pages: TestPdfLine[][]): Uint8Array {
  const objects: string[] = [];
  const add = (body: string) => objects.push(body);
  const first = 4; // 1 catalog, 2 page tree, 3 font
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${first + i * 2} 0 R`).join(" ")}] >>`);
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  pages.forEach((lines, i) => {
    const stream = lines
      .map((l) => `BT /F1 ${l.size ?? 12} Tf ${l.x ?? 72} ${l.y} Td (${l.text.replace(/([\\()])/g, "\\$1")}) Tj ET`)
      .join("\n");
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${first + i * 2 + 1} 0 R >>`);
    add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
