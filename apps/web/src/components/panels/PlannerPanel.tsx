// Ship · Pwedo Pomo Studio interactive planner: Weekly Plan, Habit Tracker,
// Pomodoro Tracker, and Monthly Calendar, with pastel costume minions.

import { useState } from "react";
import { buildMonthlyReportText, buildObsidianMarkdown, downloadTextFile } from "../../lib/plannerExport.js";
import { DAYS, todayDateKey, usePlanner } from "../../stores/plannerStore.js";
import { useUi } from "../../stores/uiStore.js";
import { useVoyage } from "../../stores/voyageStore.js";
import { IconCalendar } from "../icons.js";
import { PastelMinionBadge } from "../PastelMinionBadge.js";
import { Button, Panel, Tabs, cx } from "../ui.js";

type PlannerTab = "weekly" | "habits" | "pomodoro" | "monthly" | "sync";

const MINION_FOR_TAB: Record<PlannerTab, { costume: "banana" | "teddy" | "bunny" | "frog"; note: string }> = {
  weekly: { costume: "banana", note: "Little by little is a lot over time." },
  habits: { costume: "teddy", note: "Small daily habits build steady voyages." },
  pomodoro: { costume: "bunny", note: "One calm interval at a time!" },
  monthly: { costume: "frog", note: "See the whole horizon for the month." },
  sync: { costume: "banana", note: "Export to Obsidian, Calendar, or your Monthly Report." },
};

export function PlannerPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<PlannerTab>("weekly");
  const lastCheckInDay = usePlanner((s) => s.lastCheckInDay);
  const claimDailyCheckIn = usePlanner((s) => s.claimDailyCheckIn);
  const toast = useUi((s) => s.toast);
  const checkedInToday = lastCheckInDay === todayDateKey();
  const buddy = MINION_FOR_TAB[tab];

  const onCheckIn = () => {
    if (claimDailyCheckIn()) {
      toast("Banana Planna checked in for today!", "info");
    }
  };

  const now = new Date();
  const isStartOfMonth = now.getDate() <= 3;
  const isStartOfWeek = now.getDay() === 0 || now.getDay() === 1;

  return (
    <Panel title="Banana Planna" subtitle="Ship · Pwedo Pomo Studio pastel sheets · plan your weeks, habits, and months" icon={<IconCalendar />} onClose={onClose} wide>
      {(isStartOfMonth || isStartOfWeek) && !checkedInToday && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#FFF9DC] px-4 py-2 text-xs text-ink">
          <span>
            {isStartOfMonth
              ? "New month reminder: fill out your Habit Tracker & Banana Planna!"
              : "New week reminder: plan your Weekly Plan & top goals!"}
          </span>
          <div className="flex gap-3">
            {isStartOfMonth && (
              <button type="button" onClick={() => setTab("habits")} className="hover:underline underline-offset-4">
                Open Habits
              </button>
            )}
            <button type="button" onClick={() => setTab(isStartOfMonth ? "monthly" : "weekly")} className="hover:underline underline-offset-4">
              Open {isStartOfMonth ? "Banana Planna" : "Weekly"}
            </button>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-cream-50/70 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <PastelMinionBadge costume={buddy.costume} size={46} />
          <div>
            <p className="font-serif text-sm tracking-wide text-ink">{buddy.note}</p>
            <p className="text-xs text-ink/60">Your progress saves automatically in this browser.</p>
          </div>
        </div>
        <button
          type="button"
          disabled={checkedInToday}
          onClick={onCheckIn}
          className="bg-transparent px-2 py-1 font-serif text-sm tracking-wide text-[#6D655C] transition hover:underline underline-offset-4 disabled:opacity-50"
        >
          {checkedInToday ? "Checked in today ✓" : "Daily Check-in"}
        </button>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "weekly", label: "Weekly Plan" },
          { id: "habits", label: "Habit Tracker" },
          { id: "pomodoro", label: "Pwedo Pomo" },
          { id: "monthly", label: "Banana Planna" },
          { id: "sync", label: "Obsidian & Report" },
        ]}
      />

      {tab === "weekly" && <WeeklySheet />}
      {tab === "habits" && <HabitSheet />}
      {tab === "pomodoro" && <PomodoroSheet />}
      {tab === "monthly" && <MonthlySheet />}
      {tab === "sync" && <SyncAndReportSheet />}
    </Panel>
  );
}

