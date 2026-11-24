// Study Rooms' look, shared by the panel, the crew strip, the banner and the games.
// Every pastel fill carries its own ink, so a card stays readable whatever the page around it
// looks like (Full Color's navy, Midnight Moon, Deep Sea Jellyfish). Small time helpers live
// here too, so every room part words times the same way.

import { createElement, useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { ROOM_ACCESSORIES, ROOM_COSTUMES } from "@ship/shared-types";
import type { RoomAccessory, RoomCostume, RoomMember, RoomState } from "@ship/shared-types";
import { presence, roomProblem } from "../../lib/roomRules.js";
import type { RoomAction } from "../../lib/roomRules.js";
import { useRooms } from "../../stores/roomStore.js";

export interface RoomPastel {
  name: string;
  /** Background. */
  fill: string;
  /** Border and dividers. */
  line: string;
  /** Text on the fill. */
  ink: string;
}

/** A room's colors, picked by its subject (subject % 8). */
export const ROOM_PASTELS: readonly RoomPastel[] = [
  { name: "butter", fill: "#FFF9DC", line: "#F1E3A0", ink: "#4B3A0B" },
  { name: "lilac", fill: "#F3ECFB", line: "#DCCCF0", ink: "#56406A" },
  { name: "seafoam", fill: "#E9F6EF", line: "#C7E6D5", ink: "#2D6252" },
  { name: "coral", fill: "#FDE8E4", line: "#F4C7BE", ink: "#8A3B31" },
  { name: "sky", fill: "#E6F2FA", line: "#B2C8E0", ink: "#2F4F6B" },
  { name: "peach", fill: "#FFF1E6", line: "#F3D2B8", ink: "#6B4326" },
  { name: "mint", fill: "#ECF8F1", line: "#C3E6DC", ink: "#24584B" },
  { name: "rose", fill: "#FCE8EC", line: "#F2C6D0", ink: "#7A3346" },
];

export function roomPastel(subject: number): RoomPastel {
  const n = ROOM_PASTELS.length;
  return ROOM_PASTELS[(((Math.trunc(subject) || 0) % n) + n) % n]!;
}

/** The soft circle behind each character's badge. */
export const COSTUME_PASTELS: Record<RoomCostume, { fill: string; ink: string }> = {
  pwedo: { fill: "#E6F2FA", ink: "#4D453E" },
  teddy: { fill: "#F7ECE1", ink: "#4D453E" },
  bunny: { fill: "#F3ECFB", ink: "#4D453E" },
  frog: { fill: "#E9F6EF", ink: "#4D453E" },
  banana: { fill: "#FFF9DC", ink: "#4D453E" },
};

export const COSTUME_LABELS: Record<RoomCostume, string> = {
  pwedo: "Pigeon",
  teddy: "Teddy",
  bunny: "Bunny",
  frog: "Frog",
  banana: "Banana",
};

export const ACCESSORY_LABELS: Record<RoomAccessory, string> = {
  none: "none",
  "cafe-apron": "café apron",
  "woodland-sprout": "sprout",
  sunflower: "sunflower",
  "pumpkin-cap": "pumpkin cap",
  "star-pin": "star pin",
  "astro-helmet": "astro helmet",
  "jelly-bow": "jelly bow",
};

/** A sailor's character, from the index the room stores (an unknown one from a newer app shows Pwedo). */
export function costumeOf(index: number): RoomCostume {
  return ROOM_COSTUMES[index] ?? "pwedo";
}

export function accessoryOf(index: number): RoomAccessory {
  return ROOM_ACCESSORIES[index] ?? "none";
}

export type BadgeStatus = "focus" | "break" | "port" | "paused" | "away";

/** The dot on a badge. Away is the badge at half strength with "zZ" instead. */
export const STATUS_DOT: Record<Exclude<BadgeStatus, "away">, string> = {
  focus: "#E8B84A",
  break: "#7FC8B2",
  port: "#C7BFB3",
  paused: "#CDBDEB",
};

export const STATUS_WORD: Record<BadgeStatus, string> = {
  focus: "Focusing",
  break: "On a break",
  port: "In port",
  paused: "Paused",
  away: "Away",
};

export function stateStatus(state: RoomState): Exclude<BadgeStatus, "away"> {
  return state === 1 ? "focus" : state === 2 ? "break" : state === 3 ? "paused" : "port";
}

export function memberStatus(m: RoomMember, serverNow: number): BadgeStatus {
  return presence(m, serverNow) === "here" ? stateStatus(m.state) : "away";
}

// ---- Buttons and cards (Bottle Bay and Banana Planna's chunky pastel style) ------------------

/**
 * The keyboard focus ring: the page's ink, except inside a fixed pastel card (ON_PASTEL), where the
 * page's ink can be near-white (Midnight Moon, Deep Sea Jellyfish, Full Color) and would vanish.
 */
const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring,var(--page-ink))]";

