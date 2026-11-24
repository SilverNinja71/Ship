// Everyone aboard, in the order they came: their made-up name and character, what they're doing,
// and the minutes they've given the crew. Each crewmate's ⋯ menu hides their cheers on this
// device; the skipper's adds passing the hat and asking someone to leave.

import { useEffect, useRef, useState } from "react";
import { ROOM_LIMITS } from "@ship/shared-types";
import type { Room } from "@ship/shared-types";
import { nickText, statusLine } from "../../lib/roomRules.js";
import { useRooms } from "../../stores/roomStore.js";
import { useUi } from "../../stores/uiStore.js";
import { PastelMinionBadge } from "../PastelMinionBadge.js";
import { cx } from "../ui.js";
import { COSTUME_PASTELS, PAPER_CARD, ROOM_FOCUS_RING, accessoryOf, costumeOf, memberStatus, roomAction } from "./roomStyle.js";

export interface MoreMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

/** A small ⋯ button with a menu under it. Escape or a click elsewhere closes it. */
export function MoreMenu({ label, items, ink }: { label: string; items: MoreMenuItem[]; ink?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key, true);
    };
  }, [open]);
  if (!items.length) return null;
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
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
        <div role="menu" className="popover-enter absolute right-0 top-full z-20 mt-1 w-56 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-1 text-[var(--page-ink)] shadow-[3px_3px_0_#EAE5DA]">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cx("block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)]", ROOM_FOCUS_RING, item.danger && "text-[#8A3B31]")}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CrewList({ room, myKey, now }: { room: Room; myKey: string; now: number }) {
  const hidden = useRooms((s) => s.hidden);
  const toast = useUi((s) => s.toast);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const iSkipper = room.host === myKey;

  const act = async (run: () => Promise<void>, done: string) => {
    setBusy(true);
    const problem = await roomAction(run, "write");
    toast(problem ?? done, problem ? "warning" : "info");
    setBusy(false);
    setConfirm(null);
  };

  return (
    <section aria-label="Crew" className="space-y-2">
      <h3 className="flex items-baseline gap-2 font-display text-lg font-normal">
        Crew <span className="text-sm text-[var(--muted-ink)] tabular-nums">{room.members.length}/{ROOM_LIMITS.size} aboard</span>
      </h3>
      <ul className="grid gap-2 sm:grid-cols-2">
        {room.members.map((m) => {
          const me = m.key === myKey;
          const name = nickText(m.nick);
          const costume = costumeOf(m.costume);
          const isHidden = hidden.includes(m.key);
          const items = me
            ? []
            : [
                { label: isHidden ? "Show their cheers again" : "Hide their cheers", onSelect: () => useRooms.getState().hideSailor(m.key, !isHidden) },
                ...(iSkipper
                  ? [
                      { label: "Pass the skipper's hat", onSelect: () => void act(() => useRooms.getState().passHat(m.key), `${name} is the skipper now.`) },
                      { label: "Ask to leave", onSelect: () => setConfirm(m.key), danger: true },
                    ]
                  : []),
              ];
          return (
            <li key={m.key} className={cx(PAPER_CARD, "px-2.5 py-2", me && "ring-2 ring-[#F1E3A0]")}>
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
                    {isHidden && <span> · cheers hidden</span>}
                  </p>
                </div>
                <MoreMenu label={`More for ${name}`} items={items} />
              </div>
              {confirm === m.key && (
                <div className="mt-2 rounded-xl bg-[#FDE8E4] px-3 py-2 text-sm text-[#8A3B31]">
                  <p>Remove {name} from this room? They won't be able to come back.</p>
                  <div className="mt-1.5 flex flex-wrap gap-3">
                    <button type="button" disabled={busy} onClick={() => void act(() => useRooms.getState().removeSailor(m.key), `${name} left the room.`)} className="font-semibold underline underline-offset-4 disabled:opacity-50">
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
