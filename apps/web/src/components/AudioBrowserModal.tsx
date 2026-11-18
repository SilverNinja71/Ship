// Focus Soundscapes browser modal (extracted from VoyageDock for modularity).

import { useState } from "react";
import { selectAudioTrack, useActiveAudioTrack } from "../hooks/useAmbiance.js";
import { CURATED_FOCUS_TRACKS, findCuratedTrack } from "../lib/audio.js";
import type { CuratedTrack } from "../lib/audio.js";
import { useSettings } from "../stores/settingsStore.js";
import { cx } from "./ui.js";

const CATEGORIES: Array<"All" | CuratedTrack["category"]> = [
  "All",
  "Suggestions",
  "Lo-fi & Beats",
  "Nature & ASMR",
  "Piano & Ambient",
];

export function AudioBrowserModal({ onClose }: { onClose: () => void }) {
  const soundOn = useSettings((s) => s.soundOn);
  const volume = useSettings((s) => s.ambienceVolume);
  const setSettings = useSettings((s) => s.set);
  const activeTrackId = useActiveAudioTrack();
  const [category, setCategory] = useState<"All" | CuratedTrack["category"]>("All");
  const [query, setQuery] = useState("");

  const filtered = CURATED_FOCUS_TRACKS.filter((t) => {
    const matchesCat = category === "All" || t.category === category;
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q || t.title.toLowerCase().includes(q) || t.subtitle.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
    return matchesCat && matchesQuery;
  });

  const activeTrack = findCuratedTrack(activeTrackId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(0_0_0_/_0.26)] p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Focus Audio Library"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[84dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-2 text-[var(--page-ink)] shadow-sm">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-[rgb(0_0_0_/_0.06)] bg-[var(--surface-1)]">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface-2)] px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-xl border border-[var(--border-subtle)] bg-[#FFF3A8] text-lg text-[#4D453E]">
                ♫
              </span>
              <div>
                <h2 className="font-serif text-base font-bold tracking-wide text-[var(--page-ink)]">
                  Focus Soundscapes
                </h2>
                <p className="text-[11px] text-[var(--muted-ink)]">
                  Curated study playlists &amp; ambient mixes · Auto-pauses for other media
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSettings({ soundOn: !soundOn })}
                className={cx(
                  "rounded-full border border-[var(--border-subtle)] px-3 py-1 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]",
                  soundOn
                    ? "bg-[#FFF3A8] text-[#4D453E]"
                    : "bg-[var(--surface-1)] text-[var(--muted-ink)] hover:text-[var(--page-ink)]",
                )}
              >
                {soundOn ? "Audio: On" : "Audio: Off"}
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close audio library"
                className="grid size-8 place-items-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface-1)] text-sm font-bold text-[var(--page-ink)] transition hover:bg-[#EFE9DA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Search & category chips */}
          <div className="flex flex-col gap-2.5 border-b border-[var(--border-subtle)] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search rain, piano, lo-fi, library..."
                aria-label="Search focus tracks"
                className="min-w-[180px] flex-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3.5 py-1.5 text-xs text-[var(--page-ink)] placeholder:text-[var(--muted-ink)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--page-ink)]"
              />
              <label className="flex items-center gap-2 text-[11px] font-semibold text-[var(--muted-ink)]">
                <span>Vol</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) => setSettings({ ambienceVolume: Number(e.target.value) })}
                  aria-label="Audio volume"
                  className="w-20 accent-[#6B635B]"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={cx(
                    "rounded-full border border-[var(--border-subtle)] px-3 py-1 text-[11px] font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]",
                    category === cat
                      ? "bg-[#FFF3A8] text-[#4D453E]"
                      : "bg-[var(--surface-1)] text-[var(--muted-ink)] hover:bg-[var(--surface-2)] hover:text-[var(--page-ink)]",
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Track grid */}
          <div className="grid flex-1 grid-cols-1 gap-2.5 overflow-y-auto p-4 sm:grid-cols-2">
            {filtered.map((track) => {
              const isActive = soundOn && activeTrackId === track.id;
              return (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => selectAudioTrack(track.id, true)}
                  className={cx(
                    "group flex items-center gap-3 rounded-2xl border border-[var(--border-subtle)] p-2.5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]",
                    isActive
                      ? "bg-[#FFF8D6]"
                      : "bg-[var(--surface-1)] hover:bg-[var(--surface-2)]",
                  )}
                >
                  <div
                    className="relative grid size-12 shrink-0 place-items-center rounded-[10px] border border-[rgb(0_0_0_/_0.08)] text-xl"
                    style={{ backgroundColor: track.coverBg }}
                  >
                    <span>{track.emoji}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-bold text-[var(--page-ink)]">{track.title}</div>
                    <div className="truncate text-[11px] text-[var(--muted-ink)]">{track.subtitle}</div>
                    <div className="mt-0.5 text-[10px] font-semibold text-[var(--muted-ink)]">{track.category}</div>
                  </div>
                  <span
                    className={cx(
                      "grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold transition",
                      isActive
                        ? "bg-[#5C544B] text-[#FFFDF7]"
                        : "bg-[var(--surface-2)] text-[var(--page-ink)] group-hover:bg-[#FFF3A8]",
                    )}
                  >
                    {isActive ? "❚❚" : "▶"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Now playing footer */}
          <div className="flex items-center justify-between border-t border-[var(--border-subtle)] bg-[var(--surface-2)] px-4 py-2.5 text-xs">
            <div className="flex items-center gap-2 truncate">
              <span>{activeTrack.emoji}</span>
              <span className="font-bold text-[var(--page-ink)]">
                {soundOn ? `Playing: ${activeTrack.title}` : `Selected: ${activeTrack.title} (Paused)`}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-1 text-[11px] font-bold text-[var(--page-ink)] hover:bg-[#EFE9DA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