/**
 * For any card with its own fixed pastel fill: focus rings inside it take the focused control's
 * own (dark) text color instead of the page's ink. Popovers on the page's surface inside such a
 * card reset it (PAGE_RING).
 */
export const ON_PASTEL = "[--ring:currentColor]";
export const PAGE_RING = "[--ring:var(--page-ink)]";

/** The main action: chunky butter yellow. */
export const YELLOW_BUTTON = `inline-flex items-center justify-center gap-1.5 rounded-full bg-[#FFE27A] px-4 py-1.5 font-semibold text-[#4B3A0B] shadow-[0_3px_0_#E8C64A] transition hover:bg-[#FFD95A] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none ${FOCUS_RING}`;

/** Going aboard and sailing together: chunky seafoam. */
export const SEAFOAM_BUTTON = `inline-flex items-center justify-center gap-1.5 rounded-full bg-[#BFE8DC] px-4 py-1.5 font-semibold text-[#1F4D41] shadow-[0_3px_0_#8CCBB8] transition hover:bg-[#AEE0D2] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none ${FOCUS_RING}`;

/** A quiet text button, as the rest of Ship's panels use. */
export const QUIET_BUTTON = `rounded-md px-1.5 py-0.5 text-sm text-[var(--muted-ink)] underline-offset-4 hover:text-[var(--page-ink)] hover:underline disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;

/** The quiet text button inside a fixed pastel card (the banner, Lumi's and Pwedo's cards): the card's own ink, never the theme's. */
export const PASTEL_QUIET_BUTTON = `rounded-md px-1.5 py-0.5 text-sm underline-offset-4 opacity-90 hover:underline hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;

/**
 * The sticker-edge shadow under anything with the page's own fill. It's cream, which only suits a
 * light page: Full Color and the dark themes (Midnight Moon, Deep Sea Jellyfish) drop it.
 */
export const PAPER_SHADOW = "shadow-[3px_3px_0_#EAE5DA] [[data-visual-style=storybook]_&]:shadow-none [[data-theme-dark=true]_&]:shadow-none";

/** A paper card on the page. */
export const PAPER_CARD = `rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] ${PAPER_SHADOW}`;

/**
 * A little pill chip (subjects, cheers, accessories). `pastel`: inside a card with its own fixed
 * pastel fill (the look picker, Lumi's cards), so the chip keeps a light fill and the card's ink
 * on every theme instead of turning into a dark pill.
 */
export function chipClass(active: boolean, opts: { pastel?: boolean } = {}): string {
  const idle = opts.pastel ? "border-white/80 bg-white/70 text-[inherit] hover:bg-white" : "border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--muted-ink)] hover:text-[var(--page-ink)]";
  return ["rounded-full border px-2.5 py-0.5 text-xs transition", FOCUS_RING, active ? "border-transparent bg-[#CDEDE5] text-[#24584B]" : idle].join(" ");
}

/**
 * Closes a small popover (a ⋯ menu, the sticker picker) on Escape or a click outside `ref`. Escape
 * is caught before the page hears it, so it closes only the popover, never the panel around it.
 */
export function usePopoverDismiss(open: boolean, ref: RefObject<HTMLElement | null>, close: (how: "escape" | "outside") => void): void {
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close("outside");
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      close("escape");
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key, true);
    };
  }, [open, ref, close]);
}

export const ROOM_FOCUS_RING = FOCUS_RING;

// ---- Time --------------------------------------------------------------------------------

/** Re-renders every `ms` while mounted; returns this device's clock. Add the room's serverOffset for server time. */
/**
 * When this element appears in place of what had the focus (the button pressed went away, or the
 * room was lost while the panel was open, and focus fell back to the page), it takes the focus,
 * so a keyboard user carries on from here and a screen reader reads it. It never takes the focus
 * from anywhere else.
 */
export function useCatchFocus(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const active = document.activeElement;
      if (!active || active === document.body) ref.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [ref]);
}

/** Text that takes the focus when it replaces what had it (useCatchFocus), e.g. a card that took a pressed button's place. */
export function CatchFocus({ as: Tag = "p", className, children }: { as?: "p" | "h3" | "span"; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useCatchFocus(ref);
  return createElement(Tag, { ref, tabIndex: -1, className: className ? `${className} outline-none` : "outline-none" }, children);
}

/**
 * A busy (or waiting) button that keeps the keyboard focus: `aria-disabled` and a guard instead of
 * `disabled`, which drops the focus to the page (a screen reader then loses its place, and the next
 * Tab starts again from the top). Spread onto the <button> with HELD in its classes.
 */
export function heldButton(held: boolean, onClick: () => void): { "aria-disabled"?: true; onClick: (e: { preventDefault(): void }) => void } {
  return {
    ...(held ? { "aria-disabled": true as const } : {}),
    onClick: (e) => {
      if (held) e.preventDefault();
      else onClick();
    },
  };
}
export const HELD = "aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:shadow-none";

const KEEPER_DELAY_MS = 80;
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Where the focus goes when what had it inside `container` went away: the nearest place still on the page, from the last focused element outwards. */
export function focusFallback(chain: readonly HTMLElement[], container: HTMLElement): HTMLElement | null {
  for (const el of chain) {
    if (!el.isConnected || !container.contains(el)) continue;
    if (el.matches(FOCUSABLE) || (el.tabIndex === -1 && el.hasAttribute("tabindex"))) return el;
    const inside = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].find((x) => x.getClientRects().length > 0 && getComputedStyle(x).visibility !== "hidden");
    if (inside) return inside;
  }
  return null;
}

