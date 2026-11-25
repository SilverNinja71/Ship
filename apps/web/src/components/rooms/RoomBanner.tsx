// One study room message at a time, in a pill just under the top bar (and under the crew row, and
// any cheer bubbles hanging from it, on a phone), so it's seen in every scene: Captain Banan
// calling the crew's sail, Pwedo bringing the bottle or a game starting, and Lumi when you've left
// a room without meaning to. When the page has scrolled the scene out of view (as it does to the
// reflection box after a focus block), it pins itself to the top of the window instead. Nothing
// happens until it's tapped. It hides while the Study Rooms panel is open, which says the same.
// Screen readers hear each message once; a countdown in it isn't read out every second.

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Room } from "@ship/shared-types";
import { useAuthUser } from "../../hooks/useAuthUser.js";
import { roomNameText, roomProblem, steadySailWords } from "../../lib/roomRules.js";
import { lookFor, useRooms } from "../../stores/roomStore.js";
import type { RoomNotice, RoomOffer } from "../../stores/roomStore.js";
import { prefersReducedMotion, useSettings } from "../../stores/settingsStore.js";
import { useUi } from "../../stores/uiStore.js";
import { cx } from "../ui.js";
import { BUBBLE_ROW, STRIP_ROW_HEIGHT, stripBubbles, useTopBarHeight, useWideScreen } from "./CrewStrip.js";
import { MinionPortrait } from "./MinionPortrait.js";
import { HELD, ON_PASTEL, PASTEL_QUIET_BUTTON, SEAFOAM_BUTTON, YELLOW_BUTTON, clockText, heldButton, roomAction, useTicker } from "./roomStyle.js";

/** The toast stack's id (Hud.tsx), and where it starts on screen (its top-16), so the banner can sit under it. */
export const TOAST_STACK_ID = "ship-toasts";
const TOAST_STACK_TOP = 64;

/** The toast stack's height now (0 with no toasts). */
function useToastStackHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const el = document.getElementById(TOAST_STACK_ID);
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setHeight(el.getBoundingClientRect().height);
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, []);
  return height;
}

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
  const sentinel = useRef<HTMLSpanElement>(null);
  const top = useTopBarHeight(anchor);
  // An offer belongs to the room this device is in: none shows once it has left (from another tab, say).
  const offer = useRooms((s) => (s.current !== null ? s.offer : null));
  // Leaving by yourself shows its note (with Report) only in the panel, where you left from. A
  // note is the signed-in account's own: none shows signed out, or to someone else on this browser.
  const user = useAuthUser();
  const noticeOwner = useRooms((s) => s.uid);
  const ownNotice = user !== null && noticeOwner === user.uid;
  const notice = useRooms((s) => (s.notice === "left" ? null : s.notice));
  const shownNotice = ownNotice ? notice : null;
  const noticeRoom = useRooms((s) => s.noticeRoom);
  const panelOpen = useUi((s) => s.panel === "rooms");
  const show = !panelOpen && (shownNotice !== null || offer !== null);
  const sceneShowing = useInView(sentinel);
  return (
    <>
      <span ref={anchor} hidden />
      {/* Where the banner sits in the scene; once this has scrolled out of view, the banner pins to the window. */}
      <span ref={sentinel} aria-hidden="true" className="pointer-events-none absolute left-0 h-px w-px" style={{ top: top + 40 }} />
      {show && <Banner top={top} pinned={!sceneShowing} showNotice={ownNotice} />}
      <span className="sr-only" role="status" aria-live="polite">
        {show ? spokenText(offer, shownNotice, noticeRoom ? roomNameText(noticeRoom.name) : "the room") : ""}
      </span>
    </>
  );
}

/** Whether `el` is on screen (true until the browser says otherwise). */
function useInView(el: RefObject<HTMLElement | null>): boolean {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const node = el.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry?.isIntersecting ?? true));
    observer.observe(node);
    return () => observer.disconnect();
  }, [el]);
  return inView;
}

/**
 * What a screen reader hears, once per message: the same words, without anything that changes as
 * time passes (the sail countdown, Hop aboard's minutes left), so it isn't read out again.
 */
function spokenText(offer: RoomOffer | null, notice: RoomNotice | null, roomName: string): string {
  const message = notice ? noticeMessage(notice, roomName, { dismiss: () => undefined, open: () => undefined, hopBack: null }) : offer ? offerMessage(offer, null, 0) : null;
  if (!message) return "";
  const steady = (!notice && offer && (offer.kind === "sail-with" || offer.kind === "hop-aboard") ? steadySailWords(offer) : null) ?? message.text;
  return `${LOOK[message.who].name}: ${steady}`;
}

