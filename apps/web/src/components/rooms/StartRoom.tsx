// Opening a room: who can come (fixed for the room's life), a made-up name, a subject and the
// sailor's own made-up look. Invite rooms are the default; open rooms are listed for anyone 13+.

import { useState } from "react";
import { ROOM_SUBJECTS } from "@ship/shared-types";
import type { RoomLook, RoomMode } from "@ship/shared-types";
import { randomRoomName, roomNameText } from "../../lib/roomRules.js";
import { useRooms } from "../../stores/roomStore.js";
import { IconRefresh } from "../icons.js";
import { cx } from "../ui.js";
import { LookPicker } from "./LookPicker.js";
import { HELD, PAPER_CARD, ROOM_FOCUS_RING, YELLOW_BUTTON, chipClass, heldButton, roomAction, roomPastel } from "./roomStyle.js";

const MODES: { id: RoomMode; title: string; line: string }[] = [
  { id: "invite", title: "Invite only", line: "friends with the link" },
  { id: "open", title: "Open", line: "anyone logged in, 13+" },
];

export function StartRoom({ look, onLook, onRules }: { look: RoomLook; onLook: (look: RoomLook) => void; onRules: () => void }) {
  const over13 = useRooms((s) => s.over13);
  const [mode, setMode] = useState<RoomMode>("invite");
  const [name, setName] = useState<[number, number]>(() => randomRoomName(Math.random));
  const [subject, setSubject] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pastel = roomPastel(subject);

  const open = async () => {
    setBusy(true);
    setError(null);
    // On success the panel switches to the new room by itself.
    const problem = await roomAction(() => useRooms.getState().openRoom({ mode, name, subject, look }), "open");
    setBusy(false);
    setError(problem);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="space-y-4">
        <fieldset>
          <legend className="mb-1.5 font-display text-base">Who can come?</legend>
          <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
            {MODES.map((m) => {
              const locked = m.id === "open" && !over13;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.id}
                  disabled={locked}
                  onClick={() => setMode(m.id)}
                  className={cx(
                    "rounded-2xl border-2 px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-55",
                    ROOM_FOCUS_RING,
                    mode === m.id ? "border-[#E8C64A] bg-[#FFF9DC] text-[#4B3A0B]" : "border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--page-ink)] hover:bg-[var(--surface-2)]",
                  )}
                >
                  <span className="block font-display text-base">{m.title}</span>
                  <span className="block text-xs opacity-90">{m.line}</span>
                </button>
              );
            })}
          </div>
          {!over13 && (
            <p className="mt-1.5 text-xs text-[var(--muted-ink)]">
              Open rooms need the 13+ tick.{" "}
              <button type="button" onClick={onRules} className="underline underline-offset-4">
                Open the room rules
              </button>
            </p>
          )}
          <p className="mt-1.5 text-xs text-[var(--muted-ink)]">This can't be changed later.</p>
        </fieldset>

        <div>
          <p className="mb-1.5 font-display text-base">Subject</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Subject">
            {ROOM_SUBJECTS.map((s, i) => (
              <button key={s} type="button" role="radio" aria-checked={subject === i} onClick={() => setSubject(i)} className={chipClass(subject === i)}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 font-display text-base">You</p>
          <LookPicker look={look} onChange={onLook} />
        </div>
      </div>

      <div className="space-y-3 lg:sticky lg:top-0 lg:self-start">
        <div className="rounded-2xl border px-4 py-4 [--ring:currentColor]" style={{ background: pastel.fill, borderColor: pastel.line, color: pastel.ink }}>
          <p className="text-xs tracking-[0.18em] uppercase opacity-90">Your room</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="min-w-0 flex-1 font-display text-2xl leading-tight">{roomNameText(name)}</p>
            <button
              type="button"
              onClick={() => setName(randomRoomName(Math.random))}
              aria-label="Pick another room name"
              title="Pick another room name"
              className={cx("grid size-9 shrink-0 place-items-center rounded-full bg-white/70 hover:bg-white", ROOM_FOCUS_RING)}
            >
              <IconRefresh size={16} />
            </button>
          </div>
          <p className="mt-1 text-sm opacity-85">
            {ROOM_SUBJECTS[subject]} <span aria-hidden="true">·</span> {mode === "open" ? "Open room" : "Invite room"}
          </p>
          <p className="mt-2 text-xs opacity-90">Room names are made up, so nobody types anything others see. The room ends after 12 hours.</p>
        </div>
        <button type="button" {...heldButton(busy, () => void open())} className={cx(YELLOW_BUTTON, HELD, "w-full py-2.5 font-display text-base font-normal")}>
          {busy ? "Opening the room…" : "Open the room"}
        </button>
        {error && (
          <p role="alert" className="rounded-2xl bg-[#FDE8E4] px-3 py-2 text-sm text-[#8A3B31]">
            {error}
          </p>
        )}
        <div className={cx(PAPER_CARD, "px-3 py-2.5 text-xs text-[var(--muted-ink)]")}>
          You'll be the <strong className="font-normal text-[var(--page-ink)]">Skipper</strong>: you can set sail for the crew, lock the door, ask someone to leave, and close the room.
        </div>
      </div>
    </div>
  );
}
