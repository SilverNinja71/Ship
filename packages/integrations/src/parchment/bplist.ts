// A small binary property list ("bplist00") reader built on DataView, so it
// runs in the browser (no Node Buffer). Format: an 8-byte header, the
// objects, an offset table, and a 32-byte trailer that says where the table
// is and which object is the root.

import { APPLE_REFERENCE_EPOCH_MS } from "../time.js";

/** An NSKeyedArchiver object reference. */
export class PlistUid {
  readonly value: number;
  constructor(value: number) {
    this.value = value;
  }
}

export type PlistValue =
  | null
  | boolean
  | number
  /** Only for integers outside Number's safe range. */
  | bigint
  | string
  | Date
  | Uint8Array
  | PlistUid
  | PlistValue[]
  | PlistDict;

export interface PlistDict {
  [key: string]: PlistValue;
}

export class BplistError extends Error {
  constructor(message: string) {
    super(`Binary plist: ${message}`);
    this.name = "BplistError";
  }
}

export interface BplistOptions {
  /** Deepest nesting allowed (guards against hostile files). */
  maxDepth?: number;
}

const MAGIC = "bplist00";
const TRAILER_SIZE = 32;

export function isBplist(bytes: Uint8Array): boolean {
  if (bytes.length < MAGIC.length) return false;
  for (let i = 0; i < MAGIC.length; i++) if (bytes[i] !== MAGIC.charCodeAt(i)) return false;
  return true;
}

