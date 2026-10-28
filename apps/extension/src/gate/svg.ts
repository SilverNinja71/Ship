// Turns our own static SVG markup into DOM nodes with createElementNS, so the
// gate never uses innerHTML. Some pages (YouTube) enforce Trusted Types, and
// building elements directly is safe however strict the page's policy is.
// Only handles the simple markup in art.ts: tags and double-quoted attributes.

export interface SvgNode {
  tag: string;
  attrs: Record<string, string>;
  children: SvgNode[];
}

const SVG_NS = "http://www.w3.org/2000/svg";
const TAG = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
const ATTR = /([\w:-]+)="([^"]*)"/g;

export function parseSvgMarkup(markup: string): SvgNode {
  const root: SvgNode = { tag: "#root", attrs: {}, children: [] };
  const stack = [root];
  for (const [, closing, tag, attrText, selfClosing] of markup.matchAll(TAG)) {
    if (closing) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const node: SvgNode = { tag: tag!, attrs: Object.fromEntries([...attrText!.matchAll(ATTR)].map((a) => [a[1]!, a[2]!])), children: [] };
    stack.at(-1)!.children.push(node);
    if (!selfClosing) stack.push(node);
  }
  const svg = root.children[0];
  if (!svg || svg.tag !== "svg") throw new Error("Expected <svg> markup");
  return svg;
}

function build(doc: Document, node: SvgNode): Element {
  const el = doc.createElementNS(SVG_NS, node.tag);
  // xmlns is implied by createElementNS; event-handler attributes are never wanted.
  for (const [k, v] of Object.entries(node.attrs)) if (k !== "xmlns" && !k.startsWith("on")) el.setAttribute(k, v);
  for (const child of node.children) el.append(build(doc, child));
  return el;
}

export function svgElement(doc: Document, markup: string): Element {
  return build(doc, parseSvgMarkup(markup));
}
