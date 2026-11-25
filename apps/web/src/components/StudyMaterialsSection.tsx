// Scrollable Ship · Pwedo Pomo Studio stationery workspace below the main scene:
// 1. Interactive Pomodoro Tracker task form + die-cut sticker stamping (wired to usePlanner)
// 2. Active Recall Study Sheets quick-launch & file upload (wired to useFleet & useRecall)
// 3. Banana Planna: Weekly Plan & Habit Tracker (wired to usePlanner)

import { useEffect, useRef, useState } from "react";
import { useFleet } from "../stores/fleetStore.js";
import { usePlanner } from "../stores/plannerStore.js";
import { dueNow, useRecall } from "../stores/recallStore.js";
import { useUi } from "../stores/uiStore.js";
import { useVoyage } from "../stores/voyageStore.js";
import { BananaPlannaSection, DailyPlanBanner } from "./BananaPlannaSection.js";
import { useNow } from "./Hud.js";
import { PastelMinionBadge } from "./PastelMinionBadge.js";
import { DieCutSticker } from "./StickerArt.js";
import { StickerPickerPopover } from "./StickerPickerPopover.js";
import { IconBottle, IconCards, IconCrew, IconLog, IconNotebook } from "./icons.js";
import { cx, readFile } from "./ui.js";

