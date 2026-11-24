// The crew in every scene. While you're aboard a study room, everyone's badge shows over the
// scene, whatever it is (deck, desk, break, quarters, Full Color or Ink & Paper): a status dot
// each, the Kraken's live health bar, and a cheer bubble for 6 seconds when someone sends one.
// On a wide screen it's a paper card at the bottom left; on a phone (or any screen too narrow for
// the card beside the running Pwedo Pomo pill), one row under the top bar.
// Tapping it opens Study Rooms. It reads the room store only, so it never loads Firestore.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { QUEST_BEASTS, ROOM_CHEERS, ROOM_LIMITS, STICKER_IDS, questFromDamage } from "@ship/shared-types";
import type { Room, RoomMember } from "@ship/shared-types";
import { liveDamage, nickText, sceneMates } from "../../lib/roomRules.js";
import { useRooms } from "../../stores/roomStore.js";
import { prefersReducedMotion, useSettings } from "../../stores/settingsStore.js";
import { useUi } from "../../stores/uiStore.js";
import { PastelMinionBadge } from "../PastelMinionBadge.js";
import { DieCutSticker, STICKERS } from "../StickerArt.js";
import { cx } from "../ui.js";
import { PAPER_SHADOW, ROOM_FOCUS_RING, STATUS_WORD, accessoryOf, costumeOf, memberStatus, useTicker } from "./roomStyle.js";

/**
 * Wide screens get the bottom-left card. A full crew's card is 320 px wide and the running Pwedo
 * Pomo pill about 694 px, centred, so below about 1390 px they'd overlap: narrower screens get the row.
 */
const WIDE_QUERY = "(min-width: 1400px)";
/** The phone row's height, so the banner can sit just under it. */
export const STRIP_ROW_HEIGHT = 42;

const BADGE = { wide: 44, narrow: 30 } as const;
const GAP = { wide: 6, narrow: 4 } as const;
const PAD = { wide: 12, narrow: 6 } as const;
/** Each cheer bubble's row; on a phone they hang under the strip, so the banner moves down by these. */
export const BUBBLE_ROW = 32;

