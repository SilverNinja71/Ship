// Kraken Watch: every focused minute anyone in the room sails is one bonk on the crew's beast.
// Which beast, and how many are beaten, come from the credited figure everyone agrees on (so they
// never run ahead of the cheer, or step back); the live minutes still being sailed only fill the
// current beast's bar (shownQuest). Captain Banan pops up to cheer when one goes down.

import { useEffect, useRef, useState } from "react";
import { QUEST_BEASTS } from "@ship/shared-types";
import type { QuestBeastId, Room } from "@ship/shared-types";
import { FIGUREHEADS } from "@ship/ship-theme-kit";
import { presence, shownQuest } from "../../lib/roomRules.js";
import { prefersReducedMotion, useSettings } from "../../stores/settingsStore.js";
import { cx } from "../ui.js";
import { MinionPortrait } from "./MinionPortrait.js";

const BEAST_MARK: Record<QuestBeastId, string> = {
  "procrastination-kraken": "🐙",
  "doomscroll-leviathan": "🐋",
  "notification-siren": "🧜",
  "snooze-serpent": "🐍",
};

const figureheadName = (id: string) => FIGUREHEADS.find((f) => f.id === id)?.name ?? id;

export function KrakenCard({ room, now }: { room: Room; now: number }) {
  const motion = useSettings((s) => s.motion);
  const quest = shownQuest(room, now);
  const beast = QUEST_BEASTS[quest.beastIndex]!;
  const beaten = quest.defeated;
  const present = room.members.filter((m) => presence(m, now) === "here");
  const formation = present.length >= 2 && present.every((m) => m.state === 1);

  // A defeat after this card opened (never one from before) brings the captain out for 4 s.
  const seen = useRef(beaten);
  const [cheer, setCheer] = useState<string | null>(null);
  useEffect(() => {
    if (beaten <= seen.current) {
      seen.current = beaten;
      return;
    }
    seen.current = beaten;
    const gone = QUEST_BEASTS[(beaten - 1) % QUEST_BEASTS.length]!;
    setCheer(`Bonk! The crew beat ${gone.name.replace(/^The /, "the ")}!`);
    const id = setTimeout(() => setCheer(null), 4000);
    return () => clearTimeout(id);
  }, [beaten]);

  return (
    <section aria-label="Kraken Watch" className="relative overflow-hidden rounded-2xl border border-[#F4C7BE] bg-[#FDE8E4] px-4 py-3.5 text-[#8A3B31] [--ring:currentColor]">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/75 text-2xl" aria-hidden="true">
          {BEAST_MARK[beast.id]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs tracking-[0.18em] uppercase opacity-90">Kraken Watch</p>
          <h3 className="font-display text-lg leading-tight">{beast.name}</h3>
        </div>
        <p className="shrink-0 font-display text-sm tabular-nums">
          {Math.ceil(quest.hp)} / {quest.maxHp}
        </p>
      </div>
      <div
        role="progressbar"
        aria-label={`${beast.name} health`}
        aria-valuemin={0}
        aria-valuemax={quest.maxHp}
        aria-valuenow={Math.ceil(quest.hp)}
        className="mt-2.5 h-3 w-full overflow-hidden rounded-full border border-[#F4C7BE] bg-white/70"
      >
        <div className="h-full rounded-full bg-[#F4A79A] transition-[width] duration-500" style={{ width: `${Math.round((quest.hp / quest.maxHp) * 100)}%` }} />
      </div>
      <p className="mt-2 text-sm">Every focused minute anyone sails is one bonk.</p>
      <p className="mt-0.5 text-xs opacity-85">
        Beasts beaten: <span className="tabular-nums">{quest.defeated}</span> <span aria-hidden="true">·</span> beat this one for the {figureheadName(beast.reward)} figurehead
      </p>
      {formation && <p className="mt-1.5 inline-block rounded-full bg-white/75 px-2.5 py-0.5 text-xs">Sailing in formation ✨</p>}
      {cheer && (
        <div role="status" className={cx("absolute inset-0 grid place-items-center bg-[#FFF9DC]/95 px-4 text-center text-[#4B3A0B]", !prefersReducedMotion(motion) && "sticker-pop")}>
          <div className="grid justify-items-center gap-1.5">
            <MinionPortrait costume="captain" size={64} />
            <p className="font-display text-base">{cheer}</p>
            <p className="text-xs opacity-90">Captain Banan</p>
          </div>
        </div>
      )}
    </section>
  );
}
