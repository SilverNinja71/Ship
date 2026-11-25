// The room's invite ticket, carried by Pwedo: the code to read out and a link to send. The code
// rides in the link's #fragment, which browsers never send to any server. Copying uses the
// clipboard only; nothing opens or shares by itself.

import { useState } from "react";
import type { Room } from "@ship/shared-types";
import { formatCode, inviteLink } from "../../lib/roomRules.js";
import { useUi } from "../../stores/uiStore.js";
import { IconChevron } from "../icons.js";
import { PastelMinionBadge } from "../PastelMinionBadge.js";
import { cx } from "../ui.js";
import { ROOM_FOCUS_RING, SEAFOAM_BUTTON } from "./roomStyle.js";

async function copy(text: string, done: string): Promise<void> {
  const toast = useUi.getState().toast;
  try {
    await navigator.clipboard.writeText(text);
    toast(done, "info");
  } catch {
    toast("Couldn't copy here. Select the code and copy it yourself.", "warning");
  }
}

export function Ticket({ room }: { room: Room }) {
  // Open while the skipper is waiting for friends; folded away once the crew is here.
  const [open, setOpen] = useState(room.members.length <= 1);
  const link = typeof location === "undefined" ? "" : inviteLink(room.code, location.origin, location.pathname);
  return (
    <section className="rounded-2xl border-2 border-dashed border-[#B2C8E0] bg-[#E6F2FA] text-[#2F4F6B] [--ring:currentColor]">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={cx("flex w-full items-center gap-2 rounded-2xl px-4 py-2.5 text-left", ROOM_FOCUS_RING)}>
        <span className="font-display text-base">Invite ticket</span>
        <span className="font-display text-sm tracking-[0.16em] tabular-nums opacity-90">{formatCode(room.code)}</span>
        <span className="ml-auto opacity-70">
          <IconChevron dir={open ? "up" : "down"} size={16} />
        </span>
      </button>
      {open && (
        <div className="grid gap-3 border-t border-dashed border-[#B2C8E0] px-4 py-4 sm:flex sm:items-center sm:gap-4">
          <div className="flex min-w-0 items-center gap-3 sm:flex-1">
            <span className="grid shrink-0 place-items-center rounded-full bg-white/70 p-1">
              <PastelMinionBadge costume="pwedo" size={56} />
            </span>
            <div className="min-w-0">
              <p className="text-xs tracking-[0.18em] uppercase opacity-90">Room code</p>
              <p className="whitespace-nowrap font-display text-2xl tabular-nums tracking-[0.22em] sm:text-3xl">{formatCode(room.code)}</p>
              <p className="mt-0.5 text-xs opacity-85">Share it only with people you'd study with.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void copy(link, "Invite link copied.")} className={cx(SEAFOAM_BUTTON, "text-sm")}>
              Copy link
            </button>
            <button type="button" onClick={() => void copy(room.code, "Room code copied.")} className={cx("rounded-full bg-white/80 px-4 py-1.5 text-sm text-[#2F4F6B] hover:bg-white", ROOM_FOCUS_RING)}>
              Copy code
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