function WeeklySheet() {
  const weeklyTitle = usePlanner((s) => s.weeklyTitle);
  const weeklyGoal = usePlanner((s) => s.weeklyGoal);
  const weeklyCells = usePlanner((s) => s.weeklyCells);
  const setWeeklyTitle = usePlanner((s) => s.setWeeklyTitle);
  const setWeeklyGoal = usePlanner((s) => s.setWeeklyGoal);
  const setWeeklyCell = usePlanner((s) => s.setWeeklyCell);

  return (
    <div className="rounded-2xl border-2 border-ink/25 bg-[#FFFDF9] p-4 sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-1/3">
          <p className="font-serif text-lg tracking-[0.28em] text-ink/85">Weekly plan :</p>
          <input
            value={weeklyTitle}
            onChange={(e) => setWeeklyTitle(e.target.value)}
            placeholder="Week of..."
            aria-label="Week label"
            className="mt-1 w-full border-b border-ink/40 bg-transparent pb-1 text-sm text-ink placeholder:text-ink/35 focus:border-ink focus:outline-none"
          />
        </div>
        <div className="flex-1 rounded-sm border border-ink/35 bg-white/70 p-2.5">
          <span className="block font-serif text-xs tracking-[0.2em] text-ink/70">GOAL:</span>
          <textarea
            rows={2}
            value={weeklyGoal}
            onChange={(e) => setWeeklyGoal(e.target.value)}
            placeholder="Main focus for this week..."
            aria-label="Weekly goal"
            className="mt-1 w-full resize-none bg-transparent text-sm text-ink placeholder:text-ink/30 focus:outline-none"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[640px] border border-ink/35">
          <div className="grid grid-cols-7 border-b border-ink/35 bg-[#EFECE5]">
            {DAYS.map((d) => (
              <div key={d} className="border-r border-ink/25 py-1.5 text-center font-serif text-xs tracking-[0.25em] text-ink/80 last:border-r-0">
                {d}
              </div>
            ))}
          </div>
          {weeklyCells.map((row, rIdx) => (
            <div key={rIdx} className="grid grid-cols-7 border-b border-dotted border-ink/30 last:border-b-0">
              {row.map((val, cIdx) => (
                <input
                  key={cIdx}
                  value={val}
                  onChange={(e) => setWeeklyCell(rIdx, cIdx, e.target.value)}
                  aria-label={`${DAYS[cIdx]} item ${rIdx + 1}`}
                  className="h-8 border-r border-ink/20 bg-transparent px-2 text-xs text-ink last:border-r-0 focus:bg-[#FFF7C2]/35 focus:outline-none"
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-center font-serif text-[11px] tracking-[0.18em] text-ink/45">Banana Planna • Ship · Pwedo Pomo Studio</p>
    </div>
  );
}

function HabitSheet() {
  const habits = usePlanner((s) => s.habits);
  const setHabitLabel = usePlanner((s) => s.setHabitLabel);
  const toggleHabit = usePlanner((s) => s.toggleHabit);

  return (
    <div className="rounded-2xl border-2 border-ink/25 bg-[#FFFDF9] p-4 sm:p-6">
      <p className="mb-4 font-serif text-lg tracking-[0.28em] text-ink/85">Habit Tracker :</p>
      <div className="overflow-x-auto">
        <div className="min-w-[540px]">
          <div className="mb-2 grid grid-cols-[1fr_repeat(7,44px)] items-end gap-2">
            <div />
            {DAYS.map((d) => (
              <div key={d} className="-rotate-45 pb-2 text-center font-serif text-xs tracking-[0.18em] text-ink/75">
                {d}
              </div>
            ))}
          </div>
          <div className="space-y-3">
            {habits.map((h, rIdx) => (
              <div key={rIdx} className="grid grid-cols-[1fr_repeat(7,44px)] items-center gap-2">
                <input
                  value={h.label}
                  onChange={(e) => setHabitLabel(rIdx, e.target.value)}
                  placeholder={`Habit ${rIdx + 1}...`}
                  aria-label={`Habit ${rIdx + 1}`}
                  className="border-b border-ink/40 bg-transparent py-1 text-sm text-ink placeholder:text-ink/30 focus:border-ink focus:outline-none"
                />
                {h.checks.map((checked, cIdx) => (
                  <button
                    key={cIdx}
                    type="button"
                    onClick={() => toggleHabit(rIdx, cIdx)}
                    aria-label={`${h.label || `Habit ${rIdx + 1}`} ${DAYS[cIdx]}`}
                    aria-pressed={checked}
                    className={cx(
                      "mx-auto grid size-7 place-items-center border border-ink/45 transition",
                      checked ? "bg-[#CBEAD7] text-ink font-bold" : "bg-white hover:bg-[#FAF7F0]",
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
      <p className="mt-4 text-center font-serif text-[11px] tracking-[0.18em] text-ink/45">Ship · Pwedo Pomo Studio</p>
    </div>
  );
}

function PomodoroSheet() {
  const pomodoros = usePlanner((s) => s.pomodoros);
  const updatePomodoro = usePlanner((s) => s.updatePomodoro);
  const togglePomodoroTask = usePlanner((s) => s.togglePomodoroTask);
  const setPomodoroTaskText = usePlanner((s) => s.setPomodoroTaskText);
  const togglePomodoroBox = usePlanner((s) => s.togglePomodoroBox);

  return (
    <div className="space-y-5">
      {pomodoros.map((session, sIdx) => (
        <div key={session.id} className="rounded-2xl border-2 border-ink/25 bg-[#FFFDF9] p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between border-b border-ink/35 pb-1.5">
            <span className="font-serif text-sm tracking-[0.22em] text-ink/85">Task</span>
            <label className="flex items-center gap-1.5 font-serif text-sm tracking-[0.2em] text-ink/85">
              Session
              <input
                value={session.sessionNumber}
                onChange={(e) => updatePomodoro(sIdx, { sessionNumber: e.target.value })}
                aria-label="Session number"
                className="w-10 border-b border-ink/40 bg-transparent text-center text-sm focus:border-ink focus:outline-none"
              />
            </label>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2.5">
              {session.tasks.map((task, tIdx) => (
                <div key={tIdx} className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => togglePomodoroTask(sIdx, tIdx)}
                    aria-label={`Task ${tIdx + 1} done`}
                    aria-pressed={task.done}
                    className={cx(
                      "grid size-6 shrink-0 place-items-center border border-ink/45 transition",
                      task.done ? "bg-[#FFF7C2] text-ink font-bold" : "bg-white",
                    )}
                  >
                    {task.done ? "✓" : ""}
                  </button>
                  <input
                    value={task.text}
                    onChange={(e) => setPomodoroTaskText(sIdx, tIdx, e.target.value)}
                    placeholder={`Task ${tIdx + 1}...`}
                    aria-label={`Task ${tIdx + 1}`}
                    className={cx(
                      "min-w-0 flex-1 border-b border-ink/35 bg-transparent py-0.5 text-sm focus:border-ink focus:outline-none",
                      task.done && "line-through opacity-55",
                    )}
                  />
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="mb-1.5 flex items-center gap-1 font-serif text-xs tracking-[0.16em] text-ink/75">
                    <input
                      value={session.focusMinutes}
                      onChange={(e) => updatePomodoro(sIdx, { focusMinutes: e.target.value })}
                      aria-label="Focus interval minutes"
                      className="w-8 border-b border-ink/40 bg-transparent text-center font-sans text-xs focus:outline-none"
                    />
                    minutes interval
                  </div>
                  <div className="flex gap-2">
                    {session.focusChecks.map((checked, bIdx) => (
                      <button
                        key={bIdx}
                        type="button"
                        onClick={() => togglePomodoroBox(sIdx, "focus", bIdx)}
                        aria-label={`Focus interval ${bIdx + 1}`}
                        aria-pressed={checked}
                        className={cx("grid size-7 place-items-center border border-ink/45", checked ? "bg-[#FFF3A8] font-bold" : "bg-white")}
                      >
                        {checked ? "✓" : ""}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center gap-1 font-serif text-xs tracking-[0.16em] text-ink/75">
                    <input
                      value={session.breakMinutes}
                      onChange={(e) => updatePomodoro(sIdx, { breakMinutes: e.target.value })}
                      aria-label="Break minutes"
                      className="w-8 border-b border-ink/40 bg-transparent text-center font-sans text-xs focus:outline-none"
                    />
                    break
                  </div>
                  <div className="flex gap-2">
                    {session.breakChecks.map((checked, bIdx) => (
                      <button
                        key={bIdx}
                        type="button"
                        onClick={() => togglePomodoroBox(sIdx, "break", bIdx)}
                        aria-label={`Break ${bIdx + 1}`}
                        aria-pressed={checked}
                        className={cx("grid size-7 place-items-center border border-ink/45", checked ? "bg-[#E6DAF8] font-bold" : "bg-white")}
                      >
                        {checked ? "✓" : ""}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border border-ink/35 bg-white/75 p-2.5">
                <span className="block font-serif text-xs tracking-[0.12em] text-ink/70">How can I improve next session:</span>
                <textarea
                  rows={2}
                  value={session.improveNote}
                  onChange={(e) => updatePomodoro(sIdx, { improveNote: e.target.value })}
                  aria-label="How can I improve next session"
                  className="mt-1 w-full resize-none bg-transparent text-sm text-ink focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function MonthlySheet() {
  const monthTitle = usePlanner((s) => s.monthTitle);
  const monthCells = usePlanner((s) => s.monthCells);
  const monthNotes = usePlanner((s) => s.monthNotes);
  const setMonthTitle = usePlanner((s) => s.setMonthTitle);
  const setMonthCell = usePlanner((s) => s.setMonthCell);
  const setMonthNotes = usePlanner((s) => s.setMonthNotes);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDayOffset = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayDate = now.getDate();
  const defaultMonthLabel = now.toLocaleString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="rounded-2xl border-2 border-ink/25 bg-[#FFFDF9] p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <input
          value={monthTitle}
          onChange={(e) => setMonthTitle(e.target.value)}
          placeholder={defaultMonthLabel}
          aria-label="Month title"
          className="w-56 border-b border-ink/45 bg-transparent pb-1 font-serif text-base tracking-[0.2em] text-ink focus:border-ink focus:outline-none"
        />
        <span className="text-xs font-bold text-ink/60">{defaultMonthLabel}</span>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[700px] grid-cols-[repeat(7,1fr)_170px] border border-ink/35">
          {DAYS.map((d) => (
            <div key={d} className="border-r border-b border-ink/25 bg-[#EFECE5] py-1.5 text-center font-serif text-xs tracking-[0.22em] text-ink/80">
              {d}
            </div>
          ))}
          <div className="border-b border-ink/25 bg-[#EFECE5] py-1.5 text-center font-serif text-xs tracking-[0.22em] text-ink/80">notes</div>

          <div className="col-span-7 grid grid-cols-7">
            {monthCells.map((val, idx) => {
              const dayNum = idx - firstDayOffset + 1;
              const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
              const isToday = inMonth && dayNum === todayDate;
              return (
                <div
                  key={idx}
                  className={cx(
                    "border-r border-b border-ink/20 p-1",
                    isToday ? "bg-[#FFF3A8]/45" : inMonth ? "bg-transparent" : "bg-ink/[0.03]",
                  )}
                >
                  <div className="mb-0.5 flex items-center justify-between px-0.5">
                    <span className={cx("text-[11px] font-bold", isToday ? "rounded-full bg-ink px-1.5 text-cream-50" : "text-ink/50")}>
                      {inMonth ? dayNum : ""}
                    </span>
                  </div>
                  <textarea
                    rows={2}
                    value={val}
                    onChange={(e) => setMonthCell(idx, e.target.value)}
                    placeholder={inMonth ? "Add event / task..." : ""}
                    aria-label={inMonth ? `${defaultMonthLabel} ${dayNum}` : `Padding cell ${idx + 1}`}
                    className="w-full resize-none bg-transparent text-xs text-ink placeholder:text-ink/25 focus:outline-none"
                  />
                </div>
              );
            })}
          </div>
          <textarea
            value={monthNotes}
            onChange={(e) => setMonthNotes(e.target.value)}
            placeholder="Monthly reminders, milestones..."
            aria-label="Monthly notes"
            className="h-full resize-none border-b border-ink/20 bg-[#FAF7F0]/60 p-2 text-xs text-ink placeholder:text-ink/35 focus:outline-none"
          />
        </div>
      </div>
      <p className="mt-3 text-center font-serif text-[11px] tracking-[0.18em] text-ink/45">Banana Planna • Ship · Pwedo Pomo Studio</p>
    </div>
  );
}

function SyncAndReportSheet() {
  const toast = useUi((s) => s.toast);
  const [email, setEmail] = useState("");
  const reportText = buildMonthlyReportText();

  const syncToObsidianFolder = async () => {
    const picker = (window as unknown as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
    if (!picker) {
      downloadTextFile("Ship-Planner.md", buildObsidianMarkdown());
      toast("Downloaded Ship-Planner.md so you can drop it into your Obsidian vault!", "info");
      return;
    }
    try {
      const dir = await picker();
      const fileHandle = await dir.getFileHandle("Ship-Planner.md", { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(buildObsidianMarkdown());
      await writable.close();
      toast("Synced Ship-Planner.md straight into your Obsidian vault folder!", "reward");
    } catch {
      toast("Obsidian folder sync cancelled.", "info");
    }
  };

  const emailReport = () => {
    const subject = encodeURIComponent(`Ship Monthly Progress Report (${new Date().toLocaleString("en-US", { month: "long", year: "numeric" })})`);
    const body = encodeURIComponent(reportText);
    const to = encodeURIComponent(email.trim());
    window.open(`mailto:${to}?subject=${subject}&body=${body}`, "_blank");
  };

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 sm:p-6">
      <div className="rounded-xl border border-[var(--border-subtle)] bg-cream-50 p-4">
        <h3 className="font-display text-base font-extrabold">Obsidian Vault Sync</h3>
        <p className="mt-1 text-xs text-ink/70">
          Write your Weekly Plan, Session Tasks (`- [ ]`), Habit Tracker, Monthly Notes, and Break Reflections directly to your local Obsidian vault as Markdown.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={syncToObsidianFolder}>
            Sync to Obsidian Folder
          </Button>
          <Button variant="secondary" size="sm" onClick={() => downloadTextFile("Ship-Planner.md", buildObsidianMarkdown())}>
            Download Ship-Planner.md
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border-subtle)] bg-cream-50 p-4">
        <h3 className="font-display text-base font-extrabold">End-of-Month Progress Report</h3>
        <pre className="mt-2 max-h-44 overflow-auto rounded-lg border border-[var(--border-subtle)] bg-white/80 p-3 font-mono text-xs whitespace-pre-wrap text-ink">
          {reportText}
        </pre>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            aria-label="Email for monthly progress report"
            className="min-w-48 flex-1 rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-1.5 text-sm focus:border-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--page-ink)]"
          />
          <Button variant="primary" size="sm" onClick={emailReport}>
            Email Monthly Report
          </Button>
          <Button variant="secondary" size="sm" onClick={() => downloadTextFile("Ship-Monthly-Report.txt", reportText, "text/plain;charset=utf-8")}>
            Download Report
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-ink/60">
          Tip: Opens your default mail app pre-filled with this month&apos;s report (automated background emails require connecting an SMTP/cloud server).
        </p>
      </div>
    </div>
  );
}
