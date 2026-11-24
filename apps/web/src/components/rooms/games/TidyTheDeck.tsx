// Tidy the Deck: co-op Match on a break, about a minute or two. Every device deals the same
// patches from the game's seed; each sailor tidies their own patch, then helps with any patch
// nobody has cleared. Only small counters travel (which patches, when, how many mix-ups), and
// nothing here changes when anyone's cards are due. The crew races the tide, never each other.

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { MATCH_PENALTY_MS, tidyPatches } from "@ship/active-recall-engine";
import type { PracticeCard } from "@ship/active-recall-engine";
import { ROOM_LIMITS } from "@ship/shared-types";
import type { Room, TidyGame } from "@ship/shared-types";
import { nickText, tidyStatus } from "../../../lib/roomRules.js";
import { useRecall } from "../../../stores/recallStore.js";
import { useRooms } from "../../../stores/roomStore.js";
import { prefersReducedMotion, useSettings } from "../../../stores/settingsStore.js";
import { MatchTiles } from "../../flashcards/MatchTiles.js";
import { IconCheck } from "../../icons.js";
import { PastelMinionBadge } from "../../PastelMinionBadge.js";
import { cx } from "../../ui.js";
import { MinionPortrait } from "../MinionPortrait.js";
import { ROOM_FOCUS_RING, accessoryOf, clockText, costumeOf, useTicker } from "../roomStyle.js";

const LIMIT_MS = ROOM_LIMITS.tidy.timeLimitMs;

/** Each game's crew time is checked against the best once on this device, so "New crew record!" doesn't flicker as late writes land. */
const crewRecords = new Map<number, boolean>();

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const bit = (i: number) => 1 << i;

export interface TidyProps {
  room: Room;
  game: TidyGame;
  myKey: string;
  /** The game's cards (playable, in deck order), or null while they load. */
  deck: PracticeCard[] | null;
  /** Shown on the end card ("Keep these cards"). */
  endExtra?: ReactNode;
}

