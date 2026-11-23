// Pure markdown and plain-text export helpers for Banana Planna (extracted from PlannerPanel).

import { DAYS, usePlanner } from "../stores/plannerStore.js";
import { useVoyage } from "../stores/voyageStore.js";

export function buildObsidianMarkdown(): string {
  const p = usePlanner.getState();
  const v = useVoyage.getState();
  const lines: string[] = [
    `# Ship Tiny Planner · ${p.monthTitle || new Date().toLocaleString("en-US", { month: "long", year: "numeric" })}`,
    "",
    `## Weekly Plan (${p.weeklyTitle || "This Week"})`,
    `**Goal:** ${p.weeklyGoal || "None set"}`,
    "",
    ...DAYS.map((day, dIdx) => {
      const items = p.weeklyCells.map((row) => row[dIdx]?.trim()).filter(Boolean);
      return `### ${day}\n${items.length ? items.map((item, i) => `${i + 1}. ${item}`).join("\n") : "- [ ] "}`;
    }),
    "",
    "## Session Tasks",
    ...(v.sessionTasks.length ? v.sessionTasks.map((t) => `- [${t.done ? "x" : " "}] ${t.text}`) : ["- [ ] No tasks added yet"]),
    "",
    "## Habit Tracker",
    ...p.habits.map((h) => {
      const count = h.checks.filter(Boolean).length;
      return `- ${h.label}: ${count}/${h.checks.length} days`;
    }),
    "",
    "## Monthly Notes",
    p.monthNotes || "No notes yet.",
    "",
    "## Recent Break Reflections",
    ...(v.breakReflections.length
      ? v.breakReflections.slice(0, 10).flatMap((r) => [
          `### ${new Date(r.at).toLocaleString()} (Round ${r.cycle})`,
          `- **How was your session?** ${r.howWasSession || "Not recorded"}`,
          `- **What worked / didn't?** ${r.whatWorked || "Not recorded"}`,
          `- **Improve next round:** ${r.nextAdjustment || "Not recorded"}`,
        ])
      : ["- No reflections recorded yet."]),
  ];
  return lines.join("\n");
}

export function buildMonthlyReportText(): string {
  const v = useVoyage.getState();
  const p = usePlanner.getState();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthVoyages = v.records.filter((r) => r.startedAt >= monthStart);
  const totalMinutes = monthVoyages.reduce((acc, r) => acc + r.focusedMinutes, 0);
  const completedCount = monthVoyages.filter((r) => r.completed).length;
  const tasksDone = v.sessionTasks.filter((t) => t.done).length;
  const habitChecks = p.habits.reduce((acc, h) => acc + h.checks.filter(Boolean).length, 0);
  const monthLabel = now.toLocaleString("en-US", { month: "long", year: "numeric" });

  return [
    `Ship Monthly Progress Report · ${monthLabel}`,
    `==========================================`,
    `Focus Minutes Sailed: ${totalMinutes} min`,
    `Completed Voyages: ${completedCount} / ${monthVoyages.length}`,
    `Session Tasks Completed: ${tasksDone} / ${v.sessionTasks.length}`,
    `Habit Check-ins Logged: ${habitChecks}`,
    `Weekly Goal: ${p.weeklyGoal || "None set"}`,
    "",
    "Recent Break Reflections:",
    ...(v.breakReflections.slice(0, 5).map(
      (r) => `• ${r.howWasSession || "Session"} | Worked: ${r.whatWorked || "None"} | Next: ${r.nextAdjustment || "None"}`,
    )),
  ].join("\n");
}

export function downloadTextFile(filename: string, content: string, mime = "text/markdown;charset=utf-8"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
