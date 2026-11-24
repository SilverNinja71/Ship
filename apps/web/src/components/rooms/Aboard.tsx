// The room you're in, top to bottom: its name, the invite ticket, the crew, Kraken Watch,
// sailing together, cheers, the break games, and the way out. Times are the server's (this
// device's clock plus the room's measured offset), so everyone's countdowns agree.

import type { Room } from "@ship/shared-types";
import { roomNameText, subjectText } from "../../lib/roomRules.js";
import { useRooms } from "../../stores/roomStore.js";
import { useUi } from "../../stores/uiStore.js";
import { PastelMinionBadge } from "../PastelMinionBadge.js";
import { CheerBar } from "./CheerBar.js";
import { CrewList } from "./CrewList.js";
import { KrakenCard } from "./KrakenCard.js";
import { PlayTogether } from "./PlayTogether.js";
import { ReportRoom } from "./ReportRoom.js";
import { closesAt } from "./RoomCardView.js";
import { SailTogetherCard } from "./SailTogetherCard.js";
import { SkipperMenu } from "./SkipperMenu.js";
import { Ticket } from "./Ticket.js";
import { QUIET_BUTTON, roomAction, roomPastel, useTicker } from "./roomStyle.js";

export function Aboard() {
  const room = useRooms((s) => s.room);
  const myKey = useRooms((s) => s.myKey);
  const status = useRooms((s) => s.status);
  const error = useRooms((s) => s.alert ?? s.error);
  const alert = useRooms((s) => s.alert);
  const serverOffset = useRooms((s) => s.serverOffset);
  const now = useTicker(1000) + serverOffset;

  if (status === "elsewhere") {
    return (
      <div className="mx-auto grid max-w-md place-items-center gap-3 rounded-3xl border border-[#B2C8E0] bg-[#E6F2FA] px-6 py-8 text-center text-[#2F4F6B]">
        <PastelMinionBadge costume="pwedo" size={64} />
        <p className="font-display text-xl leading-snug">This room is open in another Ship tab</p>
        <p className="text-sm">Pwedo keeps your seat in one tab at a time, so your crew sees one of you. Use that tab, or close it and this one takes over.</p>
        <LeaveButton label="Leave the room" />
      </div>
    );
  }

  if (!room || !myKey || !room.members.some((m) => m.key === myKey)) {
    return (
      <div className="mx-auto grid max-w-md place-items-center gap-3 rounded-3xl border border-dashed border-[var(--border-subtle)] px-6 py-10 text-center">
        <PastelMinionBadge costume="pwedo" size={64} />
        {status === "error" ? (
          <>
            <p className="rounded-2xl bg-[#FDE8E4] px-3 py-2 text-sm text-[#8A3B31]">{error ?? "Couldn't reach the room. Check your connection."}</p>
            <LeaveButton label="Leave the room" />
          </>
        ) : (
          <p className="text-sm text-[var(--muted-ink)]">Climbing aboard…</p>
        )}
      </div>
    );
  }

  return <AboardRoom room={room} myKey={myKey} now={now} serverOffset={serverOffset} problem={alert} listening={status !== "error"} />;
}

function AboardRoom({ room, myKey, now, serverOffset, problem, listening }: { room: Room; myKey: string; now: number; serverOffset: number; problem: string | null; listening: boolean }) {
  const pastel = roomPastel(room.subject);
  const iSkipper = room.host === myKey;
  return (
    <div className="space-y-4">
      {problem && <ProblemNote text={problem} listening={listening} />}
      <header className="rounded-2xl border px-4 py-3.5" style={{ background: pastel.fill, borderColor: pastel.line, color: pastel.ink }}>
        <h3 className="font-display text-2xl leading-tight">{roomNameText(room.name)}</h3>
        <p className="mt-0.5 text-sm opacity-85">
          {subjectText(room.subject)} <span aria-hidden="true">·</span> {room.mode === "open" ? "Open room" : "Invite room"}
          {room.locked && (
            <>
              {" "}
              <span aria-hidden="true">·</span> door locked
            </>
          )}
        </p>
        <p className="mt-0.5 text-xs opacity-75">closes {closesAt(room, serverOffset)}</p>
      </header>

      <Ticket room={room} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <CrewList room={room} myKey={myKey} now={now} />
        <div className="space-y-4">
          <KrakenCard room={room} now={now} />
          <SailTogetherCard room={room} myKey={myKey} now={now} />
        </div>
      </div>

      <CheerBar />
      <PlayTogether />

      <footer className="flex flex-wrap items-center gap-x-2 gap-y-2 border-t border-dashed border-[var(--border-subtle)] pt-3">
        <LeaveButton label="Leave the room" />
        <ReportRoom code={room.code} />
        {iSkipper && (
          <div className="ml-auto">
            <SkipperMenu room={room} />
          </div>
        )}
      </footer>
      <p className="text-xs text-[var(--muted-ink)]">Nobody here sees your real name, and there's no chat, voice or video. Leaving keeps the minutes you gave the crew.</p>
    </div>
  );
}

/**
 * A problem from the room's background work (the listener dropped, the day's free database use
 * ran out, an own write was refused): Pwedo says so while the room stays on show. A listener
 * problem clears itself on the next good snapshot; the rest are dismissed.
 */
function ProblemNote({ text, listening }: { text: string; listening: boolean }) {
  return (
    <div role="status" className="flex items-start gap-3 rounded-2xl border border-[#F4C7BE] bg-[#FDE8E4] px-3.5 py-2.5 text-[#8A3B31]">
      <PastelMinionBadge costume="pwedo" size={40} />
      <div className="min-w-0 flex-1 text-sm">
        <p>{text}</p>
        <p className="mt-0.5 text-xs opacity-85">{listening ? "Your own timer keeps going either way." : "Pwedo keeps trying to reach the room. Your own timer keeps going either way."}</p>
      </div>
      {listening && (
        <button type="button" onClick={() => useRooms.setState({ alert: null })} className="shrink-0 rounded-full bg-white/70 px-2.5 py-0.5 text-xs hover:bg-white">
          OK
        </button>
      )}
    </div>
  );
}

function LeaveButton({ label }: { label: string }) {
  const leave = async () => {
    const problem = await roomAction(() => useRooms.getState().leaveRoom(), "leave");
    useUi.getState().toast(problem ?? "You left the room. Your minutes stay with the crew.", problem ? "warning" : "info");
  };
  return (
    <button type="button" onClick={() => void leave()} className={QUIET_BUTTON}>
      {label}
    </button>
  );
}
