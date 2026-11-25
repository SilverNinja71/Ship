import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NICK_NUMBER_SKIP, ROOM_ACCESSORIES, ROOM_CHEERS, ROOM_CODE_ALPHABET, ROOM_COSTUMES, ROOM_GAME_ENGINE, ROOM_LIMITS, ROOM_REPORT_REASONS, STICKER_IDS } from "@ship/shared-types";

// The drift guard. firestore.rules can't import ROOM_LIMITS, so its numbers are copied by hand;
// these tests read the rules file and fail when a number in it no longer matches the app's.
const rules = readFileSync(new URL("../../../../firestore.rules", import.meta.url), "utf8");

const L = ROOM_LIMITS;
const range = (field: string, r: { min: number; max: number }) => `${field} >= ${r.min} && ${field} <= ${r.max}`;

/** Every limit the database enforces, by its path in ROOM_LIMITS, with the rules text that enforces it. */
const IN_RULES: Record<string, string[]> = {
  size: [`n.m.size() <= ${L.size}`, `n.game.seats.size() <= ${L.size}`],
  codeLength: [`roomId.matches('[A-HJ-NP-Z2-9]{${L.codeLength}}')`, `docId.matches('[A-HJ-NP-Z2-9]{${L.codeLength}}')`],
  writeGapSeconds: [`o.seen + duration.value(${L.writeGapSeconds}, 's')`],
  staleMinutes: [`!staleAt(o.m[o.host].seen, ${L.staleMinutes})`, `staleAt(o.m[gone].seen, ${L.staleMinutes})`, `staleAt(d.m[d.host].seen, ${L.staleMinutes})`],
  hatMinutes: [`(!(o.host in o.m) || staleAt(o.m[o.host].seen, ${L.hatMinutes}))`],
  cardFreshMinutes: [`!staleAt(getAfter(cardAt(roomId)).data.alive, ${L.cardFreshMinutes})`],
  lifetimeHours: [`o.at + duration.value(${L.lifetimeHours}, 'h')`, `d.at + duration.value(${L.lifetimeHours}, 'h')`],
  createCooldownSeconds: [`stampTime('madeAt', ${L.createCooldownSeconds})`, `stampDue('madeAt', ${L.createCooldownSeconds})`],
  joinCooldownSeconds: [`stampTime('joinedAt', ${L.joinCooldownSeconds})`, `stampDue('joinedAt', ${L.joinCooldownSeconds})`],
  listPage: [`request.query.limit <= ${L.listPage}`],
  hideAtReports: [`n.strikes < ${L.hideAtReports}`, `o.strikes < ${L.hideAtReports}`],
  reportStakeMinutes: [`staleAt(o.m[k].in, ${L.reportStakeMinutes})`, `.in + duration.value(${L.reportStakeMinutes}, 'm')`],
  maxBans: [`n.ban.size() <= ${L.maxBans}`],
  maxReports: [`n.rep.size() <= ${L.maxReports}`],
  wordList: [`x.n[0] < ${L.wordList}`, `x.n[1] < ${L.wordList}`, `d.name[0] < ${L.wordList}`, `d.name[1] < ${L.wordList}`],
  subjects: [`d.subj < ${L.subjects}`],
  costumes: [`x.c < ${L.costumes}`],
  accessories: [`x.a < ${L.accessories}`],
  nickNumberMax: [`x.n[2] <= ${L.nickNumberMax}`],
  creditSlackSeconds: [`(request.time - o.cr).seconds() + ${L.creditSlackSeconds})`, `(request.time - o.m[gone].cr).seconds() + ${L.creditSlackSeconds})`],
  "deckCards.min": [range("n.deck.n", L.deckCards), range("request.resource.data.cards.size()", L.deckCards), `n.game.n >= ${L.deckCards.min}`],
  "deckCards.max": [range("n.deck.n", L.deckCards), range("request.resource.data.cards.size()", L.deckCards)],
  "sailFocus.min": [range("n.sail.f", L.sailFocus)],
  "sailFocus.max": [range("n.sail.f", L.sailFocus)],
  "sailBreak.min": [range("n.sail.b", L.sailBreak)],
  "sailBreak.max": [range("n.sail.b", L.sailBreak)],
  "sailCycles.min": [range("n.sail.c", L.sailCycles)],
  "sailCycles.max": [range("n.sail.c", L.sailCycles)],
  "bottle.takeoverSeconds": [`g.tAt + duration.value(${L.bottle.takeoverSeconds}, 's')`],
  "bottle.minTurnSeconds": [`g.tAt + duration.value(${L.bottle.minTurnSeconds}, 's')`],
  "bottle.maxTurns": [`h.turn <= ${L.bottle.maxTurns}`],
  "bottle.buoys": [`n.game.buoys == ${L.bottle.buoys}`],
  "bottle.goal.min": [range("n.game.goal", L.bottle.goal)],
  "bottle.goal.max": [range("n.game.goal", L.bottle.goal)],
  "tidy.maxMs": [`x.gt <= ${L.tidy.maxMs}`],
  // Cleared patches travel as bits in `g`.
  "tidy.maxPatches": [`x.g < ${2 ** L.tidy.maxPatches}`],
};

