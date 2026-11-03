import { describe, expect, it } from "vitest";
import { needsCrewServerAddress, pointsAtThisComputer } from "./hosting.js";

describe("hosting", () => {
  it.each(["http://localhost:8787", "localhost:8787", " http://127.0.0.1:8787/ ", "http://[::1]:8787", "ws://localhost:8787"])("treats %s as this computer", (address) => {
    expect(pointsAtThisComputer(address)).toBe(true);
  });

  it.each(["https://crew.example.com", "crew.example.com:8787", "http://192.168.1.20:8787", "", "http://"])("doesn't treat %j as this computer", (address) => {
    expect(pointsAtThisComputer(address)).toBe(false);
  });

  it("asks for a crew server only on the website, and only while the address is this computer", () => {
    expect(needsCrewServerAddress("http://localhost:8787", true)).toBe(true);
    expect(needsCrewServerAddress("https://crew.example.com", true)).toBe(false);
    expect(needsCrewServerAddress("http://localhost:8787", false)).toBe(false);
  });
});
