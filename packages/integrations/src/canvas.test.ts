import { describe, expect, it } from "vitest";
import { HttpError } from "./http.js";
import { mapCanvasAssignment, normalizeCanvasBaseUrl, syncCanvas } from "./canvas.js";
import type { CanvasCourse } from "./canvas.js";
import { fakeFetch } from "./testing/fakeFetch.js";
import type { FakeReply } from "./testing/fakeFetch.js";

const BASE = "https://school.instructure.com/api/v1";
const settings = { baseUrl: "school.instructure.com/", token: " secret " };

function canvasRoutes(overrides: Record<string, FakeReply> = {}) {
  const routes: Record<string, FakeReply> = {
    [`${BASE}/courses?enrollment_state=active&per_page=100`]: {
      body: [
        { id: 101, name: "Bio Nick", original_name: "Biology 110", course_code: "BIO110", apply_assignment_group_weights: true },
        { id: 102, name: "Calculus I", course_code: "MATH151", apply_assignment_group_weights: false },
      ],
      headers: { Link: `<${BASE}/courses?enrollment_state=active&per_page=100&page=2>; rel="next"` },
    },
    [`${BASE}/courses?enrollment_state=active&per_page=100&page=2`]: {
      body: [{ id: 103, access_restricted_by_date: true }],
    },
    [`${BASE}/users/self/colors`]: { body: { custom_colors: { course_101: "#E1185C", group_7: "#000", user_1: "#fff" } } },
    [`${BASE}/users/self/course_nicknames?per_page=100`]: {
      body: [{ course_id: 101, name: "Biology 110", nickname: "Bio Nick" }],
    },
    [`${BASE}/courses/101/assignments?include%5B%5D=submission&per_page=100`]: {
      body: [
        {
          id: 5001,
          name: "Lab report 1",
          due_at: "2026-10-30T03:59:00Z",
          points_possible: 20,
          html_url: "https://school.instructure.com/courses/101/assignments/5001",
          submission_types: ["online_upload"],
          assignment_group_id: 11,
          submission: { workflow_state: "submitted", submitted_at: "2026-10-29T10:00:00Z" },
        },
        {
          id: 5002,
          name: "Chapter 4 check",
          due_at: null,
          points_possible: 5,
          submission_types: ["online_quiz"],
          assignment_group_id: 12,
          submission: { workflow_state: "unsubmitted" },
        },
      ],
      headers: { link: `<${BASE}/courses/101/assignments?include%5B%5D=submission&per_page=100&page=2>; rel="next"` },
    },
    [`${BASE}/courses/101/assignments?include%5B%5D=submission&per_page=100&page=2`]: {
      body: [
        { id: 5003, name: "Midterm Exam", due_at: "2026-11-05T15:00:00Z", submission_types: ["online_quiz"], assignment_group_id: 12 },
        { id: 5004, name: "Week 6 discussion", submission_types: ["discussion_topic"], assignment_group_id: 99 },
      ],
    },
    [`${BASE}/courses/101/assignment_groups?per_page=100`]: {
      body: [
        { id: 11, name: "Labs", group_weight: 30 },
        { id: 12, name: "Exams", group_weight: 70 },
      ],
    },
    [`${BASE}/courses/102/assignments?include%5B%5D=submission&per_page=100`]: {
      body: [{ id: 6001, name: "Problem set 3", due_at: "2026-11-01T05:59:59Z", assignment_group_id: 21, submission: { excused: true } }],
    },
    ...overrides,
  };
  return fakeFetch(routes);
}

