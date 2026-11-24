// Everyone aboard, in the order they came: their made-up name and character, what they're doing,
// and the minutes they've given the crew. Each crewmate's ⋯ menu hides their cheers on this
// device; the skipper's adds passing the hat and asking someone to leave.

import { useCallback, useEffect, useRef, useState } from "react";
import { ROOM_LIMITS } from "@ship/shared-types";
import type { Room } from "@ship/shared-types";
import { hasTwin, memberName, statusLine } from "../../lib/roomRules.js";
import { useRooms } from "../../stores/roomStore.js";
import { useUi } from "../../stores/uiStore.js";
import { PastelMinionBadge } from "../PastelMinionBadge.js";
import { cx } from "../ui.js";
import { COSTUME_PASTELS, HELD, PAGE_RING, PAPER_CARD, PAPER_SHADOW, ROOM_FOCUS_RING, accessoryOf, costumeOf, heldButton, memberStatus, skipperAction, usePopoverDismiss } from "./roomStyle.js";
import { ConfirmQuestion } from "./SkipperMenu.js";

export interface MoreMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  /** The pick opens something that takes the focus itself (a confirm), so it isn't handed back to ⋯. */
  keepFocus?: boolean;
}

/**
 * A small ⋯ button with a menu under it, following the menu pattern: opening it moves focus to the
 * first item; the arrow keys, Home and End move between items; Escape, Tab, a click elsewhere or a
 * pick closes it, and focus goes back to the ⋯ button (when it's still there).
 */
