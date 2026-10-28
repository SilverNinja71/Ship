import { describe, expect, it } from "vitest";
import {
  acceptedAnswers,
  annotateBlurt,
  annotateNotes,
  checkBlurt,
  extractConcepts,
  gradeBlurt,
  gradeTypedAnswer,
  levenshtein,
  normalize,
  stem,
  wordMatch,
} from "./index.js";

describe("text helpers", () => {
  it("normalizes case, accents, apostrophes and punctuation", () => {
    expect(normalize("  Café-au-lait! Don't & 1,000 cells; 3.14 ")).toBe("cafe au lait dont and 1000 cells 3.14");
  });

  it("stems lightly so word forms meet", () => {
    expect(["cells", "studies", "processes", "splitting", "making", "hoping", "hopping"].map(stem)).toEqual([
      "cell",
      "study",
      "process",
      "split",
      "make",
      "hope",
      "hop",
    ]);
  });

  it("forgives typos only on longer words, and never on numbers", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(wordMatch("mitochondria", "mitocondria")).toBeGreaterThan(0.9);
    expect(wordMatch("cell", "call")).toBe(0);
    expect(wordMatch("1945", "1944")).toBe(0);
  });
});

describe("gradeTypedAnswer", () => {
  it("accepts exact answers regardless of case and articles", () => {
    expect(gradeTypedAnswer("the Mitochondria", "mitochondria")).toMatchObject({ verdict: "correct", score: 1, suggestedRating: 4 });
  });

  it("suggests Easy only for a fast, exact answer", () => {
    expect(gradeTypedAnswer("Paris", "Paris", { responseMs: 2000 }).suggestedRating).toBe(5);
    expect(gradeTypedAnswer("Paris", "Paris", { responseMs: 20000 }).suggestedRating).toBe(4);
  });

  it("forgives a typo", () => {
    expect(gradeTypedAnswer("photosynthesus", "photosynthesis").verdict).toBe("correct");
  });

  it("accepts any listed alternative and ignores parenthetical asides", () => {
    expect(acceptedAnswers("automobile / car")).toEqual(["automobile / car", "automobile", "car"]);
    expect(gradeTypedAnswer("car", "automobile / car").verdict).toBe("correct");
    expect(gradeTypedAnswer("paris", "Paris (France)").verdict).toBe("correct");
  });

  it("marks a wrong number wrong even when the rest is close", () => {
    const g = gradeTypedAnswer("June 6, 1945", "June 6, 1944");
    expect(g.verdict).toBe("incorrect");
    expect(g.missing).toContain("1944");
  });

  it("notices a flipped negation", () => {
    expect(gradeTypedAnswer("not soluble in water", "soluble in water").verdict).toBe("incorrect");
  });

  it("gives partial credit to long answers with most key words", () => {
    const g = gradeTypedAnswer(
      "photosynthesis converts light energy to chemical energy",
      "Photosynthesis converts light energy into chemical energy stored in glucose",
    );
    expect(g.verdict).toBe("close");
    expect(g.suggestedRating).toBe(3);
    expect(g.missing).toEqual(["stored", "glucose"]);
  });

  it("rates blank and unrelated answers as Forgot", () => {
    expect(gradeTypedAnswer("", "mitochondria").suggestedRating).toBe(1);
    expect(gradeTypedAnswer("banana", "mitochondria").suggestedRating).toBe(1);
  });
});

const BIO = `# Cellular Respiration
Mitochondria: the powerhouse of the cell, where ATP is produced.
- Glycolysis happens in the cytoplasm and splits glucose into two pyruvate molecules.
- The Krebs cycle takes place in the mitochondrial matrix and releases carbon dioxide.
- The electron transport chain makes most of the ATP, using oxygen as the final electron acceptor.
`;

const HISTORY = `World War II
The war began in 1939 when Germany invaded Poland.
Pearl Harbor was attacked by Japan on December 7, 1941, bringing the United States into the war.
D-Day: the Allied invasion of Normandy on June 6, 1944.
`;

