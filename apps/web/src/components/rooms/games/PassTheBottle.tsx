// Pass the Bottle: a relay quiz on a break, about four minutes. Pwedo flies the bottle from
// sailor to sailor. The holder answers the card, graded on their own device (typed words never
// leave it), and each turn is one small write the database checks: it must be the old turn + 1,
// so two sailors can never both take the same turn. A miss becomes a rescue for the next sailor
// (Lumi throws the lifebuoy); a missed rescue loses a lifebuoy. Reach the island before they run
// out. Nothing here changes when anyone's cards are due.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { bottleOrder, bottleQuestion, gradeTypedAnswer } from "@ship/active-recall-engine";
import type { PracticeCard } from "@ship/active-recall-engine";
import { ROOM_LIMITS } from "@ship/shared-types";
import type { BottleGame, Room } from "@ship/shared-types";
import { bottleOver, canTakeHelm, nickText } from "../../../lib/roomRules.js";
import type { BottleOutcome } from "../../../lib/roomRules.js";
import { useRooms } from "../../../stores/roomStore.js";
import { prefersReducedMotion, useSettings } from "../../../stores/settingsStore.js";
import { ChoiceButtons } from "../../flashcards/ChoiceButtons.js";
import { PastelMinionBadge } from "../../PastelMinionBadge.js";
import { DieCutSticker } from "../../StickerArt.js";
import { cx } from "../../ui.js";
import { YELLOW_BUTTON, accessoryOf, costumeOf, roomAction, useTicker } from "../roomStyle.js";

/** Everyone sees the last card's answer this long before the next sailor's question shows. */
const REVEAL_MS = 2500;
const TURN_MS = ROOM_LIMITS.bottle.turnSeconds * 1000;
const BUOYS = ROOM_LIMITS.bottle.buoys;

/** Turns this device has answered ("seed:turn"), so a re-render or a reopened panel never answers twice. */
const answered = new Set<string>();

type RevealKind = "delivered" | "saved" | "rescue" | "lost";
interface Reveal {
  turn: number;
  kind: RevealKind;
  front: string;
  answer: string;
  /** This device's clock. */
  until: number;
}

interface MyAnswer {
  turnId: string;
  picked: string | null;
  typed: string | null;
  outcome: BottleOutcome;
}

