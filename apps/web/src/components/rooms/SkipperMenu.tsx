// The skipper's door: lock it (nobody new can come aboard, and an open room leaves the list),
// unlock it, or close the room for everyone.

import { useState } from "react";
import type { Room } from "@ship/shared-types";
import { roomNameText } from "../../lib/roomRules.js";
import { useRooms } from "../../stores/roomStore.js";
import { useUi } from "../../stores/uiStore.js";
import { cx } from "../ui.js";
import { QUIET_BUTTON, ROOM_FOCUS_RING, roomAction } from "./roomStyle.js";

export function SkipperMenu({ room }: { room: Room }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const name = roomNameText(room.name);

  const run = async (action: () => Promise<void>, done: string) => {
    setBusy(true);
    const problem = await roomAction(action, "write");
    useUi.getState().toast(problem ?? done, problem ? "warning" : "info");
    setBusy(false);
    setConfirm(false);
  };

  if (confirm)
    return (
      <div className="w-full rounded-2xl bg-[#FDE8E4] px-3 py-2.5 text-sm text-[#8A3B31]">
        <p>Close {name} for everyone?</p>
        <div className="mt-1.5 flex flex-wrap gap-3">
          <button type="button" disabled={busy} onClick={() => void run(() => useRooms.getState().closeRoom(), `${name} is closed. Thanks for sailing together!`)} className="font-semibold underline underline-offset-4 disabled:opacity-50">
            Yes, close it
          </button>
          <button type="button" onClick={() => setConfirm(false)} className="underline-offset-4 hover:underline">
            Keep sailing
          </button>
        </div>
      </div>
    );
  return (
    <div className="flex flex-wrap items-center gap-x-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void run(() => useRooms.getState().lock(!room.locked), room.locked ? "The door is open again." : "Door locked. Nobody new can come aboard.")}
        className={QUIET_BUTTON}
      >
        {room.locked ? "Unlock the door" : "Lock the door"}
      </button>
      <button type="button" disabled={busy} onClick={() => setConfirm(true)} className={cx("rounded-md px-1.5 py-0.5 text-sm text-[#8A3B31] underline-offset-4 hover:underline disabled:opacity-50 [[data-visual-style=storybook]_&]:text-[#F4A79A]", ROOM_FOCUS_RING)}>
        Close room
      </button>
    </div>
  );
}
