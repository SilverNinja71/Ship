// Compact Pwedo Pomo timer pill at the bottom of the Mr. Tiny Studio scene.

import { useEffect, useState } from "react";
import { VOYAGE_PRESETS } from "@ship/shared-types";
import type { VoyagePresetId } from "@ship/shared-types";
import { formatClock } from "../lib/format.js";
import { focusProgress, remainingFocusMs } from "../lib/voyageLogic.js";
import { PORT_THEMES } from "../ship-engine/tinyInk.js";
import type { PortThemeId } from "../ship-engine/tinyInk.js";
import { useSettings } from "../stores/settingsStore.js";
import type { SoundTrackId } from "../stores/settingsStore.js";
import { useVoyage } from "../stores/voyageStore.js";
import { useNow } from "./Hud.js";
import { IconAnchor, IconPause, IconPlay, IconStop } from "./icons.js";
import { cx } from "./ui.js";

const AUDIO_OPTIONS: { id: SoundTrackId | "off"; label: string }[] = [
  { id: "off", label: "Audio: Off" },
  { id: "rain", label: "Rain Drops" },
  { id: "asmr", label: "ASMR" },
  { id: "lofi", label: "Lo-fi" },
  { id: "ocean", label: "Ocean Waves" },
];

export function VoyageDock() {
  const phase = useVoyage((s) => s.phase);
  const prepEndsAt = useVoyage((s) => s.prepEndsAt);

  return (
    <section
      aria-label="Pwedo Pomo"
      className="pointer-events-auto relative z-20 flex flex-col items-center gap-1.5"
    >
      {phase === "docked" ? (prepEndsAt !== null ? <BearingsPrep /> : <DockedPill />) : <ActivePill />}
      <a
        href="#study-materials"
        className="text-[11px] font-semibold tracking-wide text-[#8E887F] transition hover:text-[#6D655C]"
      >
        Scroll for study sheets &amp; task form ↓
      </a>
    </section>
  );
}

function BearingsPrep() {
  const prepEndsAt = useVoyage((s) => s.prepEndsAt);
  const objective = useVoyage((s) => s.objective);
  const skipPrep = useVoyage((s) => s.skipPrep);
  const cancelPrep = useVoyage((s) => s.cancelPrep);
  const now = useNow(200);
  const remaining = Math.max(0, (prepEndsAt ?? now) - now);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-full border border-[#A29C93]/60 bg-[#FAF6E8]/95 px-4 py-2 text-[#6D655C] shadow-[3px_3px_0_#EAE5DA] backdrop-blur-sm">
      <span className="rounded-full border border-[#A29C93]/45 bg-[#FFF3A8] px-2.5 py-0.5 font-serif text-xs tracking-[0.14em] text-[#5D564E]">
        Pwedo Pomo
      </span>
      <span className="font-display text-sm font-bold tabular-nums">
        Ready in {formatClock(remaining)}
        {objective ? ` · ${objective}` : ""}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={cancelPrep}
          className="rounded-full border border-transparent bg-[#FFFDF7] px-3 py-1 font-serif text-xs font-bold text-[#6D655C] transition hover:border-[#A29C93]/60 hover:bg-[#EFE9DA] hover:underline underline-offset-4 focus:outline-none"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={skipPrep}
          className="inline-flex items-center gap-1 rounded-full border border-transparent bg-[#FFF3A8] px-3.5 py-1 font-serif text-xs font-extrabold text-[#5D564E] transition hover:border-[#A29C93]/60 hover:bg-[#FCEB8B] hover:underline underline-offset-4 focus:outline-none"
        >
          <IconPlay size={13} /> Start now
        </button>
      </div>
    </div>
  );
}

