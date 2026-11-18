// Compact Pwedo Pomo timer pill at the bottom of the Mr. Tiny Studio scene.

import { useEffect, useState } from "react";
import { VOYAGE_PRESETS } from "@ship/shared-types";
import type { VoyagePresetId } from "@ship/shared-types";
import { QUICK_AUDIO_SUGGESTIONS, findCuratedTrack } from "../lib/audio.js";
import { formatClock } from "../lib/format.js";
import { focusProgress, remainingFocusMs } from "../lib/voyageLogic.js";
import { selectAudioTrack, useActiveAudioTrack } from "../hooks/useAmbiance.js";
import { setPwedoPomoOpen } from "../ship-engine/StudySceneRenderer.js";
import { useSettings } from "../stores/settingsStore.js";
import { onVoyageEvent, useVoyage } from "../stores/voyageStore.js";
import { AudioBrowserModal } from "./AudioBrowserModal.js";
import { useNow } from "./Hud.js";
import { IconAnchor, IconPause, IconPlay, IconStop, IconSwap } from "./icons.js";
import { cx } from "./ui.js";

function scrollToQuickReflection(focusInput = true): void {
  const textarea = document.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label*="how can I improve next session"]',
  );
  const target = textarea ?? document.getElementById("study-materials");
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  if (focusInput && textarea) {
    window.setTimeout(() => textarea.focus({ preventScroll: true }), 450);
  }
}

