// Cheers and stickers: picked from fixed lists, never typed, so nobody can send anything unkind
// or personal. Only the latest one is kept, on your own entry, and the crew sees it for a few
// seconds. The room allows one write every 15 s, so a ring shows when the next can go.

import { useCallback, useEffect, useRef, useState } from "react";
import { ROOM_CHEERS, ROOM_LIMITS, STICKER_IDS } from "@ship/shared-types";
import { useRooms } from "../../stores/roomStore.js";
import { DieCutSticker, STICKERS } from "../StickerArt.js";
import { cx } from "../ui.js";
import { PAPER_CARD, PAPER_SHADOW, ROOM_FOCUS_RING, chipClass, usePopoverDismiss } from "./roomStyle.js";

const GAP_MS = ROOM_LIMITS.writeGapSeconds * 1000;

/** When this device last sent a cheer; kept outside the component so closing the panel doesn't reset the wait. */
let lastSentAt = 0;

export function CheerBar() {
  const muted = useRooms((s) => s.muted);
  const [sentAt, setSentAt] = useState(lastSentAt);
  const [picker, setPicker] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const waiting = now - sentAt < GAP_MS;
  // Escape or a tap outside closes the sticker picker (and only the picker, not the room).
  const pickerRef = useRef<HTMLDivElement>(null);
  const closePicker = useCallback(() => setPicker(false), []);
  usePopoverDismiss(picker && !waiting, pickerRef, closePicker);

  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [waiting]);

  const send = (say: number) => {
    useRooms.getState().cheer(say);
    lastSentAt = Date.now();
    setSentAt(lastSentAt);
    setNow(lastSentAt);
    setPicker(false);
  };

  const left = Math.max(0, GAP_MS - (now - sentAt));
  return (
    <section aria-label="Cheers" className={cx(PAPER_CARD, "px-4 py-3.5")}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="font-display text-lg font-normal">Cheer the crew</h3>
        {waiting && (
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted-ink)]">
            <svg width="16" height="16" viewBox="0 0 20 20" className="-rotate-90" aria-hidden="true">
              <circle cx="10" cy="10" r="8" fill="none" stroke="#F1E3A0" strokeWidth="3" />
              <circle cx="10" cy="10" r="8" fill="none" stroke="#E8B84A" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${50.3 * (left / GAP_MS)} 50.3`} />
            </svg>
            Next cheer in {Math.ceil(left / 1000)} s
          </span>
        )}
        {/* Screen readers hear once when cheering is open again, not every second of the wait. */}
        <span className="sr-only" role="status" aria-live="polite">
          {!waiting && sentAt > 0 ? "You can cheer again." : ""}
        </span>
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-[var(--muted-ink)]">
          <input type="checkbox" checked={muted} onChange={(e) => useRooms.getState().setMuted(e.target.checked)} className="size-3.5 accent-[#7FC8B2]" />
          Mute cheers
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <div ref={pickerRef} className="relative">
          <button
            type="button"
            disabled={waiting}
            aria-expanded={picker}
            onClick={() => setPicker(!picker)}
            className={cx("inline-flex items-center gap-1 rounded-full border border-[#F1E3A0] bg-[#FFF9DC] px-2.5 py-0.5 text-xs text-[#4B3A0B] disabled:opacity-50", ROOM_FOCUS_RING)}
          >
            <DieCutSticker id="star-sparkle" size={16} /> Stickers
          </button>
          {picker && !waiting && (
            <div role="dialog" aria-label="Send a sticker" className={cx("popover-enter absolute left-0 top-full z-20 mt-2 w-64 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-2", PAPER_SHADOW)}>
              <div className="grid grid-cols-4 gap-1.5 rounded-[12px] bg-[var(--surface-2)] p-2">
                {STICKERS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    title={s.label}
                    aria-label={`Send the ${s.label} sticker`}
                    onClick={() => send(ROOM_CHEERS.length + STICKER_IDS.indexOf(s.id))}
                    className={cx("grid place-items-center rounded-xl bg-[var(--surface-1)] p-1 transition-[transform,background-color] duration-150 hover:scale-105 hover:bg-[var(--surface-3)]", ROOM_FOCUS_RING)}
                  >
                    <DieCutSticker id={s.id} size={30} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {ROOM_CHEERS.map((text, i) => (
          <button key={text} type="button" disabled={waiting} onClick={() => send(i)} className={cx(chipClass(false), "disabled:opacity-50")}>
            {text}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--muted-ink)]">Your crew sees your cheer for a few seconds. There's no typed chat in rooms.</p>
    </section>
  );
}
