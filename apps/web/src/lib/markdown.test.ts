import { describe, expect, it } from "vitest";
import { headingSlug, renderMarkdown } from "./markdown.js";

const html = (md: string) => renderMarkdown(md).html;

describe("Obsidian-style Markdown", () => {
  it("renders the basics, keeping single line breaks", () => {
    const out = html("# Cells\n\n**Bold** and *italic*, ~~gone~~\nnext line\n\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nlet x = 1;\n```");
    expect(out).toContain('<h1 id="cells">Cells</h1>');
    expect(out).toContain("<strong>Bold</strong>");
    expect(out).toContain("<s>gone</s>");
    expect(out).toContain("<br>");
    expect(out).toContain("<table>");
    expect(out).toContain('<code class="language-js">');
  });

  it("turns wikilinks and embeds into links Ship can follow", () => {
    const out = html("See [[Krebs cycle]], [[Bio/ATP|energy]], [[Cells#Organelles]], ![[Lecture 2]] and ![[diagram.png]].");
    expect(out).toContain('data-wikilink="Krebs cycle">Krebs cycle</a>');
    expect(out).toContain('data-wikilink="Bio/ATP">energy</a>');
    expect(out).toContain('data-wikilink="Cells" data-heading="Organelles">Cells › Organelles</a>');
    expect(out).toContain('class="md-wikilink md-embed-link" data-wikilink="Lecture 2">↪ Lecture 2</a>');
    expect(out).toContain('data-embed="diagram.png"');
  });

  it("draws callouts, with a title or the type's own", () => {
    const out = html("> [!tip] Remember this\n> Mitochondria make ATP.\n\n> [!warning]\n> Careful.\n\n> [!unknown-kind]\n> Hmm.");
    expect(out).toContain('<blockquote class="callout callout-tip" data-callout="tip">');
    expect(out).toContain("Remember this</div>");
    expect(out).toContain("<p>Mitochondria make ATP.</p>");
    expect(out).toContain('class="callout callout-warning"');
    expect(out).toContain("Warning</div>");
    expect(out).toContain("Unknown-kind</div>");
    expect(html("> plain quote")).toContain("<blockquote>");
  });

  it("checks off tasks, highlights, tags and hides comments", () => {
    const out = html("- [ ] read ch 4\n- [x] lab report\n\n==key idea== #biology #unit/2 #2024 C#sharp\n\nkeep %%secret%% this\n\n`%%code%%`");
    expect(out).toContain('<li class="task-list-item"><input type="checkbox" class="md-task" disabled> read ch 4');
    expect(out).toContain('<input type="checkbox" class="md-task" disabled checked> lab report');
    expect(out).toContain("<mark>key idea</mark>");
    expect(out).toContain('data-tag="biology">#biology</a>');
    expect(out).toContain('data-tag="unit/2"');
    expect(out).not.toContain('data-tag="2024"');
    expect(out).not.toContain('data-tag="sharp"');
    expect(out).not.toContain("secret");
    expect(out).toContain("<code>%%code%%</code>");
  });

  it("never runs HTML or script links from a note", () => {
    const out = html('<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n[click](javascript:alert(1)) [[x" onmouseover="alert(1)]]');
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("<img src=x");
    expect(out).not.toContain('href="javascript:');
    expect(out).not.toContain('" onmouseover="');
    expect(out).toContain("&lt;script&gt;");
  });

  it("opens web links in a new tab and reads properties separately", () => {
    const { html: out, properties } = renderMarkdown('---\ntitle: "Cells"\ntags: [bio]\n---\n[MDN](https://developer.mozilla.org) ![p](https://example.com/p.png)');
    expect(properties).toEqual({ title: "Cells", tags: ["bio"] });
    expect(out).toContain('target="_blank" rel="noopener noreferrer"');
    expect(out).toContain('loading="lazy"');
    expect(out).not.toContain("title:");
  });

  it("gives repeated headings their own ids", () => {
    expect(html("## Notes\n## Notes")).toContain('id="notes-1"');
    expect(headingSlug("Krebs Cycle: Steps!")).toBe("krebs-cycle-steps");
  });
});
