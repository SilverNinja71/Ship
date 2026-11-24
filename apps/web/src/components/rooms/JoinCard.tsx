// "Come aboard?": a room's public card before joining, from an invite link, a typed code or the
// open list. Nothing joins until the sailor taps Come aboard, and they pick their made-up look
// first. A refused join says why in plain words.

import { useEffect, useState } from "react";
import type { RoomCard, RoomLook } from "@ship/shared-types";
import { joinProblem, roomNameText, roomProblem, subjectText } from "../../lib/roomRules.js";
import { useRooms } from "../../stores/roomStore.js";
import { PastelMinionBadge } from "../PastelMinionBadge.js";
import { cx } from "../ui.js";
import { LookPicker } from "./LookPicker.js";
import { AboardDots, closesAt } from "./RoomCardView.js";
import { ReportRoom } from "./ReportRoom.js";
import { QUIET_BUTTON, SEAFOAM_BUTTON, YELLOW_BUTTON, roomAction, roomPastel } from "./roomStyle.js";

/** What a refused join says: the card shows no reason, so usually a ban (the skipper removed this sailor). */
const BANNED_TEXT = roomProblem("permission-denied", "join");

type Found = { state: "loading" } | { state: "found"; card: RoomCard } | { state: "missing" } | { state: "problem"; text: string };

export function JoinCard({
  code,
  card: known,
  look,
  onLook,
  onJoined,
  onCancel,
  onRules,
  refusal: firstRefusal = null,
}: {
  code: string;
  /** The card already in hand (from the open list), so it isn't read again. */
  card?: RoomCard;
  look: RoomLook;
  onLook: (look: RoomLook) => void;
  onJoined: () => void;
  onCancel: () => void;
  onRules: () => void;
  /** Why an earlier try (Hop back in) was refused. */
  refusal?: string | null;
}) {
  const over13 = useRooms((s) => s.over13);
  const current = useRooms((s) => s.current);
  const serverOffset = useRooms((s) => s.serverOffset);
  // The store reads the card (loadPreview), and reads it again after a refused join.
  const preview = useRooms((s) => (s.preview?.code === code ? s.preview : null));
  const [loadProblem, setLoadProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(firstRefusal);

  useEffect(() => {
    if (known) return;
    let live = true;
    void roomAction(() => useRooms.getState().loadPreview(code), "load").then((problem) => live && setLoadProblem(problem));
    return () => {
      live = false;
    };
  }, [code, known]);

  const found: Found = preview
    ? preview.card
      ? { state: "found", card: preview.card }
      : { state: "missing" }
    : known
      ? { state: "found", card: known }
      : loadProblem
        ? { state: "problem", text: loadProblem }
        : { state: "loading" };

  const join = async () => {
    setBusy(true);
    setRefusal(null);
    // The store leaves any other room first, and words a refusal (full, locked, a ban…) itself.
    const problem = await roomAction(() => useRooms.getState().joinRoom(code, look), "join");
    setBusy(false);
    if (!problem && useRooms.getState().current === code) onJoined();
    else setRefusal(problem ?? roomProblem("permission-denied", "join"));
  };

  if (current === code) {
    return (
      <Box>
        <PastelMinionBadge costume="pwedo" size={64} />
        <p className="font-display text-xl">You're already aboard this room</p>
        <button type="button" onClick={onJoined} className={SEAFOAM_BUTTON}>
          Back to the crew
        </button>
      </Box>
    );
  }
  if (found.state === "loading") {
    return (
      <Box>
        <PastelMinionBadge costume="pwedo" size={64} />
        <p className="text-sm text-[var(--muted-ink)]">Pwedo is looking for that room…</p>
      </Box>
    );
  }
  if (found.state !== "found") {
    return (
      <Box>
        <PastelMinionBadge costume="pwedo" size={64} />
        <p className="font-display text-xl">{found.state === "missing" ? "No room here" : "Couldn't look for the room"}</p>
        <p className="max-w-sm text-sm text-[var(--muted-ink)]">{found.state === "problem" ? found.text : roomProblem("not-found", "join")}</p>
        <button type="button" onClick={onCancel} className={YELLOW_BUTTON}>
          OK
        </button>
      </Box>
    );
  }

  const card = found.card;
  const pastel = roomPastel(card.subject);
  const why = joinProblem(card, Date.now() + serverOffset);
  const needsAge = card.mode === "open" && !over13;
  const whyText = why ? roomProblem("permission-denied", "join", why) : null;

  return (
    <div className="mx-auto grid max-w-2xl gap-4">
      <div className="rounded-3xl border px-5 py-5" style={{ background: pastel.fill, borderColor: pastel.line, color: pastel.ink }}>
        <div className="flex items-start gap-3">
          <PastelMinionBadge costume="pwedo" size={56} />
          <div className="min-w-0 flex-1">
            <p className="text-xs tracking-[0.18em] uppercase opacity-80">Come aboard?</p>
            <h3 className="font-display text-2xl leading-tight">{roomNameText(card.name)}</h3>
            <p className="mt-0.5 text-sm opacity-85">
              {subjectText(card.subject)} <span aria-hidden="true">·</span> {card.mode === "open" ? "Open room" : "Invite room"}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          <AboardDots aboard={card.aboard} ink={pastel.ink} />
          <span className="text-xs opacity-80">closes at {closesAt(card, serverOffset)}</span>
        </div>
      </div>

      {current && <p className="rounded-2xl bg-[#FFF9DC] px-3 py-2 text-sm text-[#4B3A0B]">You're in another room right now. Coming aboard here takes you out of it.</p>}
      {whyText ? (
        <p className="rounded-2xl bg-[#FDE8E4] px-3 py-2 text-sm text-[#8A3B31]">{whyText}</p>
      ) : needsAge ? (
        <p className="rounded-2xl bg-[#F3ECFB] px-3 py-2 text-sm text-[#56406A]">
          Open rooms are for sailors 13 and older.{" "}
          <button type="button" onClick={onRules} className="underline underline-offset-4">
            Open the room rules
          </button>
        </p>
      ) : (
        <LookPicker look={look} onChange={onLook} />
      )}

      {refusal && refusal !== whyText && <p className="rounded-2xl bg-[#FDE8E4] px-3 py-2 text-sm text-[#8A3B31]">{refusal}</p>}
      {/* A sailor the skipper removed can still report the room (the rules allow it for banned sailors). */}
      {refusal === BANNED_TEXT && (
        <div className="flex justify-start">
          <ReportRoom code={code} label="⚑ Report this room" />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button type="button" onClick={onCancel} className={QUIET_BUTTON}>
          Not now
        </button>
        <button type="button" disabled={busy || !!why || needsAge} onClick={() => void join()} className={cx(SEAFOAM_BUTTON, "px-5 py-2 font-display text-base font-normal")}>
          {busy ? "Climbing aboard…" : "Come aboard"}
        </button>
      </div>
    </div>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto grid max-w-md place-items-center gap-3 rounded-3xl border border-dashed border-[var(--border-subtle)] px-6 py-10 text-center">{children}</div>;
}