/** Sets come back as arrays; dates as Date; data as Uint8Array. */
export function parseBplist(bytes: Uint8Array, options: BplistOptions = {}): PlistValue {
  const maxDepth = options.maxDepth ?? 256;
  if (bytes.length < MAGIC.length + TRAILER_SIZE + 1) throw new BplistError("file is too short.");
  if (!isBplist(bytes)) {
    const head = String.fromCharCode(...bytes.subarray(0, 6));
    throw new BplistError(head === "bplist" ? "only version 00 is supported." : "missing the bplist00 header.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const t = bytes.length - TRAILER_SIZE;
  const offsetSize = view.getUint8(t + 6);
  const refSize = view.getUint8(t + 7);
  const numObjects = readUint(view, t + 8, 8, "object count");
  const topObject = readUint(view, t + 16, 8, "root object");
  const tableOffset = readUint(view, t + 24, 8, "offset table position");

  if (offsetSize < 1 || offsetSize > 8 || refSize < 1 || refSize > 8) {
    throw new BplistError(`bad trailer sizes (offset ${offsetSize}, ref ${refSize}).`);
  }
  if (numObjects < 1 || topObject >= numObjects) throw new BplistError("the root object is out of range.");
  if (tableOffset < MAGIC.length || tableOffset + numObjects * offsetSize > t) {
    throw new BplistError("the offset table is out of bounds.");
  }

  const objectsEnd = tableOffset;
  const done = new Map<number, PlistValue>();
  const inProgress = new Set<number>();

  const need = (offset: number, length: number, what: string) => {
    if (offset < MAGIC.length || length < 0 || offset + length > objectsEnd) {
      throw new BplistError(`${what} runs past the end of the object area.`);
    }
  };

  const offsetOf = (ref: number): number => {
    if (ref >= numObjects) throw new BplistError(`object reference ${ref} is out of range.`);
    const offset = readUint(view, tableOffset + ref * offsetSize, offsetSize, "object offset");
    if (offset < MAGIC.length || offset >= objectsEnd) throw new BplistError(`object ${ref} has a bad offset.`);
    return offset;
  };

  /** Returns [length, offset of the payload]. Lengths ≥ 15 are stored as a following int object. */
  const lengthAt = (offset: number, marker: number): [number, number] => {
    const low = marker & 0x0f;
    if (low !== 0x0f) return [low, offset + 1];
    need(offset + 1, 1, "a length");
    const intMarker = view.getUint8(offset + 1);
    if (intMarker >> 4 !== 0x1) throw new BplistError("a long length isn't stored as an integer.");
    const size = 1 << (intMarker & 0x0f);
    if (size > 8) throw new BplistError("a length is too large.");
    need(offset + 2, size, "a length");
    return [readUint(view, offset + 2, size, "length"), offset + 2 + size];
  };

  const refs = (start: number, count: number): number[] => {
    need(start, count * refSize, "a container");
    const out: number[] = [];
    for (let i = 0; i < count; i++) out.push(readUint(view, start + i * refSize, refSize, "object reference"));
    return out;
  };

  const parse = (ref: number, depth: number): PlistValue => {
    const cached = done.get(ref);
    if (cached !== undefined) return cached;
    if (inProgress.has(ref)) throw new BplistError(`object ${ref} contains itself (a cycle).`);
    if (depth > maxDepth) throw new BplistError(`nesting is deeper than ${maxDepth}.`);
    const offset = offsetOf(ref);
    const marker = view.getUint8(offset);
    const kind = marker >> 4;
    const low = marker & 0x0f;
    let value: PlistValue;

    switch (kind) {
      case 0x0:
        if (marker === 0x00) value = null;
        else if (marker === 0x08) value = false;
        else if (marker === 0x09) value = true;
        else throw new BplistError(`unknown marker 0x${hex(marker)}.`);
        break;
      case 0x1: {
        const size = 1 << low;
        need(offset + 1, size, "an integer");
        value = readInt(view, offset + 1, size);
        break;
      }
      case 0x2: {
        const size = 1 << low;
        need(offset + 1, size, "a real number");
        if (size === 4) value = view.getFloat32(offset + 1);
        else if (size === 8) value = view.getFloat64(offset + 1);
        else throw new BplistError(`unsupported real size ${size}.`);
        break;
      }
      case 0x3:
        if (marker !== 0x33) throw new BplistError(`unknown marker 0x${hex(marker)}.`);
        need(offset + 1, 8, "a date");
        value = new Date(APPLE_REFERENCE_EPOCH_MS + view.getFloat64(offset + 1) * 1000);
        break;
      case 0x4: {
        const [length, start] = lengthAt(offset, marker);
        need(start, length, "data");
        value = bytes.slice(start, start + length);
        break;
      }
      case 0x5: {
        const [length, start] = lengthAt(offset, marker);
        need(start, length, "a string");
        let s = "";
        for (let i = 0; i < length; i++) s += String.fromCharCode(view.getUint8(start + i));
        value = s;
        break;
      }
      case 0x6: {
        const [units, start] = lengthAt(offset, marker);
        need(start, units * 2, "a string");
        const codes: number[] = [];
        for (let i = 0; i < units; i++) codes.push(view.getUint16(start + i * 2));
        let s = "";
        for (let i = 0; i < codes.length; i += 4096) s += String.fromCharCode(...codes.slice(i, i + 4096));
        value = s;
        break;
      }
      case 0x8: {
        const size = low + 1;
        need(offset + 1, size, "a UID");
        value = new PlistUid(readUint(view, offset + 1, size, "UID"));
        break;
      }
      case 0xa:
      case 0xc: {
        const [count, start] = lengthAt(offset, marker);
        const children = refs(start, count);
        inProgress.add(ref);
        value = children.map((child) => parse(child, depth + 1));
        inProgress.delete(ref);
        break;
      }
      case 0xd: {
        const [count, start] = lengthAt(offset, marker);
        const keyRefs = refs(start, count);
        const valueRefs = refs(start + count * refSize, count);
        inProgress.add(ref);
        const dict: PlistDict = {};
        for (let i = 0; i < count; i++) {
          const key = parse(keyRefs[i] as number, depth + 1);
          if (typeof key !== "string") throw new BplistError("a dictionary key isn't a string.");
          const v = parse(valueRefs[i] as number, depth + 1);
          // defineProperty so a "__proto__" key stays a plain key.
          Object.defineProperty(dict, key, { value: v, enumerable: true, writable: true, configurable: true });
        }
        inProgress.delete(ref);
        value = dict;
        break;
      }
      default:
        throw new BplistError(`unknown marker 0x${hex(marker)}.`);
    }
    done.set(ref, value);
    return value;
  };

  return parse(topObject, 0);
}

const hex = (n: number) => n.toString(16).padStart(2, "0");

/** Unsigned big-endian integer of 1..8 bytes that must fit in a safe Number. */
function readUint(view: DataView, offset: number, size: number, what: string): number {
  if (offset < 0 || offset + size > view.byteLength) throw new BplistError(`${what} is out of bounds.`);
  let n = 0n;
  for (let i = 0; i < size; i++) n = (n << 8n) | BigInt(view.getUint8(offset + i));
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new BplistError(`${what} is too large.`);
  return Number(n);
}

/** 1, 2 and 4-byte ints are unsigned, 8-byte ones signed, 16-byte ones unsigned 128-bit. */
function readInt(view: DataView, offset: number, size: number): number | bigint {
  let big: bigint;
  if (size === 1) return view.getUint8(offset);
  if (size === 2) return view.getUint16(offset);
  if (size === 4) return view.getUint32(offset);
  if (size === 8) big = view.getBigInt64(offset);
  else if (size === 16) big = (view.getBigUint64(offset) << 64n) | view.getBigUint64(offset + 8);
  else throw new BplistError(`unsupported integer size ${size}.`);
  return big >= BigInt(Number.MIN_SAFE_INTEGER) && big <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(big) : big;
}
