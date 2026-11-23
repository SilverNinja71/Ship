// End-of-month overall stats popup: centered rounded square with left/right pagination
// across Total Focus Time, Completed Sessions & Cycles, Top #Hashtags, and Habit Streaks.

import { useEffect, useMemo, useState } from "react";
import { useModalBehavior } from "../hooks/useModalBehavior.js";
import { streakDays } from "../lib/voyageLogic.js";
import { currentMonthKey, usePlanner } from "../stores/plannerStore.js";
import { useVoyage } from "../stores/voyageStore.js";
import { PastelMinionBadge } from "./PastelMinionBadge.js";
import { DieCutSticker } from "./StickerArt.js";
import { IconClose } from "./icons.js";

const VIEWS = [
  { id: "focus", label: "Total Focus Time", badge: "banana" as const, tint: "bg-[#FFF8D6]" },
  { id: "sessions", label: "Completed Sessions & Cycles", badge: "bunny" as const, tint: "bg-[#EFE8FA]" },
  { id: "hashtags", label: "Top #Hashtags", badge: "frog" as const, tint: "bg-[#E2F3EC]" },
  { id: "habits", label: "Habit Streaks", badge: "teddy" as const, tint: "bg-[#FCE8EC]" },
] as const;

function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function isEndOfMonth(now = new Date()): boolean {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return tomorrow.getDate() === 1;
}

