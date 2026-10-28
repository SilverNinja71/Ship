// The voyage controls at the bottom of the screen: pick a voyage and set
// sail, then watch the clock, pause, or come back from shore leave.

import { useEffect, useState } from "react";
import { DOUBLOONS_PER_FOCUS_MINUTE, VOYAGE_PRESETS } from "@ship/shared-types";
import type { VoyagePresetId } from "@ship/shared-types";
import { formatClock, formatDue } from "../lib/format.js";
import { focusProgress, remainingFocusMs } from "../lib/voyageLogic.js";
import { isDone, sortItinerary, useFleet } from "../stores/fleetStore.js";
import { useSettings } from "../stores/settingsStore.js";
import { useVoyage } from "../stores/voyageStore.js";
import { useNow } from "./Hud.js";
import { Doubloon, IconAnchor, IconPause, IconPlay, IconStop } from "./icons.js";
import { Button, cx } from "./ui.js";

export function VoyageDock() {
  const phase = useVoyage((s) => s.phase);
  return (
    <section aria-label="Voyage" className="pointer-events-auto relative z-20 w-full max-w-3xl rounded-3xl border-[3px] border-ink bg-cream-100/95 p-3 text-ink shadow-card backdrop-blur sm:absolute sm:inset-x-2 sm:bottom-3 sm:mx-auto">
      {phase === "docked" ? <Docked /> : <Underway />}
    </section>
  );
}

function Docked() {
  const presetId = useSettings((s) => s.presetId);
  const customFocus = useSettings((s) => s.customFocusMinutes);
  const customBreak = useSettings((s) => s.customBreakMinutes);
  const set = useSettings((s) => s.set);
  const start = useVoyage((s) => s.start);
  const assignments = useFleet((s) => s.assignments);
  const done = useFleet((s) => s.done);
  const [objective, setObjective] = useState("");
  const [assignmentId, setAssignmentId] = useState("");

  const upcoming = sortItinerary(assignments, done).filter((a) => !isDone(a, done)).slice(0, 40);

  const setSail = () => {
    const picked = upcoming.find((a) => a.id === assignmentId);
    start({
      presetId,
      focusMinutes: presetId === "custom" ? customFocus : undefined,
      breakMinutes: presetId === "custom" ? customBreak : undefined,
      objective: objective.trim() || picked?.title || null,
      assignmentId: picked?.id ?? null,
    });
    setObjective("");
    setAssignmentId("");
  };

  return (
    <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
      <div className="flex shrink-0 gap-1.5" role="radiogroup" aria-label="Voyage length">
        {(Object.keys(VOYAGE_PRESETS) as VoyagePresetId[]).map((id) => {
          const p = VOYAGE_PRESETS[id];
          const focus = id === "custom" ? customFocus : p.focusMinutes;
          const brk = id === "custom" ? customBreak : p.breakMinutes;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={presetId === id}
              onClick={() => set({ presetId: id })}
              className={cx(
                "rounded-xl border-2 px-2.5 py-1 text-left leading-tight transition",
                presetId === id ? "border-ink bg-navy-900 text-cream-50" : "border-ink/20 bg-cream-50 hover:border-ink/50",
              )}
            >
              <span className="block font-display text-sm font-extrabold">{p.label.split(" ")[0]}</span>
              <span className="block text-xs opacity-75 tabular-nums">
                {focus}/{brk} min
              </span>
            </button>
          );
        })}
      </div>

      {presetId === "custom" && (
        <div className="flex shrink-0 items-center gap-1.5 text-sm font-bold">
          <input type="number" min={1} max={240} value={customFocus} onChange={(e) => set({ customFocusMinutes: Number(e.target.value) || 1 })} className="w-16 rounded-lg border-2 border-ink/25 bg-cream-50 px-2 py-1" aria-label="Focus minutes" />
          <span>/</span>
          <input type="number" min={0} max={60} value={customBreak} onChange={(e) => set({ customBreakMinutes: Math.max(0, Number(e.target.value) || 0) })} className="w-14 rounded-lg border-2 border-ink/25 bg-cream-50 px-2 py-1" aria-label="Break minutes" />
        </div>
      )}

      <div className="flex min-w-0 flex-1 gap-1.5">
        <input
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setSail()}
          placeholder="What are you studying?"
          aria-label="Voyage goal"
          className="min-w-0 flex-1 rounded-xl border-2 border-ink/25 bg-cream-50 px-3 py-2 focus:border-navy-600 focus:outline-none"
        />
        {upcoming.length > 0 && (
          <select
            value={assignmentId}
            onChange={(e) => setAssignmentId(e.target.value)}
            aria-label="Sail for an assignment"
            className="w-36 min-w-0 rounded-xl border-2 border-ink/25 bg-cream-50 px-2 py-2 text-sm"
          >
            <option value="">Assignment…</option>
            {upcoming.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title} · {formatDue(a.dueAt)}
              </option>
            ))}
          </select>
        )}
      </div>

      <Button variant="primary" size="lg" onClick={setSail} title="Set sail (Space)">
        <IconPlay size={18} />
        Set sail
      </Button>
    </div>
  );
}

