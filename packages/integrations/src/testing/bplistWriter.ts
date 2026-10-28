// Test-only: a tiny binary plist (bplist00) writer, so fixtures can be built
// in code instead of checked in as opaque files.

import { PlistUid } from "../parchment/bplist.js";
import { APPLE_REFERENCE_EPOCH_MS } from "../time.js";

/** Forces a float encoding (4 or 8 bytes) even for whole numbers. */
export class Real {
  readonly value: number;
  readonly bytes: 4 | 8;
  constructor(value: number, bytes: 4 | 8 = 8) {
    this.value = value;
    this.bytes = bytes;
  }
}

/** Forces an integer width, to exercise every size the reader supports. */
export class SizedInt {
  readonly value: number | bigint;
  readonly bytes: 1 | 2 | 4 | 8 | 16;
  constructor(value: number | bigint, bytes: 1 | 2 | 4 | 8 | 16) {
    this.value = value;
    this.bytes = bytes;
  }
}

/** A plist set (marker 0xC). */
export class PlistSet {
  readonly items: Writable[];
  constructor(items: Writable[]) {
    this.items = items;
  }
}

export type Writable =
  | null
  | boolean
  | number
  | bigint
  | string
  | Date
  | Uint8Array
  | PlistUid
  | Real
  | SizedInt
  | PlistSet
  | Writable[]
  | { [key: string]: Writable };

class ByteWriter {
  private chunks: number[] = [];
  get length() {
    return this.chunks.length;
  }
  byte(b: number) {
    this.chunks.push(b & 0xff);
  }
  bytes(bs: ArrayLike<number>) {
    for (let i = 0; i < bs.length; i++) this.byte(bs[i] as number);
  }
  uint(value: number | bigint, size: number) {
    let v = BigInt(value);
    const out: number[] = [];
    for (let i = 0; i < size; i++) {
      out.unshift(Number(v & 0xffn));
      v >>= 8n;
    }
    this.bytes(out);
  }
  toUint8Array() {
    return Uint8Array.from(this.chunks);
  }
}

const sizeFor = (n: number) => (n < 0x100 ? 1 : n < 0x10000 ? 2 : n < 0x100000000 ? 4 : 8);

function intBytes(value: number | bigint): 1 | 2 | 4 | 8 | 16 {
  const v = BigInt(value);
  if (v < 0n) return 8;
  if (v < 0x100n) return 1;
  if (v < 0x10000n) return 2;
  if (v < 0x100000000n) return 4;
  if (v < 0x8000000000000000n) return 8;
  return 16;
}

export function writeBplist(root: Writable): Uint8Array {
  const objects: Writable[] = [];
  // Children are encoded as refs, so number every value first (no dedup, which keeps it simple).
  const collect = (value: Writable): number => objects.push(value) - 1;
  const childRefs = new Map<number, number[]>();
  const walk = (value: Writable): number => {
    const i = collect(value);
    if (Array.isArray(value)) childRefs.set(i, value.map(walk));
    else if (value instanceof PlistSet) childRefs.set(i, value.items.map(walk));
    else if (isPlainObject(value)) {
      const keys = Object.keys(value);
      const keyRefs = keys.map((k) => walk(k));
      const valueRefs = keys.map((k) => walk(value[k] as Writable));
      childRefs.set(i, [...keyRefs, ...valueRefs]);
    }
    return i;
  };
  walk(root);

  const refSize = sizeFor(objects.length);
  const out = new ByteWriter();
  out.bytes([..."bplist00"].map((c) => c.charCodeAt(0)));
  const offsets: number[] = [];

  const header = (kind: number, length: number) => {
    if (length < 15) out.byte((kind << 4) | length);
    else {
      out.byte((kind << 4) | 0x0f);
      const size = intBytes(length);
      out.byte(0x10 | Math.log2(size));
      out.uint(length, size);
    }
  };

  objects.forEach((value, i) => {
    offsets.push(out.length);
    if (value === null) out.byte(0x00);
    else if (value === false) out.byte(0x08);
    else if (value === true) out.byte(0x09);
    else if (value instanceof SizedInt || typeof value === "bigint" || (typeof value === "number" && Number.isInteger(value))) {
      const v = value instanceof SizedInt ? value.value : value;
      const size = value instanceof SizedInt ? value.bytes : intBytes(v);
      out.byte(0x10 | Math.log2(size));
      const big = BigInt(v);
      out.uint(big < 0n ? BigInt.asUintN(size * 8, big) : big, size);
    } else if (value instanceof Real || typeof value === "number") {
      const v = value instanceof Real ? value.value : value;
      const size = value instanceof Real ? value.bytes : 8;
      const buf = new DataView(new ArrayBuffer(size));
      if (size === 4) buf.setFloat32(0, v);
      else buf.setFloat64(0, v);
      out.byte(0x20 | Math.log2(size));
      out.bytes(new Uint8Array(buf.buffer));
    } else if (value instanceof Date) {
      const buf = new DataView(new ArrayBuffer(8));
      buf.setFloat64(0, (value.getTime() - APPLE_REFERENCE_EPOCH_MS) / 1000);
      out.byte(0x33);
      out.bytes(new Uint8Array(buf.buffer));
    } else if (value instanceof Uint8Array) {
      header(0x4, value.length);
      out.bytes(value);
    } else if (typeof value === "string") {
      if (/^[\x00-\x7f]*$/.test(value)) {
        header(0x5, value.length);
        out.bytes([...value].map((c) => c.charCodeAt(0)));
      } else {
        header(0x6, value.length);
        for (let k = 0; k < value.length; k++) out.uint(value.charCodeAt(k), 2);
      }
    } else if (value instanceof PlistUid) {
      const size = sizeFor(value.value);
      out.byte(0x80 | (size - 1));
      out.uint(value.value, size);
    } else {
      const refs = childRefs.get(i) ?? [];
      const kind = Array.isArray(value) ? 0xa : value instanceof PlistSet ? 0xc : 0xd;
      header(kind, kind === 0xd ? refs.length / 2 : refs.length);
      for (const r of refs) out.uint(r, refSize);
    }
  });

  const tableOffset = out.length;
  const offsetSize = sizeFor(tableOffset);
  for (const o of offsets) out.uint(o, offsetSize);
  out.bytes([0, 0, 0, 0, 0, 0, offsetSize, refSize]);
  out.uint(objects.length, 8);
  out.uint(0, 8);
  out.uint(tableOffset, 8);
  return out.toUint8Array();
}

function isPlainObject(value: Writable): value is { [key: string]: Writable } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof Uint8Array) &&
    !(value instanceof PlistUid) &&
    !(value instanceof Real) &&
    !(value instanceof SizedInt) &&
    !(value instanceof PlistSet)
  );
}
