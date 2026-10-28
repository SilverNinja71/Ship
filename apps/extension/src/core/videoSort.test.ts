import { describe, expect, it } from "vitest";
import type { VideoInspection } from "@ship/shared-types";
import { normalize } from "@ship/active-recall-engine";
import { CHANNELS, DISTRACTIONS, LESSON, STUDY_AUDIO, SUBJECTS } from "./videoGroups.js";
import { SURE_CONFIDENCE, sortVideo, studySubjects, subjectsIn, topicKeywords } from "./videoSort.js";
import type { StudyContext } from "./voyage.js";

const video = (title: string, channel = "Some Channel", description = "", category: string | null = null): VideoInspection => ({
  videoId: "dQw4w9WgXcQ",
  title,
  channel,
  description,
  transcriptExcerpt: null,
  thumbnailUrl: null,
  category,
});

const ctx = (assignment: string | null, course: string | null = null, objective: string | null = null): StudyContext => ({ assignment, course, objective });
const bio = ctx("Enzyme kinetics lab report", "BIO 201", "Finish the discussion section");
const resp = ctx("Cellular respiration worksheet", "Biology");
const apush = ctx("DBQ practice", "APUSH");
const calc = ctx(null, "MATH 2413", "Chain rule homework");
const none = ctx(null);

const sort = (v: VideoInspection, c: StudyContext) => sortVideo(v, c);
const decide = (v: VideoInspection, c: StudyContext) => {
  const { verdict, sure } = sortVideo(v, c);
  return `${verdict.decision}${sure ? "" : "?"}`;
};

describe("the groups", () => {
  it("are written in normalized form, with no empty or duplicate phrases", () => {
    const lists = [...SUBJECTS.flatMap((s) => [s.terms, s.codes]), ...DISTRACTIONS.map((d) => d.phrases), LESSON, STUDY_AUDIO];
    for (const list of lists) {
      for (const p of list) expect(p, p).toBe(normalize(p));
      expect(new Set(list).size).toBe(list.length);
    }
    for (const name of CHANNELS.keys()) expect(name).toBe(normalize(name));
  });

  it("only relate subjects that exist", () => {
    const ids = new Set(SUBJECTS.map((s) => s.id));
    for (const s of SUBJECTS) for (const r of s.related) expect(ids.has(r), `${s.id} → ${r}`).toBe(true);
  });
});

describe("study subjects", () => {
  it("come from course codes and named terms", () => {
    expect([...studySubjects(bio)]).toEqual(["biology"]);
    expect([...studySubjects(apush)]).toEqual(["history"]);
    expect([...studySubjects(calc)]).toEqual(["math"]);
    expect([...studySubjects(ctx("Problem set 3", "CS61B"))]).toEqual(["computer-science"]);
    expect([...studySubjects(ctx("Lab writeup", "CHEM 1A"))]).toEqual(["chemistry"]);
    expect([...studySubjects(ctx(null, null, "Spanish vocabulary for Friday"))]).toEqual(["spanish"]);
  });

  it("don't read everyday words as course codes", () => {
    expect(studySubjects(ctx("Help me finish writing the art of persuasion speech"))).toEqual(new Set());
  });

  it("keep the topic words that matter", () => {
    expect(topicKeywords(bio)).toEqual(["enzyme", "kinetics", "bio"]);
  });
});

