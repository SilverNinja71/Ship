import { describe, expect, it } from "vitest";
import { importFile, importFileAsync } from "../importFile.js";
import { slideShape, slideText, writeDocx, writePdf, writePptx, zipParts } from "../testing/documentWriters.js";
import { bodyHeight, linesFromItems, pageText, withoutRunningText } from "./pdf.js";
import type { PdfLine, PdfTextItem } from "./pdf.js";
import { MAX_PAGE_CHARS, renderRuns, splitLongPage } from "./pages.js";
import { decodeXml, scanXml } from "./xml.js";

describe("scanXml", () => {
  it("reports tags, attributes and decoded text in order", () => {
    const seen: string[] = [];
    scanXml(`<?xml version="1.0"?><!-- note --><a x="1 &amp; 2"><b y='z'/>T &lt;1&gt; &#65;&#x42;<![CDATA[<raw>]]></a>`, {
      open: (name, attrs) => seen.push(`open ${name} ${JSON.stringify(attrs)}`),
      close: (name) => seen.push(`close ${name}`),
      text: (text) => seen.push(`text ${text}`),
    });
    expect(seen).toEqual(['open a {"x":"1 & 2"}', 'open b {"y":"z"}', "close b", "text T <1> AB", "text <raw>", "close a"]);
  });

  it("ignores everything inside skipped elements, even nested", () => {
    const text: string[] = [];
    scanXml("<r><s>no<s>no</s>no</s><s/>yes</r>", { text: (t) => text.push(t) }, new Set(["s"]));
    expect(text).toEqual(["yes"]);
  });

  it("leaves unknown entities and impossible character codes alone", () => {
    expect(decodeXml("&bogus; &#x110000; &apos;")).toBe("&bogus; &#x110000; '");
  });
});

describe("renderRuns", () => {
  it("marks bold stretches, keeping the spaces around them outside the marks", () => {
    expect(
      renderRuns([
        { text: "The ", bold: false },
        { text: "mitochondria ", bold: true },
        { text: "makes ATP", bold: false },
      ]),
    ).toBe("The **mitochondria** makes ATP");
  });

  it("merges neighbouring bold runs, even across a space", () => {
    expect(
      renderRuns([
        { text: "cell", bold: true },
        { text: " ", bold: false },
        { text: "wall", bold: true },
      ]),
    ).toBe("**cell wall**");
  });

  it("doesn't bold bare punctuation", () => {
    expect(renderRuns([{ text: "a", bold: false }, { text: ":", bold: true }, { text: " b", bold: false }])).toBe("a: b");
  });
});

describe("splitLongPage", () => {
  it("cuts at paragraph boundaries and never splits a paragraph", () => {
    expect(splitLongPage(["aaaa", "bbbb", "cc", "dddddddddd"], 8)).toEqual([["aaaa", "bbbb"], ["cc"], ["dddddddddd"]]);
  });
});

