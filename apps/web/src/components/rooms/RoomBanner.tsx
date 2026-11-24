// One study room message at a time, in a pill just under the top bar (and under the crew row on
// a phone), so it's seen in every scene: Captain Banan calling the crew's sail, Pwedo bringing
// the bottle or a game starting, and Lumi when you've left a room without meaning to. Nothing
// happens until it's tapped. It hides while the Study Rooms panel is open, which says the same.

import { useRef, useState } from "react";
import type { Room } from "@ship/shared-types";
import { randomLook, roomNameText } from "../../lib/roomRules.js";
import { useRooms } from "../../stores/roomStore.js";
import type { RoomNotice, RoomOffer } from "../../stores/roomStore.js";
import { prefersReducedMotion, useSettings } from "../../stores/settingsStore.js";
import { useUi } from "../../stores/uiStore.js";
import { cx } from "../ui.js";
import { STRIP_ROW_HEIGHT, useTopBarHeight, useWideScreen } from "./CrewStrip.js";
import { MinionPortrait } from "./MinionPortrait.js";
import { QUIET_BUTTON, SEAFOAM_BUTTON, YELLOW_BUTTON, clockText, roomAction, useTicker } from "./roomStyle.js";

type Who = "captain" | "pwedo" | "bunny" | "teddy";

/** Each character's pastel, with its own ink so the banner reads on any page color. */
const LOOK: Record<Who, { fill: string; line: string; ink: string; circle: string; name: string }> = {
  captain: { fill: "#FFF9DC", line: "#F1E3A0", ink: "#4B3A0B", circle: "#FFFFFF", name: "Captain Banan" },
  pwedo: { fill: "#E6F2FA", line: "#B2C8E0", ink: "#2F4F6B", circle: "#FFFFFF", name: "Pwedo" },
  bunny: { fill: "#F3ECFB", line: "#DCCCF0", ink: "#56406A", circle: "#FFFFFF", name: "Lumi" },
  teddy: { fill: "#FFF1E6", line: "#F3D2B8", ink: "#6B4326", circle: "#FFFFFF", name: "Mochi" },
};

export function RoomBanner() {
  const anchor = useRef<HTMLSpanElement>(null);
  const top = useTopBarHeight(anchor);
  const offer = useRooms((s) => s.offer);
  const notice = useRooms((s) => s.notice);
  const panelOpen = useUi((s) => s.panel === "rooms");
  const show = !panelOpen && (notice !== null || offer !== null);
  return (
    <>
      <span ref={anchor} hidden />
      {show && <Banner top={top} />}
    </>
  );
}

interface Message {
  who: Who;
  text: string;
  /** The main button; omitted when the message only needs OK. */
  action?: { label: string; run: () => void | Promise<void>; tone: "seafoam" | "yellow" };
  /** The quiet button. */
  later: { label: string; run: () => void };
}

function Banner({ top }: { top: number }) {
  const offer = useRooms((s) => s.offer);
  const notice = useRooms((s) => s.notice);
  const noticeRoom = useRooms((s) => s.noticeRoom);
  const room = useRooms((s) => s.room);
  const aboard = useRooms((s) => s.current !== null && s.room !== null);
  const serverOffset = useRooms((s) => s.serverOffset);
  const motion = useSettings((s) => s.motion);
  const openPanel = useUi((s) => s.openPanel);
  const toast = useUi((s) => s.toast);
  const wide = useWideScreen();
  const now = useTicker(1000) + serverOffset;
  const [busy, setBusy] = useState(false);

  const roomName = noticeRoom ? roomNameText(noticeRoom.name) : "the room";
  const message: Message | null = notice
    ? noticeMessage(notice, roomName, {
        dismiss: () => useRooms.getState().dismissNotice(),
        open: () => openPanel("rooms"),
        hopBack: noticeRoom
          ? async () => {
              const rooms = useRooms.getState();
              const code = noticeRoom.code;
              setBusy(true);
              // The same made-up look comes back with the sailor; joining clears the notice.
              const problem = await roomAction(() => rooms.joinRoom(code, rooms.myLook ?? randomLook(Math.random)), "join");
              setBusy(false);
              if (problem || useRooms.getState().current !== code) {
                if (problem) toast(problem, "warning");
                openPanel("rooms");
              }
            }
          : null,
      })
    : offer
      ? offerMessage(offer, room, now)
      : null;
  if (!message) return null;

  const look = LOOK[message.who];
  // On a phone the crew's badge row sits under the top bar; the banner goes under that.
  const y = top + (aboard && !wide ? STRIP_ROW_HEIGHT + 6 : 4);

  return (
    <div className="pointer-events-none absolute inset-x-0 z-20 flex justify-center px-3" style={{ top: y }}>
      <div
        role="status"
        aria-live="polite"
        className={cx(
          "pointer-events-auto flex max-w-xl flex-wrap items-center gap-x-3 gap-y-2 rounded-3xl border py-1.5 pr-2 pl-1.5 shadow-[3px_3px_0_#EAE5DA] sm:flex-nowrap sm:rounded-full [[data-visual-style=storybook]_&]:shadow-none",
          !prefersReducedMotion(motion) && "sticker-pop",
        )}
        style={{ background: look.fill, borderColor: look.line, color: look.ink }}
      >
        <span className="flex w-full min-w-0 items-center gap-2.5 sm:w-auto sm:flex-1">
          <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full" style={{ background: look.circle }} title={look.name}>
            <MinionPortrait costume={message.who} size={38} />
          </span>
          <span className="min-w-0 text-sm leading-snug">
            <span className="sr-only">{look.name}: </span>
            {message.text}
          </span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {message.action && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void message.action!.run()}
              className={cx(message.action.tone === "seafoam" ? SEAFOAM_BUTTON : YELLOW_BUTTON, "px-3 py-1 text-sm")}
            >
              {busy ? "Climbing aboard…" : message.action.label}
            </button>
          )}
          <button type="button" onClick={message.later.run} className={cx(QUIET_BUTTON, "text-[inherit] opacity-80 hover:text-[inherit] hover:opacity-100")}>
            {message.later.label}
          </button>
        </span>
      </div>
    </div>
  );
}

