// Scrollable Mr. Tiny Studio workspace below the main scene:
// 1. Interactive Pomodoro Tracker task form (wired to usePlanner)
// 2. Active Recall Study Sheets quick-launch & file upload (wired to useFleet & useRecall)
// 3. Banana Planna: Weekly Plan & Habit Tracker (wired to usePlanner)

import { useEffect, useRef, useState } from "react";
import { useFleet } from "../stores/fleetStore.js";
import { usePlanner } from "../stores/plannerStore.js";
import { dueNow, useRecall } from "../stores/recallStore.js";
import { useUi } from "../stores/uiStore.js";
import { useVoyage } from "../stores/voyageStore.js";
import { BananaPlannaSection } from "./BananaPlannaSection.js";
import { useNow } from "./Hud.js";
import { PastelMinionBadge } from "./PastelMinionBadge.js";
import { IconCards, IconLog } from "./icons.js";
import { cx, readFile } from "./ui.js";

const CARD =
  "rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5 text-[var(--page-ink)] shadow-sm sm:p-6";

export function StudyMaterialsSection() {
  const openMonthlyStats = usePlanner((s) => s.openMonthlyStats);

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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openMonthlyStats()}
              className="rounded-full border border-[#A29C93]/45 bg-[#FFF8D6] px-3.5 py-1.5 text-xs font-bold text-[#8E887F] shadow-[2px_2px_0_#EAE5DA] transition hover:bg-[#FFF3A8]/70 focus:outline-none"
            >
              Monthly Stats
            </button>
            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="rounded-full border border-[#A29C93]/55 bg-[#FFFDF7] px-3.5 py-1.5 text-xs font-bold text-[#8E887F] shadow-[2px_2px_0_#EAE5DA] transition hover:bg-[#FFF8D6] focus:outline-none"
            >
              Back to scene ↑
            </a>
          </div>
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
  const cyclesCompleted = useVoyage((s) => s.cyclesCompleted);

  const [focusedSessionIdx, setFocusedSessionIdx] = useState<number | null>(null);

  // Auto-fill focus & break checkboxes for the active session as Pwedo Pomo cycles complete.
  useEffect(() => {
    if (cyclesCompleted <= 0) return;
    const targetIdx = focusedSessionIdx ?? 0;
    const session = pomodoros[targetIdx];
    if (!session) return;

    const focusTarget = Math.min(cyclesCompleted, session.focusChecks.length);
    const breakTarget = Math.min(
      phase === "shore-leave" ? Math.max(0, cyclesCompleted - 1) : cyclesCompleted,
      session.breakChecks.length,
    );

    const needsFocus = session.focusChecks.some((checked, i) => i < focusTarget && !checked);
    const needsBreak = session.breakChecks.some((checked, i) => i < breakTarget && !checked);
    if (!needsFocus && !needsBreak) return;

    updatePomodoro(targetIdx, {
      ...(needsFocus
        ? {
            focusChecks: session.focusChecks.map((checked, i) =>
              i < focusTarget ? true : checked,
            ),
          }
        : {}),
      ...(needsBreak
        ? {
            breakChecks: session.breakChecks.map((checked, i) =>
              i < breakTarget ? true : checked,
            ),
          }
        : {}),
    });
  }, [cyclesCompleted, phase, focusedSessionIdx, pomodoros, updatePomodoro]);

  const visibleSessions =
    focusedSessionIdx !== null && pomodoros[focusedSessionIdx]
      ? [{ session: pomodoros[focusedSessionIdx]!, sIdx: focusedSessionIdx }]
      : pomodoros.map((session, sIdx) => ({ session, sIdx }));

  return (
    <div className={CARD}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl border border-[#A29C93]/30 bg-[#E6F2FA]/75">
            <PastelMinionBadge costume="pwedo" size={38} />
          </div>
          <div>
            <h3 className="font-serif text-lg tracking-[0.18em] text-[#6D655C]">
              Pomodoro Tracker
            </h3>
            <p className="text-xs text-[var(--muted-ink)]">
              {phase === "docked"
                ? "Jot down your tasks and press Enter to focus on one session."
                : "Pwedo Pomo is active · focus & break boxes auto-fill as cycles complete."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {focusedSessionIdx !== null && (
            <button
              type="button"
              onClick={() => setFocusedSessionIdx(null)}
              className="rounded-full border border-[#A29C93]/35 bg-[#FAF6E8] px-3 py-1 text-xs font-semibold text-[#8E887F] transition hover:bg-[#FFF8D6]"
            >
              Show all sessions
            </button>
          )}
          <span className="rounded-full border border-[#EAE2C8] bg-[#FFF8D6] px-3 py-1 text-xs font-semibold text-[#8E887F]">
            Auto-saved
          </span>
        </div>
      </div>

      <div className="space-y-5">
        {visibleSessions.map(({ session, sIdx }) => (
          <div
            key={session.id}
            className="rounded-2xl border border-[#A29C93]/40 bg-[#FFFDF7] p-4 sm:p-5"
          >
            <div className="mb-4 flex items-center justify-between gap-2 border-b border-[#A29C93]/25 pb-2.5">
              <span className="font-serif text-sm tracking-[0.2em] text-[#6D655C] select-none">
                Session #{sIdx + 1}
              </span>
              {focusedSessionIdx === sIdx && (
                <button
                  type="button"
                  onClick={() => setFocusedSessionIdx(null)}
                  className="text-xs font-medium text-[#8E887F] underline-offset-2 hover:underline"
                >
                  Show all sessions
                </button>
              )}
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
                          ? "bg-[#E2F3EC] font-bold text-[#668B7D]"
                          : "bg-white hover:bg-[#FAF6E8]",
                      )}
                    >
                      {task.done ? "✓" : ""}
                    </button>
                    <input
                      value={task.text}
                      onChange={(e) => setPomodoroTaskText(sIdx, tIdx, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          setFocusedSessionIdx(sIdx);
                        }
                      }}
                      placeholder={`Task ${tIdx + 1}...`}
                      aria-label={`Session ${sIdx + 1} task ${tIdx + 1}`}
                      className={cx(
                        "min-w-0 flex-1 border-b border-[#A29C93]/35 bg-transparent py-0.5 text-sm text-[#6D655C] placeholder:text-[#B8B0A4] focus:border-[#8E887F] focus:outline-none",
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
                            "grid size-7 place-items-center rounded-lg border border-[#A29C93]/45 text-xs transition",
                            checked ? "bg-[#FFF8D6] font-bold text-[#8E887F]" : "bg-white hover:bg-[#FAF6E8]",
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
                            "grid size-7 place-items-center rounded-lg border border-[#A29C93]/45 text-xs transition",
                            checked ? "bg-[#EFE8FA] font-bold text-[#8E887F]" : "bg-white hover:bg-[#FAF6E8]",
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
          <div className="grid size-11 place-items-center rounded-2xl border border-[#A29C93]/30 bg-[#EFE8FA]/70">
            <PastelMinionBadge costume="bunny" size={38} />
          </div>
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
            className="rounded-full border border-[#EAE2C8] bg-[#FFF8D6] px-3.5 py-1.5 text-xs font-bold text-[#8E887F] transition hover:bg-[#FFF3A8]/80 disabled:opacity-50"
          >
            {uploading ? "Uploading..." : "Upload"}
          </button>
          <button
            type="button"
            onClick={() => openPanel("log")}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#A29C93]/40 bg-[#FFFDF7] px-3.5 py-1.5 text-xs font-bold text-[#8E887F] transition hover:bg-[#FAF6E8]"
          >
            <IconLog size={14} /> Open Study Sheets
          </button>
          <button
            type="button"
            onClick={() => openPanel("flashcards")}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#A29C93]/35 bg-[#EFE8FA] px-3.5 py-1.5 text-xs font-bold text-[#8E887F] transition hover:bg-[#E6DAF8]/80"
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
        <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-1)]/60 px-4 py-5 text-center text-xs text-[var(--muted-ink)]">
          No study sheets uploaded yet. Drop in a PDF, DOCX, Markdown, or image above to start active recall.
        </div>
      )}
    </div>
  );
}
