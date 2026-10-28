// Canvas LMS, read with a student's personal access token: active courses,
// their assignments (with the student's submission), assignment-group
// weights, course colors and nicknames. Canvas sends no CORS headers, so in
// the browser pass `createRelayFetch(...)` as `fetch`.

import type { Assignment, AssignmentKind, FetchLike, IntegrationSettings } from "@ship/shared-types";
import { HttpError, bearer, getLinkPaged, mapWithConcurrency, requestJson, withQuery } from "./http.js";
import type { FetchInit } from "./http.js";
import { isExamTitle, guessKind } from "./kind.js";
import { asArray, asBoolean, asDict, asId, asNumber, asString, asText } from "./values.js";
import { parseDateString } from "./time.js";

export type CanvasSettings = NonNullable<IntegrationSettings["canvas"]>;

export interface CanvasCourse {
  /** Canvas's course id. */
  id: string;
  /** The course's real name (Canvas returns the nickname in `name` when one is set). */
  name: string;
  nickname: string | null;
  courseCode: string | null;
  color: string | null;
  /** When false, Canvas ignores group weights for this course's grade. */
  applyGroupWeights: boolean;
}

export interface CanvasSyncResult {
  courses: CanvasCourse[];
  assignments: Assignment[];
  /** Partial failures (one course, colors, nicknames) that didn't stop the sync. */
  warnings: string[];
}

const SERVICE = "Canvas";
const PER_PAGE = 100;

/**
 * Trims, adds a missing https://, drops a trailing slash or pasted `/api/v1`,
 * and refuses plain http (the token would travel in the clear).
 */
export function normalizeCanvasBaseUrl(raw: string): string {
  let text = raw.trim();
  if (text === "") throw new Error("Enter your Canvas address, like https://school.instructure.com.");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`"${raw.trim()}" doesn't look like a Canvas address.`);
  }
  if (url.protocol !== "https:") throw new Error("The Canvas address must start with https://.");
  const path = url.pathname.replace(/\/+$/, "").replace(/\/api\/v1$/i, "");
  return `${url.origin}${path}`;
}

function api(settings: CanvasSettings, path: string): string {
  return `${normalizeCanvasBaseUrl(settings.baseUrl)}/api/v1${path}`;
}

function init(settings: CanvasSettings): FetchInit {
  return { method: "GET", headers: bearer(settings.token) };
}

/** Active-enrollment courses, raw from Canvas (filtered to ones we can read). */
export async function listCanvasCourses(fetch: FetchLike, settings: CanvasSettings): Promise<unknown[]> {
  const url = withQuery(api(settings, "/courses"), { enrollment_state: "active", per_page: PER_PAGE });
  const courses = await getLinkPaged(fetch, url, init(settings), { service: SERVICE });
  // Courses outside their dates come back as stubs with no name.
  return courses.filter((c) => asDict(c)?.["access_restricted_by_date"] !== true && asId(asDict(c)?.["id"]));
}

export async function listCanvasAssignments(
  fetch: FetchLike,
  settings: CanvasSettings,
  courseId: string,
): Promise<unknown[]> {
  const url = withQuery(api(settings, `/courses/${encodeURIComponent(courseId)}/assignments`), {
    "include[]": ["submission"],
    per_page: PER_PAGE,
  });
  return getLinkPaged(fetch, url, init(settings), { service: SERVICE });
}

/** Assignment-group id → weight (0..100). */
export async function getCanvasGroupWeights(
  fetch: FetchLike,
  settings: CanvasSettings,
  courseId: string,
): Promise<Map<string, number>> {
  const url = withQuery(api(settings, `/courses/${encodeURIComponent(courseId)}/assignment_groups`), {
    per_page: PER_PAGE,
  });
  const groups = await getLinkPaged(fetch, url, init(settings), { service: SERVICE });
  const weights = new Map<string, number>();
  for (const g of groups) {
    const group = asDict(g);
    const id = asId(group?.["id"]);
    const weight = asNumber(group?.["group_weight"]);
    if (id && weight !== null) weights.set(id, weight);
  }
  return weights;
}

/** Course id → CSS color, from the student's own Canvas colors (`custom_colors.course_123`). */
export async function getCanvasCourseColors(fetch: FetchLike, settings: CanvasSettings): Promise<Map<string, string>> {
  const { data } = await requestJson(fetch, api(settings, "/users/self/colors"), init(settings), SERVICE);
  const colors = new Map<string, string>();
  const custom = asDict(asDict(data)?.["custom_colors"]);
  for (const [key, value] of Object.entries(custom ?? {})) {
    const match = /^course_(\d+)$/.exec(key);
    const color = asText(value);
    if (match?.[1] && color) colors.set(match[1], color);
  }
  return colors;
}

/** Course id → nickname. */
export async function getCanvasCourseNicknames(
  fetch: FetchLike,
  settings: CanvasSettings,
): Promise<Map<string, string>> {
  const url = withQuery(api(settings, "/users/self/course_nicknames"), { per_page: PER_PAGE });
  const list = await getLinkPaged(fetch, url, init(settings), { service: SERVICE });
  const nicknames = new Map<string, string>();
  for (const item of list) {
    const entry = asDict(item);
    const id = asId(entry?.["course_id"]);
    const nickname = asText(entry?.["nickname"]);
    if (id && nickname) nicknames.set(id, nickname);
  }
  return nicknames;
}

