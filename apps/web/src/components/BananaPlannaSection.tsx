// Banana Planna: Weekly Plan (1, 2, 3... per day, auto-resets Sunday 12:00 am) & Habit Tracker
// Extracted from StudyMaterialsSection for cleaner separation on the stationery graph grid.

import { useEffect, useState } from "react";
import { localDayKey, planStreak } from "../lib/kanban.js";
import { DAYS, plannedToday, todaysPicks, usePlanner } from "../stores/plannerStore.js";
import { useUi } from "../stores/uiStore.js";
import { PastelMinionBadge } from "./PastelMinionBadge.js";
import { DieCutSticker } from "./StickerArt.js";
import { StickerPickerPopover } from "./StickerPickerPopover.js";
import { IconCalendar } from "./icons.js";
import { cx } from "./ui.js";

const SHEET =
  "rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/92 p-4 text-[var(--page-ink)] sm:p-5";

export function BananaPlannaSection() {
  const openPanel = useUi((s) => s.openPanel);
  const weeklyTitle = usePlanner((s) => s.weeklyTitle);
  const weeklyGoal = usePlanner((s) => s.weeklyGoal);
  const weeklyCells = usePlanner((s) => s.weeklyCells);
  const weeklyStickers = usePlanner((s) => s.weeklyStickers);
  const setWeeklyTitle = usePlanner((s) => s.setWeeklyTitle);
  const setWeeklyGoal = usePlanner((s) => s.setWeeklyGoal);
  const setWeeklyCell = usePlanner((s) => s.setWeeklyCell);
  const toggleWeeklySticker = usePlanner((s) => s.toggleWeeklySticker);
  const checkAndResetWeek = usePlanner((s) => s.checkAndResetWeek);

  const habits = usePlanner((s) => s.habits);
  const setHabitLabel = usePlanner((s) => s.setHabitLabel);
  const toggleHabit = usePlanner((s) => s.toggleHabit);

  const [stickerDay, setStickerDay] = useState<number | null>(null);

  // Auto-reset Weekly Plan when Sunday 12:00 am local time passes.
  useEffect(() => {
    checkAndResetWeek();
    const id = window.setInterval(() => {
      checkAndResetWeek();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [checkAndResetWeek]);

  // grid-cols-1 lets the column shrink to the screen, so on phones the week grid scrolls inside
  // its card instead of making the whole page scroll sideways.
  return (
    <div className="grid grid-cols-1 gap-8 border-t border-[var(--border-subtle)] pt-8 lg:grid-cols-[1.35fr_1fr]">
      {/* Weekly Plan */}
      <div className={SHEET}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="grid size-10 place-items-center rounded-xl border border-[var(--border-subtle)] bg-[#FFF8D6]">
              <PastelMinionBadge costume="banana" size={34} />
            </div>
            <h3 className="font-serif text-lg tracking-[0.18em] text-[var(--page-ink)]">
              Weekly Plan
            </h3>
          </div>
          <button
            type="button"
            onClick={() => openPanel("planner")}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1 text-xs font-bold text-[var(--page-ink)] transition-[background-color] duration-150 hover:bg-[#FFF8D6] hover:text-[#4D453E] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
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
            className="min-w-0 flex-1 border-b border-[var(--border-subtle)] bg-transparent pb-1 text-sm text-[var(--page-ink)] placeholder:text-[var(--muted-ink)] focus:border-[var(--page-ink)] focus:outline-none"
          />
        </div>

        <div className="overflow-x-auto">
          <div className="grid min-w-[540px] grid-cols-7 border border-[var(--border-subtle)]">
            {DAYS.map((d, cIdx) => {
              const dayStickers = weeklyStickers?.[cIdx] ?? [];
              return (
              <div
                key={d}
                className="flex flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-1)] last:border-r-0"
              >
                <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-2)] py-1 text-center font-serif text-[11px] tracking-[0.18em] text-[var(--muted-ink)]">
                  {d}
                </div>
                <div className="flex flex-col divide-y divide-[var(--border-subtle)]">
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
                <div className="mt-auto flex min-h-8 flex-wrap items-center justify-center gap-1 border-t border-[var(--border-subtle)] bg-[var(--surface-2)]/60 px-1 py-1">
                  {dayStickers.map((stId) => (
                    <DieCutSticker key={stId} id={stId} size={20} />
                  ))}
                  <button
                    type="button"
                    onClick={() => setStickerDay((cur) => (cur === cIdx ? null : cIdx))}
                    aria-label={`Add sticker to ${d}`}
                    aria-expanded={stickerDay === cIdx}
                    className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-1)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted-ink)] transition-[color,background-color] duration-150 hover:bg-[#FFF8D6] hover:text-[#4D453E] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--page-ink)]"
                  >
                    + Sticker
                  </button>
                </div>
              </div>
            );})}
          </div>
        </div>

        {stickerDay !== null && (
          <div className="relative mt-2 flex items-center justify-between border-t border-[var(--border-subtle)] pt-2 text-xs text-[var(--muted-ink)]">
            <span>
              Stamping <strong className="uppercase text-[var(--page-ink)]">{DAYS[stickerDay]}</strong> sticker
            </span>
            <StickerPickerPopover
              selected={weeklyStickers?.[stickerDay] ?? []}
              onToggle={(id) => toggleWeeklySticker(stickerDay, id)}
              onClose={() => setStickerDay(null)}
            />
          </div>
        )}
      </div>

      {/* Habit Tracker */}
      <div className={SHEET}>
        <div className="mb-4 flex items-center gap-2.5">
          <div className="grid size-10 place-items-center rounded-xl border border-[var(--border-subtle)] bg-[#FCE8EC]">
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
                    "grid size-5 place-items-center rounded-md border border-[var(--border-subtle)] text-[10px] transition-[background-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--page-ink)]",
                    checked
                      ? "bg-[#E2F3EC] font-bold text-[#386657]"
                      : "bg-[var(--surface-2)] hover:bg-[#FFF8D6]/60",
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

/** The 10-minute daily plan, front and centre until today is planned. */
export function DailyPlanBanner({ onOpen }: { onOpen: () => void }) {
  const today = localDayKey();
  const done = usePlanner((s) => plannedToday(s, today));
  const plannedDays = usePlanner((s) => s.plannedDays);
  const kanban = usePlanner((s) => s.kanban);
  const picks = todaysPicks({ picks: usePlanner((s) => s.picks), picksDay: usePlanner((s) => s.picksDay) }, today);
  const streak = planStreak(plannedDays, today);
  const count = (col: string) => kanban.filter((c) => c.column === col).length;
  const top = picks.map((id) => kanban.find((c) => c.id === id)).filter((c) => c !== undefined);

  return (
    <div
      className={cx(
        "flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border px-4 py-3.5",
        done ? "border-[#C7E6D5] bg-[#F1FAF5]" : "border-[#F1E3A0] bg-[#FFF9DC]",
      )}
    >
      <PastelMinionBadge costume="banana" size={44} />
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg text-[#4B3A0B]">{done ? "Today is planned ✓" : "Take 10 minutes to plan today"}</p>
        <p className="text-sm text-[#6B5E45]">
          {done
            ? top.length
              ? `Top picks: ${top.map((c) => c.text).join(" · ")}`
              : "Your plan is set. Sail it one Pwedo Pomo at a time."
            : "Check what's due, empty your head onto the Kanban board, pick your top 3 and plan your Pwedo Pomos."}
        </p>
        <p className="mt-0.5 text-xs text-[#8A7B5C]">
          {streak > 0 ? `🍌 ${streak}-day planning streak · ` : ""}Kanban: {count("todo")} to do · {count("doing")} doing · {count("done")} done
        </p>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className={cx(
          "rounded-full px-4 py-2 font-serif text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]",
          done ? "border border-[#C7E6D5] bg-white text-[#2F6B55] hover:bg-[#E9F6EF]" : "bg-[#FFE27A] text-[#4B3A0B] shadow-[0_3px_0_#E0B93E] hover:bg-[#FFD95A]",
        )}
      >
        {done ? "Open the board" : "Plan now · 10 min"}
      </button>
    </div>
  );
}
