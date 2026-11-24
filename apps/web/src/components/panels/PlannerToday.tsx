// Banana Planna's two newest sheets: the 10-minute daily plan (a quiet
// countdown, four steps and a streak) and the Kanban board (To do, Doing,
// Done). The timer makes no sound, as everything in Ship.

import { useEffect, useMemo, useState } from "react";
import type { DragEvent, ReactNode } from "react";
import { DOING_LIMIT, KANBAN_COLUMNS, localDayKey, PLAN_MINUTES, planStreak, TOP_PICKS } from "../../lib/kanban.js";
import type { KanbanCard, KanbanColumnId } from "../../lib/kanban.js";
import { sortItinerary, isDone, useFleet } from "../../stores/fleetStore.js";
import { plannedToday, todaysPicks, usePlanner } from "../../stores/plannerStore.js";
import { dueNow, useRecall } from "../../stores/recallStore.js";
import { useSettings } from "../../stores/settingsStore.js";
import { useUi } from "../../stores/uiStore.js";
import { useVoyage } from "../../stores/voyageStore.js";
import { PastelMinionBadge } from "../PastelMinionBadge.js";
import { cx } from "../ui.js";

function useTick(ms: number, active: boolean): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, active]);
  return active ? now : Date.now();
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Starts a Pwedo Pomo on a card: it becomes the objective and moves to Doing. */
function focusOn(card: KanbanCard): void {
  const ui = useUi.getState();
  const voyage = useVoyage.getState();
  if (voyage.phase === "sailing" || voyage.phase === "drifting" || voyage.prepEndsAt !== null) {
    ui.toast("A Pwedo Pomo is already running. Finish that one first.", "warning");
    return;
  }
  voyage.start({ presetId: voyage.presetId, cycles: useSettings.getState().pomodoroCycles, prep: true, objective: card.text });
  if (card.column !== "doing") usePlanner.getState().moveKanbanCard(card.id, "doing");
  ui.openPanel(null);
  ui.toast(`Pwedo Pomo starts in a minute: "${card.text}"`, "info");
}

// ---- The 10-minute daily plan ---------------------------------------------------------------

const STEPS = ["Check what's due", "Empty your head onto the board", `Pick today's top ${TOP_PICKS}`, "Plan your Pwedo Pomos"];

