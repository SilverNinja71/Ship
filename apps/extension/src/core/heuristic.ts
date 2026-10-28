// The keyword check: decides a watch page when there's no Gemini key (or
// Gemini fails). It looks for the assignment's words in the video's title
// and description, plus a few "this is a lesson" and "this is entertainment"
// phrases. Deliberately modest: its confidence never goes above 0.6.

import type { LookoutVerdict, VideoInspection } from "@ship/shared-types";
import { contentWords, isNumber, normalize, wordMatch } from "@ship/active-recall-engine";
import type { StudyContext } from "./voyage.js";

/** Words that say "schoolwork" but not what it's about. */
const GENERIC = new Set(
  `assignment assignments homework hw pset problem problems set sets worksheet quiz quizzes test tests exam exams midterm final finals
  essay essays paper report lab labs project projects chapter chapters section sections unit units week weeks module modules lesson lessons
  lecture lectures class classes course courses intro introduction study studying notes review reading readings read write writing
  draft finish work practice due part submit submission discussion post response question questions answer answers`.split(/\s+/),
);

const EDUCATIONAL = [
  "lecture",
  "lesson",
  "tutorial",
  "explained",
  "explanation",
  "how to",
  "introduction to",
  "intro to",
  "crash course",
  "full course",
  "khan academy",
  "opencourseware",
  "professor",
  "university",
  "for beginners",
  "step by step",
  "worked example",
  "practice problems",
  "study guide",
  "exam prep",
  "revision",
  "proof",
  "derivation",
  "documentary",
  "masterclass",
  "course",
];
const STUDY_AUDIO = [
  "lofi",
  "lo fi",
  "study music",
  "study with me",
  "focus music",
  "deep focus",
  "concentration music",
  "white noise",
  "brown noise",
  "rain sounds",
  "pomodoro",
  "ambient study",
  "classical music for studying",
];
const DISTRACTION = [
  "reaction",
  "reacts",
  "reacting",
  "prank",
  "funny",
  "meme",
  "memes",
  "compilation",
  "vlog",
  "gameplay",
  "lets play",
  "speedrun",
  "trailer",
  "highlights",
  "unboxing",
  "tier list",
  "mukbang",
  "try not to laugh",
  "fails",
  "tiktok",
  "minecraft",
  "fortnite",
  "roblox",
  "gta",
  "music video",
  "official video",
  "full episode",
  "gossip",
  "satisfying",
  "shorts",
  "livestream",
  "storytime",
];

const PHRASES = (list: string[]) => list.map((p) => normalize(p));
const EDU_PHRASES = PHRASES(EDUCATIONAL);
const AUDIO_PHRASES = PHRASES(STUDY_AUDIO);
const DISTRACTION_PHRASES = PHRASES(DISTRACTION);

function found(normalized: string, phrases: readonly string[]): string[] {
  const padded = ` ${normalized} `;
  return phrases.filter((p) => p && padded.includes(` ${p} `));
}

/** The words of the study context worth looking for in a video. */
export function topicKeywords(ctx: StudyContext): string[] {
  const words = contentWords([ctx.assignment, ctx.course, ctx.objective].filter(Boolean).join(" "));
  return [...new Set(words.filter((w) => w.length >= 3 && !isNumber(w) && !GENERIC.has(w)))];
}

function matched(keywords: readonly string[], text: string): string[] {
  const pool = [...new Set(normalize(text).split(" ").filter(Boolean))];
  return keywords.filter((k) => pool.some((w) => wordMatch(k, w) >= 0.8));
}

const quote = (words: readonly string[]) =>
  words
    .slice(0, 3)
    .map((w) => `“${w}”`)
    .join(", ");

export function judgeByKeywords(video: VideoInspection, ctx: StudyContext): LookoutVerdict {
  const verdict = (decision: LookoutVerdict["decision"], reason: string, confidence: number): LookoutVerdict => ({
    decision,
    reason,
    confidence,
    source: "heuristic",
  });

  const title = normalize(video.title);
  const body = `${video.description} ${video.transcriptExcerpt ?? ""}`;
  const keywords = topicKeywords(ctx);
  const inTitle = matched(keywords, `${video.title} ${video.channel}`);
  const inBody = matched(
    keywords.filter((k) => !inTitle.includes(k)),
    body,
  );
  const edu = found(`${title} ${normalize(video.channel)} ${normalize(video.description.slice(0, 500))}`, EDU_PHRASES);
  const audio = found(title, AUDIO_PHRASES);
  // A distraction word that is itself the topic ("Minecraft in education") doesn't count,
  // and two topic words in the title outweigh one.
  const distractions = found(title, DISTRACTION_PHRASES).filter((d) => !keywords.some((k) => d.split(" ").some((w) => wordMatch(k, w) >= 0.8)));

  if (distractions.length && !(inTitle.length >= 2 && distractions.length === 1)) {
    return verdict("BLOCKED", `The title says ${quote(distractions)}, which sounds like entertainment rather than study.`, 0.55);
  }
  if (audio.length) return verdict("PROCEED", "Looks like quiet study audio to keep you company.", 0.45);

  if (keywords.length) {
    const relevance = inTitle.length * 2 + Math.min(inBody.length, 3);
    if (relevance >= 2) return verdict("PROCEED", `It mentions ${quote([...inTitle, ...inBody])} from what you're studying.`, 0.6);
    if (relevance >= 1 && edu.length) return verdict("PROCEED", `It looks like a lesson and mentions ${quote(inBody)}.`, 0.45);
    const topic = ctx.assignment ?? ctx.objective ?? ctx.course ?? "your assignment";
    return verdict("BLOCKED", `Nothing in the title or description matches “${topic}”.`, 0.5);
  }

  if (edu.length >= 2) return verdict("PROCEED", "No assignment is set, but this looks like a lesson.", 0.4);
  return verdict("BLOCKED", "No assignment is set, and this doesn't look like study material.", 0.4);
}
