// Set sail together: the skipper picks a plan, and Captain Banan calls the legs for everyone.
// Each sailor's own Pwedo Pomo runs it (nothing is ticked remotely): Sail with the crew while
// they get ready, Hop aboard mid-leg, or Sail on at the start of the next leg.

import { useState } from "react";
import { ROOM_LIMITS } from "@ship/shared-types";
import type { Room } from "@ship/shared-types";
import { sailOffer, sailStatus } from "../../lib/roomRules.js";
import type { SailOffer } from "../../lib/roomRules.js";
import { useRooms } from "../../stores/roomStore.js";
import { useUi } from "../../stores/uiStore.js";
import { useVoyage } from "../../stores/voyageStore.js";
import { cx } from "../ui.js";
import { MinionPortrait } from "./MinionPortrait.js";
import { HELD, PAPER_CARD, ROOM_FOCUS_RING, SEAFOAM_BUTTON, YELLOW_BUTTON, chipClass, clockText, heldButton, skipperAction } from "./roomStyle.js";

const MINUTE = 60_000;
const PRESETS = [
  { id: "25/5", focus: 25, brk: 5 },
  { id: "50/10", focus: 50, brk: 10 },
] as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(v) ? v : lo)));

function offerLabel(o: SailOffer): string {
  if (o.kind === "sail-with") return "Sail with the crew";
  // The minutes the timer will run (the crew's time left, rounded), so the button and the pill agree.
  if (o.kind === "hop-aboard") return `Hop aboard · ${o.focusMinutes} min left`;
  const last = o.fromLeg + o.cycles - 1;
  // The first leg has only just begun: it's still sailing with the crew, not sailing on.
  const verb = o.fromLeg === 1 ? "Sail with the crew" : "Sail on";
  // Word joiners keep "1–2" on one line (a narrow button would break after the dash).
  return o.cycles > 1 ? `${verb} (legs\u00a0${o.fromLeg}\u2060–\u2060${last})` : `${verb} (leg\u00a0${o.fromLeg})`;
}