describe("sortVideo", () => {
  it("lets through videos about the assignment, sure of it", () => {
    const v = sort(video("Enzyme Kinetics Explained: Michaelis-Menten"), bio);
    expect(v).toMatchObject({ sure: true, verdict: { decision: "PROCEED", source: "heuristic" } });
    expect(v.verdict.reason).toContain("enzyme");
    expect(decide(video("All about enzymes and their kinetic rates"), bio)).toBe("PROCEED");
  });

  it("knows a subject's vocabulary, not just the assignment's words", () => {
    // Nothing here says "cellular respiration", but the Krebs cycle is biology, and it's a lesson.
    expect(decide(video("The Krebs Cycle Made Easy"), resp)).toBe("PROCEED");
    expect(decide(video("Glycolysis: Step by Step", "Ninja Nerd"), resp)).toBe("PROCEED");
    expect(decide(video("Implicit Differentiation - Calculus Tutorial"), calc)).toBe("PROCEED");
    expect(decide(video("APUSH Review: The New Deal", "Heimler's History"), apush)).toBe("PROCEED");
  });

  it("blocks a lesson from the wrong subject", () => {
    const v = sort(video("Stoichiometry Practice Problems", "Tyler DeWitt"), apush);
    expect(v).toMatchObject({ sure: true, verdict: { decision: "BLOCKED" } });
    expect(v.verdict.reason).toBe("This is a chemistry video, but you're studying history.");
  });

  it("is unsure about a lesson from a related subject", () => {
    expect(decide(video("Chemical Equilibrium Explained"), resp)).toBe("PROCEED?");
  });

  it("blocks the usual distractions, naming the group", () => {
    expect(sort(video("Top 10 Speedrun Fails"), bio).verdict.reason).toBe("This looks like gaming, not study material.");
    expect(decide(video("Taylor Swift - Anti-Hero (Official Music Video)"), bio)).toBe("BLOCKED");
    expect(decide(video("I Spent 24 Hours In A Grocery Store"), bio)).toBe("BLOCKED");
    expect(decide(video("My morning routine"), none)).toBe("BLOCKED");
    expect(decide(video("Lakers vs Celtics Full Game Highlights"), apush)).toBe("BLOCKED");
    expect(decide(video("Dune: Part Three | Official Trailer"), resp)).toBe("BLOCKED");
  });

  it("blocks entertainment channels outright", () => {
    expect(sort(video("I Built 100 Houses And Gave Them Away", "MrBeast"), bio).verdict).toMatchObject({
      decision: "BLOCKED",
      reason: "MrBeast makes entertainment videos, not study material.",
      confidence: 0.9,
    });
  });

  it("isn't sure when a distraction touches the topic, so Gemini can look", () => {
    expect(decide(video("Funny biology memes compilation"), bio)).toBe("BLOCKED?");
  });

  it("lets a strongly on-topic title outweigh one entertainment word", () => {
    expect(decide(video("Enzyme kinetics trailer for my new course"), bio)).toBe("PROCEED");
  });

  it("doesn't treat the topic itself as a distraction", () => {
    expect(decide(video("Minecraft education edition classroom lesson"), ctx("Minecraft in education essay"))).toBe("PROCEED");
  });

  it("doesn't mistake chemistry reactions or makeup exams for distractions", () => {
    expect(decide(video("SN2 Reaction Mechanism"), ctx("Orgo problem set", "CHEM 2423"))).toBe("PROCEED");
    expect(decide(video("Makeup exam review: limiting reagent"), ctx("Stoichiometry", "CHEM 1411"))).toBe("PROCEED");
  });

  it("allows quiet study audio", () => {
    expect(sort(video("lofi hip hop radio - beats to relax/study to"), bio)).toMatchObject({ sure: true, verdict: { decision: "PROCEED" } });
    expect(decide(video("3 hour study with me - rain sounds, pomodoro 50/10"), apush)).toBe("PROCEED");
  });

  it("is careful with fun explainer channels", () => {
    expect(decide(video("Why is the sky blue?", "Veritasium"), apush)).toBe("BLOCKED");
    // TED-Ed covers everything, so with no subject in the title the groups can't be sure.
    expect(decide(video("How does your body make energy?", "TED-Ed"), resp)).toBe("BLOCKED?");
    expect(decide(video("The Cold War: Animated", "OverSimplified"), apush)).toBe("PROCEED?");
  });

  it("teaches languages to language learners", () => {
    expect(decide(video("Spanish Verb Conjugation for Beginners"), ctx(null, null, "Spanish vocabulary for Friday"))).toBe("PROCEED");
    expect(decide(video("Learn French in 20 minutes"), ctx(null, "SPAN 102"))).toBe("BLOCKED");
  });

  it("uses YouTube's category when the page gives one", () => {
    expect(decide(video("A day at the lake", "Some Channel", "", "Gaming"), bio)).toBe("BLOCKED");
    expect(decide(video("Mitochondria", "Some Channel", "", "Education"), resp)).toBe("PROCEED");
  });

  it("reads history from old years, long study audio from its length, and cooking as a distraction", () => {
    expect(decide(video("The Fall of Berlin 1945 - Full Documentary"), ctx("WWII essay outline", "HIST 1302"))).toBe("PROCEED");
    expect(decide(video("Top 10 movies of 1999"), ctx("WWII essay outline", "HIST 1302"))).toBe("BLOCKED");
    expect(decide(video("10 hours of rain on a tin roof for sleep and study"), bio)).toBe("PROCEED");
    expect(decide(video("Gordon Ramsay cooks a steak"), bio)).toBe("BLOCKED");
  });

  it("checks the description when the title is vague", () => {
    expect(decide(video("Lecture 12", "Some Channel", "Today: enzyme inhibition and reaction rates"), bio)).toBe("PROCEED?");
    expect(decide(video("Lecture 12", "Some Channel", "Supply and demand, elasticity and consumer surplus."), resp)).toBe("BLOCKED");
  });

  it("blocks videos with nothing to do with the assignment", () => {
    const v = sort(video("How I built a treehouse"), bio);
    expect(v.verdict.decision).toBe("BLOCKED");
    expect(v.verdict.reason).toContain("Enzyme kinetics lab report");
  });

  it("with no assignment, allows only clear lessons", () => {
    expect(decide(video("Introduction to Organic Chemistry - Full Course", "Khan Academy"), none)).toBe("PROCEED");
    expect(decide(video("Photosynthesis explained"), none)).toBe("PROCEED");
    expect(decide(video("What happened at the party"), none)).toBe("BLOCKED?");
  });

  it("is sure exactly when its confidence reaches the threshold", () => {
    for (const title of ["Enzyme Kinetics Explained", "Prank compilation", "", "lofi", "Lecture 12"]) {
      const s = sort(video(title), bio);
      expect(s.sure).toBe(s.verdict.confidence >= SURE_CONFIDENCE);
    }
  });

  it("finds subjects in plain text", () => {
    expect([...subjectsIn(normalize("Organic Chemistry: SN1 vs SN2 reactions and the periodic table"))]).toEqual([["chemistry", 5]]);
  });
});