export interface BottleProps {
  room: Room;
  game: BottleGame;
  myKey: string;
  /** The game's cards (playable, in deck order), or null while they load. */
  deck: PracticeCard[] | null;
  /** Shown on the end card ("Keep these cards"). */
  endExtra?: ReactNode;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function PassTheBottle({ room, game, myKey, deck, endExtra }: BottleProps) {
  const serverOffset = useRooms((s) => s.serverOffset);
  const motion = useSettings((s) => s.motion);
  const reduced = prefersReducedMotion(motion);
  const tick = useTicker(250);
  const now = tick + serverOffset;

  // The game deals game.cards cards (the deck's playable ones, fixed when it started), so every
  // device asks the same card at the same step, and the game ends when they run out, never repeating one.
  const dealt = useMemo(() => (deck && deck.length >= game.cards ? deck.slice(0, game.cards) : null), [deck, game.cards]);
  const order = useMemo(() => (dealt?.length ? bottleOrder(dealt.length, game.seed) : null), [dealt, game.seed]);
  const over = bottleOver(game);
  const question = useMemo(
    () => (dealt?.length && order && over === 0 ? bottleQuestion(dealt, order, game.card, game.seed, game.turn) : null),
    [dealt, order, over, game.card, game.seed, game.turn],
  );
  const turnId = `${game.seed}:${game.turn}`;
  const iHold = game.holder === myKey;
  const seated = game.seats.includes(myKey);
  const holder = room.members.find((m) => m.key === game.holder) ?? null;
  const holderName = holder ? nickText(holder.nick) : "A sailor who left";

  // When a turn lands, everyone sees what happened to the last card, and its answer.
  const seen = useRef<BottleGame | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  useEffect(() => {
    const before = seen.current;
    seen.current = game;
    if (!before || before.seed !== game.seed || game.turn !== before.turn + 1 || !dealt?.length || !order) return;
    const asked = bottleQuestion(dealt, order, before.card, game.seed, before.turn).card;
    const kind: RevealKind = game.delivered > before.delivered ? (before.rescue ? "saved" : "delivered") : game.rescue ? "rescue" : "lost";
    setReveal({ turn: game.turn, kind, front: asked.front, answer: asked.back, until: Date.now() + REVEAL_MS });
  }, [game, dealt, order]);
  const revealing = reveal !== null && reveal.turn === game.turn && tick < reveal.until;

  // The holder's 30 s start once the reveal is over (the first turn has none).
  const turnStart = game.turn === 0 ? game.turnAt : game.turnAt + REVEAL_MS;
  const deadline = turnStart + TURN_MS;

  const [mine, setMine] = useState<MyAnswer | null>(null);
  const myAnswer = mine?.turnId === turnId ? mine : null;
  // A first miss sends this same card to the next sailor as a rescue, so its answer stays hidden until the rescue is over.
  const answerHidden = myAnswer !== null && !game.rescue && myAnswer.outcome !== "right" && myAnswer.outcome !== "close";
  const [note, setNote] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTyped("");
  }, [turnId]);

  const send = useCallback(
    (outcome: BottleOutcome, picked: string | null, words: string | null) => {
      if (answered.has(turnId)) return;
      answered.add(turnId);
      setMine({ turnId, picked, typed: words, outcome });
      setNote(null);
      void roomAction(() => useRooms.getState().playTurn(outcome), "game").then((err) => {
        if (err) setNote(err);
      });
    },
    [turnId],
  );

  const canAnswer = iHold && over === 0 && !!question && !revealing && !myAnswer && !answered.has(turnId);

  // Silence counts as a miss: the holder's own device passes the bottle on when the sand runs out.
  useEffect(() => {
    if (!iHold || over !== 0 || !question || answered.has(turnId)) return;
    const wait = deadline - (Date.now() + useRooms.getState().serverOffset);
    const id = setTimeout(() => send("timeout", null, null), Math.max(0, wait));
    return () => clearTimeout(id);
  }, [iHold, over, question, turnId, deadline, send]);

  useEffect(() => {
    if (canAnswer && question?.kind === "written") inputRef.current?.focus();
  }, [canAnswer, question]);

  const pickChoice = useCallback(
    (opt: string) => {
      if (!question || !canAnswer) return;
      send(opt === question.card.back ? "right" : "miss", opt, null);
    },
    [question, canAnswer, send],
  );

  const sendTyped = () => {
    if (!question || !canAnswer || !typed.trim()) return;
    const verdict = gradeTypedAnswer(typed, question.card.back).verdict;
    send(verdict === "correct" ? "right" : verdict === "close" ? "close" : "miss", null, typed);
  };

  const helm = !iHold && !answered.has(turnId) && canTakeHelm(game, room, myKey, now);

  let body: ReactNode;
  if (!deck) {
    body = <Note costume="pwedo" text="Pwedo is fetching the cards…" />;
  } else if (!dealt?.length) {
    body = <Note costume="pwedo" text="Couldn't read this deck's cards. It may have been taken back from Bottle Bay. The skipper can end the game and pick another." />;
  } else if (over !== 0) {
    body =
      over === 1 ? (
        <div className="grid justify-items-center gap-2 rounded-2xl border border-[#F1E3A0] bg-[#FFF9DC] px-4 py-5 text-center text-[#4B3A0B]">
          <DieCutSticker id="plane-pwedo" size={72} />
          <p className="font-display text-2xl">Island reached!</p>
          <p className="text-sm">
            The crew delivered {plural(game.delivered, "bottle", "bottles")}, with {plural(game.buoys, "lifebuoy", "lifebuoys")} to spare.
          </p>
          {endExtra}
        </div>
      ) : (
        <div className="grid justify-items-center gap-2 rounded-2xl border border-[#B2C8E0] bg-[#E6F2FA] px-4 py-5 text-center text-[#2F4F6B]">
          <PastelMinionBadge costume="bunny" size={64} />
          <p className="font-display text-xl">The tide turned: {plural(game.delivered, "bottle", "bottles")} delivered! Try again?</p>
          <p className="text-sm">{game.buoys === 0 ? "Lumi ran out of lifebuoys." : game.turn >= ROOM_LIMITS.bottle.maxTurns ? "That was the longest voyage a bottle can take." : "The deck ran out of cards."}</p>
          {endExtra}
        </div>
      );
  } else if (revealing && reveal) {
    body = <RevealCard reveal={reveal} reduced={reduced} />;
  } else if (question) {
    body = (
      <div className="space-y-2">
        {game.rescue && (
          <p className="flex items-center gap-2 rounded-2xl border border-[#DCCCF0] bg-[#F3ECFB] px-2.5 py-1.5 text-sm text-[#56406A]">
            <PastelMinionBadge costume="bunny" size={30} />
            Rescue! Lumi threw a lifebuoy: a second try at this card, with the choices shuffled.
          </p>
        )}
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3.5 py-3">
            <p className="text-xs tracking-wide text-[var(--muted-ink)] uppercase">{iHold ? (question.kind === "choice" ? "Your turn: pick the answer" : "Your turn: type the answer") : `${holderName} is answering…`}</p>
            <p className="mt-1 font-display text-lg leading-snug whitespace-pre-wrap">{question.card.front}</p>
          </div>
          <SandRing left={deadline - now} />
        </div>

        {iHold &&
          (question.kind === "choice" ? (
            <ChoiceButtons
              options={question.options}
              onPick={pickChoice}
              reveal={myAnswer && myAnswer.picked !== null ? { right: answerHidden ? "" : question.card.back, picked: myAnswer.picked } : undefined}
              disabled={!canAnswer}
              keys={canAnswer}
            />
          ) : myAnswer ? (
            <p className="text-sm">
              {myAnswer.typed !== null && <>You wrote "{myAnswer.typed}". </>}
              {answerHidden ? (
                "Not quite. The answer stays hidden for the rescue."
              ) : (
                <>
                  The answer: <span className="font-display">{question.card.back}</span>
                </>
              )}
            </p>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                sendTyped();
              }}
            >
              <input
                ref={inputRef}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={!canAnswer}
                placeholder="Your answer"
                aria-label="Your answer"
                autoComplete="off"
                className="min-w-0 flex-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3.5 py-1.5 text-[var(--page-ink)] placeholder:text-[var(--muted-ink)]"
              />
              <button type="submit" disabled={!canAnswer || !typed.trim()} className={cx(YELLOW_BUTTON, "text-sm")}>
                Send the bottle
              </button>
            </form>
          ))}
        {iHold && myAnswer && (
          <p className="text-xs text-[var(--muted-ink)]">
            {myAnswer.outcome === "timeout" ? "The sand ran out, so the bottle moves on." : answerHidden ? "Lumi's getting a lifebuoy ready for the next sailor…" : "Pwedo is flying the bottle over…"}
          </p>
        )}
        {iHold && canAnswer && question.kind === "choice" && <p className="text-xs text-[var(--muted-ink)]">Keys 1–4 pick an answer. Your answer is checked on this device.</p>}

        {helm && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-[var(--border-subtle)] px-3 py-2">
            <p className="min-w-0 flex-1 text-sm text-[var(--muted-ink)]">
              {holder ? (holder.state === 1 ? `${holderName} started focusing.` : `${holderName} seems to be away.`) : "The bottle's holder left the room."} Taking the helm passes the bottle on (it counts as a miss).
            </p>
            <button type="button" onClick={() => send("timeout", null, null)} className={cx(YELLOW_BUTTON, "text-sm")}>
              Take the helm
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <PastelMinionBadge costume="pwedo" size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-xs tracking-[0.18em] text-[var(--muted-ink)] uppercase">Pwedo's relay</p>
          <h4 className="font-display text-lg leading-tight font-normal">Pass the Bottle</h4>
        </div>
        <div className="grid justify-items-end gap-1 text-xs text-[var(--muted-ink)]">
          <span className="tabular-nums">
            {game.delivered} of {game.goal} delivered
          </span>
          <Buoys left={game.buoys} />
        </div>
      </div>

      <SeaRoute goal={game.goal} delivered={game.delivered} reduced={reduced} />
      <Seats room={room} game={game} myKey={myKey} />
      {/* Screen readers hear when the bottle reaches this sailor (it goes quiet while the last card's answer shows). */}
      <span className="sr-only" role="status" aria-live="polite">
        {iHold && over === 0 && !!question && !revealing ? `Your turn: Pwedo brought you the bottle.${game.rescue ? " It's a rescue." : ""}` : ""}
      </span>

      {body}

      {note && (
        <p role="alert" className="rounded-xl border border-[#F4C7BE] bg-[#FDE8E4] px-3 py-1.5 text-sm text-[#8A3B31]">
          {note}
        </p>
      )}
      {!seated && over === 0 && <p className="text-xs text-[var(--muted-ink)]">You're watching this round. You'll get a seat in the next one.</p>}
    </div>
  );
}

