// The skipper's door: lock it (nobody new can come aboard, and an open room leaves the list),
// unlock it, or close the room for everyone.

import { useRef, useState } from "react";
import type { Room } from "@ship/shared-types";
import { roomNameText } from "../../lib/roomRules.js";
import { useRooms } from "../../stores/roomStore.js";
import { useUi } from "../../stores/uiStore.js";
import { cx } from "../ui.js";
import { HELD, ROOM_FOCUS_RING, heldButton, roomAction, skipperAction, useCatchFocus, useReturnFocus } from "./roomStyle.js";

export function SkipperMenu({ room }: { room: Room }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const name = roomNameText(room.name);
  const closeButton = useRef<HTMLButtonElement>(null);
  useReturnFocus(confirm, closeButton);

  // Closing ends the room on purpose; the door waits for the room's write gap and says nothing if the skipper left meanwhile.
  const run = async (action: () => Promise<void>, done: string, closing = false) => {
    setBusy(true);
    const problem = closing ? await roomAction(action, "leave") : await skipperAction(action);
    setBusy(false);
    setConfirm(false);
    if (problem !== undefined) useUi.getState().toast(problem ?? done, problem ? "warning" : "info");
  };

  if (confirm)
    return (
      <div className="w-full rounded-2xl bg-[#FDE8E4] px-3 py-2.5 text-sm text-[#8A3B31] [--ring:currentColor]">
        <ConfirmQuestion text={`Close ${name} for everyone?`} />
        <div className="mt-1.5 flex flex-wrap gap-3">
          <button type="button" {...heldButton(busy, () => void run(() => useRooms.getState().closeRoom(), `${name} is closed. Thanks for sailing together!`, true))} className={cx("font-semibold underline underline-offset-4", HELD)}>
            Yes, close it
          </button>
          <button type="button" onClick={() => setConfirm(false)} className="underline-offset-4 hover:underline">
            Keep sailing
          </button>
        </div>
      </div>
    );
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
      <button
        type="button"
        {...heldButton(busy, () => void run(() => useRooms.getState().lock(!room.locked), room.locked ? "The door is open again." : "Door locked. Nobody new can come aboard."))}
        className={cx("rounded-full border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2.5 py-0.5 text-sm text-[var(--page-ink)] hover:bg-[var(--surface-3)]", HELD, ROOM_FOCUS_RING)}
      >
        {room.locked ? "Unlock the door" : "Lock the door"}
      </button>
      {/* Its own coral fill, so it reads on every theme (dark red on navy didn't). */}
      <button ref={closeButton} type="button" {...heldButton(busy, () => setConfirm(true))} className={cx("rounded-full bg-[#FDE8E4] px-2.5 py-0.5 text-sm text-[#8A3B31] hover:bg-[#FAD9D2]", HELD, ROOM_FOCUS_RING)}>
        Close room
      </button>
    </div>
  );
}

/** A confirm's question: it takes the focus from the button it replaced, so it's read out before Yes or Keep. */
export function ConfirmQuestion({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useCatchFocus(ref);
  return (
    <p ref={ref} tabIndex={-1} className="outline-none">
      {text}
    </p>
  );
}