function DockedPill() {
  const presetId = useSettings((s) => s.presetId);
  const customFocus = useSettings((s) => s.customFocusMinutes);
  const customBreak = useSettings((s) => s.customBreakMinutes);
  const portTheme = useSettings((s) => s.portTheme);
  const pomodoroCycles = useSettings((s) => s.pomodoroCycles);
  const soundOn = useSettings((s) => s.soundOn);
  const soundTrack = useSettings((s) => s.soundTrack);
  const set = useSettings((s) => s.set);

  const start = useVoyage((s) => s.start);
  const [objective, setObjective] = useState("");
  const [showOptions, setShowOptions] = useState(false);
  const [tinyMethod, setTinyMethod] = useState(
    () => presetId === "custom" && customFocus === 50 && customBreak === 10 && pomodoroCycles === 3,
  );

  const activePreset = VOYAGE_PRESETS[presetId];
  const focusMin = presetId === "custom" ? customFocus : activePreset.focusMinutes;
  const breakMin = presetId === "custom" ? customBreak : activePreset.breakMinutes;

  const selectPreset = (id: VoyagePresetId) => {
    setTinyMethod(false);
    set({ presetId: id });
  };

  const selectTinyMethod = () => {
    setTinyMethod(true);
    set({
      presetId: "custom",
      customFocusMinutes: 50,
      customBreakMinutes: 10,
      pomodoroCycles: 3,
    });
  };

  const depart = () => {
    start({
      presetId,
      focusMinutes: presetId === "custom" ? customFocus : undefined,
      breakMinutes: presetId === "custom" ? customBreak : undefined,
      cycles: pomodoroCycles,
      prep: true,
      objective: objective.trim() || null,
      assignmentId: null,
    });
    setObjective("");
    setShowOptions(false);
  };

  return (
    <div className="relative flex flex-col items-center">
      {showOptions && (
        <div className="mb-3 flex w-[min(92vw,440px)] flex-col gap-3 rounded-2xl bg-[#FFFDF7]/98 p-4 font-serif text-xs text-[#6D655C] shadow-[0_8px_24px_rgba(93,86,78,0.12)] backdrop-blur-sm">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold tracking-wide text-[#5D564E]">Pwedo Pomo</span>
            <span className="text-[11px] text-[#8E887F]">
              {pomodoroCycles} {pomodoroCycles === 1 ? "cycle" : "cycles"} · {focusMin}m focus / {breakMin}m break
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => selectPreset("coastal")}
              className={cx(
                "px-1.5 py-0.5 transition hover:underline underline-offset-4 focus:outline-none",
                !tinyMethod && presetId === "coastal"
                  ? "font-bold text-[#5D564E] underline underline-offset-4"
                  : "text-[#8E887F] hover:text-[#5D564E]",
              )}
            >
              25/5
            </button>
            <button
              type="button"
              onClick={() => selectPreset("ocean")}
              className={cx(
                "px-1.5 py-0.5 transition hover:underline underline-offset-4 focus:outline-none",
                !tinyMethod && presetId === "ocean"
                  ? "font-bold text-[#5D564E] underline underline-offset-4"
                  : "text-[#8E887F] hover:text-[#5D564E]",
              )}
            >
              50/10
            </button>
            <button
              type="button"
              onClick={selectTinyMethod}
              className={cx(
                "px-1.5 py-0.5 transition hover:underline underline-offset-4 focus:outline-none",
                tinyMethod
                  ? "font-bold text-[#5D564E] underline underline-offset-4"
                  : "text-[#8E887F] hover:text-[#5D564E]",
              )}
            >
              50/40/30 Tiny Method
            </button>
            <button
              type="button"
              onClick={() => selectPreset("custom")}
              className={cx(
                "px-1.5 py-0.5 transition hover:underline underline-offset-4 focus:outline-none",
                !tinyMethod && presetId === "custom"
                  ? "font-bold text-[#5D564E] underline underline-offset-4"
                  : "text-[#8E887F] hover:text-[#5D564E]",
              )}
            >
              Custom
            </button>
          </div>

          {presetId === "custom" && !tinyMethod && (
            <div className="flex items-center gap-2">
              <span>Custom:</span>
              <input
                type="number"
                min={1}
                max={240}
                value={customFocus}
                onChange={(e) => set({ customFocusMinutes: Math.max(1, Number(e.target.value) || 1) })}
                className="w-12 border-b border-[#A29C93]/45 bg-transparent py-0.5 text-center focus:outline-none"
                aria-label="Focus minutes"
              />
              <span>/</span>
              <input
                type="number"
                min={0}
                max={60}
                value={customBreak}
                onChange={(e) => set({ customBreakMinutes: Math.max(0, Number(e.target.value) || 0) })}
                className="w-12 border-b border-[#A29C93]/45 bg-transparent py-0.5 text-center focus:outline-none"
                aria-label="Break minutes"
              />
              <span>min</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-1">
              <span className="text-[#8E887F]">Cycles:</span>
              <select
                aria-label="Pwedo Pomo cycles"
                value={pomodoroCycles}
                onChange={(e) => set({ pomodoroCycles: Number(e.target.value) })}
                className="bg-transparent font-semibold text-[#5D564E] focus:outline-none"
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}x
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-1">
              <span className="text-[#8E887F]">Scene:</span>
              <select
                aria-label="Port theme"
                value={portTheme}
                onChange={(e) => set({ portTheme: e.target.value as PortThemeId })}
                className="bg-transparent font-semibold text-[#5D564E] focus:outline-none"
              >
                {(Object.keys(PORT_THEMES) as PortThemeId[]).map((id) => (
                  <option key={id} value={id}>
                    {PORT_THEMES[id].label}
                  </option>
                ))}
              </select>
            </label>

            <select
              aria-label="Relaxing audio"
              value={soundOn ? soundTrack : "off"}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "off") set({ soundOn: false });
                else set({ soundOn: true, soundTrack: val as SoundTrackId });
              }}
              className="bg-transparent font-semibold text-[#5D564E] focus:outline-none"
            >
              {AUDIO_OPTIONS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 border-t border-[#A29C93]/20 pt-2.5">
            <input
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && depart()}
              placeholder="What are you focusing on?"
              aria-label="Focus task"
              className="min-w-0 flex-1 bg-transparent py-1 text-sm text-[#5D564E] placeholder:text-[#A29C93] focus:outline-none"
            />
            <button
              type="button"
              onClick={depart}
              title="Start Pwedo Pomo"
              className="inline-flex items-center gap-1 px-2 py-1 text-sm font-semibold text-[#5D564E] transition hover:underline underline-offset-4 focus:outline-none"
            >
              <IconPlay size={13} />
              <span>Start</span>
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowOptions((v) => !v)}
        className="bg-transparent px-2 py-1 font-serif text-base tracking-[0.14em] text-[#5D564E] transition hover:underline underline-offset-4 focus:outline-none"
        title="Open Pwedo Pomo sessions & cycles"
      >
        Pwedo Pomo
      </button>
    </div>
  );
}

