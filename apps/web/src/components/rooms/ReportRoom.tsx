// ⚑ Report room: one report per sailor, with a reason, counted on the room without saying who
// sent it. Sailors aboard can report, and so can a sailor the skipper removed.

import { useRef, useState } from "react";
import type { RoomReportReason } from "@ship/shared-types";
import { useRooms } from "../../stores/roomStore.js";
import { useUi } from "../../stores/uiStore.js";
import { cx } from "../ui.js";
import { HELD, QUIET_BUTTON, chipClass, heldButton, roomAction, useCatchFocus, useReturnFocus } from "./roomStyle.js";

const REASONS: { id: RoomReportReason; label: string }[] = [
  { id: "spam", label: "Spam or ads" },
  { id: "unkind", label: "Unkind or bullying" },
  { id: "personal", label: "Someone's personal details" },
  { id: "off", label: "Not about studying" },
];

/** `onPastel` keeps the button in the surrounding card's own ink, for pastel cards. */
export function ReportRoom({ code, label = "⚑ Report room", onPastel = false }: { code: string; label?: string; onPastel?: boolean }) {
  const quiet = onPastel ? "rounded-md px-1.5 py-0.5 text-sm underline-offset-4 opacity-85 hover:underline hover:opacity-100" : QUIET_BUTTON;
  const reported = useRooms((s) => s.reported.includes(code));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  // Never mind puts the focus back on ⚑ Report.
  useReturnFocus(open, opener);

  const report = async (reason: RoomReportReason) => {
    setBusy(true);
    const problem = await roomAction(() => useRooms.getState().report(reason, code), "report");
    useUi.getState().toast(problem ?? "Thanks for telling us. Open rooms reported by a few sailors who've been aboard a while leave the open list.", problem ? "warning" : "info");
    setBusy(false);
    if (!problem) setOpen(false);
  };

  if (reported) return <ReportedMark onPastel={onPastel} />;
  if (!open)
    return (
      <button ref={opener} type="button" onClick={() => setOpen(true)} className={quiet}>
        {label}
      </button>
    );
  // On a pastel card the reasons keep a light fill and the card's ink, whatever the theme.
  return (
    <div className={cx("w-full space-y-1.5 rounded-2xl px-3 py-2.5 text-left", onPastel ? "bg-white/60" : "bg-[var(--surface-2)]")}>
      <ReasonsQuestion onPastel={onPastel} />
      <div className="flex flex-wrap gap-1.5">
        {REASONS.map((r) => (
          <button key={r.id} type="button" {...heldButton(busy, () => void report(r.id))} className={cx(chipClass(false, { pastel: onPastel }), HELD)}>
            {r.label}
          </button>
        ))}
        <button type="button" onClick={() => setOpen(false)} className={chipClass(false, { pastel: onPastel })}>
          Never mind
        </button>
      </div>
    </div>
  );
}

/** The reasons' question takes the focus from the ⚑ button it replaced, so it's read out first. */
function ReasonsQuestion({ onPastel }: { onPastel: boolean }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useCatchFocus(ref);
  return (
    <p ref={ref} tabIndex={-1} className={cx("text-sm outline-none", !onPastel && "text-[var(--page-ink)]")}>
      What's wrong? Nobody in the room sees who reported.
    </p>
  );
}

/** "Reported ✓" takes the focus from the reason that was picked, so the keyboard doesn't fall back to the page. */
function ReportedMark({ onPastel }: { onPastel: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useCatchFocus(ref);
  return (
    <span ref={ref} tabIndex={-1} className={cx("px-1.5 text-sm outline-none", onPastel ? "opacity-85" : "text-[var(--muted-ink)]")}>
      Reported ✓
    </span>
  );
}
