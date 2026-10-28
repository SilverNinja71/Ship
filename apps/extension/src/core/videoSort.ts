// Sorts a YouTube watch page with the video groups (videoGroups.ts), with no
// AI and no network: what kind of video it is (a lesson, study audio, gaming,
// a music video...), which subject it's about, and whether that fits what
// the sailor is studying. Each answer says whether the rules are sure; when
// they aren't and the sailor has a Gemini key, Gemini gets the final word.

import type { LookoutVerdict, VideoInspection } from "@ship/shared-types";
import { contentWords, isNumber, normalize, wordMatch } from "@ship/active-recall-engine";
import {
  CHANNELS,
  DISTRACTIONS,
  HISTORY_YEAR,
  LANGUAGE_LESSON,
  LESSON,
  LESSON_PATTERN,
  STUDY_AUDIO,
  STUDY_AUDIO_PATTERN,
  SUBJECTS,
  SUBJECT_BY_ID,
  YOUTUBE_CATEGORIES,
} from "./videoGroups.js";
import type { ChannelInfo, SubjectId } from "./videoGroups.js";
import type { StudyContext } from "./voyage.js";

/** At or above this confidence the rules decide alone; below it, Gemini (if set up) decides. */
export const SURE_CONFIDENCE = 0.75;

export interface SortedVideo {
  verdict: LookoutVerdict;
  /** The rules are confident enough that asking Gemini isn't worth it. */
  sure: boolean;
}

/** Words that say "schoolwork" but not what it's about. */
const GENERIC = new Set(
  `assignment assignments homework hw pset problem problems set sets worksheet quiz quizzes test tests exam exams midterm final finals
  essay essays paper report lab labs project projects chapter chapters section sections unit units week weeks module modules lesson lessons
  lecture lectures class classes course courses intro introduction study studying notes review reading readings read write writing
  draft finish work practice due part submit submission discussion post response question questions answer answers`.split(/\s+/),
);

const LANGUAGES: ReadonlySet<SubjectId> = new Set(["spanish", "french", "german", "japanese", "chinese", "korean", "latin", "italian", "arabic", "portuguese", "russian", "sign-language"]);

const pad = (normalized: string) => ` ${normalized} `;

/** Phrases from `list` that appear in the (normalized, padded) text, allowing a plural "s"/"es". */
function found(padded: string, list: readonly string[]): string[] {
  return list.filter((p) => p && (padded.includes(` ${p} `) || padded.includes(` ${p}s `) || padded.includes(` ${p}es `)));
}

/** How many of each subject's terms the text mentions. */
export function subjectsIn(normalized: string): Map<SubjectId, number> {
  const padded = pad(normalized);
  const hits = new Map<SubjectId, number>();
  for (const s of SUBJECTS) {
    const n = found(padded, s.terms).length;
    if (n) hits.set(s.id, n);
  }
  return hits;
}

