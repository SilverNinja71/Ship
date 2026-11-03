// Word and PowerPoint files are zip archives of XML.

import { strFromU8, unzipSync } from "fflate";
import { scanXml } from "./xml.js";

export type ReadPart = (path: string) => string | null;

/** Opens the archive, leaving pictures and other media compressed since only the text is read. */
export function openOfficeFile(bytes: Uint8Array, kind: "Word" | "PowerPoint"): ReadPart {
  const isOldFormat = bytes[0] === 0xd0 && bytes[1] === 0xcf;
  if (isOldFormat) throw new Error(`It's password-protected, or saved in an older format. Open it in ${kind}, remove any password and save it again.`);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (file) => /\.(xml|rels)$/i.test(file.name) });
  } catch {
    throw new Error(`It isn't a valid ${kind} file.`);
  }
  return (path) => {
    const part = files[path];
    return part ? strFromU8(part) : null;
  };
}

export interface Relationship {
  id: string;
  type: string;
  /** The full path inside the archive. */
  path: string;
}

/** The relationships of one part, such as a slide's speaker notes. */
export function relationshipsOf(read: ReadPart, partPath: string): Relationship[] {
  const slash = partPath.lastIndexOf("/");
  const dir = partPath.slice(0, slash + 1);
  const xml = read(`${dir}_rels/${partPath.slice(slash + 1)}.rels`);
  const found: Relationship[] = [];
  if (!xml) return found;
  scanXml(xml, {
    open(name, attrs) {
      if (name !== "Relationship" || attrs.TargetMode === "External") return;
      found.push({ id: attrs.Id ?? "", type: attrs.Type ?? "", path: resolvePath(dir, attrs.Target ?? "") });
    },
  });
  return found;
}

function resolvePath(dir: string, target: string): string {
  const parts = target.startsWith("/") ? [] : dir.split("/").filter(Boolean);
  for (const piece of target.split("/")) {
    if (piece === "..") parts.pop();
    else if (piece && piece !== ".") parts.push(piece);
  }
  return parts.join("/");
}
