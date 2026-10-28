import { describe, expect, it } from "vitest";
import type { VideoInspection } from "@ship/shared-types";
import { judgeByKeywords, topicKeywords } from "./heuristic.js";
import type { StudyContext } from "./voyage.js";

const video = (title: string, description = "", channel = "Some Channel"): VideoInspection => ({
  videoId: "dQw4w9WgXcQ",
  title,
  channel,
  description,
  transcriptExcerpt: null,
  thumbnailUrl: null,
});

const bio: StudyContext = { assignment: "Enzyme kinetics lab report", course: "BIO 201", objective: "Finish the discussion section" };
const none: StudyContext = { assignment: null, course: null, objective: null };

describe("topicKeywords", () => {
  it("keeps the topic and drops schoolwork words and course numbers", () => {
    expect(topicKeywords(bio)).toEqual(["enzyme", "kinetics", "bio"]);
  });
});

describe("judgeByKeywords", () => {
  it("lets through a video about the assignment", () => {
    const v = judgeByKeywords(video("Enzyme Kinetics Explained: Michaelis-Menten"), bio);
    expect(v).toMatchObject({ decision: "PROCEED", source: "heuristic" });
    expect(v.reason).toContain("enzyme");
  });

  it("matches plurals and small typos", () => {
    expect(judgeByKeywords(video("All about enzymes and their kinetic rates"), bio).decision).toBe("PROCEED");
  });

  it("counts description matches when the video is a lesson", () => {
    expect(judgeByKeywords(video("Lecture 12", "Today: enzyme inhibition and reaction rates"), bio).decision).toBe("PROCEED");
  });

  it("blocks an off-topic video", () => {
    const v = judgeByKeywords(video("How I built a treehouse"), bio);
    expect(v.decision).toBe("BLOCKED");
    expect(v.reason).toContain("Enzyme kinetics lab report");
  });

  it("blocks entertainment even when it name-drops the topic once", () => {
    expect(judgeByKeywords(video("Funny biology memes compilation"), bio).decision).toBe("BLOCKED");
    expect(judgeByKeywords(video("Top 10 Speedrun Fails"), bio).decision).toBe("BLOCKED");
  });

  it("lets a strongly on-topic title outweigh one entertainment word", () => {
    expect(judgeByKeywords(video("Enzyme kinetics trailer for my new course"), bio).decision).toBe("PROCEED");
  });

  it("doesn't treat the topic itself as a distraction", () => {
    const ctx: StudyContext = { assignment: "Minecraft in education essay", course: null, objective: null };
    expect(judgeByKeywords(video("Minecraft education edition classroom lesson"), ctx).decision).toBe("PROCEED");
  });

  it("allows quiet study audio", () => {
    expect(judgeByKeywords(video("lofi hip hop radio - beats to relax/study to"), bio).decision).toBe("PROCEED");
  });

  it("with no assignment, allows only clearly educational videos", () => {
    expect(judgeByKeywords(video("Introduction to Organic Chemistry - Full Course", "", "Khan Academy"), none).decision).toBe("PROCEED");
    expect(judgeByKeywords(video("My morning routine"), none).decision).toBe("BLOCKED");
  });

  it("never claims much confidence", () => {
    for (const title of ["Enzyme Kinetics Explained", "Prank compilation", "", "lofi"]) {
      const v = judgeByKeywords(video(title), bio);
      expect(v.confidence).toBeGreaterThan(0);
      expect(v.confidence).toBeLessThanOrEqual(0.6);
    }
  });
});
