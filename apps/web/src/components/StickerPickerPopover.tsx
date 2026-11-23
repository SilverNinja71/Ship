// Spring-animated popover for stamping original die-cut stickers onto planner days/sessions.

import { useModalBehavior } from "../hooks/useModalBehavior.js";
import { DieCutSticker, STICKERS } from "./StickerArt.js";
import { cx } from "./ui.js";

export function StickerPickerPopover({
  selected,
  onToggle,
  onClose,
}: {
  selected: readonly string[];
  onToggle: (stickerId: string) => void;
  onClose: () => void;
}) {
  const ref = useModalBehavior(onClose);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Choose die-cut study stickers"
      tabIndex={-1}
      className="popover-enter absolute right-0 bottom-full z-30 mb-2 w-64 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-2 shadow-sm outline-none"
    >
      <div className="rounded-[12px] border border-[rgb(0_0_0_/_0.06)] bg-[var(--surface-2)] p-2.5">
        <div className="mb-2 flex items-center justify-between text-[11px] text-[var(--muted-ink)]">
          <span className="font-bold text-[var(--page-ink)]">Die-cut Stickers (up to 3)</span>
          <button
            type="button"
            onClick={onClose}
            className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
          >
            Done
          </button>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {STICKERS.map((s) => {
            const active = selected.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onToggle(s.id)}
                title={s.label}
                aria-pressed={active}
                className={cx(
                  "grid place-items-center rounded-xl p-1 transition-[transform,background-color] duration-150 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--page-ink)]",
                  active ? "bg-[#FFF3A8]" : "bg-[var(--surface-1)] hover:bg-[var(--surface-3)]",
                )}
              >
                <DieCutSticker id={s.id} size={30} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