export function StudyMaterialsSection() {
  const openMonthlyStats = usePlanner((s) => s.openMonthlyStats);

  return (
    <section
      id="study-materials"
      aria-label="Study materials and Pomodoro task form"
      className="notebook-grid relative z-10 border-t border-[var(--border-subtle)] px-4 py-10 text-[var(--page-ink)] sm:px-8 sm:py-14"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-10">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-5">
          <div>
            <p className="font-serif text-[11px] uppercase tracking-[0.22em] text-[var(--muted-ink)]">
              Ship · Pwedo Pomo Studio Notebook
            </p>
            <h2 className="font-display text-2xl font-extrabold text-[var(--page-ink)]">
              Pwedo Pomo &amp; Study Materials
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openMonthlyStats()}
              className="rounded-full border border-[var(--border-subtle)] bg-[#FFF8D6] px-3.5 py-1.5 text-xs font-bold text-[#4D453E] transition-[background-color] duration-150 hover:bg-[#FFF3A8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
            >
              Monthly Stats
            </button>
            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3.5 py-1.5 text-xs font-bold text-[var(--page-ink)] transition-[background-color] duration-150 hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
            >
              Back to scene ↑
            </a>
          </div>
        </div>

        {/* 0. The 10-minute daily plan comes first: plan, then sail. */}
        <DailyPlanBanner onOpen={() => useUi.getState().openPanel("planner")} />

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
  const sessionStickers = usePlanner((s) => s.sessionStickers);
  const toggleSessionSticker = usePlanner((s) => s.toggleSessionSticker);
  const updatePomodoro = usePlanner((s) => s.updatePomodoro);
  const togglePomodoroTask = usePlanner((s) => s.togglePomodoroTask);
  const setPomodoroTaskText = usePlanner((s) => s.setPomodoroTaskText);
  const togglePomodoroBox = usePlanner((s) => s.togglePomodoroBox);
  const phase = useVoyage((s) => s.phase);
  const cyclesCompleted = useVoyage((s) => s.cyclesCompleted);

  const [focusedSessionIdx, setFocusedSessionIdx] = useState<number | null>(null);
  const [stickerSessionId, setStickerSessionId] = useState<string | null>(null);

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
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl border border-[var(--border-subtle)] bg-[#E6F2FA]">
            <PastelMinionBadge costume="pwedo" size={38} />
          </div>
          <div>
            <h3 className="font-serif text-lg tracking-[0.18em] text-[var(--page-ink)]">
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
              className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-1 text-xs font-semibold text-[var(--page-ink)] transition-[background-color] duration-150 hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
            >
              Show all sessions
            </button>
          )}
          <span className="rounded-full border border-[var(--border-subtle)] bg-[#FFF8D6] px-3 py-1 text-xs font-semibold text-[#5C544B]">
            Auto-saved
          </span>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {visibleSessions.map(({ session, sIdx }) => {
          const stamped = sessionStickers?.[session.id] ?? [];
          return (
          <div
            key={session.id}
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/92 p-4 sm:p-5"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2.5">
              <div className="flex items-center gap-2">
                <span className="font-serif text-sm tracking-[0.2em] text-[var(--page-ink)] select-none">
                  Session #{sIdx + 1}
                </span>
                {stamped.map((stId) => (
                  <DieCutSticker key={stId} id={stId} size={26} />
                ))}
              </div>
              <div className="relative flex items-center gap-2">
                {focusedSessionIdx === sIdx && (
                  <button
                    type="button"
                    onClick={() => setFocusedSessionIdx(null)}
                    className="text-xs font-medium text-[var(--muted-ink)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
                  >
                    Show all
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setStickerSessionId((cur) => (cur === session.id ? null : session.id))
                  }
                  className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--page-ink)] transition-[background-color] duration-150 hover:bg-[#FFF8D6] hover:text-[#4D453E] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
                >
                  + Sticker
                </button>
                {stickerSessionId === session.id && (
                  <StickerPickerPopover
                    selected={stamped}
                    onToggle={(id) => toggleSessionSticker(session.id, id)}
                    onClose={() => setStickerSessionId(null)}
                  />
                )}
              </div>
            </div>

            <div className="grid gap-5">
              {/* Task checkboxes + textboxes */}
              <div className="space-y-2.5">
                <p className="font-serif text-xs tracking-[0.18em] text-[var(--muted-ink)]">
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
                        "grid size-5 shrink-0 place-items-center rounded-md border border-[var(--border-subtle)] text-xs transition-[background-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--page-ink)]",
                        task.done
                          ? "bg-[#E2F3EC] font-bold text-[#386657]"
                          : "bg-[var(--surface-2)] hover:bg-[#FAF6E8] hover:text-[#4D453E]",
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
                        "min-w-0 flex-1 border-b border-[var(--border-subtle)] bg-transparent py-0.5 text-sm text-[var(--page-ink)] placeholder:text-[var(--muted-ink)] focus:border-[var(--page-ink)] focus:outline-none",
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
                    <div className="mb-1.5 flex items-center gap-1 font-serif text-xs tracking-[0.14em] text-[var(--muted-ink)]">
                      <input
                        value={session.focusMinutes}
                        onChange={(e) => updatePomodoro(sIdx, { focusMinutes: e.target.value })}
                        aria-label={`Session ${sIdx + 1} focus minutes`}
                        className="w-8 border-b border-[var(--border-subtle)] bg-transparent text-center font-sans text-xs font-bold text-[var(--page-ink)] focus:border-[var(--page-ink)] focus:outline-none"
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
                            "grid size-7 place-items-center rounded-lg border border-[var(--border-subtle)] text-xs transition-[background-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--page-ink)]",
                            checked ? "bg-[#FFF8D6] font-bold text-[#5C544B]" : "bg-[var(--surface-2)] hover:bg-[#FFF8D6]/60",
                          )}
                        >
                          {checked ? "✓" : ""}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center gap-1 font-serif text-xs tracking-[0.14em] text-[var(--muted-ink)]">
                      <input
                        value={session.breakMinutes}
                        onChange={(e) => updatePomodoro(sIdx, { breakMinutes: e.target.value })}
                        aria-label={`Session ${sIdx + 1} break minutes`}
                        className="w-8 border-b border-[var(--border-subtle)] bg-transparent text-center font-sans text-xs font-bold text-[var(--page-ink)] focus:border-[var(--page-ink)] focus:outline-none"
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
                            "grid size-7 place-items-center rounded-lg border border-[var(--border-subtle)] text-xs transition-[background-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--page-ink)]",
                            checked ? "bg-[#EFE8FA] font-bold text-[#52466A]" : "bg-[var(--surface-2)] hover:bg-[#EFE8FA]/60",
                          )}
                        >
                          {checked ? "✓" : ""}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="border-t border-[var(--border-subtle)] pt-3">
                  <span className="block font-serif text-xs tracking-[0.1em] text-[var(--muted-ink)]">
                    How can I improve next session:
                  </span>
                  <textarea
                    rows={2}
                    value={session.improveNote}
                    onChange={(e) => updatePomodoro(sIdx, { improveNote: e.target.value })}
                    placeholder="Write a quick reflection..."
                    aria-label={`Session ${sIdx + 1} how can I improve next session`}
                    className="mt-1 w-full resize-none bg-transparent text-sm text-[var(--page-ink)] placeholder:text-[var(--muted-ink)] focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        );})}
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
      className={cx(
        "border-t border-[var(--border-subtle)] pt-8 transition-[background-color] duration-150",
        dragging && "rounded-2xl bg-[var(--surface-1)]/70 ring-2 ring-[var(--page-ink)] px-3 pb-4",
      )}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl border border-[var(--border-subtle)] bg-[#EFE8FA]">
            <PastelMinionBadge costume="bunny" size={38} />
          </div>
          <div>
            <h3 className="font-serif text-lg tracking-[0.18em] text-[var(--page-ink)]">
              Active Recall Study Sheets
            </h3>
            <p className="text-xs text-[var(--muted-ink)]">
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
            className="rounded-full border border-[var(--border-subtle)] bg-[#FFF8D6] px-3.5 py-1.5 text-xs font-bold text-[#4D453E] transition-[background-color] duration-150 hover:bg-[#FFF3A8] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
          >
            {uploading ? "Uploading..." : "Upload"}
          </button>
          <button
            type="button"
            onClick={() => openPanel("log")}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3.5 py-1.5 text-xs font-bold text-[var(--page-ink)] transition-[background-color] duration-150 hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
          >
            <IconLog size={14} /> Open Study Sheets
          </button>
          <button
            type="button"
            onClick={() => openPanel("flashcards")}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[#EFE8FA] px-3.5 py-1.5 text-xs font-bold text-[#4A3C63] transition-[background-color] duration-150 hover:bg-[#E6DAF8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
          >
            <IconCards size={14} /> Flashcards{due > 0 ? ` (${due} due)` : ""}
          </button>
          <button
            type="button"
            onClick={() => openPanel("notes")}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[#F3EAF7] px-3.5 py-1.5 text-xs font-bold text-[#56406A] transition-[background-color] duration-150 hover:bg-[#EBDDF3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
          >
            <IconNotebook size={14} /> Note Nook &amp; Obsidian
          </button>
          <button
            type="button"
            onClick={() => openPanel("bay")}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[#EAF7F3] px-3.5 py-1.5 text-xs font-bold text-[#2D6252] transition-[background-color] duration-150 hover:bg-[#DDF2EB] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
          >
            <IconBottle size={14} /> Bottle Bay
          </button>
          <button
            type="button"
            onClick={() => openPanel("rooms")}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[#E6F2FA] px-3.5 py-1.5 text-xs font-bold text-[#2F4F6B] transition-[background-color] duration-150 hover:bg-[#D9EAF6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
          >
            <IconCrew size={14} /> Study Rooms
          </button>
        </div>
      </div>

      {notes.length > 0 ? (
        <div className="divide-y divide-[var(--border-subtle)] rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/92">
          {notes.slice(0, 6).map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => openPanel("log")}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-[background-color] duration-150 first:rounded-t-2xl last:rounded-b-2xl hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--page-ink)]"
            >
              <span className="min-w-0 truncate font-display text-sm font-bold text-[var(--page-ink)]">
                {n.title}
              </span>
              <span className="shrink-0 text-[11px] text-[var(--muted-ink)]">
                {n.pages.length} {n.pages.length === 1 ? "page" : "pages"} · Practice →
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-1)]/70 px-4 py-5 text-center text-xs text-[var(--muted-ink)]">
          No study sheets uploaded yet. Drop in a PDF, DOCX, Markdown, or image above to start active recall.
        </div>
      )}
    </div>
  );
}
