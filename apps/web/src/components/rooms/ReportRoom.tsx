// ⚑ Report room: one report per sailor, with a reason, counted on the room without saying who
// sent it. Sailors aboard can report, and so can a sailor the skipper removed.

import { useState } from "react";
import type { RoomReportReason } from "@ship/shared-types";
import { useRooms } from "../../stores/roomStore.js";
import { useUi } from "../../stores/uiStore.js";
import { cx } from "../ui.js";
import { QUIET_BUTTON, chipClass, roomAction } from "./roomStyle.js";

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

  const report = async (reason: RoomReportReason) => {
    setBusy(true);
    const problem = await roomAction(() => useRooms.getState().report(reason, code), "report");
    useUi.getState().toast(problem ?? "Thanks for telling us. Rooms with a few reports leave the open list.", problem ? "warning" : "info");
    setBusy(false);
    if (!problem) setOpen(false);
  };

  if (reported) return <span className={cx("px-1.5 text-sm", onPastel ? "opacity-85" : "text-[var(--muted-ink)]")}>Reported ✓</span>;
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className={quiet}>
        {label}
      </button>
    );
  return (
    <div className="w-full space-y-1.5 rounded-2xl bg-[var(--surface-2)] px-3 py-2.5 text-left">
      <p className="text-sm text-[var(--page-ink)]">What's wrong? Nobody in the room sees who reported.</p>
      <div className="flex flex-wrap gap-1.5">
        {REASONS.map((r) => (
          <button key={r.id} type="button" disabled={busy} onClick={() => void report(r.id)} className={cx(chipClass(false), "disabled:opacity-50")}>
            {r.label}
          </button>
        ))}
        <button type="button" onClick={() => setOpen(false)} className={chipClass(false)}>
          Never mind
        </button>
      </div>
    </div>
  );
}
