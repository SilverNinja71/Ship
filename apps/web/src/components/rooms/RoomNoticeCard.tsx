// What happened when a sailor lost their room, told by Lumi: asked to leave, drifted out while
// away, the skipper closed it, it docked for the day, or they left it themselves. Kind words, a
// way back in where there is one, and Report wherever the room still exists (a sailor who left,
// drifted out or was removed can still report it).

import { useRef, useState } from "react";
import { roomNameText, roomProblem } from "../../lib/roomRules.js";
import { lookFor, useRooms } from "../../stores/roomStore.js";
import type { RoomNotice } from "../../stores/roomStore.js";
import { PastelMinionBadge } from "../PastelMinionBadge.js";
import { HELD, ROOM_FOCUS_RING, SEAFOAM_BUTTON, YELLOW_BUTTON, heldButton, roomAction, useCatchFocus } from "./roomStyle.js";
import { ReportRoom } from "./ReportRoom.js";

const TEXT: Record<RoomNotice, (name: string) => string> = {
  removed: () => "The skipper asked you to leave this room. There are plenty of other boats!",
  drifted: (name) => `You drifted out of ${name} while you were away.`,
  // The room stopped letting this sailor read it: swept after being away, or removed by the skipper
  // (the database doesn't say which), so the words fit both.
  gone: (name) => `You're no longer aboard ${name}. If you drifted away for a while, you can hop back in.`,
  closed: () => "The skipper closed the room. Thanks for sailing together!",
  ended: () => "This room has docked for the day. Start a fresh one?",
  left: (name) => `You left ${name}. Your minutes stay with the crew.`,
};

/** Notices about a room that still exists, which this sailor can still report. */
const REPORTABLE: readonly RoomNotice[] = ["removed", "drifted", "gone", "left"];

/**
 * `onRejoin` gets the room's code and the words to show when Hop back in is refused (the notice
 * is gone by then, so the panel shows that room's Join card with the reason).
 */
export function RoomNoticeCard({ notice, onStart, onRejoin }: { notice: RoomNotice; onStart: () => void; onRejoin: (code: string, refusal: string) => void }) {
  const room = useRooms((s) => s.noticeRoom);
  const [busy, setBusy] = useState(false);
  const dismiss = () => useRooms.getState().dismissNotice();
  const name = room ? roomNameText(room.name) : "the room";
  // Losing the room while the panel is open swaps the crew for this note: it takes the focus the crew's buttons had.
  const message = useRef<HTMLParagraphElement>(null);
  useCatchFocus(message);

  const hopBack = async () => {
    if (!room) return;
    const code = room.code;
    setBusy(true);
    const rooms = useRooms.getState();
    // Joining clears the notice at once; the nickname this sailor had in this room comes back with them.
    const problem = await roomAction(() => rooms.joinRoom(code, lookFor(code)), "join");
    setBusy(false);
    if (problem || useRooms.getState().current !== code) onRejoin(code, problem ?? roomProblem("permission-denied", "join"));
  };

  return (
    <div className="mx-auto max-w-xl rounded-3xl border border-[#DCCCF0] bg-[#F7F2FD] px-5 py-6 text-center text-[#56406A] shadow-[3px_3px_0_#E6DCF3] [--ring:currentColor]">
      <div className="grid justify-items-center gap-3">
        <PastelMinionBadge costume="bunny" size={72} />
        <p className="text-xs tracking-[0.18em] uppercase opacity-90">A note from Lumi</p>
        <p ref={message} tabIndex={-1} className="max-w-md font-display text-xl leading-snug outline-none">
          <span className="sr-only">Lumi: </span>
          {TEXT[notice](name)}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {(notice === "drifted" || notice === "gone") && room && (
            <button type="button" {...heldButton(busy, () => void hopBack())} className={`${SEAFOAM_BUTTON} ${HELD}`}>
              {busy ? "Climbing aboard…" : "Hop back in"}
            </button>
          )}
          {notice === "ended" && (
            <button
              type="button"
              onClick={() => {
                dismiss();
                onStart();
              }}
              className={YELLOW_BUTTON}
            >
              Start a room
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            className={notice === "removed" || notice === "closed" ? YELLOW_BUTTON : `rounded-md px-1.5 py-0.5 text-sm underline-offset-4 hover:underline ${ROOM_FOCUS_RING}`}
          >
            OK
          </button>
        </div>
        {REPORTABLE.includes(notice) && room && (
          <div className="grid justify-items-center gap-1">
            {notice === "left" && <p className="max-w-sm text-sm">If someone there made you feel unsafe, you can still report the room, and tell an adult you trust.</p>}
            <ReportRoom code={room.code} label="⚑ Report this room" onPastel />
          </div>
        )}
      </div>
    </div>
  );
}
