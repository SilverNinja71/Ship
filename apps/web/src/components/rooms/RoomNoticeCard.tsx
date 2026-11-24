// What happened when a sailor lost their room, told by Lumi: asked to leave, drifted out while
// away, the skipper closed it, or it docked for the day. Kind words, and a way back in where
// there is one.

import { useState } from "react";
import { roomNameText, roomProblem } from "../../lib/roomRules.js";
import { lookFor, useRooms } from "../../stores/roomStore.js";
import type { RoomNotice } from "../../stores/roomStore.js";
import { PastelMinionBadge } from "../PastelMinionBadge.js";
import { ROOM_FOCUS_RING, SEAFOAM_BUTTON, YELLOW_BUTTON, roomAction } from "./roomStyle.js";
import { ReportRoom } from "./ReportRoom.js";

const TEXT: Record<RoomNotice, (name: string) => string> = {
  removed: () => "The skipper asked you to leave this room. There are plenty of other boats!",
  drifted: (name) => `You drifted out of ${name} while you were away.`,
  // The room stopped letting this sailor read it: swept after being away, or removed by the skipper
  // (the database doesn't say which), so the words fit both.
  gone: (name) => `You're no longer aboard ${name}. If you drifted away for a while, you can hop back in.`,
  closed: () => "The skipper closed the room. Thanks for sailing together!",
  ended: () => "This room has docked for the day. Start a fresh one?",
};

/**
 * `onRejoin` gets the room's code and the words to show when Hop back in is refused (the notice
 * is gone by then, so the panel shows that room's Join card with the reason).
 */
export function RoomNoticeCard({ notice, onStart, onRejoin }: { notice: RoomNotice; onStart: () => void; onRejoin: (code: string, refusal: string) => void }) {
  const room = useRooms((s) => s.noticeRoom);
  const [busy, setBusy] = useState(false);
  const dismiss = () => useRooms.getState().dismissNotice();
  const name = room ? roomNameText(room.name) : "the room";

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
    <div className="mx-auto max-w-xl rounded-3xl border border-[#DCCCF0] bg-[#F7F2FD] px-5 py-6 text-center text-[#56406A] shadow-[3px_3px_0_#E6DCF3]">
      <div className="grid justify-items-center gap-3">
        <PastelMinionBadge costume="bunny" size={72} />
        <p className="text-xs tracking-[0.18em] uppercase opacity-80">A note from Lumi</p>
        <p className="max-w-md font-display text-xl leading-snug">{TEXT[notice](name)}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {(notice === "drifted" || notice === "gone") && room && (
            <button type="button" disabled={busy} onClick={() => void hopBack()} className={SEAFOAM_BUTTON}>
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
        {notice === "removed" && room && <ReportRoom code={room.code} label="⚑ Report this room" onPastel />}
      </div>
    </div>
  );
}
