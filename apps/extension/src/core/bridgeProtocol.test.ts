import { describe, expect, it } from "vitest";
import { LOOKOUT_SOURCE, WEB_SOURCE } from "@ship/shared-types";
import { MAX_CARDS } from "./constants.js";
import { parseVoyageState, parseWebMessage, sanitizeCards } from "./bridgeProtocol.js";

const voyage = {
  phase: "sailing",
  guarding: true,
  endsAt: 1_800_000_000_000,
  objective: "  Finish the discussion  ",
  assignment: { title: "Enzyme lab", course: "BIO 201" },
  updatedAt: 1_799_999_000_000,
};

describe("parseWebMessage", () => {
  it("accepts each well-formed message", () => {
    expect(parseWebMessage({ source: WEB_SOURCE, t: "hello", version: 1 })).toEqual({ source: WEB_SOURCE, t: "hello", version: 1 });
    expect(parseWebMessage({ source: WEB_SOURCE, t: "voyage", voyage })).toMatchObject({ t: "voyage", voyage: { objective: "Finish the discussion" } });
    expect(parseWebMessage({ source: WEB_SOURCE, t: "cards", cards: [{ id: "a", front: "Q", back: "A" }] })).toEqual({
      source: WEB_SOURCE,
      t: "cards",
      cards: [{ id: "a", front: "Q", back: "A" }],
    });
    expect(parseWebMessage({ source: WEB_SOURCE, t: "claim-rewards" })).toEqual({ source: WEB_SOURCE, t: "claim-rewards" });
    expect(parseWebMessage({ source: WEB_SOURCE, t: "ack-rewards", ids: ["a", 7, "b"] })).toEqual({ source: WEB_SOURCE, t: "ack-rewards", ids: ["a", "b"] });
  });

  it.each([
    ["no source", { t: "hello", version: 1 }],
    ["a foreign source", { source: "some-other-extension", t: "claim-rewards" }],
    ["our own replies", { source: LOOKOUT_SOURCE, t: "hello", version: 1, stats: {} }],
    ["an unknown type", { source: WEB_SOURCE, t: "pay-me", amount: 1e9 }],
    ["hello without a version", { source: WEB_SOURCE, t: "hello" }],
    ["a voyage that isn't an object", { source: WEB_SOURCE, t: "voyage", voyage: "sailing" }],
    ["cards that aren't a list", { source: WEB_SOURCE, t: "cards", cards: { id: "a" } }],
    ["ack without ids", { source: WEB_SOURCE, t: "ack-rewards", ids: "a,b" }],
    ["a string", "ship-web"],
    ["null", null],
    ["a list", [WEB_SOURCE]],
  ])("ignores %s", (_label, data) => {
    expect(parseWebMessage(data)).toBeNull();
  });
});

describe("parseVoyageState", () => {
  it.each([
    ["an unknown phase", { phase: "flying" }],
    ["guarding as a string", { guarding: "true" }],
    ["a non-numeric endsAt", { endsAt: "soon" }],
    ["an infinite updatedAt", { updatedAt: Infinity }],
    ["a numeric objective", { objective: 42 }],
    ["an assignment that isn't an object", { assignment: "Enzyme lab" }],
  ])("refuses %s", (_label, patch) => {
    expect(parseVoyageState({ ...voyage, ...patch })).toBeNull();
  });

  it("allows nulls and drops an assignment with no title", () => {
    expect(parseVoyageState({ ...voyage, endsAt: null, objective: null, assignment: { title: "  ", course: null } })).toMatchObject({
      endsAt: null,
      objective: null,
      assignment: null,
    });
  });

  it("caps long strings", () => {
    expect(parseVoyageState({ ...voyage, objective: "x".repeat(5000) })?.objective).toHaveLength(300);
  });
});

describe("sanitizeCards", () => {
  it("keeps complete cards, trimmed, first copy of each id", () => {
    expect(
      sanitizeCards([
        { id: "a", front: " Q1 ", back: " A1 " },
        { id: "a", front: "dupe", back: "dupe" },
        { id: "b", front: "Q2", back: "" },
        { id: "c", front: "", back: "A3" },
        { id: 4, front: "Q4", back: "A4" },
        "junk",
        null,
        { id: "d", front: "Q5", back: "A5", extra: "<script>" },
      ]),
    ).toEqual([
      { id: "a", front: "Q1", back: "A1" },
      { id: "d", front: "Q5", back: "A5" },
    ]);
  });

  it("keeps at most MAX_CARDS", () => {
    const many = Array.from({ length: MAX_CARDS + 10 }, (_, i) => ({ id: `c${i}`, front: "Q", back: "A" }));
    expect(sanitizeCards(many)).toHaveLength(MAX_CARDS);
  });
});
