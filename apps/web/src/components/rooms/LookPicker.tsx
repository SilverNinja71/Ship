// The made-up sailor a room sees: a nickname from the word lists, a character and an accessory.
// Nothing here comes from the sailor's account or Wardrobe, so no real name can slip into a room.

import { ROOM_ACCESSORIES, ROOM_COSTUMES } from "@ship/shared-types";
import type { RoomLook } from "@ship/shared-types";
import { nickText, randomNick } from "../../lib/roomRules.js";
import { IconRefresh } from "../icons.js";
import { PastelMinionBadge } from "../PastelMinionBadge.js";
import { cx } from "../ui.js";
import { ACCESSORY_LABELS, COSTUME_LABELS, COSTUME_PASTELS, ROOM_FOCUS_RING, accessoryOf, chipClass, costumeOf } from "./roomStyle.js";

export function LookPicker({ look, onChange }: { look: RoomLook; onChange: (look: RoomLook) => void }) {
  const costume = costumeOf(look.costume);
  return (
    <div className="space-y-3 rounded-2xl border border-[#DCCCF0] bg-[#F7F2FD] px-3.5 py-3 text-[#56406A] [--ring:currentColor]">
      <div className="flex items-center gap-3">
        <span className="grid shrink-0 place-items-center rounded-2xl" style={{ background: COSTUME_PASTELS[costume].fill }}>
          <PastelMinionBadge costume={costume} accessory={accessoryOf(look.accessory)} size={64} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            In this room you're <strong className="font-display text-base font-normal">{nickText(look.nick)}</strong>.
          </p>
          <p className="text-xs opacity-90">Your Google name and email stay hidden, and every room gets a new nickname.</p>
          <button
            type="button"
            onClick={() => onChange({ ...look, nick: randomNick(Math.random) })}
            className={cx("mt-1 inline-flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-0.5 text-xs text-[#56406A] hover:bg-white", ROOM_FOCUS_RING)}
          >
            <IconRefresh size={13} /> New name
          </button>
        </div>
      </div>

      <div role="radiogroup" aria-label="Your character" className="flex flex-wrap gap-1.5">
        {ROOM_COSTUMES.map((c, i) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={look.costume === i}
            aria-label={COSTUME_LABELS[c]}
            title={COSTUME_LABELS[c]}
            onClick={() => onChange({ ...look, costume: i })}
            className={cx(
              "grid place-items-center rounded-2xl border-2 p-0.5 transition",
              ROOM_FOCUS_RING,
              look.costume === i ? "border-[#B9A3DC] bg-white" : "border-transparent bg-white/50 hover:bg-white/80",
            )}
          >
            <PastelMinionBadge costume={c} size={40} />
          </button>
        ))}
      </div>

      <div role="radiogroup" aria-label="Accessory" className="flex flex-wrap gap-1.5">
        {ROOM_ACCESSORIES.map((a, i) => (
          <button key={a} type="button" role="radio" aria-checked={look.accessory === i} onClick={() => onChange({ ...look, accessory: i })} className={chipClass(look.accessory === i, { pastel: true })}>
            {ACCESSORY_LABELS[a]}
          </button>
        ))}
      </div>
    </div>
  );
}