describe("extractConcepts", () => {
  it("finds headings, defined terms and key phrases, in note order", () => {
    const concepts = extractConcepts(BIO);
    const terms = concepts.map((c) => c.term);
    for (const t of ["cellular respiration", "mitochondria", "atp", "glycolysis", "cytoplasm", "krebs cycle", "electron transport chain", "carbon dioxide"]) {
      expect(terms).toContain(t);
    }
    expect(terms.indexOf("glycolysis")).toBeLessThan(terms.indexOf("krebs cycle"));
    expect(new Set(concepts.map((c) => c.id)).size).toBe(concepts.length);
  });

  it("weights defined terms as headline ideas and keeps stopwords and lone verbs out", () => {
    const concepts = extractConcepts(BIO);
    expect(concepts.find((c) => c.term === "mitochondria")?.weight).toBe(3);
    for (const c of concepts) {
      expect(c.weight).toBeGreaterThanOrEqual(1);
      expect(c.weight).toBeLessThanOrEqual(3);
      expect(c.term).not.toMatch(/\b(the|of|and|makes|takes|releases)\b/);
    }
  });

  it("keeps dates and hyphenated terms whole", () => {
    const concepts = extractConcepts(HISTORY);
    const displays = concepts.map((c) => c.display);
    expect(displays).toContain("D-Day");
    expect(displays).toContain("December 7, 1941");
    expect(displays).toContain("Pearl Harbor");
    expect(displays).not.toContain("attacked");
  });

  it("keeps the sentence each concept came from", () => {
    const krebs = extractConcepts(BIO).find((c) => c.term === "krebs cycle");
    expect(krebs?.sentence).toMatch(/^The Krebs cycle takes place/);
  });

  it("returns nothing for empty notes and respects maxConcepts", () => {
    expect(extractConcepts("   \n ")).toEqual([]);
    expect(extractConcepts(BIO, { maxConcepts: 4 })).toHaveLength(4);
  });
});

describe("gradeBlurt", () => {
  const blurt =
    "Glycolysis splits glucose in the cytoplasm. Then the krebs cycle happens in the mitocondria. The electron transport chain makes ATP. Photo synthesis uses chlorophyll.";
  const result = checkBlurt(blurt, BIO);
  const status = (term: string) => result.concepts.find((r) => r.concept.term === term)?.status;

  it("sorts concepts into mastered, partial and missed", () => {
    expect(status("glycolysis")).toBe("mastered");
    expect(status("krebs cycle")).toBe("mastered");
    expect(status("electron transport chain")).toBe("mastered");
    // "mitocondria" (typo) still counts for Mitochondria.
    expect(status("mitochondria")).toBe("mastered");
    expect(status("mitochondrial matrix")).toBe("partial");
    expect(status("carbon dioxide")).toBe("missed");
    expect(status("cellular respiration")).toBe("missed");
  });

  it("weights coverage by concept weight", () => {
    const w = result.concepts.reduce((a, r) => a + r.concept.weight, 0);
    const expected =
      result.concepts.reduce((a, r) => a + r.concept.weight * (r.status === "mastered" ? 1 : r.status === "partial" ? r.score : 0), 0) / w;
    expect(result.coverage).toBeCloseTo(expected, 10);
    expect(result.coverage).toBeGreaterThan(0.3);
    expect(result.coverage).toBeLessThan(0.8);
  });

  it("reports blurt words that aren't in the notes", () => {
    expect(result.extraTerms).toEqual(["Photo", "synthesis", "chlorophyll"]);
  });

  it("flags a wrong date as an extra term", () => {
    const r = checkBlurt("Japan attacked Pearl Harbor in 1942.", HISTORY);
    expect(r.extraTerms).toEqual(["1942"]);
  });

  it("joins split words in the blurt", () => {
    const concepts = extractConcepts("Photosynthesis: how plants turn light into sugar.");
    const r = gradeBlurt("photo synthesis makes sugar", concepts);
    expect(r.concepts.find((c) => c.concept.term === "photosynthesis")?.status).toBe("mastered");
  });

  it("scores an empty blurt as zero coverage, and no concepts as zero too", () => {
    expect(checkBlurt("", BIO).coverage).toBe(0);
    expect(gradeBlurt("anything", []).coverage).toBe(0);
  });
});

describe("annotations", () => {
  const blurt = "Glycolysis happens in the cytoplasm. Chlorophyll is green.";
  const result = checkBlurt(blurt, BIO);

  it("splits the notes into spans that rebuild the original text", () => {
    const spans = annotateNotes(BIO, result);
    expect(spans.map((s) => s.text).join("")).toBe(BIO);
    expect(spans.find((s) => s.text === "Glycolysis")?.status).toBe("mastered");
    expect(spans.find((s) => s.text === "Krebs cycle")?.status).toBe("missed");
    expect(spans.filter((s) => s.status).every((s) => s.conceptId)).toBe(true);
  });

  it("marks blurt words that hit a concept, and extra terms", () => {
    const spans = annotateBlurt(blurt, result);
    expect(spans.map((s) => s.text).join("")).toBe(blurt);
    expect(spans.find((s) => s.text === "cytoplasm")?.status).toBe("mastered");
    expect(spans.find((s) => s.text === "Chlorophyll")?.status).toBe("extra");
    expect(spans.find((s) => s.text.includes("happens"))?.status ?? null).toBeNull();
  });
});