function Underway() {
  const v = useVoyage();
  const now = useNow(250);
  const [confirmEnd, setConfirmEnd] = useState(false);
  useEffect(() => {
    if (!confirmEnd) return;
    const t = setTimeout(() => setConfirmEnd(false), 4000);
    return () => clearTimeout(t);
  }, [confirmEnd]);

  const ashore = v.phase === "shore-leave";
  const drifting = v.phase === "drifting";
  const remaining = ashore ? Math.max(0, (v.breakEndsAt ?? now) - now) : remainingFocusMs(v, now);
  const progress = ashore ? 1 - remaining / Math.max(1, v.breakMinutes * 60_000) : focusProgress(v, now);
  const earned = v.paidMinutes * DOUBLOONS_PER_FOCUS_MINUTE;

  const status = ashore ? "Shore leave" : drifting ? (v.pausedReason === "idle" ? "Drifting: you stepped away" : "Anchored (paused)") : "Under sail";

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex items-center gap-3">
        <div className={cx("font-display text-4xl font-extrabold tabular-nums sm:text-5xl", ashore ? "text-seafoam-700" : drifting ? "text-ink/50" : "text-navy-900")} aria-live="off">
          {formatClock(remaining)}
        </div>
        <div className="min-w-0 sm:hidden">
          <p className="font-display text-sm font-extrabold">{status}</p>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="hidden truncate font-display font-extrabold sm:block">
            {status}
            {v.objective && <span className="font-body font-semibold text-ink/70"> · {v.objective}</span>}
          </p>
          {!ashore && (
            <span className="flex shrink-0 items-center gap-1 text-sm font-bold tabular-nums" title="Doubloons earned this voyage">
              <Doubloon size={16} /> {earned}
            </span>
          )}
        </div>
        <div className="mt-1.5 h-3 overflow-hidden rounded-full border-2 border-ink/30 bg-ink/10">
          <div className={cx("h-full rounded-full transition-[width] duration-300", ashore ? "bg-seafoam-500" : drifting ? "bg-ink/30" : "bg-brass-400")} style={{ width: `${Math.round(progress * 1000) / 10}%` }} />
        </div>
        {v.objective && <p className="mt-1 truncate text-sm text-ink/70 sm:hidden">{v.objective}</p>}
      </div>
      <div className="flex shrink-0 gap-1.5">
        {ashore ? (
          <Button variant="primary" onClick={v.endBreak}>
            <IconAnchor size={18} /> Back to the helm
          </Button>
        ) : (
          <>
            {drifting ? (
              <Button variant="seafoam" onClick={v.resume} title="Resume (Space)">
                <IconPlay size={18} /> Sail on
              </Button>
            ) : (
              <Button onClick={() => v.pause("manual")} title="Pause (Space)">
                <IconPause size={18} /> Anchor
              </Button>
            )}
            <Button variant={confirmEnd ? "danger" : "secondary"} onClick={() => (confirmEnd ? (setConfirmEnd(false), v.abandon()) : setConfirmEnd(true))}>
              <IconStop size={16} /> {confirmEnd ? "End? The tree will wilt" : "End"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
