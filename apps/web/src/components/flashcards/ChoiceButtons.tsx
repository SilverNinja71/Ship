// Multiple-choice answers, numbered 1–4. Practice's Learn and the Study Rooms' Pass the Bottle
// both use it. Once `reveal` is set the buttons lock: the right answer turns seafoam and a wrong
// pick coral, so the sailor sees both.

import { useEffect } from "react";
import { cx } from "../ui.js";

/** True while the sailor is typing somewhere, so a "1" typed into a box never picks an answer. */
function typingIn(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
}

export function ChoiceButtons({
  options,
  onPick,
  reveal,
  disabled = false,
  keys = false,
}: {
  options: readonly string[];
  onPick: (option: string) => void;
  reveal?: { right: string; picked: string };
  disabled?: boolean;
  /** Listen for keys 1–4 on the page (Learn listens for them itself, along with Enter). */
  keys?: boolean;
}) {
  const locked = disabled || Boolean(reveal);

  useEffect(() => {
    if (!keys || locked) return;
    const onKey = (e: KeyboardEvent) => {
      if (!/^[1-4]$/.test(e.key) || e.ctrlKey || e.metaKey || e.altKey || typingIn(e.target)) return;
      const pick = options[Number(e.key) - 1];
      if (pick === undefined) return;
      e.preventDefault();
      onPick(pick);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keys, locked, options, onPick]);

  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {options.map((opt, i) => {
        const isAnswer = reveal !== undefined && opt === reveal.right;
        const picked = reveal?.picked === opt;
        return (
          <button
            key={opt}
            type="button"
            disabled={locked}
            onClick={() => onPick(opt)}
            className={cx(
              "rounded-xl border px-3 py-2.5 text-left transition",
              !reveal && !disabled && "border-[var(--border-subtle)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)]",
              !reveal && disabled && "border-[var(--border-subtle)] bg-[var(--surface-1)] opacity-60",
              reveal && isAnswer && "border-seafoam-700 bg-seafoam-500/15 font-bold",
              reveal && picked && !isAnswer && "border-coral-700 bg-coral-500/15",
              reveal && !isAnswer && !picked && "border-[var(--border-subtle)] opacity-60",
            )}
          >
            <span className="mr-2 text-xs text-[var(--muted-ink)]">{i + 1}</span>
            {opt}
          </button>
        );
      })}
    </div>
  );
}