export function DailyPlanSheet({ onOpenBoard }: { onOpenBoard: () => void }) {
  const s = usePlanner();
  const today = localDayKey();
  const done = plannedToday(s, today);
  const running = s.planTimerEndsAt !== null;
  const now = useTick(500, running);
  const left = running ? s.planTimerEndsAt! - now : (s.planTimerLeft ?? PLAN_MINUTES * 60_000);
  const timeUp = running && left <= 0;
  const progress = 1 - Math.max(0, left) / (PLAN_MINUTES * 60_000);
  const streak = planStreak(s.plannedDays, today);
  const steps = s.planSteps.day === today ? s.planSteps.done : [];
  const picks = todaysPicks(s, today);
  const toast = useUi((u) => u.toast);

  const finish = () => {
    if (s.finishDailyPlan()) toast(`Day planned! +5 doubloons. ${streak + 1}-day planning streak 🍌`, "reward");
  };

  return (
    <div className="grid gap-5 rounded-2xl border-2 border-ink/20 bg-[#FFFDF6] p-4 sm:grid-cols-[13rem_minmax(0,1fr)] sm:p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="font-serif text-sm tracking-[0.22em] text-ink/70">10 MINUTES A DAY</p>
        <div className="relative grid size-40 place-items-center">
          <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden="true">
            <circle cx="50" cy="50" r="44" fill="#FFF6C9" stroke="#F1E3A0" strokeWidth="6" />
            <circle cx="50" cy="50" r="44" fill="none" stroke="#E8B84A" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${276.5 * progress} 276.5`} />
          </svg>
          <div className="relative">
            {done ? (
              <PastelMinionBadge costume="banana" size={70} />
            ) : (
              <>
                <p className="font-display text-4xl tabular-nums text-ink" role="timer" aria-label="Planning time left">
                  {clock(left)}
                </p>
                <p className="text-xs text-ink/55">{timeUp ? "time's up!" : running ? "planning…" : "ready"}</p>
              </>
            )}
          </div>
        </div>
        {!done && (
          <div className="flex gap-3 text-sm">
            {running && !timeUp ? (
              <button type="button" onClick={() => s.pausePlanTimer()} className="hover:underline underline-offset-4">
                Pause
              </button>
            ) : (
              <button type="button" onClick={() => (timeUp ? s.resetPlanTimer() : s.startPlanTimer())} className="font-semibold hover:underline underline-offset-4">
                {timeUp ? "Again" : s.planTimerLeft !== null ? "Resume" : "Start 10 minutes"}
              </button>
            )}
            {(running || s.planTimerLeft !== null) && !timeUp && (
              <button type="button" onClick={() => s.resetPlanTimer()} className="text-ink/60 hover:underline underline-offset-4">
                Reset
              </button>
            )}
          </div>
        )}
        <p className="rounded-full bg-[#FFF1B8] px-3 py-1 text-xs text-[#6B5418]">{streak > 0 ? `🍌 ${streak}-day planning streak` : "Start a planning streak today"}</p>
      </div>

      <div className="min-w-0">
        <h3 className="font-display text-xl text-ink">{done ? "Today is planned ✓" : "Plan your day, then sail it"}</h3>
        <p className="mb-3 text-sm text-ink/65">
          {done ? "Nice. Your top picks are on the board. Come back tomorrow to keep the streak going." : "Ten calm minutes now saves hours of drifting later. Work through the four steps, then lock it in."}
        </p>

        <ol className="space-y-3">
          {STEPS.map((label, i) => (
            <li key={label} className="rounded-2xl border border-ink/15 bg-white/70 px-3 py-2.5">
              <label className="flex cursor-pointer items-center gap-2 font-serif text-[15px] text-ink">
                <input type="checkbox" checked={!!steps[i]} onChange={() => s.togglePlanStep(i)} className="size-4 accent-[#E8B84A]" />
                <span className={cx(steps[i] && "text-ink/50 line-through decoration-[#E8B84A]")}>
                  {i + 1}. {label}
                </span>
              </label>
              <div className="mt-1.5 pl-6 text-sm">
                {i === 0 && <DueSoon />}
                {i === 1 && <QuickAdd />}
                {i === 2 && <PickTop picks={picks} onOpenBoard={onOpenBoard} />}
                {i === 3 && <CyclesPicker />}
              </div>
            </li>
          ))}
        </ol>

        <button
          type="button"
          disabled={done}
          onClick={finish}
          className={cx(
            "mt-4 w-full rounded-2xl px-4 py-3 font-display text-base transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
            done ? "bg-[#E8F6EF] text-[#2F6B55]" : "bg-[#FFE27A] text-[#4B3A0B] shadow-[0_3px_0_#E0B93E] hover:bg-[#FFD95A] active:translate-y-px",
          )}
        >
          {done ? "Planned today ✓" : "I've planned my day · +5 doubloons"}
        </button>
      </div>
    </div>
  );
}

function DueSoon() {
  const assignments = useFleet((f) => f.assignments);
  const doneMap = useFleet((f) => f.done);
  const cards = useRecall((r) => r.cards);
  const upcoming = useMemo(() => sortItinerary(assignments, doneMap).filter((a) => !isDone(a, doneMap) && a.dueAt !== null).slice(0, 3), [assignments, doneMap]);
  const dueCards = dueNow(cards).length;
  return (
    <div className="space-y-0.5 text-ink/75">
      {upcoming.length ? (
        upcoming.map((a) => (
          <p key={a.id} className="truncate">
            • {a.title} <span className="text-ink/50">· {new Date(a.dueAt!).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
          </p>
        ))
      ) : (
        <p className="text-ink/55">No deadlines in Ship yet. Add them from the Helm (H) or a calendar feed.</p>
      )}
      <p>{dueCards ? `• ${dueCards} flashcard${dueCards === 1 ? "" : "s"} due for review` : "• No flashcards due"}</p>
    </div>
  );
}

function QuickAdd() {
  const add = usePlanner((p) => p.addKanbanCard);
  const todo = usePlanner((p) => p.kanban.filter((c) => c.column === "todo").length);
  const [text, setText] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (add(text)) setText("");
      }}
    >
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Anything on your mind…" aria-label="Add to To do" className="min-w-0 flex-1 rounded-xl border border-ink/20 bg-white px-2.5 py-1 text-sm focus:border-ink/50 focus:outline-none" />
      <button type="submit" className="shrink-0 hover:underline underline-offset-4">
        Add
      </button>
      <span className="self-center text-xs text-ink/50">{todo} in To do</span>
    </form>
  );
}

function PickTop({ picks, onOpenBoard }: { picks: string[]; onOpenBoard: () => void }) {
  const cards = usePlanner((p) => p.kanban);
  const toggle = usePlanner((p) => p.togglePick);
  const open = cards.filter((c) => c.column !== "done");
  if (!open.length) return <p className="text-ink/55">Add a few cards first, then star the three that matter most.</p>;
  return (
    <div>
      <ul className="flex flex-wrap gap-1.5">
        {open.slice(0, 12).map((c) => {
          const on = picks.includes(c.id);
          return (
            <li key={c.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(c.id)}
                disabled={!on && picks.length >= TOP_PICKS}
                className={cx("max-w-[16rem] truncate rounded-full border px-2.5 py-0.5 text-xs transition disabled:opacity-40", on ? "border-[#E8B84A] bg-[#FFF1B8] text-[#5B460F]" : "border-ink/20 bg-white text-ink/70 hover:border-ink/40")}
              >
                {on ? "★" : "☆"} {c.text}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-1 text-xs text-ink/50">
        {picks.length}/{TOP_PICKS} picked ·{" "}
        <button type="button" onClick={onOpenBoard} className="underline-offset-4 hover:underline">
          open the board
        </button>
      </p>
    </div>
  );
}

function CyclesPicker() {
  const cycles = useSettings((x) => x.pomodoroCycles);
  const set = useSettings((x) => x.set);
  const focus = useVoyage((v) => v.focusMinutes);
  return (
    <div className="flex flex-wrap items-center gap-2 text-ink/75">
      <span>Pwedo Pomo cycles today:</span>
      <button type="button" aria-label="Fewer cycles" onClick={() => set({ pomodoroCycles: Math.max(1, cycles - 1) })} className="grid size-6 place-items-center rounded-full border border-ink/25 hover:bg-ink/5">
        −
      </button>
      <span className="w-5 text-center font-semibold tabular-nums text-ink">{cycles}</span>
      <button type="button" aria-label="More cycles" onClick={() => set({ pomodoroCycles: Math.min(8, cycles + 1) })} className="grid size-6 place-items-center rounded-full border border-ink/25 hover:bg-ink/5">
        +
      </button>
      <span className="text-xs text-ink/50">≈ {cycles * focus} minutes of focus</span>
    </div>
  );
}

// ---- The Kanban board --------------------------------------------------------------------------

const COLUMN_LOOK: Record<KanbanColumnId, { bg: string; border: string; empty: string; badge: "banana" | "bunny" | "teddy" }> = {
  todo: { bg: "bg-[#FFF9DC]", border: "border-[#F1E3A0]", empty: "Add what's on your mind.", badge: "banana" },
  doing: { bg: "bg-[#F3ECFB]", border: "border-[#DCCCF0]", empty: "Drag a card here, or press ▶ to start a Pwedo Pomo on it.", badge: "bunny" },
  done: { bg: "bg-[#E9F6EF]", border: "border-[#C7E6D5]", empty: "Finished cards land here.", badge: "teddy" },
};

export function KanbanBoard() {
  const cards = usePlanner((p) => p.kanban);
  const picksRaw = usePlanner((p) => p.picks);
  const picksDay = usePlanner((p) => p.picksDay);
  const picks = todaysPicks({ picks: picksRaw, picksDay });
  const { moveKanbanCard, clearDoneCards } = usePlanner.getState();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<KanbanColumnId | null>(null);

  const drop = (column: KanbanColumnId, beforeId: string | null) => (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const id = e.dataTransfer.getData("text/x-ship-card") || dragging;
    if (id) moveKanbanCard(id, column, beforeId);
    setDragging(null);
    setOver(null);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {KANBAN_COLUMNS.map(({ id, label }) => {
        const look = COLUMN_LOOK[id];
        const list = cards.filter((c) => c.column === id);
        const full = id === "doing" && list.length >= DOING_LIMIT;
        return (
          <section
            key={id}
            aria-label={label}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(id);
            }}
            onDragLeave={() => setOver((o) => (o === id ? null : o))}
            onDrop={drop(id, null)}
            className={cx("flex min-h-48 flex-col rounded-2xl border-2 p-3 transition", look.bg, look.border, over === id && "ring-2 ring-[#E8B84A] ring-offset-1")}
          >
            <header className="mb-2 flex items-center gap-2">
              <PastelMinionBadge costume={look.badge} size={28} />
              <h3 className="font-display text-base text-ink">{label}</h3>
              <span className={cx("rounded-full px-2 text-xs", full ? "bg-[#FBE0DA] text-[#8A3B31]" : "bg-white/70 text-ink/60")}>
                {id === "doing" ? `${list.length}/${DOING_LIMIT}` : list.length}
              </span>
              {id === "done" && list.length > 0 && (
                <button type="button" onClick={clearDoneCards} className="ml-auto text-xs text-ink/55 hover:underline underline-offset-4">
                  Clear done
                </button>
              )}
            </header>
            {full && <p className="mb-2 text-xs text-[#8A3B31]">Three at a time keeps you focused: finish one first.</p>}
            <ul className="flex flex-1 flex-col gap-2">
              {list.map((c) => (
                <KanbanCardView key={c.id} card={c} picked={picks.includes(c.id)} onDragStart={() => setDragging(c.id)} onDrop={drop(id, c.id)} />
              ))}
              {!list.length && <li className="rounded-xl border border-dashed border-ink/20 px-3 py-4 text-center text-xs text-ink/50">{look.empty}</li>}
            </ul>
            {id !== "done" && <AddCard column={id} />}
          </section>
        );
      })}
    </div>
  );
}

function AddCard({ column }: { column: KanbanColumnId }) {
  const add = usePlanner((p) => p.addKanbanCard);
  const [text, setText] = useState("");
  return (
    <form
      className="mt-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (add(text, column)) setText("");
      }}
    >
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="+ Add a card" aria-label={`Add a card to ${column === "todo" ? "To do" : "Doing"}`} className="w-full rounded-xl border border-transparent bg-white/60 px-2.5 py-1.5 text-sm placeholder:text-ink/45 focus:border-ink/30 focus:bg-white focus:outline-none" />
    </form>
  );
}

function KanbanCardView({ card, picked, onDragStart, onDrop }: { card: KanbanCard; picked: boolean; onDragStart: () => void; onDrop: (e: DragEvent) => void }) {
  const { moveKanbanCard, updateKanbanCard, deleteKanbanCard, togglePick } = usePlanner.getState();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(card.text);
  const index = KANBAN_COLUMNS.findIndex((c) => c.id === card.column);
  const prev = KANBAN_COLUMNS[index - 1];
  const next = KANBAN_COLUMNS[index + 1];
  const overdue = card.due !== null && card.column !== "done" && card.due < localDayKey();
  const save = () => {
    if (text.trim()) updateKanbanCard(card.id, { text: text.trim() });
    else setText(card.text);
    setEditing(false);
  };

  return (
    <li
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/x-ship-card", card.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className={cx("group rounded-xl border bg-white px-2.5 py-2 text-sm shadow-[0_2px_0_rgb(0_0_0_/_0.05)]", picked ? "border-[#E8B84A]" : "border-ink/12", card.column === "done" && "opacity-75")}
    >
      {editing ? (
        <div className="space-y-1.5">
          <textarea autoFocus rows={2} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), save())} aria-label="Card text" className="w-full resize-none rounded-lg border border-ink/20 px-2 py-1 focus:outline-none" />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1 text-ink/60">
              Due
              <input type="date" value={card.due ?? ""} onChange={(e) => updateKanbanCard(card.id, { due: e.target.value || null })} className="rounded border border-ink/20 px-1" />
            </label>
            <button type="button" onClick={save} className="ml-auto font-semibold hover:underline underline-offset-4">
              Save
            </button>
            <button type="button" onClick={() => deleteKanbanCard(card.id)} className="text-[#8A3B31] hover:underline underline-offset-4">
              Delete
            </button>
          </div>
        </div>
      ) : (
        <>
          <button type="button" onClick={() => setEditing(true)} className={cx("block w-full text-left text-ink", card.column === "done" && "line-through decoration-ink/30")} title="Edit">
            {picked && <span className="mr-1 text-[#D9A22E]" aria-label="Today's pick">★</span>}
            {card.text}
          </button>
          <div className="mt-1.5 flex items-center gap-1 text-xs text-ink/55">
            {card.due && <span className={cx("rounded-full px-1.5", overdue ? "bg-[#FBE0DA] text-[#8A3B31]" : "bg-ink/5")}>{new Date(`${card.due}T12:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
            <span className="ml-auto flex items-center gap-0.5">
              {card.column !== "done" && (
                <>
                  <IconBtn label={picked ? "Unpick from today's top 3" : "Pick for today's top 3"} onClick={() => togglePick(card.id)}>
                    {picked ? "★" : "☆"}
                  </IconBtn>
                  <IconBtn label="Start a Pwedo Pomo on this" onClick={() => focusOn(card)}>
                    ▶
                  </IconBtn>
                </>
              )}
              {prev && (
                <IconBtn label={`Move to ${prev.label}`} onClick={() => moveKanbanCard(card.id, prev.id)}>
                  <Chevron left />
                </IconBtn>
              )}
              {next && (
                <IconBtn label={`Move to ${next.label}`} onClick={() => moveKanbanCard(card.id, next.id)}>
                  <Chevron />
                </IconBtn>
              )}
            </span>
          </div>
        </>
      )}
    </li>
  );
}

function Chevron({ left = false }: { left?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={left ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="grid size-7 place-items-center rounded-full text-sm text-ink/60 hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-ink">
      {children}
    </button>
  );
}