export function SailTogetherCard({ room, myKey, now }: { room: Room; myKey: string; now: number }) {
  const phase = useVoyage((s) => s.phase);
  const prepEndsAt = useVoyage((s) => s.prepEndsAt);
  const iSkipper = room.host === myKey;
  const sail = room.sail;
  const status = sail ? sailStatus(sail, now) : null;
  const live = status && status.phase !== "done" ? status : null;
  const offer = sailOffer(sail, { phase, prepEndsAt }, now);
  const running = phase !== "docked" || prepEndsAt !== null;

  const accept = (o: SailOffer) => {
    useRooms.getState().acceptOffer(o);
    // Back to the scene, where the Pwedo Pomo pill shows the crew's timer.
    useUi.getState().openPanel(null);
  };

  return (
    <section aria-label="Set sail together" className={cx(PAPER_CARD, "px-4 py-3.5")}>
      <div className="flex items-center gap-3">
        <span className="grid shrink-0 place-items-center rounded-full bg-[#FFF9DC]">
          <MinionPortrait costume="captain" size={48} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs tracking-[0.18em] text-[var(--muted-ink)] uppercase">Captain Banan calls the legs</p>
          <h3 className="font-display text-lg leading-tight">Set sail together</h3>
        </div>
      </div>

      {live && sail ? (
        <div className="mt-3 flex items-center gap-4">
          <LegRing status={live} sail={sail} now={now} />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="font-display text-base">
              {live.phase === "prep" ? (
                <>Crew sets sail in {clockText(live.endsAt - now)}</>
              ) : (
                <>
                  Leg {live.leg} of {live.legs} <span aria-hidden="true">·</span> {live.phase === "focus" ? "focusing" : "on a break"}
                </>
              )}
            </p>
            {/* Rounded to the nearest minute, as Hop aboard's timer is, so the card and its button agree. */}
            {live.phase !== "prep" && <p className="text-sm text-[var(--muted-ink)]">{offer?.kind === "hop-aboard" ? offer.focusMinutes : Math.max(1, Math.round((live.endsAt - now) / MINUTE))} min left</p>}
            <p className="text-xs text-[var(--muted-ink)]">
              {sail.focus} min focus, {sail.brk} min break, {sail.cycles} {sail.cycles === 1 ? "leg" : "legs"}
            </p>
            {running && (offer?.kind === "sail-with" || offer?.kind === "hop-aboard") ? (
              <div>
                <button type="button" disabled className={cx(SEAFOAM_BUTTON, "text-sm")}>
                  You're already sailing
                </button>
                <p className="mt-1 text-xs text-[var(--muted-ink)]">Your minutes still count for the crew.</p>
              </div>
            ) : offer ? (
              <button type="button" onClick={() => accept(offer)} className={cx(SEAFOAM_BUTTON, "text-sm")}>
                {offerLabel(offer)}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-[var(--muted-ink)]">
          {sail ? "The crew's plan is done. Nice sailing!" : iSkipper ? "Pick a plan and everyone's Pwedo Pomo can start together." : "When the skipper sets sail, you can sail with the crew from here."}
        </p>
      )}

      {iSkipper && <SkipperPlan hasPlan={!!live} />}
    </section>
  );
}

/** A quiet ring for the current part of the plan, in Banana Planna's style. */
function LegRing({ status, sail, now }: { status: ReturnType<typeof sailStatus>; sail: NonNullable<Room["sail"]>; now: number }) {
  const total = status.phase === "prep" ? ROOM_LIMITS.prepSeconds * 1000 : (status.phase === "focus" ? sail.focus : sail.brk) * MINUTE;
  const progress = Math.min(1, Math.max(0, 1 - (status.endsAt - now) / total));
  const colors = status.phase === "break" ? { fill: "#E9F6EF", track: "#C7E6D5", ink: "#7FC8B2" } : { fill: "#FFF6C9", track: "#F1E3A0", ink: "#E8B84A" };
  return (
    <div className="relative grid size-24 shrink-0 place-items-center">
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r="44" fill={colors.fill} stroke={colors.track} strokeWidth="6" />
        <circle cx="50" cy="50" r="44" fill="none" stroke={colors.ink} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${276.5 * progress} 276.5`} />
      </svg>
      <p className="relative font-display text-lg text-[#4B3A0B] tabular-nums" role="timer" aria-label="Time left in this part of the plan">
        {clockText(status.endsAt - now)}
      </p>
    </div>
  );
}

function SkipperPlan({ hasPlan }: { hasPlan: boolean }) {
  const [choice, setChoice] = useState<"25/5" | "50/10" | "custom">("25/5");
  const [focus, setFocus] = useState(25);
  const [brk, setBrk] = useState(5);
  const [cycles, setCycles] = useState(2);
  const [busy, setBusy] = useState(false);
  const toast = useUi((s) => s.toast);
  const { sailFocus, sailBreak, sailCycles } = ROOM_LIMITS;

  const plan = choice === "custom" ? { focus: clamp(focus, sailFocus.min, sailFocus.max), brk: clamp(brk, sailBreak.min, sailBreak.max) } : PRESETS.find((p) => p.id === choice)!;

  const go = async (next: { focus: number; brk: number; cycles: number } | null) => {
    setBusy(true);
    const problem = await skipperAction(() => useRooms.getState().setSail(next));
    setBusy(false);
    if (problem !== undefined) toast(problem ?? (next ? "Set sail! The crew starts in a minute." : "Plan cleared."), problem ? "warning" : "info");
  };

  const field = "w-16 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] px-2 py-1 text-center text-[var(--page-ink)] tabular-nums";
  return (
    <div className="mt-4 space-y-2.5 border-t border-dashed border-[var(--border-subtle)] pt-3">
      <p className="text-xs text-[var(--muted-ink)]">Skipper's plan</p>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Plan">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={choice === p.id} onClick={() => setChoice(p.id)} className={chipClass(choice === p.id)}>
            {p.id}
          </button>
        ))}
        <button type="button" role="radio" aria-checked={choice === "custom"} onClick={() => setChoice("custom")} className={chipClass(choice === "custom")}>
          Custom
        </button>
      </div>
      {choice === "custom" && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1.5">
            Focus
            <input type="number" min={sailFocus.min} max={sailFocus.max} value={focus} onChange={(e) => setFocus(Number(e.target.value))} className={field} />
            min
          </label>
          <label className="flex items-center gap-1.5">
            Break
            <input type="number" min={sailBreak.min} max={sailBreak.max} value={brk} onChange={(e) => setBrk(Number(e.target.value))} className={field} />
            min
          </label>
        </div>
      )}
      <div className="flex items-center gap-2 text-sm">
        <span>Legs</span>
        <button type="button" aria-label="One leg fewer" disabled={cycles <= sailCycles.min} onClick={() => setCycles(cycles - 1)} className={cx("grid size-7 place-items-center rounded-full bg-[var(--surface-2)] disabled:opacity-40", ROOM_FOCUS_RING)}>
          −
        </button>
        <span className="w-5 text-center font-display tabular-nums" aria-live="polite">
          {cycles}
        </span>
        <button type="button" aria-label="One leg more" disabled={cycles >= sailCycles.max} onClick={() => setCycles(cycles + 1)} className={cx("grid size-7 place-items-center rounded-full bg-[var(--surface-2)] disabled:opacity-40", ROOM_FOCUS_RING)}>
          +
        </button>
        <span className="text-xs text-[var(--muted-ink)]">
          {plan.focus} + {plan.brk} min each
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" {...heldButton(busy, () => void go({ ...plan, cycles }))} className={cx(YELLOW_BUTTON, HELD, "text-sm")}>
          Set sail together · starts in 1 minute
        </button>
        {hasPlan && (
          <button type="button" {...heldButton(busy, () => void go(null))} className={cx("text-sm text-[var(--muted-ink)] underline-offset-4 hover:underline", HELD, ROOM_FOCUS_RING)}>
            Clear the plan
          </button>
        )}
      </div>
    </div>
  );
}