/** Limits only the app keeps (timers, rewards, layout): the database never sees them. */
const APP_ONLY = [
  "keepAliveMinutes",
  "awayMinutes",
  "sailOfferMinutes",
  "prepSeconds",
  "cheerShowSeconds",
  "rewardMinDmg",
  "dailyRewards.doubloons",
  "dailyRewards.xp",
  "bottle.turnSeconds",
  "tidy.pairsPerPatch",
  "tidy.timeLimitMs",
];

function leafPaths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => leafPaths(v, prefix ? `${prefix}.${k}` : k));
}

describe("firestore.rules holds every room limit the database enforces", () => {
  for (const [path, snippets] of Object.entries(IN_RULES)) {
    it(path, () => {
      for (const snippet of snippets) expect(rules, `${path}: ${snippet}`).toContain(snippet);
    });
  }

  it("every ROOM_LIMITS entry is either in the rules or marked app-only", () => {
    const paths = leafPaths(ROOM_LIMITS).sort();
    expect([...Object.keys(IN_RULES), ...APP_ONLY].sort()).toEqual(paths);
  });
});

describe("firestore.rules agrees with the room lists", () => {
  it("refuses the same nickname numbers", () => {
    expect(rules).toContain(`!(x.n[2] in [${NICK_NUMBER_SKIP.join(", ")}])`);
  });

  it("takes only games dealt by this version of the dealing", () => {
    expect(rules).toContain(`n.game.v == ${ROOM_GAME_ENGINE} &&`);
    expect(rules.match(/n\.game\.v ==/g)?.length).toBe(1);
  });

  it("allows one `say` per cheer and sticker", () => {
    expect(rules).toContain(`x.say >= -1 && x.say < ${ROOM_CHEERS.length + STICKER_IDS.length}`);
  });

  it("allows exactly the app's costumes and accessories", () => {
    expect(ROOM_COSTUMES.length).toBe(L.costumes);
    expect(ROOM_ACCESSORIES.length).toBe(L.accessories);
  });

  it("counts the same report reasons", () => {
    const quoted = ROOM_REPORT_REASONS.map((r) => `'${r}'`);
    expect(rules).toContain(`n.why.keys().hasOnly([${quoted.join(", ")}])`);
    expect(rules).toContain(`d.why == {${quoted.map((q) => `${q}: 0`).join(", ")}}`);
  });

  it("takes room codes made of exactly the app's alphabet, everywhere the rules check one", () => {
    // Every pattern in the rules but Bottle Bay's https check is a room code: the room's id, the
    // private note's id, and the two cooldown stamps that name a room.
    const patterns = [...rules.matchAll(/\.matches\('([^']+)'\)/g)].map((m) => m[1]!).filter((p) => !p.startsWith("https://"));
    expect(patterns.length).toBe(4);
    expect(new Set(patterns).size).toBe(1);
    // Firestore's matches() must match the whole string.
    const code = new RegExp(`^(?:${patterns[0]})$`);
    for (let i = 0; i < ROOM_CODE_ALPHABET.length; i += L.codeLength) {
      expect(code.test(ROOM_CODE_ALPHABET.slice(i, i + L.codeLength).padEnd(L.codeLength, "A"))).toBe(true);
    }
    const oneChar = new RegExp(`^(?:${patterns[0]!.replace(/\{\d+\}$/, "")})$`);
    const accepted = Array.from({ length: 0x7f - 0x20 }, (_, i) => String.fromCharCode(0x20 + i)).filter((c) => oneChar.test(c));
    expect(accepted.sort()).toEqual([...ROOM_CODE_ALPHABET].sort());
    expect(code.test("A".repeat(L.codeLength - 1))).toBe(false);
    expect(code.test("A".repeat(L.codeLength + 1))).toBe(false);
  });
});

describe("firestore.rules agrees with Bottle Bay's limits", () => {
  it("holds the same report cooldown and hides at the same report count", async () => {
    const { BOTTLE_LIMITS } = await import("@ship/shared-types");
    expect(rules).toContain(`request.time > resource.data.at + duration.value(${BOTTLE_LIMITS.reportCooldownSeconds}, 's')`);
    expect(rules).toContain(`request.time < resource.data.at + duration.value(${BOTTLE_LIMITS.reportCooldownSeconds}, 's')`);
    expect(rules).toContain(`request.resource.data.hidden == (request.resource.data.reports >= ${BOTTLE_LIMITS.hideAtReports})`);
  });
});