const para = (text: string, inner = "") => `<w:p>${inner ? `<w:pPr>${inner}</w:pPr>` : ""}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const HEADING_STYLES = `<w:style w:styleId="Titre1"><w:name w:val="heading 1"/></w:style><w:style w:styleId="Normal"><w:name w:val="Normal"/></w:style>`;

describe("Word files", () => {
  const read = (body: string, styles = "") => importFile("Lecture 5.docx", writeDocx(body, styles));

  it("keeps headings, bold and list items as the blurt check's key-idea markers", () => {
    const { notes, warnings } = read(
      para("Cell parts", '<w:pStyle w:val="Titre1"/>') +
        `<w:p><w:r><w:t xml:space="preserve">The </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>nucleus</w:t></w:r><w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t xml:space="preserve"> holds DNA.</w:t></w:r></w:p>` +
        para("Ribosomes make protein", '<w:numPr><w:numId w:val="1"/></w:numPr>'),
      HEADING_STYLES,
    );
    expect(warnings).toEqual([]);
    expect(notes[0]).toMatchObject({ source: "file", title: "Lecture 5" });
    expect(notes[0].pages).toEqual([{ id: "1", text: "# Cell parts\n\nThe **nucleus** holds DNA.\n\n- Ribosomes make protein" }]);
  });

  it("reads a two-column table as definitions, and wider tables as rows", () => {
    const cell = (t: string) => `<w:tc>${para(t)}</w:tc>`;
    const { notes } = read(`<w:tbl><w:tr>${cell("ATP")}${cell("Cell energy")}</w:tr><w:tr>${cell("A")}${cell("B")}${cell("C")}</w:tr></w:tbl>`);
    expect(notes[0].pages[0].text).toBe("ATP - Cell energy\n\nA | B | C");
  });

  it("starts a new page where Word did, and cuts up files with no page information", () => {
    const paged = read(`${para("One")}<w:p><w:r><w:lastRenderedPageBreak/><w:t>Two</w:t></w:r></w:p>${para("Three", "<w:pageBreakBefore/>")}`);
    expect(paged.notes[0].pages.map((p) => p.text)).toEqual(["One", "Two", "Three"]);

    const long = read(Array.from({ length: 30 }, (_, i) => para(`${i} ${"word ".repeat(60)}`)).join(""));
    expect(long.notes[0].pages.length).toBeGreaterThan(1);
    expect(long.notes[0].pages.every((p) => p.text.length <= MAX_PAGE_CHARS + 10)).toBe(true);
  });

  it("doesn't read a text box twice, or deleted and moved-away text", () => {
    const box = `<w:p><w:r><mc:AlternateContent><mc:Choice><w:txbxContent>${para("In a box")}</w:txbxContent></mc:Choice><mc:Fallback><w:txbxContent>${para("In a box")}</w:txbxContent></mc:Fallback></mc:AlternateContent></w:r></w:p>`;
    const gone = `<w:p><w:del><w:r><w:delText>deleted</w:delText></w:r></w:del><w:moveFrom><w:r><w:t>moved</w:t></w:r></w:moveFrom><w:r><w:t>kept</w:t></w:r></w:p>`;
    const { notes } = read(box + gone);
    expect(notes[0].pages[0].text).toBe("In a box\n\nkept");
  });

  it("says when pictures were skipped, and when there's no text at all", () => {
    const withPicture = read(`${para("Words")}<w:p><w:r><w:drawing/></w:r></w:p>`);
    expect(withPicture.warnings).toEqual(["1 picture(s) weren't read. Only the text was imported."]);
    const empty = read("<w:p><w:r><w:drawing/></w:r></w:p>");
    expect(empty.notes).toEqual([]);
    expect(empty.warnings[0]).toMatch(/no text/);
  });

  it("gets the same id for the same contents, whatever the file's name, and a new one otherwise", () => {
    const a = importFile("a.docx", writeDocx(para("Same words"))).notes[0];
    const b = importFile("b.docx", writeDocx(para("Same words"))).notes[0];
    const c = importFile("a.docx", writeDocx(para("Other words"))).notes[0];
    expect(a.id).toBe(b.id);
    expect(a.id).not.toBe(c.id);
  });

  it("recognizes the temporary files Office leaves beside open documents", () => {
    for (const name of ["~$cture 5.docx", "folder/~$ides.pptx"]) {
      const { notes, warnings } = importFile(name, new Uint8Array(162));
      expect(notes).toEqual([]);
      expect(warnings[0]).toMatch(/temporary file/);
    }
  });

  it("explains broken, protected and old files rather than failing silently", () => {
    expect(importFile("x.docx", new Uint8Array([1, 2, 3, 4])).warnings[0]).toMatch(/isn't a valid Word file/);
    expect(importFile("x.docx", zipParts({ "other.xml": "<a/>" })).warnings[0]).toMatch(/isn't a valid Word file/);
    expect(importFile("x.docx", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])).warnings[0]).toMatch(/password-protected/);
    expect(importFile("x.doc", new Uint8Array([0xd0, 0xcf])).warnings[0]).toMatch(/save it as .docx/);
  });
});

describe("PowerPoint files", () => {
  const TITLE = 'type="title"';
  const BODY = 'idx="1"';

  it("reads slides in the deck's order, with titles, bullets, speaker notes and SmartArt", () => {
    const bytes = writePptx(
      {
        1: { shapes: slideShape(TITLE, slideText("Second slide shown")) + slideShape(BODY, slideText("Later point")) },
        2: {
          shapes:
            slideShape(TITLE, slideText("Krebs &amp; ATP")) +
            slideShape(BODY, slideText("Happens in mitochondria"), `<a:p><a:pPr><a:buNone/></a:pPr><a:r><a:t>No bullet here</a:t></a:r></a:p>`) +
            slideShape(BODY, slideText("Key term", 'b="1"')) +
            slideShape(null, slideText("A loose text box")),
          notes: slideShape('type="sldImg"') + slideShape('type="body" idx="1"', slideText("Say this out loud")) + slideShape('type="sldNum"', slideText("9")),
          diagram: "<dgm:pt><dgm:t><a:p><a:r><a:t>Diagram label</a:t></a:r></a:p></dgm:t></dgm:pt>",
        },
      },
      [2, 1],
    );
    const { notes, warnings } = importFile("Week 3.pptx", bytes);
    expect(warnings).toEqual([]);
    expect(notes[0]).toMatchObject({ source: "file", title: "Week 3" });
    expect(notes[0].pages).toEqual([
      {
        id: "1",
        text: "# Krebs & ATP\n- Happens in mitochondria\nNo bullet here\n- **Key term**\nA loose text box\n- Diagram label\n\nSay this out loud",
      },
      { id: "2", text: "# Second slide shown\n- Later point" },
    ]);
  });

  it("leaves out slide numbers, footers and dates, and reads tables", () => {
    const fld = '<a:p><a:fld type="slidenum"><a:t>7</a:t></a:fld></a:p>';
    const table = `<p:graphicFrame><a:tbl><a:tr><a:tc>${slideText("ATP")}</a:tc><a:tc>${slideText("Energy")}</a:tc></a:tr></a:tbl></p:graphicFrame>`;
    const bytes = writePptx(
      { 1: { shapes: slideShape(TITLE, slideText("Terms")) + table + slideShape('type="ftr"', slideText("My University")) + slideShape('type="dt"', slideText("Monday")) + slideShape('type="body"', fld) } },
      [1],
    );
    expect(importFile("t.pptx", bytes).notes[0].pages[0].text).toBe("# Terms\nATP - Energy");
  });

  it("says which slides were only pictures, and keeps real slide numbers", () => {
    const bytes = writePptx({ 1: { shapes: "" }, 2: { shapes: slideShape(TITLE, slideText("Has words")) } }, [1, 2]);
    const { notes, warnings } = importFile("t.pptx", bytes);
    expect(notes[0].pages).toEqual([{ id: "2", text: "# Has words" }]);
    expect(warnings).toEqual(["1 slide(s) had no text, only pictures, so they were left out."]);
    expect(importFile("t.pptx", writePptx({ 1: { shapes: "" } }, [1])).notes).toEqual([]);
  });

  it("explains a file that isn't really PowerPoint", () => {
    expect(importFile("x.pptx", zipParts({ "other.xml": "<a/>" })).warnings[0]).toMatch(/isn't a valid PowerPoint file/);
  });
});

const item = (str: string, x: number, y: number, extra: Partial<PdfTextItem> = {}): PdfTextItem => ({ str, x, y, width: str.length * 6, height: 12, hasEOL: false, ...extra });
const line = (text: string, y: number, height = 12): PdfLine => ({ text, y, height });

describe("PDF text clean-up", () => {
  it("rebuilds lines from scraps, adding the spaces a gap implies", () => {
    expect(linesFromItems([item("The cell", 72, 700), item("wall", 125, 700), item(" holds", 150, 700, { hasEOL: true }), item("Next", 72, 686)]).map((l) => l.text)).toEqual(["The cell wall holds", "Next"]);
  });

  it("starts a new line when the text jumps, even with no line-end mark", () => {
    expect(linesFromItems([item("Up", 72, 700), item("Down", 72, 660)]).map((l) => l.text)).toEqual(["Up", "Down"]);
  });

  it("joins bullets drawn in a symbol font to their text, and drops other symbol-font glyphs", () => {
    const lines = linesFromItems([
      item("\uF0B7", 72, 700, { hasEOL: true }),
      item("Nucleus holds DNA", 90, 700, { hasEOL: true }),
      item("\uF0A7 Second point", 72, 686, { hasEOL: true }),
      item("Energy \uF0AE ATP", 72, 672, { hasEOL: true }),
      item("\uF0B7", 72, 658, { hasEOL: true }),
      item("Far below the bullet", 72, 500),
    ]);
    expect(lines.map((l) => l.text)).toEqual(["\u2022 Nucleus holds DNA", "\u2022 Second point", "Energy ATP", "\u2022", "Far below the bullet"]);
  });

  it("drops page numbers and text repeated at the edges of most pages, but not real repeats", () => {
    const page = (n: number) => [line("Biology 101 Lecture Notes", 760), line(`Point ${"x".repeat(n)}`, 700), line("Mitochondria", 680), line("Mitochondria", 660), line("Mitochondria", 640), line(`More ${"y".repeat(n)}`, 620), line(`${n}`, 40)];
    const cleaned = withoutRunningText([page(1), page(2), page(3), page(4)]);
    expect(cleaned[0].map((l) => l.text)).toEqual(["Point x", "Mitochondria", "Mitochondria", "Mitochondria", "More y"]);
  });

  it("keeps a short file's lines even if they repeat", () => {
    const cleaned = withoutRunningText([[line("Same", 700)], [line("Same", 700)]]);
    expect(cleaned.map((p) => p.length)).toEqual([1, 1]);
  });

  it("finds the body size by how much text is set in it", () => {
    expect(bodyHeight([[line("Title", 700, 24), line("A long line of body text here", 660, 12)]])).toBe(12);
  });

  it("joins wrapped lines into sentences and mends hyphenated words", () => {
    const lines = [line("The mitochondria is where most of the cell's energy", 700), line("is made through cellular respi-", 686), line("ration in the inner membrane.", 672), line("A new sentence starts here on its own line now.", 658)];
    expect(pageText(lines, 12)).toBe("The mitochondria is where most of the cell's energy is made through cellular respiration in the inner membrane.\nA new sentence starts here on its own line now.");
  });

  it("keeps bullets and short slide lines apart, and turns big text into headings", () => {
    const lines = [line("Parts of a", 720, 28), line("Cell", 690, 28), line("- Nucleus", 650), line("- Ribosome", 636), line("Short label", 622), line("Another label", 608)];
    expect(pageText(lines, 12)).toBe("# Parts of a Cell\n- Nucleus\n- Ribosome\nShort label\nAnother label");
  });

  it("doesn't join across a big gap or a new column", () => {
    const lines = [line("This line stops without any punctuation at all", 700), line("Far below it comes something else entirely", 600), line("then a new column at the top of the page", 720)];
    expect(pageText(lines, 12).split("\n")).toHaveLength(3);
  });
});

describe("PDF files", () => {
  const read = (bytes: Uint8Array) => importFileAsync("Lecture 5.pdf", bytes);

  it("reads a real PDF page by page, keeping its page numbers", async () => {
    const { notes, warnings } = await read(
      writePdf([
        [
          { text: "Cell Respiration", y: 720, size: 24 },
          { text: "Glycolysis happens in the cytoplasm of the cell and it", y: 680 },
          { text: "produces two molecules of ATP.", y: 666 },
        ],
        [],
        [{ text: "Mitochondria make most of the (cellular) ATP.", y: 700 }],
      ]),
    );
    expect(notes[0]).toMatchObject({ source: "file", title: "Lecture 5" });
    expect(notes[0].pages).toEqual([
      { id: "1", text: "# Cell Respiration\nGlycolysis happens in the cytoplasm of the cell and it produces two molecules of ATP." },
      { id: "3", text: "Mitochondria make most of the (cellular) ATP." },
    ]);
    expect(warnings).toEqual(["1 of 3 pages had no text to read (scans or pictures), so they were left out."]);
  });

  it("says when a PDF is all scans, or not really a PDF", async () => {
    const scan = await read(writePdf([[], []]));
    expect(scan.notes).toEqual([]);
    expect(scan.warnings[0]).toMatch(/scan or photos/);

    const broken = await read(new TextEncoder().encode("not a pdf at all"));
    expect(broken.notes).toEqual([]);
    expect(broken.warnings[0]).toMatch(/^Couldn't read Lecture 5\.pdf/);
  });

  it("hands every other kind of file to importFile", async () => {
    const result = await importFileAsync("notes.txt", "Plain words here.");
    expect(result.notes[0]).toMatchObject({ source: "file", title: "notes" });
  });
});
