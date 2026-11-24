// A room's public card on the open list: only what the card holds (made-up name, subject, how
// many are aboard, when it opened). Nothing on it was typed by a person, so it has no report
// button; a sailor can still hide a room from their own list.

import { ROOM_LIMITS } from "@ship/shared-types";
import type { RoomCard } from "@ship/shared-types";
import { roomNameText, subjectText } from "../../lib/roomRules.js";
import { cx } from "../ui.js";
import { MoreMenu } from "./CrewList.js";
import { SEAFOAM_BUTTON, agoText, roomPastel, timeOfDay } from "./roomStyle.js";

/** "3/6 aboard" as six little dots, filled for each sailor. */
export function AboardDots({ aboard, ink }: { aboard: number; ink: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: ink }}>
      <span className="inline-flex gap-0.5" aria-hidden="true">
        {Array.from({ length: ROOM_LIMITS.size }, (_, i) => (
          <span key={i} className="size-2 rounded-full border" style={{ borderColor: ink, background: i < aboard ? ink : "transparent", opacity: i < aboard ? 0.85 : 0.35 }} />
        ))}
      </span>
      <span className="tabular-nums">
        {aboard}/{ROOM_LIMITS.size} aboard
      </span>
    </span>
  );
}

/** When a room closes for good (12 hours after it opened), on this device's clock. */
export function closesAt(card: { at: number }, serverOffset = 0): string {
  return timeOfDay(card.at + ROOM_LIMITS.lifetimeHours * 3_600_000, serverOffset);
}

export function RoomCardView({ card, now, serverOffset = 0, onBoard, onHide }: { card: RoomCard; now: number; serverOffset?: number; onBoard: () => void; onHide: () => void }) {
  const pastel = roomPastel(card.subject);
  const full = card.aboard >= ROOM_LIMITS.size;
  return (
    <article className="flex h-full flex-col gap-2 rounded-2xl border px-3.5 py-3 shadow-[3px_3px_0_rgb(0_0_0_/_0.05)]" style={{ background: pastel.fill, borderColor: pastel.line, color: pastel.ink }}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg leading-snug">{roomNameText(card.name)}</h3>
          <span className="mt-0.5 inline-block rounded-full bg-white/70 px-2 py-0.5 text-xs">{subjectText(card.subject)}</span>
        </div>
        <MoreMenu label={`More for ${roomNameText(card.name)}`} ink={pastel.ink} items={[{ label: "Hide this room (on this device)", onSelect: onHide }]} />
      </div>
      <AboardDots aboard={card.aboard} ink={pastel.ink} />
      <p className="text-xs opacity-80">
        opened {agoText(now - card.at)} <span aria-hidden="true">·</span> closes {closesAt(card, serverOffset)}
      </p>
      <div className="mt-auto pt-1">
        {full ? (
          <span className="inline-block rounded-full border px-3 py-1 text-sm" style={{ borderColor: pastel.line }}>
            Full
          </span>
        ) : (
          <button type="button" onClick={onBoard} className={cx(SEAFOAM_BUTTON, "text-sm")}>
            Come aboard
          </button>
        )}
      </div>
    </article>
  );
}
