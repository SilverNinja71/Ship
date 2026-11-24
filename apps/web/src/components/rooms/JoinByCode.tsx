// Typing a friend's room code (or pasting their link). The box writes the code the way the ticket
// shows it, "K7MP 2QXA", and points out the letters codes never use.

import { useState } from "react";
import type { FormEvent } from "react";
import { ROOM_LIMITS } from "@ship/shared-types";
import { normalizeCode } from "../../lib/roomRules.js";
import { PastelMinionBadge } from "../PastelMinionBadge.js";
import { SEAFOAM_BUTTON } from "./roomStyle.js";

/** Letters and numbers only, in capitals. A pasted invite link gives just its code. */
function tidy(input: string): string {
  if (/room=/i.test(input)) {
    const r = normalizeCode(input);
    if (r.ok) return r.code;
  }
  return input.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, ROOM_LIMITS.codeLength + 2);
}

const shown = (raw: string) => (raw.length > 4 ? `${raw.slice(0, 4)} ${raw.slice(4)}` : raw);

export function JoinByCode({ onFind }: { onFind: (code: string) => void }) {
  const [raw, setRaw] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const confusing = /[IO01]/.test(raw);

  const find = (e: FormEvent) => {
    e.preventDefault();
    const r = normalizeCode(raw);
    if (r.ok) onFind(r.code);
    else setProblem(r.reason);
  };

  return (
    <form onSubmit={find} className="mx-auto grid max-w-md justify-items-center gap-3 rounded-3xl border border-[#B2C8E0] bg-[#E6F2FA] px-5 py-7 text-center text-[#2F4F6B]">
      <PastelMinionBadge costume="pwedo" size={64} />
      <p className="font-display text-xl">Got a room code?</p>
      <p className="text-sm opacity-85">Type the 8 letters and numbers from your friend's ticket, or paste their invite link.</p>
      <label className="w-full">
        <span className="sr-only">Room code</span>
        <input
          value={shown(raw)}
          onChange={(e) => {
            setRaw(tidy(e.target.value));
            setProblem(null);
          }}
          placeholder="K7MP 2QXA"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={200}
          aria-describedby="room-code-hint"
          className="w-full rounded-2xl border border-[#B2C8E0] bg-white px-3 py-2.5 text-center font-display text-2xl tracking-[0.18em] text-[#2F4F6B] tabular-nums placeholder:text-[#2F4F6B]/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F4F6B]"
        />
      </label>
      <p id="room-code-hint" className="min-h-5 text-xs" aria-live="polite">
        {problem ?? (confusing ? "Room codes never use the letters I or O, or the numbers 0 or 1. Check those characters again." : "")}
      </p>
      <button type="submit" disabled={raw.length < ROOM_LIMITS.codeLength} className={SEAFOAM_BUTTON}>
        Find room
      </button>
    </form>
  );
}
