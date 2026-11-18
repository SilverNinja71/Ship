// Banana Planna: Weekly Plan (1, 2, 3... per day, auto-resets Sunday 12:00 am) & Habit Tracker
// Extracted from StudyMaterialsSection for cleaner separation.

import { useEffect } from "react";
import { DAYS, usePlanner } from "../stores/plannerStore.js";
import { useUi } from "../stores/uiStore.js";
import { PastelMinionBadge } from "./PastelMinionBadge.js";
import { IconCalendar } from "./icons.js";
import { cx } from "./ui.js";

const CARD =
  "rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5 text-[var(--page-ink)] shadow-sm sm:p-6";

export function BananaPlannaSection() {
  const openPanel = useUi((s) => s.openPanel);
  const weeklyTitle = usePlanner((s) => s.weeklyTitle);
  const weeklyGoal = usePlanner((s) => s.weeklyGoal);
  const weeklyCells = usePlanner((s) => s.weeklyCells);
  const setWeeklyTitle = usePlanner((s) => s.setWeeklyTitle);
  const setWeeklyGoal = usePlanner((s) => s.setWeeklyGoal);
  const setWeeklyCell = usePlanner((s) => s.setWeeklyCell);
  const checkAndResetWeek = usePlanner((s) => s.checkAndResetWeek);

  const habits = usePlanner((s) => s.habits);
  const setHabitLabel = usePlanner((s) => s.setHabitLabel);
  const toggleHabit = usePlanner((s) => s.toggleHabit);

  // Auto-reset Weekly Plan when Sunday 12:00 am local time passes.
  useEffect(() => {
    checkAndResetWeek();
    const id = window.setInterval(() => {
      checkAndResetWeek();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [checkAndResetWeek]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
      {/* Weekly Plan */}
      <div className={CARD}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="grid size-10 place-items-center rounded-xl border border-[rgb(0_0_0_/_0.08)] bg-[#FFF8D6]/80">
              <PastelMinionBadge costume="banana" size={34} />
            </div>
            <h3 className="font-serif text-lg tracking-[0.18em] text-[var(--page-ink)]">
              Weekly Plan
            </h3>
          </div>
          <button
            type="button"
            onClick={() => openPanel("planner")}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-1 text-xs font-bold text-[var(--muted-ink)] transition hover:bg-[var(--surface-2)] hover:text-[var(--page-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
          >
            <IconCalendar size={14} /> Full Banana Planna
          </button>
        </div>

        <div className="mb-3 flex flex-col gap-2.5 sm:flex-row sm:items-end">
          <input
            value={weeklyTitle}
            onChange={(e) => setWeeklyTitle(e.target.value)}
            placeholder="Week of..."
            aria-label="Week label"
            className="border-b border-[var(--border-subtle)] bg-transparent pb-1 text-sm text-[var(--page-ink)] placeholder:text-[var(--muted-ink)] focus:border-[var(--page-ink)] focus:outline-none sm:w-40"
          />
          <input
            value={weeklyGoal}
            onChange={(e) => setWeeklyGoal(e.target.value)}
            placeholder="Weekly goal..."
            aria-label="Weekly goal"
            className="min-w-0 flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-1.5 text-sm text-[var(--page-ink)] placeholder:text-[var(--muted-ink)] focus:border-[var(--page-ink)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--page-ink)]"
          />
        </div>

        <div className="overflow-x-auto">
          <div className="grid min-w-[540px] grid-cols-7 overflow-hidden rounded-xl border border-[var(--border-subtle)]">
            {DAYS.map((d, cIdx) => (
              <div
                key={d}
                className="flex flex-col border-r border-[rgb(0_0_0_/_0.08)] bg-[var(--surface-1)] last:border-r-0"
              >
                <div className="border-b border-[rgb(0_0_0_/_0.08)] bg-[var(--surface-2)] py-1 text-center font-serif text-[11px] tracking-[0.18em] text-[var(--muted-ink)]">
                  {d}
                </div>
                <div className="flex flex-col divide-y divide-[rgb(0_0_0_/_0.06)]">
                  {[0, 1, 2, 3].map((rIdx) => (
                    <div key={rIdx} className="flex items-center gap-1 px-1.5 py-1">
                      <span className="select-none text-[10px] font-semibold text-[var(--muted-ink)]">
                        {rIdx + 1}.
                      </span>
                      <input
                        value={weeklyCells[rIdx]?.[cIdx] ?? ""}
                        onChange={(e) => setWeeklyCell(rIdx, cIdx, e.target.value)}
                        aria-label={`${d} item ${rIdx + 1}`}
                        className="min-w-0 flex-1 bg-transparent text-xs text-[var(--page-ink)] focus:bg-[var(--surface-2)] focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Habit Tracker */}
      <div className={CARD}>
        <div className="mb-4 flex items-center gap-2.5">
          <div className="grid size-10 place-items-center rounded-xl border border-[rgb(0_0_0_/_0.08)] bg-[#FCE8EC]/70">
            <PastelMinionBadge costume="teddy" size={34} />
          </div>
          <h3 className="font-serif text-lg tracking-[0.18em] text-[var(--page-ink)]">
            Habit Tracker
          </h3>
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_repeat(7,22px)] items-center gap-1 pb-1 text-center font-serif text-[10px] tracking-wider text-[var(--muted-ink)]">
            <span className="text-left">HABIT</span>
            {DAYS.map((d) => (
              <span key={d}>{d.slice(0, 1).toUpperCase()}</span>
            ))}
          </div>

          {habits.slice(0, 6).map((h, rIdx) => (
            <div
              key={rIdx}
              className="grid grid-cols-[1fr_repeat(7,22px)] items-center gap-1"
            >
              <input
                value={h.label}
                onChange={(e) => setHabitLabel(rIdx, e.target.value)}
                placeholder={`Habit ${rIdx + 1}...`}
                aria-label={`Habit ${rIdx + 1}`}
                className="min-w-0 border-b border-[var(--border-subtle)] bg-transparent py-0.5 text-xs text-[var(--page-ink)] placeholder:text-[var(--muted-ink)] focus:border-[var(--page-ink)] focus:outline-none"
              />
              {h.checks.map((checked, cIdx) => (
                <button
                  key={cIdx}
                  type="button"
                  onClick={() => toggleHabit(rIdx, cIdx)}
                  aria-label={`${h.label || `Habit ${rIdx + 1}`} ${DAYS[cIdx]}`}
                  aria-pressed={checked}
                  className={cx(
                    "grid size-5 place-items-center rounded-md border border-[var(--border-subtle)] text-[10px] transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--page-ink)]",
                    checked
                      ? "bg-[#E2F3EC] font-bold text-[#386657]"
                      : "bg-[var(--surface-1)] hover:bg-[var(--surface-2)]",
                  )}
                >
                  {checked ? "✓" : ""}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