/** What happened to the last card, for everyone, for a moment. */
function RevealCard({ reveal, reduced }: { reveal: Reveal; reduced: boolean }) {
  const pop = !reduced && "sticker-pop";
  const words: Record<RevealKind, { title: string; line: string; fill: string; border: string; ink: string }> = {
    delivered: { title: "Delivered!", line: "Pwedo drops the bottle on the next dot.", fill: "#FFF9DC", border: "#F1E3A0", ink: "#4B3A0B" },
    saved: { title: "Saved!", line: "The rescue worked: the bottle's delivered.", fill: "#E9F6EF", border: "#C7E6D5", ink: "#2D6252" },
    rescue: { title: "Rescue!", line: "Lumi throws a lifebuoy. The next sailor gets a try at this card.", fill: "#F3ECFB", border: "#DCCCF0", ink: "#56406A" },
    lost: { title: "A lifebuoy floats away.", line: "On to the next card.", fill: "#E6F2FA", border: "#B2C8E0", ink: "#2F4F6B" },
  };
  const w = words[reveal.kind];
  return (
    <div role="status" className="grid justify-items-center gap-1.5 rounded-2xl border px-4 py-4 text-center" style={{ background: w.fill, borderColor: w.border, color: w.ink }}>
      <div className="flex items-end gap-1">
        {(reveal.kind === "rescue" || reveal.kind === "saved") && (
          <span className={cx("inline-block", pop)}>
            <PastelMinionBadge costume="bunny" size={48} />
          </span>
        )}
        {reveal.kind !== "rescue" && (
          <span className={cx("inline-block", pop)}>
            <PastelMinionBadge costume="pwedo" size={48} />
          </span>
        )}
        {(reveal.kind === "rescue" || reveal.kind === "lost") && <Lifebuoy size={30} faded={reveal.kind === "lost"} />}
      </div>
      <p className="font-display text-xl">{w.title}</p>
      <p className="text-sm">{w.line}</p>
      {reveal.kind === "rescue" ? (
        <p className="mt-1 max-w-md text-sm opacity-80">The answer stays hidden until the rescue is over.</p>
      ) : (
        <p className="mt-1 max-w-md text-sm">
          <span className="opacity-80">{reveal.front}</span>
          <span aria-hidden="true"> · </span>
          <span className="font-display">{reveal.answer}</span>
        </p>
      )}
    </div>
  );
}