interface Message {
  who: Who;
  text: string;
  /** The main button; omitted when the message only needs OK. */
  action?: { label: string; run: () => void | Promise<void>; tone: "seafoam" | "yellow" };
  /** The quiet button. */
  later: { label: string; run: () => void };
}

function Banner({ top, pinned, showNotice }: { top: number; pinned: boolean; showNotice: boolean }) {
  const offer = useRooms((s) => (s.current !== null ? s.offer : null));
  const notice = useRooms((s) => (showNotice && s.notice !== "left" ? s.notice : null));
  const noticeRoom = useRooms((s) => s.noticeRoom);
  const room = useRooms((s) => s.room);
  const aboard = useRooms((s) => s.current !== null && s.room !== null);
  const myKey = useRooms((s) => s.myKey);
  const hidden = useRooms((s) => s.hidden);
  const muted = useRooms((s) => s.muted);
  const serverOffset = useRooms((s) => s.serverOffset);
  const motion = useSettings((s) => s.motion);
  const openPanel = useUi((s) => s.openPanel);
  const toast = useUi((s) => s.toast);
  const wide = useWideScreen();
  const now = useTicker(1000) + serverOffset;
  const [busy, setBusy] = useState(false);
  const toasts = useToastStackHeight();

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
              // The nickname this sailor had in this room comes back with them; joining clears the notice.
              const problem = await roomAction(() => rooms.joinRoom(code, lookFor(code)), "join");
              setBusy(false);
              if (problem || useRooms.getState().current !== code) {
                if (problem) toast(problem, "warning");
                // The panel opens on that room's Join card with the reason, which keeps Report there
                // for a sailor the skipper removed (as the panel's own Hop back in does).
                useUi.getState().setRoomInvite(code, problem ?? roomProblem("permission-denied", "join"));
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
  // On a phone the crew's badge row sits under the top bar, with any cheer bubbles hanging under it; the banner goes under those.
  const bubbleRows = aboard && !wide && room && myKey ? stripBubbles(room, myKey, now, hidden, muted).length : 0;
  const under = top + (aboard && !wide ? STRIP_ROW_HEIGHT + 6 + bubbleRows * BUBBLE_ROW : 4);
  // Toasts ("Set sail!", rewards) sit just under the top bar too, over the banner: while any show,
  // the banner moves below them, pinned or not.
  const y = toasts > 0 ? Math.max(under, TOAST_STACK_TOP + toasts + 8) : under;

  return (
    <div
      className={cx("pointer-events-none inset-x-0 z-20 flex justify-center px-3", pinned ? "fixed" : "absolute", !prefersReducedMotion(motion) && "transition-[top] duration-200")}
      style={{ top: pinned ? (toasts > 0 ? TOAST_STACK_TOP + toasts + 8 : "calc(env(safe-area-inset-top, 0px) + 8px)") : y }}
    >
      <div
        className={cx(
          "pointer-events-auto flex max-w-xl flex-wrap items-center gap-x-3 gap-y-2 rounded-3xl border py-1.5 pr-2 pl-1.5 shadow-[3px_3px_0_#EAE5DA] sm:flex-nowrap sm:rounded-full [[data-visual-style=storybook]_&]:shadow-none",
          ON_PASTEL,
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
              {...heldButton(busy, () => void message.action!.run())}
              className={cx(message.action.tone === "seafoam" ? SEAFOAM_BUTTON : YELLOW_BUTTON, HELD, "px-3 py-1 text-sm")}
            >
              {busy ? "Climbing aboard…" : message.action.label}
            </button>
          )}
          <button type="button" onClick={message.later.run} className={PASTEL_QUIET_BUTTON}>
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
        text: offer.leg > 1 ? `Next leg is starting: hop aboard for ${offer.focusMinutes} min?` : `Hop aboard: ${offer.focusMinutes} min left with the crew`,
        action: { label: "Hop aboard", run: take, tone: "seafoam" },
        later: later("Not this time"),
      };
    }
    case "sail-on":
      return {
        who: "captain",
        // Leg 1 is offered to a sailor who missed the countdown (never to one who said "Not this time").
        text: offer.fromLeg === 1 ? "Your crew just set sail: sail with them?" : "Next leg is starting: sail on?",
        action: { label: offer.fromLeg === 1 ? "Sail with them" : "Sail on", run: take, tone: "seafoam" },
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
    case "left":
      // Never shown here (the panel shows it), but worded in case.
      return { who: "bunny", text: `You left ${name}.`, later: ok };
  }
}
