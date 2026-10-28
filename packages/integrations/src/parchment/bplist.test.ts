import { describe, expect, it } from "vitest";
import { BplistError, PlistUid, isBplist, parseBplist } from "./bplist.js";
import { PlistSet, Real, SizedInt, writeBplist } from "../testing/bplistWriter.js";

const roundTrip = (value: Parameters<typeof writeBplist>[0]) => parseBplist(writeBplist(value));

describe("parseBplist", () => {
  it("reads null and booleans", () => {
    expect(roundTrip([null, true, false])).toEqual([null, true, false]);
  });

  it("reads integers of every width", () => {
    expect(roundTrip(new SizedInt(200, 1))).toBe(200);
    expect(roundTrip(new SizedInt(65_000, 2))).toBe(65_000);
    expect(roundTrip(new SizedInt(4_000_000_000, 4))).toBe(4_000_000_000);
    expect(roundTrip(new SizedInt(2 ** 40 + 7, 8))).toBe(2 ** 40 + 7);
    expect(roundTrip(new SizedInt(5, 8))).toBe(5);
  });

  it("reads 8-byte ints as signed", () => {
    expect(roundTrip(-1)).toBe(-1);
    expect(roundTrip(-123_456_789_012)).toBe(-123_456_789_012);
  });

  it("keeps integers beyond the safe range as bigint", () => {
    expect(roundTrip(2n ** 62n)).toBe(2n ** 62n);
    expect(roundTrip(-(2n ** 60n))).toBe(-(2n ** 60n));
    expect(roundTrip(new SizedInt(2n ** 64n - 1n, 16))).toBe(2n ** 64n - 1n);
    expect(roundTrip(new SizedInt(12, 16))).toBe(12);
  });

  it("reads 4 and 8-byte reals", () => {
    expect(roundTrip(new Real(1.5, 4))).toBe(1.5);
    expect(roundTrip(Math.PI)).toBe(Math.PI);
    expect(roundTrip(new Real(3))).toBe(3);
  });

  it("reads dates relative to 2001-01-01", () => {
    const value = roundTrip(new Date(Date.UTC(2026, 9, 27, 12, 30)));
    expect(value).toBeInstanceOf(Date);
    expect((value as Date).toISOString()).toBe("2026-10-27T12:30:00.000Z");
    expect((roundTrip(new Date(Date.UTC(2001, 0, 1))) as Date).getTime()).toBe(Date.UTC(2001, 0, 1));
  });

  it("reads data as a copy", () => {
    const value = roundTrip(new Uint8Array([1, 2, 3, 255]));
    expect(value).toBeInstanceOf(Uint8Array);
    expect([...(value as Uint8Array)]).toEqual([1, 2, 3, 255]);
  });

  it("reads ASCII and UTF-16 strings, including surrogate pairs", () => {
    expect(roundTrip("plain ascii")).toBe("plain ascii");
    expect(roundTrip("café ☕ 🧪 Ωmega")).toBe("café ☕ 🧪 Ωmega");
    expect(roundTrip("")).toBe("");
  });

  it("reads long strings, data and arrays whose length needs an extra int", () => {
    const long = "x".repeat(300);
    const unicode = "é".repeat(70_000);
    expect(roundTrip(long)).toBe(long);
    expect(roundTrip(unicode)).toBe(unicode);
    const data = new Uint8Array(1000).fill(7);
    expect((roundTrip(data) as Uint8Array).length).toBe(1000);
    const list = Array.from({ length: 40 }, (_, i) => i);
    expect(roundTrip(list)).toEqual(list);
  });

  it("reads UIDs, sets, and nested dicts and arrays", () => {
    const value = roundTrip({
      uid: new PlistUid(300),
      set: new PlistSet(["a", "b"]),
      nested: { list: [1, { deep: ["x", null] }], empty: {} },
    });
    expect(value).toEqual({
      uid: new PlistUid(300),
      set: ["a", "b"],
      nested: { list: [1, { deep: ["x", null] }], empty: {} },
    });
    expect((value as { uid: PlistUid }).uid.value).toBe(300);
  });

  it("keeps a __proto__ key as a plain key", () => {
    const value = parseBplist(writeBplist(JSON.parse('{"__proto__": {"polluted": true}}') as Record<string, never>));
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(Object.keys(value as object)).toEqual(["__proto__"]);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("uses 2-byte object refs when there are many objects", () => {
    const list = Array.from({ length: 400 }, (_, i) => `item ${i}`);
    expect(roundTrip(list)).toEqual(list);
  });
});

describe("parseBplist on bad input", () => {
  const good = writeBplist({ a: [1, 2, 3] });

  it("detects the header", () => {
    expect(isBplist(good)).toBe(true);
    expect(isBplist(new TextEncoder().encode("{}"))).toBe(false);
  });

  it("rejects short or headerless files", () => {
    expect(() => parseBplist(new Uint8Array(4))).toThrow(BplistError);
    const noHeader = good.slice();
    noHeader[0] = 0x41;
    expect(() => parseBplist(noHeader)).toThrow(/header/);
    const v01 = good.slice();
    v01[7] = 0x31;
    expect(() => parseBplist(v01)).toThrow(/version 00/);
  });

  it("rejects a truncated file", () => {
    expect(() => parseBplist(good.slice(0, good.length - 5))).toThrow(BplistError);
  });

  it("rejects an offset table that points outside the file", () => {
    const bad = good.slice();
    const view = new DataView(bad.buffer);
    view.setBigUint64(bad.length - 8, BigInt(bad.length + 100));
    expect(() => parseBplist(bad)).toThrow(/offset table/);
  });

  it("rejects a root object out of range", () => {
    const bad = good.slice();
    new DataView(bad.buffer).setBigUint64(bad.length - 16, 999n);
    expect(() => parseBplist(bad)).toThrow(/root object/);
  });

  it("rejects bad trailer sizes", () => {
    const bad = good.slice();
    bad[bad.length - 26] = 0;
    expect(() => parseBplist(bad)).toThrow(/trailer/);
  });

  it("rejects an object whose length runs past the end", () => {
    // A string claiming 14 chars but the object area ends right after its marker.
    const bytes = writeBplist("abc");
    const bad = bytes.slice();
    bad[8] = 0x5e;
    expect(() => parseBplist(bad)).toThrow(/past the end/);
  });

  it("rejects unknown markers", () => {
    const bad = writeBplist([1]).slice();
    bad[8] = 0x70;
    expect(() => parseBplist(bad)).toThrow(/unknown marker/);
  });

  it("rejects cycles", () => {
    // An array whose only element is itself: patch the child ref from 1 to 0.
    const bytes = writeBplist([7]).slice();
    expect(bytes[8]).toBe(0xa1);
    bytes[9] = 0;
    expect(() => parseBplist(bytes)).toThrow(/cycle/);
  });

  it("rejects non-string dict keys", () => {
    const bytes = writeBplist({ k: "v" }).slice();
    // Object 1 is the key "k" (0x51 'k'); turn it into an int.
    const keyAt = bytes.indexOf(0x51);
    bytes[keyAt] = 0x10;
    expect(() => parseBplist(bytes)).toThrow(/key/);
  });

  it("enforces the depth limit", () => {
    let deep: Parameters<typeof writeBplist>[0] = "bottom";
    for (let i = 0; i < 20; i++) deep = [deep];
    expect(() => parseBplist(writeBplist(deep), { maxDepth: 10 })).toThrow(/deeper/);
    expect(() => parseBplist(writeBplist(deep), { maxDepth: 50 })).not.toThrow();
  });
});
