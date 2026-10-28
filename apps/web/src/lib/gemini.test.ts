import { describe, expect, it } from "vitest";
import type { FetchLike } from "@ship/shared-types";
import { DEFAULT_GEMINI_MODEL } from "@ship/integrations";
import { useSettings } from "../stores/settingsStore.js";
import { makeBackup, restoreBackup } from "./backup.js";
import { gradeLogEntry } from "./blurtGrading.js";

/** A Map-backed stand-in for localStorage. */
function memoryStorage(entries: Record<string, unknown> = {}): Storage {
  const map = new Map(Object.entries(entries).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
  };
}

const settings = (state: Record<string, unknown>) => ({ state, version: 1 });

describe("settings", () => {
  it("start with no Gemini key and the default model", () => {
    expect(useSettings.getState()).toMatchObject({ geminiApiKey: "", geminiModel: DEFAULT_GEMINI_MODEL });
  });
});

describe("backups", () => {
  it("leave the Gemini key out", () => {
    const storage = memoryStorage({
      "ship:settings": settings({ soundOn: true, geminiApiKey: "AIza-secret", geminiModel: "gemini-x" }),
      "ship:economy": { state: { doubloons: 12 }, version: 1 },
      "other-app": { hello: true },
    });
    const backup = makeBackup(storage, new Date("2026-10-28T12:00:00Z"));
    expect(backup).toEqual({
      app: "ship",
      exportedAt: "2026-10-28T12:00:00.000Z",
      data: {
        "ship:settings": settings({ soundOn: true, geminiModel: "gemini-x" }),
        "ship:economy": { state: { doubloons: 12 }, version: 1 },
      },
    });
    expect(JSON.stringify(backup)).not.toContain("AIza-secret");
  });

  it("keep this browser's key when restoring", () => {
    const storage = memoryStorage({ "ship:settings": settings({ soundOn: false, geminiApiKey: "mine" }) });
    const backup = { app: "ship", data: { "ship:settings": settings({ soundOn: true }), "ship:recall": { state: { cards: [] }, version: 1 }, evil: 1 } };
    expect(restoreBackup(storage, backup)).toBe(2);
    expect(JSON.parse(storage.getItem("ship:settings")!)).toEqual(settings({ soundOn: true, geminiApiKey: "mine" }));
    expect(storage.getItem("evil")).toBeNull();
  });

  it("refuse files that aren't Ship backups", () => {
    expect(() => restoreBackup(memoryStorage(), { app: "other", data: {} })).toThrow("not a Ship backup");
    expect(() => restoreBackup(memoryStorage(), null)).toThrow("not a Ship backup");
  });
});

describe("gradeLogEntry", () => {
  const notes = "Mitochondria: the organelle where cellular respiration makes ATP. Oxygen is the final electron acceptor.";
  const blurt = "The powerhouse of the cell makes ATP. Nitrogen accepts the electrons.";
  const geminiReply = (json: unknown): FetchLike => async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }] }),
    text: async () => "",
  });
  const noNetwork: FetchLike = async () => {
    throw new TypeError("Failed to fetch");
  };

  it("grades offline without a key, and never touches the network", async () => {
    const graded = await gradeLogEntry(blurt, notes, { geminiApiKey: "  ", geminiModel: DEFAULT_GEMINI_MODEL }, noNetwork);
    expect(graded.notice).toBeNull();
    expect(graded.result.gradedBy).toBe("heuristic");
  });

  it("uses Gemini with a key", async () => {
    const reply = { ideas: [{ id: "c1", status: "mastered", score: 1, evidence: "powerhouse of the cell", feedback: "" }], addedIdeas: [], misconceptions: [], summary: "Good start!" };
    const graded = await gradeLogEntry(blurt, notes, { geminiApiKey: "k", geminiModel: DEFAULT_GEMINI_MODEL }, geminiReply(reply));
    expect(graded).toMatchObject({ notice: null, result: { gradedBy: "gemini", summary: "Good start!" } });
  });

  it("falls back to the offline grade, saying why, when Gemini can't answer", async () => {
    const graded = await gradeLogEntry(blurt, notes, { geminiApiKey: "k", geminiModel: DEFAULT_GEMINI_MODEL }, noNetwork);
    expect(graded.result.gradedBy).toBe("heuristic");
    expect(graded.notice).toBe("Gemini couldn't grade this (Couldn't reach Gemini), so Ship graded it on this device.");
    const odd = await gradeLogEntry(blurt, notes, { geminiApiKey: "k", geminiModel: DEFAULT_GEMINI_MODEL }, geminiReply({ verdict: "PROCEED" }));
    expect(odd.notice).toContain("wasn't the JSON we asked for");
  });
});
