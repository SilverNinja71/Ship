import { describe, expect, it } from "vitest";
import { CARDS_ICON, SIREN_SVG, SPYGLASS_ICON, WHEEL_ICON } from "./art.js";
import { parseSvgMarkup } from "./svg.js";

describe("parseSvgMarkup", () => {
  it("builds a tree of tags and attributes", () => {
    const svg = parseSvgMarkup(
      '<svg viewBox="0 0 10 10"><g fill="#fff"><circle cx="1" cy="2" r="3"/><path d="M0 0 L1 1"/></g><rect width="1" height="2"/></svg>',
    );
    expect(svg).toEqual({
      tag: "svg",
      attrs: { viewBox: "0 0 10 10" },
      children: [
        {
          tag: "g",
          attrs: { fill: "#fff" },
          children: [
            { tag: "circle", attrs: { cx: "1", cy: "2", r: "3" }, children: [] },
            { tag: "path", attrs: { d: "M0 0 L1 1" }, children: [] },
          ],
        },
        { tag: "rect", attrs: { width: "1", height: "2" }, children: [] },
      ],
    });
  });

  it("parses every piece of the gate's art", () => {
    for (const markup of [SIREN_SVG, CARDS_ICON, WHEEL_ICON, SPYGLASS_ICON]) {
      const svg = parseSvgMarkup(markup);
      expect(svg.tag).toBe("svg");
      expect(svg.children.length).toBeGreaterThan(0);
    }
    const count = (n: { children: unknown[] }): number => 1 + (n.children as { children: unknown[] }[]).reduce((a, c) => a + count(c), 0);
    expect(count(parseSvgMarkup(SIREN_SVG))).toBe((SIREN_SVG.match(/<[a-zA-Z]/g) ?? []).length);
  });

  it("refuses markup that isn't an svg", () => {
    expect(() => parseSvgMarkup("<div></div>")).toThrow();
  });
});