/** The subjects of what's being studied: named terms, plus course codes ("BIO 201", "AP Calc", "CS61B"). */
export function studySubjects(ctx: StudyContext): Set<SubjectId> {
  const text = normalize([ctx.assignment, ctx.course, ctx.objective].filter(Boolean).join(" "));
  const course = normalize(ctx.course ?? "");
  const firstWord = course.split(" ")[0] ?? "";
  const out = new Set(subjectsIn(text).keys());
  for (const s of SUBJECTS) {
    for (const code of s.codes) {
      // Short codes are everyday words too ("art", "me"), so they count only as the course's
      // first word or right before a number; longer codes ("ap calc") count anywhere.
      const hit = code.includes(" ")
        ? pad(text).includes(` ${code} `)
        : firstWord === code || new RegExp(`^${code}\\d`).test(firstWord) || new RegExp(`(?:^| )${code} ?\\d`).test(text);
      if (hit) {
        out.add(s.id);
        break;
      }
    }
  }
  return out;
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

const subjectName = (ids: Iterable<SubjectId>) => {
  const first = [...ids][0];
  return first ? SUBJECT_BY_ID.get(first)!.name : "another subject";
};

const aOrAn = (word: string) => (/^[aeiou]/i.test(word) && !/^(uni|eu)/i.test(word) ? `an ${word}` : `a ${word}`);

function relatedTo(video: Set<SubjectId>, study: Set<SubjectId>): boolean {
  for (const v of video) for (const s of study) if (SUBJECT_BY_ID.get(s)?.related.includes(v)) return true;
  return false;
}

/** A channel the groups know, or one whose name says it teaches a language ("Learn Spanish with …Pod101"). */
function channelInfo(channel: string): ChannelInfo | null {
  const name = normalize(channel);
  const known = CHANNELS.get(name);
  if (known) return known;
  const langs = [...subjectsIn(name).keys()].filter((s) => LANGUAGES.has(s));
  return langs.length && (found(pad(name), LANGUAGE_LESSON).length || /pod101|easy|learn/.test(name)) ? { kind: "lesson", subjects: langs } : null;
}

export function sortVideo(video: VideoInspection, ctx: StudyContext): SortedVideo {
  const result = (decision: LookoutVerdict["decision"], reason: string, confidence: number): SortedVideo => ({
    verdict: { decision, reason: reason.charAt(0).toUpperCase() + reason.slice(1), confidence, source: "heuristic" },
    sure: confidence >= SURE_CONFIDENCE,
  });

  const title = normalize(video.title);
  const titlePadded = pad(title);
  const description = normalize(video.description.slice(0, 700));
  const channel = channelInfo(video.channel);
  const category = YOUTUBE_CATEGORIES[normalize(video.category ?? "")] ?? "neutral";

  // What's being studied.
  const keywords = topicKeywords(ctx);
  const study = studySubjects(ctx);
  const hasContext = keywords.length > 0 || study.size > 0;
  const inTitle = matched(keywords, `${video.title} ${video.channel}`);
  const inBody = matched(
    keywords.filter((k) => !inTitle.includes(k)),
    `${video.description} ${video.transcriptExcerpt ?? ""}`,
  );

  // What the video is about: its title first, then a description that names a subject twice, then the channel.
  const titleSubjects = new Set(subjectsIn(title).keys());
  if (HISTORY_YEAR.test(title)) titleSubjects.add("history");
  const descSubjects = new Set([...subjectsIn(description)].filter(([, n]) => n >= 2).map(([id]) => id));
  const named = new Set([...titleSubjects, ...descSubjects]);
  const videoSubjects = named.size ? named : new Set(channel?.subjects ?? []);
  const overlap = new Set([...videoSubjects].filter((s) => study.has(s)));
  const titleOverlap = [...titleSubjects].some((s) => study.has(s));

  // What kind of video it is.
  const lessonWords = found(pad(`${title} ${description.slice(0, 300)}`), LESSON);
  const languageLesson = [...titleSubjects].some((s) => LANGUAGES.has(s)) && found(titlePadded, LANGUAGE_LESSON).length > 0;
  const isLesson = channel?.kind === "lesson" || lessonWords.length > 0 || LESSON_PATTERN.test(title) || category === "lesson" || languageLesson;
  const audio = found(titlePadded, STUDY_AUDIO).length > 0 || STUDY_AUDIO_PATTERN.test(title);
  // A lesson channel's episodes and songs are still lessons, and a distraction word that is
  // itself the topic ("Minecraft in education") doesn't count.
  const distractions =
    channel?.kind === "lesson"
      ? []
      : DISTRACTIONS.filter((g) => found(titlePadded, g.phrases).some((p) => !keywords.some((k) => p.split(" ").some((w) => wordMatch(k, w) >= 0.8))));
  const distractionName = distractions[0]?.name ?? (category === "distraction" && !isLesson ? `${video.category} (YouTube's own category)` : null);

  const topicLabel = ctx.assignment ?? ctx.objective ?? ctx.course ?? "your assignment";
  const strongTopic = inTitle.length >= 2 || (titleOverlap && (inTitle.length >= 1 || isLesson));

  if (channel?.kind === "entertainment" && inTitle.length < 2) {
    return result("BLOCKED", `${video.channel} makes entertainment videos, not study material.`, 0.9);
  }
  if (audio) return result("PROCEED", "Looks like quiet study audio to keep you company.", 0.85);

  if (distractionName && !(strongTopic && distractions.length <= 1)) {
    const touches = titleOverlap || inTitle.length > 0;
    return touches
      ? result("BLOCKED", `This looks like ${distractionName}, though it touches on what you're studying.`, 0.6)
      : result("BLOCKED", `This looks like ${distractionName}, not study material.`, 0.85);
  }

  if (hasContext) {
    if (strongTopic) {
      return inTitle.length >= 2
        ? result("PROCEED", `It's about ${quote(inTitle)}, which is what you're studying.`, 0.85)
        : result("PROCEED", `${aOrAn(subjectName([...titleSubjects].filter((s) => study.has(s))))} ${isLesson ? "lesson" : "video"} that fits “${topicLabel}”.`, 0.8);
    }
    if (channel?.kind === "edutainment") {
      // Fun explainers are a rabbit hole unless they're on topic; only a clear mismatch is sure.
      if (titleOverlap || inTitle.length || overlap.size) {
        return result("PROCEED", `${video.channel} makes fun explainers, and this one touches on what you're studying.`, 0.65);
      }
      return result("BLOCKED", `${video.channel} is fun, but this video isn't about “${topicLabel}”.`, videoSubjects.size && study.size ? 0.8 : 0.6);
    }
    if (overlap.size && isLesson) return result("PROCEED", `${aOrAn(subjectName(overlap))} lesson, which fits what you're studying.`, 0.8);
    // The title names the subject being studied, and nothing marks it as entertainment.
    if (titleOverlap) return result("PROCEED", `It's about ${subjectName([...titleSubjects].filter((s) => study.has(s)))}, like what you're studying.`, 0.75);
    if (videoSubjects.size && !overlap.size && !inTitle.length && !inBody.length) {
      if (isLesson && relatedTo(videoSubjects, study)) {
        return result("PROCEED", `${aOrAn(subjectName(videoSubjects))} lesson. That's close to ${subjectName(study)}, so it may help.`, 0.6);
      }
      return study.size
        ? result("BLOCKED", `This is ${aOrAn(subjectName(videoSubjects))} video, but you're studying ${subjectName(study)}.`, 0.8)
        : result("BLOCKED", `This is ${aOrAn(subjectName(videoSubjects))} video, and nothing in it matches “${topicLabel}”.`, 0.7);
    }
    const relevance = inTitle.length * 2 + Math.min(inBody.length, 3);
    if (relevance >= 2) return result("PROCEED", `It mentions ${quote([...inTitle, ...inBody])} from what you're studying.`, 0.7);
    if (relevance >= 1 && isLesson) return result("PROCEED", `It looks like a lesson and mentions ${quote([...inTitle, ...inBody])}.`, 0.6);
    if (overlap.size) return result("PROCEED", `It seems to be about ${subjectName(overlap)}, like what you're studying.`, 0.6);
    if (isLesson) return result("BLOCKED", `It looks like a lesson, but nothing ties it to “${topicLabel}”.`, 0.55);
    return result("BLOCKED", `Nothing in the title or description matches “${topicLabel}”.`, 0.7);
  }

  // No assignment or objective: lessons are fine, the rest waits.
  if (channel?.kind === "lesson" || (isLesson && (videoSubjects.size > 0 || category === "lesson"))) {
    return result("PROCEED", "No assignment is set, but this looks like a lesson.", 0.75);
  }
  if (channel?.kind === "edutainment") return result("BLOCKED", `No assignment is set, and ${video.channel} is more fun than study.`, 0.6);
  if (isLesson) return result("PROCEED", "No assignment is set, but this might be a lesson.", 0.55);
  return result("BLOCKED", "No assignment is set, and this doesn't look like study material.", 0.6);
}