/**
 * Keeps the keyboard focus inside `container` when what had it goes away (a button that's removed
 * or disabled as its action runs: a cheer, a deck picked, a game started or put away, a matched
 * pair, a hidden room, an answer sent): it moves to the nearest place still there (focusFallback)
 * instead of falling to the page. Only focus that was inside and was lost; never focus the sailor
 * moved elsewhere (another control, or a tap outside).
 */
export function useFocusKeeper(container: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = container.current;
    if (!el || typeof MutationObserver === "undefined") return;
    let chain: HTMLElement[] = [];
    let inside = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onIn = (e: FocusEvent) => {
      inside = true;
      chain = [];
      for (let n = e.target instanceof HTMLElement ? e.target : null; n && n !== el; n = n.parentElement) chain.push(n);
      chain.push(el);
    };
    const onOut = (e: FocusEvent) => {
      if (e.relatedTarget instanceof Node && !el.contains(e.relatedTarget)) inside = false;
    };
    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof Node) || !el.contains(e.target)) inside = false;
    };
    // A moment after the change, so a part that places the focus itself (useCatchFocus,
    // useReturnFocus: a frame after it renders) does so first.
    const check = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const active = document.activeElement;
        if (!inside || (active && active !== document.body)) return;
        focusFallback(chain, el)?.focus({ preventScroll: true });
      }, KEEPER_DELAY_MS);
    };
    const observer = new MutationObserver(check);
    observer.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "class"] });
    el.addEventListener("focusin", onIn);
    el.addEventListener("focusout", onOut);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      el.removeEventListener("focusin", onIn);
      el.removeEventListener("focusout", onOut);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [container]);
}

/** Puts the focus back on `ref` (the button that opened something) when `open` turns false: a confirm or a list of reasons closed with Keep or Never mind. */
export function useReturnFocus(open: boolean, ref: RefObject<HTMLElement | null>): void {
  const was = useRef(open);
  useEffect(() => {
    if (was.current && !open) {
      const id = requestAnimationFrame(() => {
        const active = document.activeElement;
        if (ref.current?.isConnected && (!active || active === document.body)) ref.current.focus();
      });
      was.current = open;
      return () => cancelAnimationFrame(id);
    }
    was.current = open;
  }, [open, ref]);
}

export function useTicker(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** "0:48" or "12:05". */
export function clockText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "11:04 pm" on this device's clock, from a server time and the room's offset. */
export function timeOfDay(serverMs: number, serverOffset = 0): string {
  return new Date(serverMs - serverOffset).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();
}

/**
 * Plain words for anything a room action threw. A database error (it carries a code such as
 * "permission-denied") goes through roomProblem; an error the room store already worded is shown
 * as it is. Kept here, not in lib/rooms.ts, so nothing eager pulls in Firestore.
 */
export function errorText(e: unknown, action: RoomAction): string {
  const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code).replace(/^firestore\//, "") : "";
  if (code) return roomProblem(code, action);
  const message = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  if (/offline|network|failed to fetch/i.test(message)) return roomProblem("unavailable", action);
  return message || roomProblem("unknown", action);
}

/**
 * Runs a room store action and returns the words to show if it failed, or null. Store actions
 * put their problems in `error` (already in plain words); a few throw instead.
 */
export async function roomAction(run: () => Promise<void>, action: RoomAction): Promise<string | null> {
  useRooms.setState({ error: null });
  try {
    await run();
  } catch (e) {
    return errorText(e, action);
  }
  return useRooms.getState().error;
}

/**
 * roomAction for the skipper's tools, which can wait up to 15 s for the room's write gap:
 * undefined when the sailor left the room meanwhile (nothing was sent, and there's nothing to say).
 */
export async function skipperAction(run: () => Promise<void>): Promise<string | null | undefined> {
  const code = useRooms.getState().current;
  const problem = await roomAction(run, "skipper");
  return !problem && code !== null && useRooms.getState().current !== code ? undefined : problem;
}

/** "just now", "25 min ago", "3 h ago". */
export function agoText(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ago`;
}