function ActivePill() {
  const v = useVoyage();
  const now = useNow(250);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [taskDraft, setTaskDraft] = useState("");

  useEffect(() => {
    if (!confirmEnd) return;
    const t = setTimeout(() => setConfirmEnd(false), 4000);
    return () => clearTimeout(t);
  }, [confirmEnd]);

  const ashore = v.phase === "shore-leave";
  const drifting = v.phase === "drifting";
  const remaining = ashore ? Math.max(0, (v.breakEndsAt ?? now) - now) : remainingFocusMs(v, now);
  const progress = ashore ? 1 - remaining / Math.max(1, v.breakMinutes * 60_000) : focusProgress(v, now);
  const roundLabel = `${Math.min(v.cyclesCompleted + (ashore ? 0 : 1), v.cyclesTotal)}/${v.cyclesTotal}`;

  const addQuickTask = () => {
    if (!taskDraft.trim()) return;
    v.addSessionTask(taskDraft.trim());
    setTaskDraft("");
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      {v.sessionTasks.length > 0 && (
        <div className="flex max-w-[92vw] flex-wrap items-center justify-center gap-1.5">
          {v.sessionTasks.map((t) => (
            <label
              key={t.id}
              className={cx(
                "flex cursor-pointer items-center gap-1.5 rounded-full border border-[#A29C93]/45 bg-[#FFFDF7]/92 px-2.5 py-0.5 text-xs font-semibold text-[#6D655C] transition",
                t.done && "line-through opacity-55",
              )}
            >
              <input
                type="checkbox"
                checked={t.done}
                onChange={() => v.toggleSessionTask(t.id)}
                className="accent-[#8E887F]"
              />
              <span className="max-w-36 truncate">{t.text}</span>
            </label>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2.5 rounded-full border border-[#A29C93]/60 bg-[#FAF6E8]/95 px-3.5 py-1.5 text-[#6D655C] shadow-[3px_3px_0_#EAE5DA] backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span
            className={cx(
              "rounded-full border border-[#A29C93]/40 px-2.5 py-0.5 font-serif text-[11px] tracking-[0.12em]",
              ashore ? "bg-[#E2F3EC] text-[#457263]" : drifting ? "bg-[#EFECE5] text-[#8E887F]" : "bg-[#FFF3A8] text-[#5D564E]",
            )}
          >
            Pwedo Pomo · {ashore ? "Break" : drifting ? "Paused" : "Focus"} {roundLabel}
          </span>
          <span
            className={cx(
              "font-display text-lg font-extrabold tabular-nums",
              ashore ? "text-[#457263]" : drifting ? "text-[#8E887F]" : "text-[#5D564E]",
            )}
            aria-live="off"
          >
            {formatClock(remaining)}
          </span>
        </div>

        <div className="hidden h-2 w-20 overflow-hidden rounded-full bg-[#EAE5DA] sm:block">
          <div
            className={cx(
              "h-full rounded-full transition-[width] duration-300",
              ashore ? "bg-[#7FC8B2]" : drifting ? "bg-[#B8B0A4]" : "bg-[#F2D27A]",
            )}
            style={{ width: `${Math.round(progress * 1000) / 10}%` }}
          />
        </div>

        <input
          value={taskDraft}
          onChange={(e) => setTaskDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addQuickTask()}
          placeholder="+ quick task..."
          aria-label="Add quick task"
          className="w-28 border-b border-[#A29C93]/45 bg-transparent px-1 py-0.5 text-xs text-[#6D655C] placeholder:text-[#A29C93] focus:border-[#A29C93] focus:outline-none sm:w-32"
        />

        <div className="flex items-center gap-1.5">
          {ashore ? (
            <button
              type="button"
              onClick={v.endBreak}
              className="inline-flex items-center gap-1 rounded-full border border-[#A29C93]/60 bg-[#E2F3EC] px-3 py-1 text-xs font-extrabold text-[#457263] transition hover:bg-[#D4ECE2] focus:outline-none"
            >
              <IconAnchor size={14} />
              {v.cyclesCompleted < v.cyclesTotal ? "Next round" : "Finish"}
            </button>
          ) : (
            <>
              {drifting ? (
                <button
                  type="button"
                  onClick={v.resume}
                  title="Resume (Space)"
                  className="inline-flex items-center gap-1 rounded-full border border-[#A29C93]/60 bg-[#E2F3EC] px-3 py-1 text-xs font-extrabold text-[#457263] transition hover:bg-[#D4ECE2] focus:outline-none"
                >
                  <IconPlay size={13} /> Resume
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => v.pause("manual")}
                  title="Pause (Space)"
                  className="inline-flex items-center gap-1 rounded-full border border-[#A29C93]/55 bg-[#FFFDF7] px-3 py-1 text-xs font-bold text-[#6D655C] transition hover:bg-[#EFE9DA] focus:outline-none"
                >
                  <IconPause size={13} /> Pause
                </button>
              )}
              <button
                type="button"
                onClick={() => (confirmEnd ? (setConfirmEnd(false), v.abandon()) : setConfirmEnd(true))}
                className={cx(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold transition focus:outline-none",
                  confirmEnd
                    ? "border-[#D89A90] bg-[#FDE8E4] text-[#8A4A40]"
                    : "border-[#A29C93]/50 bg-[#FFFDF7] text-[#8E887F] hover:text-[#6D655C]",
                )}
              >
                <IconStop size={12} /> {confirmEnd ? "Confirm?" : "End"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
