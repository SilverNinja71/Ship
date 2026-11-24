// The room rules, hosted by Lumi, shown before a sailor's first room and again whenever they
// change (ROOM_RULES_VERSION). The 13+ tick is stored with the account, and the database checks
// it before anyone opens, joins or lists an open room.

import { useState } from "react";
import { useRooms } from "../../stores/roomStore.js";
import { LegalModal } from "../LegalModal.js";
import { PastelMinionBadge } from "../PastelMinionBadge.js";
import { YELLOW_BUTTON, roomAction } from "./roomStyle.js";

const RULES = ["Be kind.", "Keep your name, school, socials and photos to yourself.", "Skippers can ask you to leave.", "Tap ⚑ if anything feels off."];

export function RoomRulesCard({ onDone }: { onDone: () => void }) {
  const [over13, setOver13] = useState(() => useRooms.getState().over13);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [legal, setLegal] = useState(false);

  const accept = async () => {
    setBusy(true);
    setError(null);
    const problem = await roomAction(() => useRooms.getState().acceptRules(over13), "load");
    setBusy(false);
    if (problem) setError(problem);
    else onDone();
  };

  return (
    <div className="mx-auto max-w-xl rounded-3xl border border-[#DCCCF0] bg-[#F7F2FD] px-5 py-6 text-[#56406A] shadow-[3px_3px_0_#E6DCF3] sm:px-7">
      <div className="flex items-center gap-3">
        <PastelMinionBadge costume="bunny" size={64} />
        <div>
          <p className="text-xs tracking-[0.18em] uppercase opacity-80">Lumi's room rules</p>
          <h3 className="font-display text-2xl font-normal leading-tight">Before you come aboard</h3>
        </div>
      </div>
      <ol className="mt-4 space-y-2">
        {RULES.map((rule, i) => (
          <li key={rule} className="flex items-start gap-2.5 rounded-2xl bg-white/70 px-3 py-2 text-[15px] text-[#4A3A5C]">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#E9DDF8] font-display text-sm text-[#56406A]">{i + 1}</span>
            <span>{rule}</span>
          </li>
        ))}
      </ol>
      <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm">
        <input type="checkbox" checked={over13} onChange={(e) => setOver13(e.target.checked)} className="mt-0.5 size-4 accent-[#8E6BC0]" />
        <span>I'm 13 or older (needed for open rooms)</span>
      </label>
      <p className="mt-1 pl-6 text-xs opacity-80">Invite rooms with friends work either way.</p>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => setLegal(true)} className="text-sm underline underline-offset-4 hover:no-underline">
          Read the Community Rules
        </button>
        <button type="button" disabled={busy} onClick={() => void accept()} className={YELLOW_BUTTON}>
          {busy ? "Saving…" : "Sounds good"}
        </button>
      </div>
      {error && <p className="mt-3 rounded-2xl bg-[#FDE8E4] px-3 py-2 text-sm text-[#8A3B31]">{error}</p>}
      {legal && <LegalModal initialTab="community" onClose={() => setLegal(false)} />}
    </div>
  );
}
