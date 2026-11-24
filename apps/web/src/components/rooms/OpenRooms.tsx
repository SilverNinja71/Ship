// The open list: rooms whose skippers chose "Open", for sailors who ticked 13+. One read when
// the tab opens (and on Refresh); subjects are filtered in the browser, so no database index is
// needed. Each load also quietly clears up to 3 rooms that are over (the store does it), which is
// how open rooms expire without a server.

import { useEffect, useMemo, useState } from "react";
import type { RoomCard } from "@ship/shared-types";
import { listView, roomProblem, subjectText } from "../../lib/roomRules.js";
import { useRooms } from "../../stores/roomStore.js";
import { useUi } from "../../stores/uiStore.js";
import { IconRefresh } from "../icons.js";
import { PastelMinionBadge } from "../PastelMinionBadge.js";
import { RoomCardView } from "./RoomCardView.js";
import { QUIET_BUTTON, YELLOW_BUTTON, chipClass, roomAction, useTicker } from "./roomStyle.js";

type ListState = "loading" | "ready" | "paused" | { problem: string };

const PAUSED = roomProblem("paused", "load");

export function OpenRooms({ onBoard, onRules, onStart }: { onBoard: (card: RoomCard) => void; onRules: () => void; onStart: () => void }) {
  const over13 = useRooms((s) => s.over13);
  const hiddenRooms = useRooms((s) => s.hiddenRooms);
  const serverOffset = useRooms((s) => s.serverOffset);
  const openList = useRooms((s) => s.openList);
  const [state, setState] = useState<ListState>("loading");
  const [subject, setSubject] = useState<number | null>(null);
  const now = useTicker(30_000) + serverOffset;
  const cards = useMemo(() => openList?.cards ?? [], [openList]);

  const load = async () => {
    setState("loading");
    const problem = await roomAction(() => useRooms.getState().loadOpenRooms(), "load");
    setState(problem === PAUSED ? "paused" : problem ? { problem } : "ready");
  };
  useEffect(() => {
    if (over13) void load();
    // Loads once per visit to the tab; Refresh loads again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over13]);

  // Chips only for subjects a joinable room has.
  const joinable = listView(cards, now, hiddenRooms, null);
  const subjects = [...new Set(joinable.map((c) => c.subject))].sort((a, b) => a - b);
  const shown = listView(cards, now, hiddenRooms, subject);

  if (!over13) {
    return (
      <div className="grid place-items-center gap-3 rounded-3xl border border-dashed border-[var(--border-subtle)] px-6 py-10 text-center">
        <PastelMinionBadge costume="bunny" size={64} />
        <p className="font-display text-xl">Open rooms are for sailors 13 and older</p>
        <p className="max-w-md text-sm text-[var(--muted-ink)]">You can still join a friend's invite room with its code or link. If you're 13 or older, tick the box in the room rules.</p>
        <button type="button" onClick={onRules} className={YELLOW_BUTTON}>
          Open the room rules
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm text-[var(--muted-ink)]">Rooms anyone logged in can join. You'll only see their made-up names and subjects.</p>
        <button type="button" onClick={() => void load()} disabled={state === "loading"} className={`${QUIET_BUTTON} inline-flex items-center gap-1`}>
          <IconRefresh size={14} /> Refresh
        </button>
      </div>

      {subjects.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Subjects">
          <button type="button" aria-pressed={subject === null} onClick={() => setSubject(null)} className={chipClass(subject === null)}>
            All subjects
          </button>
          {subjects.map((s) => (
            <button key={s} type="button" aria-pressed={subject === s} onClick={() => setSubject(s)} className={chipClass(subject === s)}>
              {subjectText(s)}
            </button>
          ))}
        </div>
      )}

      {typeof state === "object" && <p className="rounded-2xl bg-[#FDE8E4] px-3 py-2 text-sm text-[#8A3B31]">{state.problem}</p>}
      {state === "paused" && (
        <div className="grid place-items-center gap-2 py-8 text-center">
          <PastelMinionBadge costume="teddy" size={60} />
          <p className="max-w-sm text-sm text-[var(--muted-ink)]">{PAUSED}</p>
        </div>
      )}
      {state === "loading" && <p className="py-6 text-center text-sm text-[var(--muted-ink)]">Looking around the harbor…</p>}
      {state === "ready" && shown.length === 0 && (
        <div className="grid place-items-center gap-2 py-8 text-center">
          <PastelMinionBadge costume="teddy" size={64} />
          <p className="font-display text-lg">The harbor is calm</p>
          <p className="max-w-sm text-sm text-[var(--muted-ink)]">Start a room, or come back later.</p>
          <button type="button" onClick={onStart} className={`${YELLOW_BUTTON} mt-1`}>
            Start a room
          </button>
        </div>
      )}
      {state === "ready" && shown.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {shown.map((card) => (
            <li key={card.code}>
              <RoomCardView
                card={card}
                now={now}
                serverOffset={serverOffset}
                onBoard={() => onBoard(card)}
                onHide={() => {
                  useRooms.getState().hideRoom(card.code);
                  useUi.getState().toast("Hidden from your list on this device.", "info");
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