export function TidyTheDeck({ room, game, myKey, deck, endExtra }: TidyProps) {
  const serverOffset = useRooms((s) => s.serverOffset);
  const motion = useSettings((s) => s.motion);
  const now = useTicker(250) + serverOffset;
  const patches = useMemo(() => (deck ? tidyPatches(deck, game.seed, game.seats.length) : null), [deck, game.seed, game.seats.length]);
  const seat = game.seats.indexOf(myKey);
  const myPatch = patches && seat >= 0 && seat < patches.length ? seat : null;

  // undefined: my own patch (from my seat); null: the "help a crewmate" list; a number: that patch.
  const [chosen, setChosen] = useState<number | null | undefined>(undefined);
  // Patches I've cleared here; the room hears about them on my next write (up to 15 s later).
  const [mine, setMine] = useState(0);
  const [patchMixups, setPatchMixups] = useState(0);
  const [mixups, setMixups] = useState(0);
  const [record, setRecord] = useState<boolean | null>(() => crewRecords.get(game.seed) ?? null);

  const count = patches?.length ?? 0;
  const status = tidyStatus(room, game, count, now);
  const full = bit(count) - 1;
  const covered = (status.covered | mine) & full;
  const active = chosen === undefined ? myPatch : chosen;
  const boardOpen = active !== null && !(covered & bit(active));
  const tookPart = seat >= 0 || mine !== 0;
  const timeUp = now >= game.at + LIMIT_MS;
  const recordKey = `crew:${room.deck?.bottleId ?? "own"}`;
  const best = useRecall((s) => s.matchBest[recordKey]);

  useEffect(() => {
    if (!status.done || status.crewMs === null || !tookPart || crewRecords.has(game.seed)) return;
    const beat = useRecall.getState().recordMatch(recordKey, status.crewMs);
    crewRecords.set(game.seed, beat);
    setRecord(beat);
  }, [status.done, status.crewMs, tookPart, game.seed, recordKey]);

  const choose = (patch: number) => {
    setChosen(patch);
    setPatchMixups(0);
  };

  const cleared = (patch: number) => {
    const ms = Math.max(0, Math.round(Date.now() + useRooms.getState().serverOffset - game.at));
    useRooms.getState().tidyCleared(patch, ms, patchMixups);
    setMine((b) => b | bit(patch));
    setPatchMixups(0);
    setChosen(null);
  };

  const mistake = () => {
    setPatchMixups((n) => n + 1);
    setMixups((n) => n + 1);
  };

  let body: ReactNode;
  if (!patches) {
    body = <Waiting text="Mochi is shuffling the cards…" />;
  } else if (!patches.length) {
    body = <Waiting text="Couldn't deal this deck: it needs at least 4 cards with different answers. The skipper can pick another deck." />;
  } else if (status.done) {
    body = (
      <EndCard tone="win">
        <MinionPortrait costume="teddy" size={88} chore="mop" />
        <p className="font-display text-2xl">Ship shape!</p>
        <p className="text-sm">
          Mochi mops up the last of it. Crew time: <span className="font-display tabular-nums">{seconds(status.crewMs ?? 0)}</span>
        </p>
        {record ? (
          <p className={cx("rounded-full bg-[#FFF9DC] px-3 py-0.5 text-sm text-[#4B3A0B]", !prefersReducedMotion(motion) && "sticker-pop")}>New crew record!</p>
        ) : best !== undefined ? (
          <p className="text-xs opacity-80">Crew best with this deck: {seconds(best)}</p>
        ) : null}
        {endExtra}
      </EndCard>
    );
  } else if (status.timedOut) {
    body = (
      <EndCard tone="tide">
        <PastelMinionBadge costume="teddy" size={64} />
        <p className="font-display text-xl">
          The tide came in: {status.cleared} of {count} {count === 1 ? "patch" : "patches"} tidied
        </p>
        <p className="text-sm">So close. Try again on the next break?</p>
        {endExtra}
      </EndCard>
    );
  } else if (timeUp) {
    body = <Waiting text="Time's up! Counting the last patches as they wash in…" />;
  } else if (boardOpen && active !== null) {
    const owner = game.seats[active];
    body = (
      <div>
        <p className="mb-2 text-sm text-[var(--muted-ink)]">
          {active === myPatch ? "Your patch" : `Patch ${active + 1}${owner && owner !== myKey ? `, ${ownerName(room, owner)}'s` : ""}`}: pair each question with its answer. A mix-up adds a second to the crew's time.
        </p>
        <MatchTiles key={`${game.seed}:${active}`} tiles={patches[active]!} onCleared={() => cleared(active)} onMistake={mistake} />
      </div>
    );
  } else if (covered === full) {
    body = <Waiting text="Every patch is tidy! Waiting for the last one to reach the crew…" />;
  } else {
    const open = status.open.filter((i) => !(mine & bit(i)));
    const lead =
      active !== null && status.covered & bit(active) && !(mine & bit(active))
        ? "A crewmate tidied that patch first. Thanks for helping!"
        : mine
          ? "Your patch is tidy! Help a crewmate:"
          : seat < 0
            ? "You came aboard after the deal, so pick a patch to help with:"
            : "You're a helper this round. Pick a patch to tidy:";
    body = (
      <div>
        <p className="mb-2 text-sm">{lead}</p>
        <ul className="flex flex-wrap gap-2">
          {open.map((i) => {
            const owner = game.seats[i];
            const m = owner ? room.members.find((x) => x.key === owner) : undefined;
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => choose(i)}
                  className={cx("flex items-center gap-2 rounded-2xl border border-[#C3E6DC] bg-[#ECF8F1] py-1.5 pr-3 pl-1.5 text-sm text-[#24584B] hover:bg-[#DDF2E7]", ROOM_FOCUS_RING)}
                >
                  {m ? <PastelMinionBadge costume={costumeOf(m.costume)} accessory={accessoryOf(m.accessory)} size={30} /> : <span className="grid size-[30px] place-items-center font-display">{i + 1}</span>}
                  <span>
                    Patch {i + 1}
                    {owner && <span className="opacity-75"> · {ownerName(room, owner)}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const playing = patches && patches.length > 0 && !status.done && !status.timedOut;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <PastelMinionBadge costume="teddy" size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-xs tracking-[0.18em] text-[var(--muted-ink)] uppercase">Mochi's mop-up</p>
          <h4 className="font-display text-lg leading-tight font-normal">Tidy the Deck</h4>
        </div>
        {playing && <TideRing left={game.at + LIMIT_MS - now} />}
      </div>

      {patches && patches.length > 0 && <PatchStrip room={room} game={game} count={count} covered={covered} myKey={myKey} />}

      {body}

      {playing && mixups > 0 && (
        <p className="text-xs text-[var(--muted-ink)]">
          Your mix-ups: {mixups} (+{(mixups * MATCH_PENALTY_MS) / 1000} s for the crew)
        </p>
      )}
    </div>
  );
}

function ownerName(room: Room, key: string): string {
  const m = room.members.find((x) => x.key === key);
  return m ? nickText(m.nick) : "a sailor who left";
}

/** One chip per patch, with the sailor who started on it and a tick once anyone has tidied it. */
function PatchStrip({ room, game, count, covered, myKey }: { room: Room; game: TidyGame; count: number; covered: number; myKey: string }) {
  const helpers = game.seats.slice(count);
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label={`${popcount(covered)} of ${count} patches tidied`} role="group">
      {Array.from({ length: count }, (_, i) => {
        const owner = game.seats[i];
        const m = owner ? room.members.find((x) => x.key === owner) : undefined;
        const done = Boolean(covered & bit(i));
        return (
          <span
            key={i}
            title={`Patch ${i + 1}${m ? `: ${nickText(m.nick)}${owner === myKey ? " (you)" : ""}` : ""}${done ? ", tidy" : ""}`}
            className={cx("relative inline-flex items-center gap-1 rounded-full border py-0.5 pr-2 pl-0.5 text-xs", done ? "border-[#C3E6DC] bg-[#ECF8F1] text-[#24584B]" : "border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--muted-ink)]")}
          >
            {m ? <PastelMinionBadge costume={costumeOf(m.costume)} size={24} /> : <span className="size-6" aria-hidden="true" />}
            <span className="tabular-nums">{i + 1}</span>
            {done && <IconCheck size={14} strokeWidth={2.5} />}
          </span>
        );
      })}
      {helpers.length > 0 && (
        <span className="ml-1 inline-flex items-center gap-1 text-xs text-[var(--muted-ink)]">
          helping:
          {helpers.map((k) => {
            const m = room.members.find((x) => x.key === k);
            return m ? <PastelMinionBadge key={k} costume={costumeOf(m.costume)} size={22} /> : null;
          })}
        </span>
      )}
    </div>
  );
}

function popcount(bits: number): number {
  let n = 0;
  for (let b = bits; b; b &= b - 1) n++;
  return n;
}

/** The five minutes before the tide comes in, as a quiet seafoam ring. */
function TideRing({ left }: { left: number }) {
  const progress = Math.min(1, Math.max(0, left / LIMIT_MS));
  return (
    <div className="relative grid size-14 shrink-0 place-items-center">
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r="42" fill="#ECF8F1" stroke="#C3E6DC" strokeWidth="8" />
        <circle cx="50" cy="50" r="42" fill="none" stroke="#7FC8B2" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${263.9 * progress} 263.9`} />
      </svg>
      <span className="relative font-display text-sm text-[#24584B] tabular-nums" role="timer" aria-label="Time before the tide comes in">
        {clockText(left)}
      </span>
    </div>
  );
}

function Waiting({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-[var(--border-subtle)] px-3 py-3">
      <PastelMinionBadge costume="teddy" size={44} />
      <p className="text-sm text-[var(--muted-ink)]" role="status">
        {text}
      </p>
    </div>
  );
}

function EndCard({ tone, children }: { tone: "win" | "tide"; children: ReactNode }) {
  return (
    <div
      className={cx(
        "grid justify-items-center gap-2 rounded-2xl border px-4 py-5 text-center",
        tone === "win" ? "border-[#C3E6DC] bg-[#ECF8F1] text-[#24584B]" : "border-[#B2C8E0] bg-[#E6F2FA] text-[#2F4F6B]",
      )}
    >
      {children}
    </div>
  );
}