export function VoyageDock() {
  const phase = useVoyage((s) => s.phase);
  const prepEndsAt = useVoyage((s) => s.prepEndsAt);
  const [showMusicBrowser, setShowMusicBrowser] = useState(false);

  // Guide user toward the Quick Reflection when a focus round completes.
  useEffect(() => {
    return onVoyageEvent((kind) => {
      if (kind === "focus-complete") {
        window.setTimeout(() => scrollToQuickReflection(true), 650);
      }
    });
  }, []);

  // Ensure Pwedo play scene is closed once a voyage starts or prepares.
  useEffect(() => {
    if (phase !== "docked" || prepEndsAt !== null) {
      setPwedoPomoOpen(false);
    }
  }, [phase, prepEndsAt]);

  return (
    <section
      aria-label="Pwedo Pomo"
      className="pointer-events-auto relative z-20 flex flex-col items-center gap-1.5"
    >
      {phase === "docked" ? (
        prepEndsAt !== null ? (
          <BearingsPrep />
        ) : (
          <DockedPill onOpenMusicBrowser={() => setShowMusicBrowser(true)} />
        )
      ) : (
        <ActivePill onOpenMusicBrowser={() => setShowMusicBrowser(true)} />
      )}
      <a
        href="#study-materials"
        className="text-[11px] font-semibold tracking-wide text-[#8E887F] transition hover:text-[#6D655C]"
      >
        Scroll for study sheets &amp; task form ↓
      </a>

      {showMusicBrowser && <AudioBrowserModal onClose={() => setShowMusicBrowser(false)} />}
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
        Preparing in {formatClock(remaining)}
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

function DockedPill({ onOpenMusicBrowser }: { onOpenMusicBrowser: () => void }) {
  const presetId = useSettings((s) => s.presetId);
  const customFocus = useSettings((s) => s.customFocusMinutes);
  const customBreak = useSettings((s) => s.customBreakMinutes);
  const pomodoroCycles = useSettings((s) => s.pomodoroCycles);
  const soundOn = useSettings((s) => s.soundOn);
  const set = useSettings((s) => s.set);
  const activeTrackId = useActiveAudioTrack();
  const activeTrack = findCuratedTrack(activeTrackId);

  const start = useVoyage((s) => s.start);
  const [objective, setObjective] = useState("");
  const [showOptions, setShowOptions] = useState(false);
  const [showAudioPicker, setShowAudioPicker] = useState(false);
  const [tinyMethod, setTinyMethod] = useState(
    () => presetId === "custom" && customFocus === 50 && customBreak === 10 && pomodoroCycles === 3,
  );

  useEffect(() => {
    return () => setPwedoPomoOpen(false);
  }, []);

  const toggleOptions = () => {
    setShowOptions((prev) => {
      const next = !prev;
      setPwedoPomoOpen(next);
      if (!next) setShowAudioPicker(false);
      return next;
    });
  };

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
    setPwedoPomoOpen(false);
    setShowAudioPicker(false);
    setShowOptions(false);
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
  };

  return (
    <div className="relative flex flex-col items-center">
      {showOptions && (
        <div className="mb-3 flex w-[min(92vw,460px)] flex-col gap-3 rounded-2xl border border-[#A29C93]/40 bg-[#FFFDF7]/98 p-4 font-serif text-xs text-[#6D655C] shadow-[0_8px_24px_rgba(93,86,78,0.12)] backdrop-blur-sm">
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

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
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

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAudioPicker((v) => !v)}
                aria-expanded={showAudioPicker}
                className={cx(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-sans text-[11px] font-semibold transition focus:outline-none",
                  soundOn
                    ? "border-[#A29C93]/60 bg-[#FFF3A8]/85 text-[#5D564E]"
                    : "border-[#A29C93]/40 bg-[#FAF6E8] text-[#6D655C] hover:bg-[#EFE9DA]",
                )}
              >
                <span>{soundOn ? `♪ ${activeTrack.title}` : "Audio: Off"}</span>
                <span className="text-[10px] text-[#8E887F]">{showAudioPicker ? "▲" : "▼"}</span>
              </button>

              <button
                type="button"
                onClick={() => scrollToQuickReflection(true)}
                className="rounded-full px-2 py-1 font-sans text-[11px] font-semibold text-[#8E887F] transition hover:bg-[#FAF6E8] hover:text-[#5D564E] focus:outline-none"
                title="Jump to Quick Reflection"
              >
                Reflect ↓
              </button>
            </div>
          </div>

          {showAudioPicker && (
            <div className="flex flex-col gap-2 rounded-xl border border-[#A29C93]/35 bg-[#FAF6E8]/90 p-2.5 font-sans">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold tracking-wide text-[#6D655C]">
                  Focus Audio Suggestions
                </span>
                {soundOn && (
                  <button
                    type="button"
                    onClick={() => set({ soundOn: false })}
                    className="rounded-full border border-[#A29C93]/45 bg-white px-2 py-0.5 text-[10px] font-semibold text-[#8E887F] transition hover:text-[#5D564E]"
                  >
                    Turn Off
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {QUICK_AUDIO_SUGGESTIONS.map((item) => {
                  const selected = soundOn && activeTrackId === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectAudioTrack(item.id, true)}
                      className={cx(
                        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition focus:outline-none",
                        selected
                          ? "border-[#A29C93]/70 bg-[#FFF3A8] text-[#5D564E]"
                          : "border-[#A29C93]/35 bg-white text-[#6D655C] hover:bg-[#F4EFE2]",
                      )}
                    >
                      <span>{item.emoji}</span>
                      <span>{item.title}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between border-t border-[#A29C93]/20 pt-1.5">
                <span className="text-[10px] text-[#8E887F]">
                  Auto-pauses when other media plays
                </span>
                <button
                  type="button"
                  onClick={onOpenMusicBrowser}
                  className="rounded-full border border-[#A29C93]/50 bg-white px-2.5 py-0.5 text-[11px] font-bold text-[#5D564E] transition hover:bg-[#FFF3A8]/60 focus:outline-none"
                >
                  Show more →
                </button>
              </div>
            </div>
          )}

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
              className="inline-flex items-center gap-1 rounded-full bg-[#FFF3A8] px-3 py-1 text-sm font-semibold text-[#5D564E] transition hover:bg-[#FCEB8B] focus:outline-none"
            >
              <IconPlay size={13} />
              <span>Start</span>
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={toggleOptions}
        className="bg-transparent px-2 py-1 font-serif text-base tracking-[0.14em] text-[#5D564E] transition hover:underline underline-offset-4 focus:outline-none"
        title="Open Pwedo Pomo sessions & cycles"
      >
        Pwedo Pomo
      </button>
    </div>
  );
}

function ActivePill({ onOpenMusicBrowser }: { onOpenMusicBrowser: () => void }) {
  const v = useVoyage();
  const soundOn = useSettings((s) => s.soundOn);
  const setSettings = useSettings((s) => s.set);
  const activeTrackId = useActiveAudioTrack();
  const activeTrack = findCuratedTrack(activeTrackId);
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

  const handleBreakAction = () => {
    const isFinalRound = v.cyclesCompleted >= v.cyclesTotal;
    v.endBreak();
    if (isFinalRound) {
      window.setTimeout(() => scrollToQuickReflection(true), 250);
    }
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

      <div className="flex flex-wrap items-center justify-center gap-2 rounded-full border border-[#A29C93]/60 bg-[#FAF6E8]/95 px-3.5 py-1.5 text-[#6D655C] shadow-[3px_3px_0_#EAE5DA] backdrop-blur-sm">
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

        <div className="hidden h-2 w-16 overflow-hidden rounded-full bg-[#EAE5DA] sm:block">
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
          className="w-24 border-b border-[#A29C93]/45 bg-transparent px-1 py-0.5 text-xs text-[#6D655C] placeholder:text-[#A29C93] focus:border-[#A29C93] focus:outline-none sm:w-28"
        />

        {/* Clear Audio On/Off toggle on the active focus bar */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSettings({ soundOn: !soundOn })}
            aria-pressed={soundOn}
            title={soundOn ? `Turn off audio (${activeTrack.title})` : `Turn on audio (${activeTrack.title})`}
            className={cx(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold transition focus:outline-none",
              soundOn
                ? "border-[#A29C93]/60 bg-[#FFF3A8] text-[#5D564E] hover:bg-[#FCEB8B]"
                : "border-[#A29C93]/45 bg-[#FFFDF7] text-[#8E887F] hover:text-[#5D564E]",
            )}
          >
            <span>{soundOn ? "♪ Audio: On" : "Audio: Off"}</span>
          </button>
          <button
            type="button"
            onClick={onOpenMusicBrowser}
            title="Browse focus tracks"
            aria-label="Browse focus tracks"
            className="rounded-full border border-[#A29C93]/45 bg-[#FFFDF7] px-2 py-1 text-xs font-bold text-[#6D655C] transition hover:bg-[#EFE9DA] focus:outline-none"
          >
            ♫
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {ashore ? (
            <>
              <button
                type="button"
                onClick={() => scrollToQuickReflection(true)}
                className="rounded-full border border-[#A29C93]/50 bg-[#FFFDF7] px-2.5 py-1 text-xs font-bold text-[#6D655C] transition hover:bg-[#EFE9DA] focus:outline-none"
              >
                Reflect ↓
              </button>
              <button
                type="button"
                onClick={handleBreakAction}
                className="inline-flex items-center gap-1 rounded-full border border-[#A29C93]/60 bg-[#E2F3EC] px-3 py-1 text-xs font-extrabold text-[#457263] transition hover:bg-[#D4ECE2] focus:outline-none"
              >
                <IconAnchor size={14} />
                {v.cyclesCompleted < v.cyclesTotal ? "Next round" : "Finish"}
              </button>
            </>
          ) : (
            <>
              {drifting ? (
                <button
                  type="button"
                  onClick={v.resume}
                  title="Resume (Space)"
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[#E2F3EC] px-3 py-1 text-xs font-extrabold text-[#386657] transition hover:bg-[#D4ECE2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
                >
                  <IconSwap swapKey="resume">
                    <IconPlay size={13} />
                  </IconSwap>{" "}
                  Resume
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => v.pause("manual")}
                  title="Pause (Space)"
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-1 text-xs font-bold text-[var(--page-ink)] transition hover:bg-[#EFE9DA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
                >
                  <IconSwap swapKey="pause">
                    <IconPause size={13} />
                  </IconSwap>{" "}
                  Pause
                </button>
              )}
              <button
                type="button"
                onClick={() => (confirmEnd ? (setConfirmEnd(false), v.abandon()) : setConfirmEnd(true))}
                className={cx(
                  "inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]",
                  confirmEnd
                    ? "bg-[#FDE8E4] text-[#8A3B31]"
                    : "bg-[var(--surface-1)] text-[var(--muted-ink)] hover:text-[var(--page-ink)]",
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