export function MoreMenu({ label, items, ink }: { label: string; items: MoreMenuItem[]; ink?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const back = useCallback(() => requestAnimationFrame(() => button.current?.isConnected && button.current.focus()), []);
  // A click elsewhere leaves focus where it lands; Escape brings it back to the ⋯ button.
  const close = useCallback(
    (how: "escape" | "outside") => {
      setOpen(false);
      if (how === "escape") back();
    },
    [back],
  );
  usePopoverDismiss(open, ref, close);
  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);
  if (!items.length) return null;

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const all = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = all.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => {
      e.preventDefault();
      all[(i + all.length) % all.length]?.focus();
    };
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(all.length - 1);
    else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cx("grid size-8 place-items-center rounded-full hover:bg-black/5", ROOM_FOCUS_RING)}
        style={ink ? { color: ink } : undefined}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
          <circle cx="6" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="18" cy="12" r="1.7" />
        </svg>
      </button>
      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          className={cx("popover-enter absolute right-0 top-full z-20 mt-1 w-56 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-1 text-[var(--page-ink)]", PAGE_RING, PAPER_SHADOW)}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                setOpen(false);
                item.onSelect();
                if (!item.keepFocus) back();
              }}
              className={cx(
                "block w-full rounded-xl px-3 py-2 text-left text-sm",
                ROOM_FOCUS_RING,
                // The danger item carries its own coral fill, so it reads on every theme's menu color.
                item.danger ? "mt-0.5 bg-[#FDE8E4] text-[#8A3B31] hover:bg-[#FAD9D2]" : "hover:bg-[var(--surface-2)]",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** "just now", "1 min ago", "12 min ago" or "2 h ago". */
function minutesAgo(at: number, now: number): string {
  const mins = Math.max(0, Math.floor((now - at) / 60_000));
  if (mins < 1) return "just now";
  return mins < 120 ? `${mins} min ago` : `${Math.floor(mins / 60)} h ago`;
}

export function CrewList({ room, myKey, now }: { room: Room; myKey: string; now: number }) {
  const hidden = useRooms((s) => s.hidden);
  const toast = useUi((s) => s.toast);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const iSkipper = room.host === myKey;
  const list = useRef<HTMLUListElement>(null);
  // "Keep them" (or a removal that's done) gives the focus back to that crewmate's ⋯ button.
  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (confirm) asked.current = confirm;
    else if (asked.current) {
      const key = asked.current;
      asked.current = null;
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active && active !== document.body) return;
        list.current?.querySelector<HTMLElement>(`[data-crew="${key}"] [aria-haspopup="menu"]`)?.focus();
      });
    }
  }, [confirm]);

  const act = async (run: () => Promise<void>, done: string) => {
    setBusy(true);
    const problem = await skipperAction(run);
    setBusy(false);
    setConfirm(null);
    if (problem !== undefined) toast(problem ?? done, problem ? "warning" : "info");
  };

  return (
    <section aria-label="Crew" className="space-y-2">
      <h3 className="flex items-baseline gap-2 font-display text-lg font-normal">
        Crew <span className="text-sm text-[var(--muted-ink)] tabular-nums">{room.members.length}/{ROOM_LIMITS.size} aboard</span>
      </h3>
      <ul ref={list} className="grid gap-2 sm:grid-cols-2">
        {room.members.map((m) => {
          const me = m.key === myKey;
          const name = memberName(room, m.key);
          // Two sailors with the same nickname: each card also says when they came aboard.
          const aboardFor = hasTwin(room, m.key) ? ` · came aboard ${minutesAgo(m.joinedAt, now)}` : "";
          const costume = costumeOf(m.costume);
          const isHidden = hidden.includes(m.key);
          const items = me
            ? []
            : [
                { label: isHidden ? "Show their cheers again" : "Hide their cheers", onSelect: () => useRooms.getState().hideSailor(m.key, !isHidden) },
                ...(iSkipper
                  ? [
                      { label: "Pass the skipper's hat", onSelect: () => void act(() => useRooms.getState().passHat(m.key), `${name} is the skipper now.`) },
                      { label: "Ask to leave", onSelect: () => setConfirm(m.key), danger: true, keepFocus: true },
                    ]
                  : []),
              ];
          return (
            <li key={m.key} data-crew={m.key} className={cx(PAPER_CARD, "px-2.5 py-2", me && "ring-2 ring-[#F1E3A0]")}>
              <div className="flex items-center gap-2.5">
                <span className="grid shrink-0 place-items-center rounded-full" style={{ background: COSTUME_PASTELS[costume].fill }}>
                  <PastelMinionBadge costume={costume} accessory={accessoryOf(m.accessory)} status={memberStatus(m, now)} skipper={m.key === room.host} size={40} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-[15px]">
                    {name}
                    {me && <span className="text-[var(--muted-ink)]"> (you)</span>}
                  </p>
                  <p className="text-xs text-[var(--muted-ink)]">
                    {statusLine(m, now)} <span aria-hidden="true">·</span> {m.dmg} min for the crew
                    {aboardFor}
                    {isHidden && <span> · cheers hidden</span>}
                  </p>
                </div>
                <MoreMenu label={`More for ${name}`} items={items} />
              </div>
              {confirm === m.key && (
                <div className="mt-2 rounded-xl bg-[#FDE8E4] px-3 py-2 text-sm text-[#8A3B31] [--ring:currentColor]">
                  <ConfirmQuestion text={`Remove ${name}${aboardFor ? ` (came aboard ${minutesAgo(m.joinedAt, now)})` : ""} from this room? They won't be able to come back.`} />
                  <div className="mt-1.5 flex flex-wrap gap-3">
                    <button type="button" {...heldButton(busy, () => void act(() => useRooms.getState().removeSailor(m.key), `${name} left the room.`))} className={`font-semibold underline underline-offset-4 ${HELD}`}>
                      Yes, remove them
                    </button>
                    <button type="button" onClick={() => setConfirm(null)} className="underline-offset-4 hover:underline">
                      Keep them
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {room.members.length === 1 && (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-[var(--border-subtle)] px-3 py-2.5 text-sm text-[var(--muted-ink)]">
          <PastelMinionBadge costume="teddy" size={40} />
          <p>Mochi is keeping your seat warm. Send your crew the invite ticket, and they'll show up here.</p>
        </div>
      )}
    </section>
  );
}
