// Scrollable Mr. Tiny Studio workspace below the main scene:
// 1. Interactive Pomodoro Tracker task form (wired to usePlanner)
// 2. Active Recall Study Sheets quick-launch & file upload (wired to useFleet & useRecall)
// 3. Banana Planna: Weekly Plan & Habit Tracker (wired to usePlanner)

import { useRef, useState } from "react";
import { useFleet } from "../stores/fleetStore.js";
import { DAYS, usePlanner } from "../stores/plannerStore.js";
import { dueNow, useRecall } from "../stores/recallStore.js";
import { useUi } from "../stores/uiStore.js";
import { useVoyage } from "../stores/voyageStore.js";
import { useNow } from "./Hud.js";
import { PastelMinionBadge } from "./PastelMinionBadge.js";
import { IconCalendar, IconCards, IconLog } from "./icons.js";
import { cx, readFile } from "./ui.js";

const CARD =
  "rounded-3xl border border-[#A29C93]/60 bg-[#FFFDF7] p-5 text-[#6D655C] shadow-[3px_3px_0_#EAE5DA] sm:p-6";

export function StudyMaterialsSection() {
  return (
    <section
      id="study-materials"
      aria-label="Study materials and Pomodoro task form"
      className="relative z-10 border-t border-[#A29C93]/25 bg-[#FAF6E8] px-4 py-10 text-[#6D655C] sm:px-8 sm:py-14"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-extrabold text-[#6D655C]">
              Pwedo Pomo &amp; Study Materials
            </h2>
          </div>
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="rounded-full border border-[#A29C93]/60 bg-[#FFFDF7] px-3.5 py-1.5 text-xs font-bold text-[#6D655C] shadow-[3px_3px_0_#EAE5DA] transition hover:bg-[#FFF3A8]/60 focus:outline-none"
          >
            Back to scene ↑
          </a>
        </div>

        {/* 1. Interactive Pomodoro Tracker Task Form */}
        <PomodoroTrackerSection />

        {/* 2. Active Recall Study Sheets Quick-Launch & Upload */}
        <StudySheetsSection />

        {/* 3. Banana Planna: Weekly Plan & Habit Tracker */}
        <BananaPlannaSection />
      </div>
    </section>
  );
}

function PomodoroTrackerSection() {
  const pomodoros = usePlanner((s) => s.pomodoros);
  const updatePomodoro = usePlanner((s) => s.updatePomodoro);
  const togglePomodoroTask = usePlanner((s) => s.togglePomodoroTask);
  const setPomodoroTaskText = usePlanner((s) => s.setPomodoroTaskText);
  const togglePomodoroBox = usePlanner((s) => s.togglePomodoroBox);
  const phase = useVoyage((s) => s.phase);

  return (
    <div className={CARD}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <PastelMinionBadge costume="bunny" size={40} />
          <div>
            <h3 className="font-serif text-lg tracking-[0.18em] text-[#6D655C]">
              Pomodoro Tracker
            </h3>
            <p className="text-xs text-[#8E887F]">
              {phase === "docked"
                ? "Jot down your tasks and fill this out while Pwedo Pomo runs."
                : "Pwedo Pomo is active — check off tasks and boxes as you go."}
            </p>
          </div>
        </div>
        <span className="rounded-full bg-[#FFF3A8] px-3 py-1 text-xs font-bold text-[#6D655C]">
          Auto-saved
        </span>
      </div>

      <div className="space-y-5">
        {pomodoros.map((session, sIdx) => (
          <div
            key={session.id}
            className="rounded-2xl border border-[#A29C93]/40 bg-[#FFFDF7] p-4 sm:p-5"
          >
            <div className="mb-4 flex items-center gap-2 border-b border-[#A29C93]/25 pb-2.5">
              <span className="font-serif text-sm tracking-[0.2em] text-[#6D655C]">
                Session #
              </span>
              <input
                value={session.sessionNumber}
                onChange={(e) => updatePomodoro(sIdx, { sessionNumber: e.target.value })}
                aria-label={`Session ${sIdx + 1} number`}
                className="w-14 border-b border-[#A29C93]/45 bg-transparent text-center font-display text-sm font-bold text-[#6D655C] focus:border-[#6D655C] focus:outline-none"
              />
            </div>

            <div className="grid gap-6 md:grid-cols-[1.15fr_1fr]">
              {/* Task checkboxes + textboxes */}
              <div className="space-y-2.5">
                <p className="font-serif text-xs tracking-[0.18em] text-[#8E887F]">
                  TASKS
                </p>
                {session.tasks.map((task, tIdx) => (
                  <div key={tIdx} className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => togglePomodoroTask(sIdx, tIdx)}
                      aria-label={`Toggle session ${sIdx + 1} task ${tIdx + 1}`}
                      aria-pressed={task.done}
                      className={cx(
                        "grid size-5 shrink-0 place-items-center rounded-md border border-[#A29C93]/55 text-xs transition",
                        task.done
                          ? "bg-[#E2F3EC] font-bold text-[#457263]"
                          : "bg-white hover:bg-[#FAF6E8]",
                      )}
                    >
                      {task.done ? "✓" : ""}
                    </button>
                    <input
                      value={task.text}
                      onChange={(e) => setPomodoroTaskText(sIdx, tIdx, e.target.value)}
                      placeholder={`Task ${tIdx + 1}...`}
                      aria-label={`Session ${sIdx + 1} task ${tIdx + 1}`}
                      className={cx(
                        "min-w-0 flex-1 border-b border-[#A29C93]/35 bg-transparent py-0.5 text-sm text-[#6D655C] placeholder:text-[#B8B0A4] focus:border-[#6D655C] focus:outline-none",
                        task.done && "line-through opacity-55",
                      )}
                    />
                  </div>
                ))}
              </div>

              {/* Focus/Break boxes + How can I improve next session */}
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="mb-1.5 flex items-center gap-1 font-serif text-xs tracking-[0.14em] text-[#8E887F]">
                      <input
                        value={session.focusMinutes}
                        onChange={(e) => updatePomodoro(sIdx, { focusMinutes: e.target.value })}
                        aria-label={`Session ${sIdx + 1} focus minutes`}
                        className="w-8 border-b border-[#A29C93]/45 bg-transparent text-center font-sans text-xs font-bold text-[#6D655C] focus:outline-none"
                      />
                      <span>min focus</span>
                    </div>
                    <div className="flex gap-2">
                      {session.focusChecks.map((checked, bIdx) => (
                        <button
                          key={bIdx}
                          type="button"
                          onClick={() => togglePomodoroBox(sIdx, "focus", bIdx)}
                          aria-label={`Session ${sIdx + 1} focus interval ${bIdx + 1}`}
                          aria-pressed={checked}
                          className={cx(
                            "grid size-7 place-items-center rounded-lg border border-[#A29C93]/50 text-xs transition",
                            checked ? "bg-[#FFF3A8] font-bold text-[#5D564E]" : "bg-white hover:bg-[#FAF6E8]",
                          )}
                        >
                          {checked ? "✓" : ""}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center gap-1 font-serif text-xs tracking-[0.14em] text-[#8E887F]">
                      <input
                        value={session.breakMinutes}
                        onChange={(e) => updatePomodoro(sIdx, { breakMinutes: e.target.value })}
                        aria-label={`Session ${sIdx + 1} break minutes`}
                        className="w-8 border-b border-[#A29C93]/45 bg-transparent text-center font-sans text-xs font-bold text-[#6D655C] focus:outline-none"
                      />
                      <span>min break</span>
                    </div>
                    <div className="flex gap-2">
                      {session.breakChecks.map((checked, bIdx) => (
                        <button
                          key={bIdx}
                          type="button"
                          onClick={() => togglePomodoroBox(sIdx, "break", bIdx)}
                          aria-label={`Session ${sIdx + 1} break ${bIdx + 1}`}
                          aria-pressed={checked}
                          className={cx(
                            "grid size-7 place-items-center rounded-lg border border-[#A29C93]/50 text-xs transition",
                            checked ? "bg-[#E6DAF8] font-bold text-[#5D564E]" : "bg-white hover:bg-[#FAF6E8]",
                          )}
                        >
                          {checked ? "✓" : ""}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-[#A29C93]/35 bg-white/80 p-3">
                  <span className="block font-serif text-xs tracking-[0.1em] text-[#8E887F]">
                    How can I improve next session:
                  </span>
                  <textarea
                    rows={2}
                    value={session.improveNote}
                    onChange={(e) => updatePomodoro(sIdx, { improveNote: e.target.value })}
                    placeholder="Write a quick reflection..."
                    aria-label={`Session ${sIdx + 1} how can I improve next session`}
                    className="mt-1 w-full resize-none bg-transparent text-sm text-[#6D655C] placeholder:text-[#B8B0A4] focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StudySheetsSection() {
  const openPanel = useUi((s) => s.openPanel);
  const toast = useUi((s) => s.toast);
  const notes = useFleet((s) => s.notes);
  const importFiles = useFleet((s) => s.importFiles);
  const cards = useRecall((s) => s.cards);
  const now = useNow(30_000);
  const due = dueNow(cards, now).length;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const parsed = await Promise.all([...files].map(readFile));
      const summary = await importFiles(parsed);
      toast(
        `Uploaded ${summary.notes} study sheet(s) & ${summary.cards} flashcard(s).`,
        "info",
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void onFiles(e.dataTransfer.files);
      }}
      className={cx(CARD, dragging && "ring-2 ring-[#8E887F] bg-[#FFFDF7]")}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <PastelMinionBadge costume="frog" size={40} />
          <div>
            <h3 className="font-serif text-lg tracking-[0.18em] text-[#6D655C]">
              Active Recall Study Sheets
            </h3>
            <p className="text-xs text-[#8E887F]">
              Drag &amp; drop files here or click Upload, then practice blurting or flashcards.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp,.heic,.heif,.parchment,.json,.csv,.tsv,.txt,.md,.ics"
            className="hidden"
            onChange={(e) => void onFiles(e.target.files)}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="rounded-full border border-[#A29C93]/50 bg-[#FFF3A8] px-3.5 py-1.5 text-xs font-extrabold text-[#5D564E] transition hover:bg-[#FCEB8B] disabled:opacity-50"
          >
            {uploading ? "Uploading..." : "Upload"}
          </button>
          <button
            type="button"
            onClick={() => openPanel("log")}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#A29C93]/45 bg-[#FFFDF7] px-3.5 py-1.5 text-xs font-bold text-[#6D655C] transition hover:bg-[#FAF6E8]"
          >
            <IconLog size={14} /> Open Study Sheets
          </button>
          <button
            type="button"
            onClick={() => openPanel("flashcards")}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#A29C93]/45 bg-[#E6DAF8]/70 px-3.5 py-1.5 text-xs font-bold text-[#5D564E] transition hover:bg-[#E6DAF8]"
          >
            <IconCards size={14} /> Flashcards{due > 0 ? ` (${due} due)` : ""}
          </button>
        </div>
      </div>

      {notes.length > 0 ? (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {notes.slice(0, 6).map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => openPanel("log")}
              className="flex flex-col items-start rounded-2xl border border-[#A29C93]/35 bg-[#FFFDF7] p-3 text-left transition hover:bg-[#FAF6E8]"
            >
              <span className="w-full truncate font-display text-sm font-bold text-[#6D655C]">
                {n.title}
              </span>
              <span className="mt-0.5 text-[11px] text-[#8E887F]">
                {n.pages.length} {n.pages.length === 1 ? "page" : "pages"} · Click to practice recall
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[#A29C93]/45 bg-[#FFFDF7]/60 px-4 py-5 text-center text-xs text-[#8E887F]">
          No study sheets uploaded yet. Drop in a PDF, DOCX, Markdown, or image above to start active recall.
        </div>
      )}
    </div>
  );
}

function BananaPlannaSection() {
  const openPanel = useUi((s) => s.openPanel);
  const weeklyTitle = usePlanner((s) => s.weeklyTitle);
  const weeklyGoal = usePlanner((s) => s.weeklyGoal);
  const weeklyCells = usePlanner((s) => s.weeklyCells);
  const setWeeklyTitle = usePlanner((s) => s.setWeeklyTitle);
  const setWeeklyGoal = usePlanner((s) => s.setWeeklyGoal);
  const setWeeklyCell = usePlanner((s) => s.setWeeklyCell);

  const habits = usePlanner((s) => s.habits);
  const setHabitLabel = usePlanner((s) => s.setHabitLabel);
  const toggleHabit = usePlanner((s) => s.toggleHabit);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
      {/* Weekly Plan */}
      <div className={CARD}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <PastelMinionBadge costume="banana" size={36} />
            <h3 className="font-serif text-lg tracking-[0.18em] text-[#6D655C]">
              Weekly Plan
            </h3>
          </div>
          <button
            type="button"
            onClick={() => openPanel("planner")}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#A29C93]/45 bg-[#FFFDF7] px-3 py-1 text-xs font-bold text-[#6D655C] transition hover:bg-[#FAF6E8]"
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
            className="border-b border-[#A29C93]/45 bg-transparent pb-1 text-sm text-[#6D655C] placeholder:text-[#B8B0A4] focus:border-[#6D655C] focus:outline-none sm:w-40"
          />
          <input
            value={weeklyGoal}
            onChange={(e) => setWeeklyGoal(e.target.value)}
            placeholder="Weekly goal..."
            aria-label="Weekly goal"
            className="min-w-0 flex-1 rounded-xl border border-[#A29C93]/35 bg-white/80 px-3 py-1.5 text-sm text-[#6D655C] placeholder:text-[#B8B0A4] focus:border-[#6D655C] focus:outline-none"
          />
        </div>

        <div className="overflow-x-auto">
          <div className="grid min-w-[540px] grid-cols-7 overflow-hidden rounded-xl border border-[#A29C93]/35">
            {DAYS.map((d) => (
              <div
                key={d}
                className="border-r border-b border-[#A29C93]/25 bg-[#EFECE5] py-1 text-center font-serif text-[11px] tracking-[0.18em] text-[#6D655C] last:border-r-0"
              >
                {d}
              </div>
            ))}
            {weeklyCells.slice(0, 4).map((row, rIdx) =>
              row.map((cell, cIdx) => (
                <input
                  key={`${rIdx}-${cIdx}`}
                  value={cell}
                  onChange={(e) => setWeeklyCell(rIdx, cIdx, e.target.value)}
                  aria-label={`${DAYS[cIdx]} item ${rIdx + 1}`}
                  className="border-r border-b border-[#A29C93]/20 bg-white/75 px-1.5 py-1.5 text-xs text-[#6D655C] focus:bg-[#FFFDF5] focus:outline-none last:border-r-0"
                />
              )),
            )}
          </div>
        </div>
      </div>

      {/* Habit Tracker */}
      <div className={CARD}>
        <div className="mb-4 flex items-center gap-2.5">
          <PastelMinionBadge costume="teddy" size={36} />
          <h3 className="font-serif text-lg tracking-[0.18em] text-[#6D655C]">
            Habit Tracker
          </h3>
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_repeat(7,22px)] items-center gap-1 pb-1 text-center font-serif text-[10px] tracking-wider text-[#8E887F]">
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
                className="min-w-0 border-b border-[#A29C93]/30 bg-transparent py-0.5 text-xs text-[#6D655C] placeholder:text-[#B8B0A4] focus:border-[#6D655C] focus:outline-none"
              />
              {h.checks.map((checked, cIdx) => (
                <button
                  key={cIdx}
                  type="button"
                  onClick={() => toggleHabit(rIdx, cIdx)}
                  aria-label={`${h.label || `Habit ${rIdx + 1}`} ${DAYS[cIdx]}`}
                  aria-pressed={checked}
                  className={cx(
                    "grid size-5 place-items-center rounded-md border border-[#A29C93]/45 text-[10px] transition",
                    checked
                      ? "bg-[#E2F3EC] font-bold text-[#457263]"
                      : "bg-white hover:bg-[#FAF6E8]",
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