/** True on screens at least 1400 px wide (and follows the window as it's resized). */
export function useWideScreen(): boolean {
  const [wide, setWide] = useState(() => typeof matchMedia !== "undefined" && matchMedia(WIDE_QUERY).matches);
  useEffect(() => {
    if (typeof matchMedia === "undefined") return;
    const query = matchMedia(WIDE_QUERY);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}

/**
 * The top bar's height in px (it wraps onto two rows on a phone), measured from the scene's own
 * header, so things placed under it never hide behind it. `anchor` is any element in the scene.
 */
export function useTopBarHeight(anchor: RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(64);
  useLayoutEffect(() => {
    const header = anchor.current?.parentElement?.querySelector<HTMLElement>(":scope > header");
    if (!header) return;
    const update = () => setHeight(header.offsetHeight);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, [anchor]);
  return height;
}

export function CrewStrip() {
  const anchor = useRef<HTMLSpanElement>(null);
  const top = useTopBarHeight(anchor);
  const room = useRooms((s) => (s.current !== null ? s.room : null));
  const myKey = useRooms((s) => s.myKey);
  return (
    <>
      <span ref={anchor} hidden />
      {room && myKey && <Strip room={room} myKey={myKey} top={top} />}
    </>
  );
}

interface Bubble {
  key: string;
  index: number;
  name: string;
  say: number;
  at: number;
}

/** The cheer bubbles showing now, newest first: other sailors' from sceneMates (it leaves out hidden sailors and muted cheers); my own always shows. */
export function stripBubbles(room: Room, myKey: string, now: number, hidden: readonly string[], muted: boolean): Bubble[] {
  const cheers = new Map(sceneMates(room, myKey, now, hidden, muted).map((m) => [m.key, m.cheer]));
  const bubbles: Bubble[] = [];
  room.members.slice(0, ROOM_LIMITS.size).forEach((m, index) => {
    const say = m.key === myKey ? ownCheer(m, now) : (cheers.get(m.key) ?? null);
    if (say !== null) bubbles.push({ key: m.key, index, name: nickText(m.nick), say, at: m.sayAt ?? 0 });
  });
  // The newest sits closest to the badges; each has a row of its own, so they never overlap.
  return bubbles.sort((a, b) => b.at - a.at);
}

function Strip({ room, myKey, top }: { room: Room; myKey: string; top: number }) {
  const serverOffset = useRooms((s) => s.serverOffset);
  const hidden = useRooms((s) => s.hidden);
  const muted = useRooms((s) => s.muted);
  const motion = useSettings((s) => s.motion);
  const openPanel = useUi((s) => s.openPanel);
  const wide = useWideScreen();
  const now = useTicker(1000) + serverOffset;
  const still = prefersReducedMotion(motion);

  const members = room.members.slice(0, ROOM_LIMITS.size);
  const size = wide ? "wide" : "narrow";
  const badge = BADGE[size];

  const bubbles = stripBubbles(room, myKey, now, hidden, muted);
  const newest = bubbles[0];

  const quest = questFromDamage(liveDamage(room, now));
  const beast = QUEST_BEASTS[quest.beastIndex]!;
  const hpShare = quest.maxHp > 0 ? Math.max(0, Math.min(1, quest.hp / quest.maxHp)) : 0;
  const hpText = `${beast.name}: ${Math.ceil(quest.hp)} of ${quest.maxHp} health left`;

  const others = members.filter((m) => m.key !== myKey);
  const label = `Your study room crew: ${members.length} aboard${others.length ? ` (${others.map((m) => `${nickText(m.nick)}, ${STATUS_WORD[memberStatus(m, now)].toLowerCase()}`).join("; ")})` : ""}. Open Study Rooms.`;

  return (
    <div
      className="pointer-events-none absolute z-20"
      style={wide ? { left: 16, bottom: 16 } : { left: 12, top }}
    >
      <button
        type="button"
        onClick={() => openPanel("rooms")}
        aria-label={label}
        title="Your study room crew (R)"
        className={cx(
          "pointer-events-auto relative flex flex-col border border-[var(--border-subtle)] bg-[var(--surface-1)] text-left text-[var(--page-ink)] transition hover:-translate-y-px",
          PAPER_SHADOW,
          wide ? "gap-2 rounded-2xl px-3 py-2.5" : "rounded-full px-1.5 py-1",
          ROOM_FOCUS_RING,
        )}
      >
        <span className="flex items-center" style={{ gap: GAP[size] }}>
          {members.map((m) => {
            const status = memberStatus(m, now);
            return (
              <span key={m.key} className="relative grid place-items-center" title={`${nickText(m.nick)}${m.key === myKey ? " (you)" : ""} · ${STATUS_WORD[status]}`}>
                <PastelMinionBadge costume={costumeOf(m.costume)} accessory={accessoryOf(m.accessory)} status={status} skipper={wide && m.key === room.host} size={badge} />
              </span>
            );
          })}
          {!wide && (
            <span className="ml-1 mr-1.5 h-1 w-10 overflow-hidden rounded-full bg-[#FDE8E4]" title={hpText}>
              <span className="block h-full rounded-full bg-[#F4A79A]" style={{ width: `${Math.round(hpShare * 100)}%` }} />
            </span>
          )}
        </span>
        {wide && (
          <span className="grid gap-1" title={hpText}>
            <span className="flex items-baseline justify-between gap-3 text-[10px] leading-none text-[var(--muted-ink)]">
              <span>Kraken Watch</span>
              <span className="tabular-nums">
                {Math.ceil(quest.hp)}/{quest.maxHp}
              </span>
            </span>
            <span className="block h-1 w-full overflow-hidden rounded-full bg-[#FDE8E4]">
              <span className="block h-full rounded-full bg-[#F4A79A] transition-[width] duration-500" style={{ width: `${Math.round(hpShare * 100)}%` }} />
            </span>
          </span>
        )}
        {bubbles.map((b, k) => (
          <CheerBubble key={`${b.key}:${b.at}`} bubble={b} row={k} wide={wide} still={still} />
        ))}
      </button>
      {/* Screen readers hear the newest cheer once; the badges themselves stay quiet. */}
      <span className="sr-only" aria-live="polite">
        {newest ? `${newest.name}: ${cheerLabel(newest.say)}` : ""}
      </span>
    </div>
  );
}

/** My own latest cheer while it shows (6 s from when the room stamped it). */
function ownCheer(m: RoomMember, serverNow: number): number | null {
  if (m.say < 0 || m.sayAt === null) return null;
  const age = serverNow - m.sayAt;
  return age >= 0 && age < ROOM_LIMITS.cheerShowSeconds * 1000 ? m.say : null;
}

function cheerLabel(say: number): string {
  if (say < ROOM_CHEERS.length) return ROOM_CHEERS[say] ?? "";
  const id = STICKER_IDS[say - ROOM_CHEERS.length];
  return id ? `${STICKERS.find((s) => s.id === id)?.label ?? "a"} sticker` : "";
}

/** A pastel pill above (wide) or below (phone) its sailor's badge, its tail pointing at them. */
function CheerBubble({ bubble, row, wide, still }: { bubble: Bubble; row: number; wide: boolean; still: boolean }) {
  const size = wide ? "wide" : "narrow";
  const center = PAD[size] + bubble.index * (BADGE[size] + GAP[size]) + BADGE[size] / 2;
  const tail = 16;
  const left = Math.max(0, center - tail);
  const offset = 6 + row * BUBBLE_ROW;
  const stickerId = bubble.say >= ROOM_CHEERS.length ? STICKER_IDS[bubble.say - ROOM_CHEERS.length] : undefined;
  // The strip sits 12-16 px from the scene's left edge: keep the bubble inside the screen.
  const space = `calc(100vw - ${left + (wide ? 16 : 12) + 12}px)`;
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute z-10 block"
      style={wide ? { left, bottom: `calc(100% + ${offset}px)` } : { left, top: `calc(100% + ${offset}px)` }}
    >
      <span
        className={cx(
          "relative flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#E4DCCD] bg-[#FFFDF7] py-1 pr-3 pl-2.5 text-xs text-[#4D453E] shadow-[2px_2px_0_#EAE5DA]",
          !still && "sticker-pop",
        )}
        style={{ maxWidth: `min(18rem, ${space})` }}
      >
        {/* The name gives way first, so the cheer itself always shows. */}
        <span className="min-w-0 truncate text-[#857B70]">{bubble.name}</span>
        {stickerId ? (
          <DieCutSticker id={stickerId} size={20} />
        ) : (
          <span className="shrink-0 font-semibold">{ROOM_CHEERS[bubble.say]}</span>
        )}
        {/* The tail, pointing at the sailor's badge. */}
        <span
          className={cx("absolute size-2 rotate-45 border-[#E4DCCD] bg-[#FFFDF7]", wide ? "-bottom-1 border-r border-b" : "-top-1 border-t border-l")}
          style={{ left: Math.min(tail, center) - 4 }}
        />
      </span>
    </span>
  );
}