export function mapCanvasCourse(
  raw: unknown,
  colors: ReadonlyMap<string, string>,
  nicknames: ReadonlyMap<string, string>,
): CanvasCourse | null {
  const course = asDict(raw);
  const id = asId(course?.["id"]);
  if (!course || !id) return null;
  const nickname = nicknames.get(id) ?? null;
  // With a nickname set, Canvas puts it in `name` and the real one in `original_name`.
  const name = asText(course["original_name"]) ?? asText(course["name"]) ?? asText(course["course_code"]) ?? `Course ${id}`;
  return {
    id,
    name,
    nickname: nickname ?? (asText(course["original_name"]) ? asText(course["name"]) : null),
    courseCode: asText(course["course_code"]),
    color: colors.get(id) ?? null,
    applyGroupWeights: asBoolean(course["apply_assignment_group_weights"]) === true,
  };
}

const SUBMITTED_STATES = new Set(["submitted", "graded", "pending_review", "complete"]);

function canvasKind(assignment: Record<string, unknown>, title: string): AssignmentKind {
  const types = asArray(assignment["submission_types"]).filter((t): t is string => typeof t === "string");
  if (types.includes("discussion_topic") || assignment["discussion_topic"]) return "discussion";
  if (isExamTitle(title)) return "exam";
  const isQuiz =
    types.includes("online_quiz") ||
    assignment["is_quiz_assignment"] === true ||
    assignment["is_quiz_lti_assignment"] === true ||
    asId(assignment["quiz_id"]) !== null;
  if (isQuiz) return "quiz";
  return guessKind(title, "assignment");
}

export function mapCanvasAssignment(
  raw: unknown,
  course: CanvasCourse,
  groupWeights: ReadonlyMap<string, number>,
): Assignment | null {
  const a = asDict(raw);
  const remoteId = asId(a?.["id"]);
  if (!a || !remoteId) return null;
  const title = asText(a["name"]) ?? "Untitled assignment";
  const submission = asDict(a["submission"]);
  const state = asString(submission?.["workflow_state"]);
  const completed =
    (state !== null && SUBMITTED_STATES.has(state)) ||
    asString(submission?.["submitted_at"]) !== null ||
    submission?.["excused"] === true;
  const dueText = asString(a["due_at"]);
  const groupId = asId(a["assignment_group_id"]);
  return {
    id: `canvas:${remoteId}`,
    source: "canvas",
    remoteId,
    title,
    course: course.nickname ?? course.name,
    courseColor: course.color,
    dueAt: dueText ? parseDateString(dueText) : null,
    kind: canvasKind(a, title),
    groupWeight: course.applyGroupWeights && groupId ? (groupWeights.get(groupId) ?? null) : null,
    pointsPossible: asNumber(a["points_possible"]),
    url: asText(a["html_url"]),
    completed,
    priority: null,
  };
}

const describe = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Reads everything Ship shows from Canvas. Course listing failures throw
 * (usually a bad token: check `HttpError.isAuthError`); anything after that
 * becomes a warning so one locked course doesn't hide the rest.
 */
export async function syncCanvas(
  fetch: FetchLike,
  settings: CanvasSettings,
  options: { concurrency?: number } = {},
): Promise<CanvasSyncResult> {
  const warnings: string[] = [];
  const [rawCourses, colors, nicknames] = await Promise.all([
    listCanvasCourses(fetch, settings),
    getCanvasCourseColors(fetch, settings).catch((e: unknown) => {
      warnings.push(`Couldn't read your Canvas course colors (${describe(e)}).`);
      return new Map<string, string>();
    }),
    getCanvasCourseNicknames(fetch, settings).catch((e: unknown) => {
      warnings.push(`Couldn't read your Canvas course nicknames (${describe(e)}).`);
      return new Map<string, string>();
    }),
  ]);
  const courses = rawCourses
    .map((c) => mapCanvasCourse(c, colors, nicknames))
    .filter((c): c is CanvasCourse => c !== null);

  const perCourse = await mapWithConcurrency(courses, options.concurrency ?? 4, async (course) => {
    const label = course.nickname ?? course.name;
    try {
      const [rawAssignments, weights] = await Promise.all([
        listCanvasAssignments(fetch, settings, course.id),
        course.applyGroupWeights
          ? getCanvasGroupWeights(fetch, settings, course.id).catch((e: unknown) => {
              warnings.push(`Couldn't read grade weights for ${label} (${describe(e)}).`);
              return new Map<string, number>();
            })
          : Promise.resolve(new Map<string, number>()),
      ]);
      return rawAssignments
        .map((a) => mapCanvasAssignment(a, course, weights))
        .filter((a): a is Assignment => a !== null);
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) throw e;
      warnings.push(`Couldn't read assignments for ${label} (${describe(e)}).`);
      return [];
    }
  });

  return { courses, assignments: perCourse.flat(), warnings };
}