function monthKeyOfTimestamp(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function MonthlyStatsModal() {
  const open = usePlanner((s) => s.monthlyStatsOpen);
  const targetMonth = usePlanner((s) => s.monthlyStatsTargetMonth);
  const lastMonthlyStatsMonth = usePlanner((s) => s.lastMonthlyStatsMonth);
  const lastActiveMonth = usePlanner((s) => s.lastActiveMonth);
  const openMonthlyStats = usePlanner((s) => s.openMonthlyStats);
  const closeMonthlyStats = usePlanner((s) => s.closeMonthlyStats);
  const markMonthlyStatsSeen = usePlanner((s) => s.markMonthlyStatsSeen);
  const syncActiveMonth = usePlanner((s) => s.syncActiveMonth);

  const records = useVoyage((s) => s.records);
  const cyclesCompleted = useVoyage((s) => s.cyclesCompleted);
  const pomodoros = usePlanner((s) => s.pomodoros);
  const habits = usePlanner((s) => s.habits);
  const weeklyCells = usePlanner((s) => s.weeklyCells);
  const weeklyGoal = usePlanner((s) => s.weeklyGoal);
  const weeklyStickers = usePlanner((s) => s.weeklyStickers);
  const sessionStickers = usePlanner((s) => s.sessionStickers);

  const [page, setPage] = useState(0);
  const modalRef = useModalBehavior(closeMonthlyStats, open);

  // Auto-open at the end of each month or when the month rolls over.
  useEffect(() => {
    const now = new Date();
    const curMonth = currentMonthKey(now);

    if (lastActiveMonth && lastActiveMonth !== curMonth && lastMonthlyStatsMonth !== lastActiveMonth) {
      markMonthlyStatsSeen(lastActiveMonth);
      syncActiveMonth(curMonth);
      openMonthlyStats(lastActiveMonth);
      return;
    }

    if (lastActiveMonth !== curMonth) {
      syncActiveMonth(curMonth);
    }

    if (isEndOfMonth(now) && lastMonthlyStatsMonth !== curMonth) {
      markMonthlyStatsSeen(curMonth);
      openMonthlyStats(curMonth);
    }
  }, [lastActiveMonth, lastMonthlyStatsMonth, markMonthlyStatsSeen, openMonthlyStats, syncActiveMonth]);

  // Reset to first slide whenever opened.
  useEffect(() => {
    if (open) setPage(0);
  }, [open]);

  // Keyboard navigation (ArrowLeft, ArrowRight; Escape handled by useModalBehavior).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setPage((p) => (p - 1 + VIEWS.length) % VIEWS.length);
      else if (e.key === "ArrowRight") setPage((p) => (p + 1) % VIEWS.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const activeMonthKey = targetMonth ?? currentMonthKey();

  const stats = useMemo(() => {
    const monthRecords = records.filter((r) => monthKeyOfTimestamp(r.startedAt) === activeMonthKey);
    const totalMinutes = monthRecords.reduce((sum, r) => sum + r.focusedMinutes, 0);
    const completedVoyages = monthRecords.filter((r) => r.completed).length;
    const totalVoyages = monthRecords.length;
    const uniqueDays = new Set(
      monthRecords.map((r) => {
        const d = new Date(r.startedAt);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      }),
    ).size;
    const avgMinutes = totalVoyages > 0 ? Math.round(totalMinutes / totalVoyages) : 0;

    // Pomodoro tracker counts
    const pomoTasksDone = pomodoros.reduce(
      (sum, s) => sum + s.tasks.filter((t) => t.done && t.text.trim()).length,
      0,
    );
    const pomoFocusBoxes = pomodoros.reduce(
      (sum, s) => sum + s.focusChecks.filter(Boolean).length,
      0,
    );

    // Top #hashtags from voyage objectives, weekly plan, and pomodoro tasks
    const tagCounts = new Map<string, number>();
    const collectTags = (text: string | null | undefined) => {
      if (!text) return;
      const matches = text.match(/#[a-zA-Z0-9_-]+/g);
      if (!matches) return;
      for (const raw of matches) {
        const tag = raw.toLowerCase();
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    };
    for (const r of monthRecords) collectTags(r.objective);
    collectTags(weeklyGoal);
    for (const row of weeklyCells) {
      for (const cell of row) collectTags(cell);
    }
    for (const p of pomodoros) {
      for (const t of p.tasks) collectTags(t.text);
      collectTags(p.improveNote);
    }
    const topHashtags = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Habit streaks & study streak
    const activeHabits = habits
      .filter((h) => h.label.trim().length > 0)
      .map((h) => ({
        label: h.label.trim(),
        doneCount: h.checks.filter(Boolean).length,
      }));
    const totalHabitChecks = activeHabits.reduce((sum, h) => sum + h.doneCount, 0);
    const studyStreak = streakDays(records, Date.now());

    return {
      totalMinutes,
      completedVoyages,
      totalVoyages,
      uniqueDays,
      avgMinutes,
      pomoTasksDone,
      pomoFocusBoxes,
      topHashtags,
      activeHabits,
      totalHabitChecks,
      studyStreak,
    };
  }, [activeMonthKey, habits, pomodoros, records, weeklyCells, weeklyGoal]);

  const recentStickers = useMemo(() => {
    const all = [
      ...Object.values(weeklyStickers ?? {}).flat(),
      ...Object.values(sessionStickers ?? {}).flat(),
    ];
    return [...new Set(all)].slice(0, 6);
  }, [weeklyStickers, sessionStickers]);

  if (!open) return null;

  const view = VIEWS[page]!;
  const prevPage = () => setPage((p) => (p - 1 + VIEWS.length) % VIEWS.length);
  const nextPage = () => setPage((p) => (p + 1) % VIEWS.length);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Monthly Overall Stats"
      onMouseDown={(e) => e.target === e.currentTarget && closeMonthlyStats()}
      className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-[#6D655C]/25 p-4 backdrop-blur-[2px]"
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="modal-enter flex aspect-square w-full max-w-md flex-col justify-between rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-2 text-[var(--page-ink)] shadow-sm outline-none"
      >
        <div className="flex flex-1 flex-col justify-between rounded-[16px] border border-[rgb(0_0_0_/_0.06)] bg-[var(--surface-1)] p-4">
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <PastelMinionBadge costume={view.badge} size={38} />
              <div>
                <p className="font-serif text-[11px] uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                  {formatMonthLabel(activeMonthKey)}
                </p>
                <h2 className="font-display text-base font-extrabold text-[var(--page-ink)]">
                  {view.label}
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={closeMonthlyStats}
              aria-label="Close monthly stats"
              className="grid size-8 place-items-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--muted-ink)] transition hover:bg-[#FFF8D6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
            >
              <IconClose size={14} />
            </button>
          </div>

          {/* Stat Slide Body with edge carousel fade mask */}
          <div className={`carousel-mask my-3 flex flex-1 flex-col items-center justify-center rounded-2xl border border-[var(--border-subtle)] ${view.tint}/65 px-7 py-5 text-center`}>
          {view.id === "focus" && (
            <div className="space-y-3">
              <p className="font-display text-4xl font-extrabold text-[#6D655C]">
                {formatDuration(stats.totalMinutes)}
              </p>
              <p className="text-xs text-[#8E887F]">
                Total focused study time this month
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3 pt-2 text-xs">
                <div className="rounded-xl border border-[#A29C93]/25 bg-[#FFFDF7]/90 px-3 py-2">
                  <div className="font-display text-lg font-bold text-[#6D655C]">
                    {stats.uniqueDays}
                  </div>
                  <div className="text-[11px] text-[#8E887F]">Study days</div>
                </div>
                <div className="rounded-xl border border-[#A29C93]/25 bg-[#FFFDF7]/90 px-3 py-2">
                  <div className="font-display text-lg font-bold text-[#6D655C]">
                    {stats.avgMinutes}m
                  </div>
                  <div className="text-[11px] text-[#8E887F]">Avg per session</div>
                </div>
              </div>
            </div>
          )}

          {view.id === "sessions" && (
            <div className="w-full space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-[#A29C93]/25 bg-[#FFFDF7]/90 p-3">
                  <p className="font-display text-3xl font-extrabold text-[#6D655C]">
                    {stats.completedVoyages}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#8E887F]">
                    Completed Voyages
                  </p>
                </div>
                <div className="rounded-2xl border border-[#A29C93]/25 bg-[#FFFDF7]/90 p-3">
                  <p className="font-display text-3xl font-extrabold text-[#6D655C]">
                    {Math.max(stats.pomoFocusBoxes, cyclesCompleted)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#8E887F]">
                    Pomo Cycles
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-[#A29C93]/25 bg-[#FFFDF7]/80 px-4 py-2.5 text-xs text-[#6B635B]">
                <span className="font-bold text-[#4D453E]">{stats.pomoTasksDone}</span>{" "}
                planner tasks checked off ·{" "}
                <span className="font-bold text-[#4D453E]">
                  {stats.totalVoyages > 0
                    ? `${Math.round((stats.completedVoyages / stats.totalVoyages) * 100)}%`
                    : "0%"}
                </span>{" "}
                completion rate
              </div>
              {recentStickers.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                  {recentStickers.map((stId) => (
                    <DieCutSticker key={stId} id={stId} size={28} />
                  ))}
                </div>
              )}
            </div>
          )}

          {view.id === "hashtags" && (
            <div className="w-full space-y-2.5">
              {stats.topHashtags.length > 0 ? (
                <div className="flex flex-wrap justify-center gap-2">
                  {stats.topHashtags.map(([tag, count]) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#A29C93]/35 bg-[#FFFDF7] px-3.5 py-1.5 text-xs font-bold text-[#6D655C]"
                    >
                      <span>{tag}</span>
                      <span className="rounded-full bg-[#E2F3EC] px-1.5 py-0.5 text-[10px] text-[#5B8575]">
                        ×{count}
                      </span>
                    </span>
                  ))}
                </div>
              ) : (
                <div className="space-y-1.5 px-2">
                  <p className="font-display text-sm font-bold text-[#6D655C]">
                    No #hashtags yet
                  </p>
                  <p className="text-xs text-[#8E887F]">
                    Add tags like <span className="font-semibold">#biology</span> or{" "}
                    <span className="font-semibold">#math</span> in your Pwedo Pomo
                    objective or Weekly Plan to see your top topics here!
                  </p>
                </div>
              )}
            </div>
          )}

          {view.id === "habits" && (
            <div className="w-full space-y-2.5">
              <div className="flex items-center justify-center gap-3">
                <div className="rounded-xl border border-[#A29C93]/25 bg-[#FFFDF7]/90 px-3.5 py-1.5 text-xs">
                  <span className="font-display text-base font-extrabold text-[#6D655C]">
                    {stats.studyStreak}d
                  </span>{" "}
                  <span className="text-[#8E887F]">study streak</span>
                </div>
                <div className="rounded-xl border border-[#A29C93]/25 bg-[#FFFDF7]/90 px-3.5 py-1.5 text-xs">
                  <span className="font-display text-base font-extrabold text-[#6D655C]">
                    {stats.totalHabitChecks}
                  </span>{" "}
                  <span className="text-[#8E887F]">weekly checks</span>
                </div>
              </div>
              <div className="max-h-32 space-y-1.5 overflow-y-auto px-1 text-left">
                {stats.activeHabits.slice(0, 4).map((h) => (
                  <div
                    key={h.label}
                    className="flex items-center justify-between rounded-xl border border-[#A29C93]/20 bg-[#FFFDF7]/85 px-3 py-1.5 text-xs"
                  >
                    <span className="truncate font-medium text-[#6D655C]">{h.label}</span>
                    <span className="ml-2 shrink-0 rounded-full bg-[#FCE8EC] px-2 py-0.5 text-[11px] font-bold text-[#8E887F]">
                      {h.doneCount}/7
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Pagination Footer with Left/Right Arrows */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={prevPage}
            aria-label="Previous stat view"
            className="grid size-9 place-items-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface-2)] text-sm font-bold text-[var(--muted-ink)] transition hover:bg-[#FFF8D6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
          >
            ←
          </button>

          <div className="flex items-center gap-2" aria-label="Stat view pages">
            {VIEWS.map((v, idx) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setPage(idx)}
                aria-label={`View ${v.label}`}
                className={`h-2 rounded-full transition-[width,background-color] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)] ${
                  idx === page
                    ? "w-5 bg-[#8E887F]"
                    : "w-2 bg-[rgb(0_0_0_/_0.18)] hover:bg-[rgb(0_0_0_/_0.32)]"
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={nextPage}
            aria-label="Next stat view"
            className="grid size-9 place-items-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface-2)] text-sm font-bold text-[var(--muted-ink)] transition hover:bg-[#FFF8D6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
          >
            →
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