describe("normalizeCanvasBaseUrl", () => {
  it("cleans up what people paste", () => {
    expect(normalizeCanvasBaseUrl("  https://school.instructure.com/  ")).toBe("https://school.instructure.com");
    expect(normalizeCanvasBaseUrl("school.instructure.com")).toBe("https://school.instructure.com");
    expect(normalizeCanvasBaseUrl("https://canvas.uni.edu/api/v1/")).toBe("https://canvas.uni.edu");
    expect(normalizeCanvasBaseUrl("https://canvas.uni.edu/?login=1#x")).toBe("https://canvas.uni.edu");
  });

  it("refuses plain http and junk", () => {
    expect(() => normalizeCanvasBaseUrl("http://school.instructure.com")).toThrow(/https/);
    expect(() => normalizeCanvasBaseUrl("   ")).toThrow(/Enter your Canvas address/);
    expect(() => normalizeCanvasBaseUrl("https://")).toThrow(/doesn't look like/);
  });
});

describe("syncCanvas", () => {
  it("reads courses, paged assignments, weights, colors and nicknames", async () => {
    const fetch = canvasRoutes();
    const result = await syncCanvas(fetch, settings);

    expect(result.warnings).toEqual([]);
    expect(result.courses).toEqual([
      { id: "101", name: "Biology 110", nickname: "Bio Nick", courseCode: "BIO110", color: "#E1185C", applyGroupWeights: true },
      { id: "102", name: "Calculus I", nickname: null, courseCode: "MATH151", color: null, applyGroupWeights: false },
    ]);

    const byId = new Map(result.assignments.map((a) => [a.id, a]));
    expect(result.assignments).toHaveLength(5);
    expect(byId.get("canvas:5001")).toEqual({
      id: "canvas:5001",
      source: "canvas",
      remoteId: "5001",
      title: "Lab report 1",
      course: "Bio Nick",
      courseColor: "#E1185C",
      dueAt: Date.parse("2026-10-30T03:59:00Z"),
      kind: "assignment",
      groupWeight: 30,
      pointsPossible: 20,
      url: "https://school.instructure.com/courses/101/assignments/5001",
      completed: true,
      priority: null,
    });
    expect(byId.get("canvas:5002")).toMatchObject({ kind: "quiz", dueAt: null, completed: false, groupWeight: 70 });
    expect(byId.get("canvas:5003")).toMatchObject({ kind: "exam", groupWeight: 70, completed: false });
    expect(byId.get("canvas:5004")).toMatchObject({ kind: "discussion", groupWeight: null });
    // Course 102 doesn't weight groups, and an excused submission counts as done.
    expect(byId.get("canvas:6001")).toMatchObject({ course: "Calculus I", groupWeight: null, completed: true });

    // Weights are only fetched for courses that use them.
    expect(fetch.calls.some((c) => c.url.includes("/courses/102/assignment_groups"))).toBe(false);
    for (const call of fetch.calls) {
      expect(call.init?.headers?.["Authorization"]).toBe("Bearer secret");
    }
  });

  it("keeps going when colors, nicknames or one course fail", async () => {
    const fetch = canvasRoutes({
      [`${BASE}/users/self/colors`]: { status: 403, body: { errors: [{ message: "unauthorized" }] } },
      [`${BASE}/users/self/course_nicknames?per_page=100`]: { status: 500, body: "boom" },
      [`${BASE}/courses/102/assignments?include%5B%5D=submission&per_page=100`]: { status: 404, body: "" },
    });
    const result = await syncCanvas(fetch, settings);
    expect(result.assignments.map((a) => a.id).sort()).toEqual(["canvas:5001", "canvas:5002", "canvas:5003", "canvas:5004"]);
    // Without the nickname endpoint, Canvas's own `name` still carries it.
    expect(result.courses[0]?.nickname).toBe("Bio Nick");
    expect(result.warnings).toEqual([
      "Couldn't read your Canvas course colors (Canvas failed with HTTP 403: unauthorized).",
      "Couldn't read your Canvas course nicknames (Canvas failed with HTTP 500: boom).",
      "Couldn't read assignments for Calculus I (Canvas failed with HTTP 404).",
    ]);
  });

  it("throws on a bad token", async () => {
    const fetch = canvasRoutes({
      [`${BASE}/courses?enrollment_state=active&per_page=100`]: { status: 401, body: { errors: [{ message: "Invalid access token." }] } },
    });
    const error = await syncCanvas(fetch, settings).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).isAuthError).toBe(true);
  });
});

describe("mapCanvasAssignment", () => {
  const course: CanvasCourse = { id: "1", name: "Eng", nickname: null, courseCode: null, color: null, applyGroupWeights: false };

  it("guesses kinds from names and submission types", () => {
    const kind = (raw: Record<string, unknown>) => mapCanvasAssignment({ id: 1, ...raw }, course, new Map())?.kind;
    expect(kind({ name: "Final Exam" })).toBe("exam");
    expect(kind({ name: "Final" })).toBe("exam");
    expect(kind({ name: "Final Paper" })).toBe("assignment");
    expect(kind({ name: "Quiz 3" })).toBe("quiz");
    expect(kind({ name: "Check-in", is_quiz_lti_assignment: true })).toBe("quiz");
    expect(kind({ name: "Midterm review discussion", submission_types: ["discussion_topic"] })).toBe("discussion");
    expect(kind({ name: "Read chapter 2" })).toBe("reading");
  });

  it("skips items without an id", () => {
    expect(mapCanvasAssignment({ name: "x" }, course, new Map())).toBeNull();
    expect(mapCanvasAssignment("junk", course, new Map())).toBeNull();
  });
});