/** The seats, in order, with the bottle's holder ringed in butter yellow. */
function Seats({ room, game, myKey }: { room: Room; game: BottleGame; myKey: string }) {
  return (
    <ul className="flex flex-wrap items-center gap-2" aria-label="Seats">
      {game.seats.map((k) => {
        const m = room.members.find((x) => x.key === k);
        const holds = k === game.holder;
        const name = m ? `${nickText(m.nick)}${k === myKey ? " (you)" : ""}` : "Left the room";
        return (
          <li key={k} className={cx("relative flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-0.5 text-xs", holds ? "bg-[#FFF9DC] text-[#4B3A0B] ring-2 ring-[#E8C64A]" : "bg-[var(--surface-2)] text-[var(--muted-ink)]", !m && "opacity-50")}>
            {m ? <PastelMinionBadge costume={costumeOf(m.costume)} accessory={accessoryOf(m.accessory)} size={26} /> : <span className="size-[26px]" aria-hidden="true" />}
            <span>{name}</span>
            {holds && <span className="sr-only">(has the bottle)</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** The holder's 30 seconds as a silent sand-timer ring. */
function SandRing({ left }: { left: number }) {
  const progress = Math.min(1, Math.max(0, left / TURN_MS));
  const secs = Math.max(0, Math.ceil(Math.min(left, TURN_MS) / 1000));
  return (
    <div className="relative grid size-14 shrink-0 place-items-center">
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r="42" fill="#FFF6C9" stroke="#F1E3A0" strokeWidth="8" />
        <circle cx="50" cy="50" r="42" fill="none" stroke="#E8B84A" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${263.9 * progress} 263.9`} />
      </svg>
      <span className="relative font-display text-sm text-[#4B3A0B] tabular-nums" role="timer" aria-label="Seconds left for this turn">
        {secs}
      </span>
    </div>
  );
}

function Lifebuoy({ size = 18, faded = false }: { size?: number; faded?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" opacity={faded ? 0.25 : 1}>
      <circle cx="10" cy="10" r="7" fill="none" stroke="#F4A79A" strokeWidth="4" />
      <circle cx="10" cy="10" r="7" fill="none" stroke="#FFFFFF" strokeWidth="4" strokeDasharray="5.5 5.5" />
      <circle cx="10" cy="10" r="9" fill="none" stroke="#A29C93" strokeWidth="0.8" />
      <circle cx="10" cy="10" r="5" fill="none" stroke="#A29C93" strokeWidth="0.8" />
    </svg>
  );
}

function Buoys({ left }: { left: number }) {
  return (
    <span className="flex items-center gap-0.5" role="img" aria-label={`${left} of ${BUOYS} lifebuoys left`}>
      {Array.from({ length: BUOYS }, (_, i) => (
        <Lifebuoy key={i} size={16} faded={i >= left} />
      ))}
    </span>
  );
}

/** The sea route: a dotted line of `goal` dots from the harbor to the island, with Pwedo on the last delivered one. */
function SeaRoute({ goal, delivered, reduced }: { goal: number; delivered: number; reduced: boolean }) {
  const W = 320;
  const H = 92;
  const steps = Math.max(1, goal);
  const points = Array.from({ length: steps + 1 }, (_, i) => ({ x: 22 + (i * (W - 74)) / steps, y: 54 + Math.sin(i * 1.15) * 11 }));
  const route = points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  let waves = `M0 ${H - 7}`;
  for (let x = 0; x < W; x += 20) waves += ` q5 -4 10 0 t10 0`;
  const at = points[Math.min(Math.max(0, delivered), steps)]!;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#B2C8E0] bg-[#E6F2FA]">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`Sea route: ${delivered} of ${goal} bottles delivered`}>
        <path d={waves} fill="none" stroke="#B2C8E0" strokeWidth="1.5" strokeLinecap="round" />
        <path d={route} fill="none" stroke="#9DB7D2" strokeWidth="2" strokeDasharray="1 6" strokeLinecap="round" />
        {/* The harbor */}
        <rect x="8" y={points[0]!.y + 6} width="22" height="5" rx="2" fill="#F3E2B8" stroke="#A29C93" strokeWidth="1" />
        {points.slice(1).map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4.5" fill={i < delivered ? "#FFE27A" : "#FFFFFF"} stroke={i < delivered ? "#D9B23A" : "#9DB7D2"} strokeWidth="1.5" />
        ))}
        {/* The island, with one palm */}
        <ellipse cx={W - 26} cy="64" rx="22" ry="9" fill="#F3E2B8" stroke="#A29C93" strokeWidth="1.2" />
        <path d={`M${W - 24} 60 q-2 -14 3 -24`} fill="none" stroke="#A29C93" strokeWidth="2" strokeLinecap="round" />
        <path d={`M${W - 21} 36 q-9 -3 -14 4 M${W - 21} 36 q8 -4 13 2 M${W - 21} 36 q-2 -7 -9 -8 M${W - 21} 36 q4 -7 11 -6`} fill="none" stroke="#7FC8B2" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      <span
        className={cx("pointer-events-none absolute -translate-x-1/2 -translate-y-[85%]", !reduced && "transition-[left,top] duration-700 ease-out")}
        style={{ left: `${(at.x / W) * 100}%`, top: `${(at.y / H) * 100}%` }}
        aria-hidden="true"
      >
        <PastelMinionBadge costume="pwedo" size={34} />
      </span>
    </div>
  );
}

function Note({ costume, text }: { costume: "pwedo" | "bunny" | "teddy"; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-[var(--border-subtle)] px-3 py-3">
      <PastelMinionBadge costume={costume} size={44} />
      <p className="text-sm text-[var(--muted-ink)]" role="status">
        {text}
      </p>
    </div>
  );
}