function offerMessage(offer: RoomOffer, room: Room | null, now: number): Message {
  const store = useRooms.getState();
  const take = () => store.acceptOffer(offer);
  const later = (label: string) => ({ label, run: () => useRooms.getState().dismissOffer() });
  switch (offer.kind) {
    case "sail-with": {
      const left = offer.prepUntilServer - now;
      return {
        who: "captain",
        text: left > 0 ? `Your crew sets sail in ${clockText(left)}!` : "Your crew is setting sail!",
        action: { label: "Sail with them", run: take, tone: "seafoam" },
        later: later("Not this time"),
      };
    }
    case "hop-aboard": {
      // The minutes the timer will run (the crew's time left, rounded), as the Sail together card says.
      return {
        who: "captain",
        text: `Hop aboard: ${offer.focusMinutes} min left with the crew`,
        action: { label: "Hop aboard", run: take, tone: "seafoam" },
        later: later("Not this time"),
      };
    }
    case "sail-on":
      return {
        who: "captain",
        text: "Next leg is starting: sail on?",
        action: { label: "Sail on", run: take, tone: "seafoam" },
        later: later("Not this time"),
      };
    case "game":
      return offer.game === "bottle"
        ? { who: "pwedo", text: "Pass the Bottle is starting", action: { label: "Open the game", run: take, tone: "yellow" }, later: later("Not now") }
        : { who: "teddy", text: "Tidy the Deck is starting", action: { label: "Open the game", run: take, tone: "yellow" }, later: later("Not now") };
    case "your-turn":
      return { who: "pwedo", text: "Pwedo brought you the bottle!", action: { label: "Answer", run: take, tone: "yellow" }, later: later("Not now") };
  }
}

function noticeMessage(
  notice: RoomNotice,
  name: string,
  act: { dismiss: () => void; open: () => void; hopBack: (() => Promise<void>) | null },
): Message {
  const ok = { label: "OK", run: act.dismiss };
  switch (notice) {
    case "removed":
      // The panel's note from Lumi has the Report button too.
      return { who: "bunny", text: "The skipper asked you to leave this room. There are plenty of other boats!", action: { label: "Open Rooms", run: act.open, tone: "yellow" }, later: ok };
    case "drifted":
    case "gone":
      return {
        who: "bunny",
        // "gone" can also be a removal (the database doesn't say which), so it doesn't blame drifting.
        text: notice === "drifted" ? `You drifted out of ${name} while you were away.` : `You're no longer aboard ${name}.`,
        action: act.hopBack ? { label: "Hop back in", run: act.hopBack, tone: "seafoam" } : undefined,
        later: ok,
      };
    case "closed":
      return { who: "bunny", text: "The skipper closed the room. Thanks for sailing together!", later: ok };
    case "ended":
      return { who: "bunny", text: "This room has docked for the day. Start a fresh one?", action: { label: "Open Rooms", run: act.open, tone: "yellow" }, later: ok };
  }
}
