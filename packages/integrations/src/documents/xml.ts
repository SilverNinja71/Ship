// A small tag scanner for Office files. They're machine-written XML, so this
// only needs tags, attributes and text. It never processes a DOCTYPE, and it
// runs in the browser and in tests alike.

export type XmlAttrs = Record<string, string>;

export interface XmlHandler {
  open?(name: string, attrs: XmlAttrs): void;
  close?(name: string): void;
  text?(text: string): void;
}

const TOKEN =
  /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<![^>]*>|<(\/?)([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
const ATTR = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const ENTITY = /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi;
const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeXml(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(ENTITY, (whole, body: string) => {
    if (body[0] !== "#") return NAMED[body.toLowerCase()] ?? whole;
    const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

function parseAttrs(source: string): XmlAttrs {
  const attrs: XmlAttrs = {};
  if (source) for (const m of source.matchAll(ATTR)) attrs[m[1]] = decodeXml(m[2] ?? m[3] ?? "");
  return attrs;
}

/** Walks the XML in order. Everything inside an element named in `skip` is ignored. */
export function scanXml(xml: string, handler: XmlHandler, skip: ReadonlySet<string> = new Set()): void {
  let at = 0;
  let skipping: string | null = null;
  let depth = 0;
  for (const m of xml.matchAll(TOKEN)) {
    if (!skipping && m.index > at) handler.text?.(decodeXml(xml.slice(at, m.index)));
    at = m.index + m[0].length;
    if (m[1] !== undefined) {
      if (!skipping) handler.text?.(m[1]);
      continue;
    }
    const name = m[3];
    if (!name) continue; // a comment, processing instruction or DOCTYPE
    const closing = m[2] === "/";
    const selfClosing = m[5] === "/";
    if (skipping) {
      if (name !== skipping) continue;
      if (closing) {
        if (--depth === 0) skipping = null;
      } else if (!selfClosing) depth++;
      continue;
    }
    if (!closing && skip.has(name)) {
      if (!selfClosing) {
        skipping = name;
        depth = 1;
      }
      continue;
    }
    if (closing) {
      handler.close?.(name);
    } else {
      handler.open?.(name, parseAttrs(m[4]));
      if (selfClosing) handler.close?.(name);
    }
  }
}
