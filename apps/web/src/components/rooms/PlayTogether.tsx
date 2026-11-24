// Play together: two co-op break games, the crew against the sea, never against each other. The
// skipper picks a deck and starts a game; sailors on a break get a seat, and focusing sailors are
// never pulled in. Both games are dealt from the room's seed with the practice engine, so every
// device shows the same cards, and neither changes anyone's review schedule. The room session pays
// each game's treasure once (earnOnce); this card only shows the games.

import { useEffect, useMemo, useRef, useState } from "react";
import { tidyPatches } from "@ship/active-recall-engine";
import type { PracticeCard } from "@ship/active-recall-engine";
import { ROOM_LIMITS, newReviewSchedule } from "@ship/shared-types";
import type { DeckSource, Room, RoomGame } from "@ship/shared-types";
import { DECK_HIDDEN_TEXT, bottleOver, cardTextId, gameSeats, roomNameText, roomStateFor, subjectText, tidyStatus } from "../../lib/roomRules.js";
import type { TidyMemo } from "../../lib/roomRules.js";
import { useRecall } from "../../stores/recallStore.js";
import { gameDeck, useRooms } from "../../stores/roomStore.js";
import { prefersReducedMotion, useSettings } from "../../stores/settingsStore.js";
import { useUi } from "../../stores/uiStore.js";
import { useVoyage } from "../../stores/voyageStore.js";
import { PastelMinionBadge } from "../PastelMinionBadge.js";
import { cx } from "../ui.js";
import { DeckPicker, bottleInfo, knownBottleTitle } from "./DeckPicker.js";
import { PassTheBottle } from "./games/PassTheBottle.js";
import { TidyTheDeck } from "./games/TidyTheDeck.js";
import { PAPER_CARD, QUIET_BUTTON, SEAFOAM_BUTTON, YELLOW_BUTTON, skipperAction, useTicker } from "./roomStyle.js";

type GameKind = RoomGame["kind"];

interface GameInfo {
  kind: GameKind;
  title: string;
  time: string;
  host: string;
  costume: "teddy" | "pwedo";
  blurb: string;
  fill: string;
  border: string;
  ink: string;
}

const GAMES: readonly GameInfo[] = [
  {
    kind: "tidy",
    title: "Tidy the Deck",
    time: "1–2 min",
    host: "Mochi",
    costume: "teddy",
    blurb: "Co-op Match. Everyone tidies a patch of cards, then helps the crew finish before the tide comes in.",
    fill: "#ECF8F1",
    border: "#C3E6DC",
    ink: "#24584B",
  },
  {
    kind: "bottle",
    title: "Pass the Bottle",
    time: "about 4 min",
    host: "Pwedo",
    costume: "pwedo",
    blurb: "A relay quiz. Answer the card, and Pwedo flies the bottle to the next sailor. A miss gets a rescue.",
    fill: "#E6F2FA",
    border: "#B2C8E0",
    ink: "#2F4F6B",
  },
];

/** Games this device has already scrolled into view by itself, so reopening the panel doesn't jump again ("Answer" in the banner always does). */
const scrolledTo = new Set<number>();

/**
 * Brings `el` into view inside the panel's own scrolling body only. scrollIntoView would also
 * scroll every clipped box around it, pushing the panel's title and Close button out of sight.
 */
function scrollIntoPanel(el: HTMLElement, smooth: boolean): void {
  const scroller = el.closest<HTMLElement>(".overflow-y-auto");
  if (!scroller) return;
  const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 16;
  scroller.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
}

export function PlayTogether() {
  const room = useRooms((s) => s.room);
  const myKey = useRooms((s) => s.myKey);
  // Only the room's current deck: one the skipper has since changed is never dealt from.
  const deck = useRooms(gameDeck);
  const serverOffset = useRooms((s) => s.serverOffset);
  const phase = useVoyage((s) => s.phase);
  const prepEndsAt = useVoyage((s) => s.prepEndsAt);
  const now = useTicker(1000) + serverOffset;
  if (!room || !myKey || !room.members.some((m) => m.key === myKey)) return null;
  // Games are for breaks: a focusing sailor sees one quiet line and nothing to click.
  if (roomStateFor(phase, prepEndsAt) === 1) return <FocusLine gameOn={room.game !== null} />;
  return <Games room={room} myKey={myKey} deck={deck} now={now} />;
}

function FocusLine({ gameOn }: { gameOn: boolean }) {
  return (
    <section aria-label="Play together" className={cx(PAPER_CARD, "flex items-center gap-3 px-4 py-3")}>
      <PastelMinionBadge costume="pwedo" size={36} />
      <p className="text-sm text-[var(--muted-ink)]">
        {gameOn ? "A game is on" : "Break games"} <span aria-hidden="true">·</span> {gameOn ? "it'll be here after your focus block" : "they'll be here on your next break"}
      </p>
    </section>
  );
}

/** Whether the game in the room has finished (it stays on show until the skipper puts it away). A sailor leaving never unfinishes Tidy the Deck (memo). */
function gameOver(room: Room, game: RoomGame, deck: PracticeCard[] | null, now: number, memo: TidyMemo | null): boolean {
  if (game.kind === "bottle") return bottleOver(game) !== 0;
  const s = tidyStatus(room, game, deck ? tidyPatches(deck, game.seed, game.seats.length).length : 0, now, memo);
  return s.done || s.timedOut;
}

function Games({ room, myKey, deck, now }: { room: Room; myKey: string; deck: PracticeCard[] | null; now: number }) {
  const iSkipper = room.host === myKey;
  const game = room.game;
  const motion = useSettings((s) => s.motion);
  const tidyMemo = useRooms((s) => s.tidyMemo);
  const deckProblem = useRooms((s) => s.deckProblem);
  const deckHidden = deckProblem === DECK_HIDDEN_TEXT;
  // A skipper change is on its way (they wait for the room's 15 s gap): no second one until it lands.
  const sending = useRooms((s) => s.busy);
  const gameWanted = useUi((s) => s.roomGameWanted);
  // The deck list reads Bottle Bay, so it opens only when the skipper asks for it.
  const [picking, setPicking] = useState(false);
  const [hidden, setHidden] = useState<number | null>(null);
  const [busy, setBusy] = useState<"tidy" | "bottle" | "end" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const area = useRef<HTMLDivElement>(null);

  const over = game ? gameOver(room, game, deck, now, tidyMemo) : false;
  const live = game !== null && !over;
  const seats = gameSeats(room, now);
  const startProblem = !room.deck ? "Pick a deck first." : !seats.length ? "Everyone's focusing. Games are for breaks." : null;

  // A game needs its cards. loadDeck reads them once per game and deck, and does nothing when they're already here.
  const deckBottle = room.deck?.bottleId;
  const deckCards = room.deck?.cards;
  useEffect(() => {
    if (game && deckCards) void useRooms.getState().loadDeck();
  }, [game?.seed, deckBottle, deckCards]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new game you're seated in comes into view by itself once.
  useEffect(() => {
    if (!game || over || !game.seats.includes(myKey) || scrolledTo.has(game.seed) || !area.current) return;
    scrolledTo.add(game.seed);
    scrollIntoPanel(area.current, !prefersReducedMotion(motion));
  }, [game?.seed]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Answer" or "Open the game" in the banner: straight to the game, every time, with the keyboard there too.
  useEffect(() => {
    if (!gameWanted) return;
    useUi.getState().roomGameShown();
    if (!game) return;
    setHidden(null);
    // After the game's box has rendered (it may have been hidden).
    requestAnimationFrame(() => {
      if (!area.current) return;
      scrollIntoPanel(area.current, !prefersReducedMotion(motion));
      area.current.focus({ preventScroll: true });
    });
  }, [gameWanted]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async (kind: GameKind) => {
    setBusy(kind);
    setPicking(false);
    setProblem(null);
    const err = await skipperAction(() => useRooms.getState().startGame(kind));
    if (err === undefined) return;
    setBusy(null);
    if (err) setProblem(err);
    else setHidden(null);
  };

  const end = async () => {
    setBusy("end");
    setProblem(null);
    const err = await skipperAction(() => useRooms.getState().endGame());
    if (err === undefined) return;
    setBusy(null);
    if (err) setProblem(err);
  };

  const deckLabel = room.deck
    ? `${room.deck.bottleId ? (knownBottleTitle(room.deck.bottleId) ?? "A Bottle Bay deck") : "The skipper's own deck"} · ${room.deck.cards} cards`
    : "None yet";
  const keep = <KeepCards room={room} deck={deck} />;

  return (
    <section aria-label="Play together" className={cx(PAPER_CARD, "px-4 py-3.5")}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h3 className="font-display text-lg font-normal">Play together</h3>
        <p className="text-xs text-[var(--muted-ink)]">
          Co-op break games <span aria-hidden="true">·</span> the crew against the sea
        </p>
      </div>
      <p className="mt-0.5 text-xs text-[var(--muted-ink)]">Playing never changes when your cards are due.</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="text-xs tracking-[0.18em] text-[var(--muted-ink)] uppercase">Deck</span>
        <span>{deckLabel}</span>
        {iSkipper && !game && !picking && (
          <button type="button" disabled={busy !== null} onClick={() => setPicking(true)} className={QUIET_BUTTON}>
            {room.deck ? "Change deck" : "Pick a deck"}
          </button>
        )}
      </div>
      {!room.deck && !iSkipper && <p className="mt-1 text-xs text-[var(--muted-ink)]">The skipper picks the cards for the games.</p>}
      {iSkipper && picking && !game && busy === null && <DeckPicker room={room} onDone={() => setPicking(false)} />}

      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {GAMES.map((g) => {
          const isThis = game?.kind === g.kind;
          const open = isThis && game !== null && hidden !== game.seed;
          return (
            <li key={g.kind} className="flex flex-col gap-2 rounded-2xl border px-3.5 py-3" style={{ background: g.fill, borderColor: g.border, color: g.ink }}>
              <div className="flex items-center gap-2.5">
                <PastelMinionBadge costume={g.costume} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg leading-tight">{g.title}</p>
                  <p className="text-xs opacity-80">
                    {g.time} <span aria-hidden="true">·</span> {g.host}
                  </p>
                </div>
                {isThis && <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-xs">{over ? "Just finished" : "Playing now"}</span>}
              </div>
              <p className="text-sm">{g.blurb}</p>
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                {iSkipper && !(isThis && live) && (
                  <button type="button" disabled={!!startProblem || live || busy !== null || sending} onClick={() => void start(g.kind)} className={cx(YELLOW_BUTTON, "text-sm")}>
                    {busy === g.kind ? "Starting…" : isThis ? "Play again" : "Start"}
                  </button>
                )}
                {isThis && game && (
                  <button type="button" onClick={() => setHidden(open ? game.seed : null)} aria-expanded={open} className={cx(SEAFOAM_BUTTON, "text-sm")}>
                    {open ? "Hide" : "Open"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {iSkipper ? (
        <p className="mt-2 text-xs text-[var(--muted-ink)]">
          {live
            ? "End this game to start another or change the deck."
            : (startProblem ?? `${seats.length} ${seats.length === 1 ? "sailor" : "sailors"} on a break would get a seat.${game ? " Put the game away to change the deck." : ""}`)}
          {busy === "tidy" || busy === "bottle" ? ` Rooms take one change every ${ROOM_LIMITS.writeGapSeconds} seconds, so starting can take a moment.` : ""}
        </p>
      ) : (
        !game && <p className="mt-2 text-xs text-[var(--muted-ink)]">The skipper starts the games. Sailors on a break get a seat.</p>
      )}

      {problem && (
        <p role="alert" className="mt-2 rounded-xl border border-[#F4C7BE] bg-[#FDE8E4] px-3 py-1.5 text-sm text-[#8A3B31]">
          {problem}
        </p>
      )}
      {game && !deck && deckProblem && (
        <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-[#F4C7BE] bg-[#FDE8E4] px-3 py-1.5 text-sm text-[#8A3B31]">
          <span className="min-w-0 flex-1">{deckHidden ? deckProblem : `Couldn't fetch the game's cards. ${deckProblem}`}</span>
          {!deckHidden && (
            <button type="button" onClick={() => void useRooms.getState().loadDeck()} className="shrink-0 rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-semibold hover:bg-white">
              Try again
            </button>
          )}
        </div>
      )}

      {game && hidden !== game.seed && (
        <div ref={area} tabIndex={-1} aria-label={game.kind === "tidy" ? "Tidy the Deck" : "Pass the Bottle"} className="mt-3 scroll-mt-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3.5 outline-none">
          {game.kind === "tidy" ? (
            <TidyTheDeck key={game.seed} room={room} game={game} myKey={myKey} deck={deck} endExtra={keep} />
          ) : (
            <PassTheBottle key={game.seed} room={room} game={game} myKey={myKey} deck={deck} endExtra={keep} />
          )}
          {iSkipper && (
            <div className="mt-3 flex justify-end border-t border-dashed border-[var(--border-subtle)] pt-2.5">
              <button type="button" disabled={busy !== null} onClick={() => void end()} className={QUIET_BUTTON}>
                {busy === "end" ? "Putting it away…" : over ? "Put the game away" : "End game"}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const pairKey = (front: string, back: string) => `${front.trim()}\u0000${back.trim()}`;

/**
 * "Keep these cards": adds the game's cards to this sailor's flashcards. A Bottle Bay deck keeps
 * Bottle Bay's ids (bottle:<id>), and one hidden after reports can't be kept. A skipper's own
 * decks go into one deck per room (room:<code>:<at>), each card named by its two sides, so a
 * second deck played in the same room adds its own cards. Cards already there are left exactly
 * as they are, so no review progress is ever reset.
 */
function KeepCards({ room, deck }: { room: Room; deck: PracticeCard[] | null }) {
  const cards = useRecall((s) => s.cards);
  const hidden = useRooms((s) => s.deckProblem === DECK_HIDDEN_TEXT);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(false);
  const fresh = useMemo(() => {
    if (!deck) return [];
    const have = new Set(cards.map((c) => pairKey(c.front, c.back)));
    return deck.filter((c) => !have.has(pairKey(c.front, c.back)));
  }, [cards, deck]);
  const ref = room.deck;
  if (!ref || !deck?.length) return null;
  if (hidden || refused) return <p className="text-xs opacity-80">Bottle Bay hid this deck after reports, so its cards can't be kept.</p>;
  if (!fresh.length) return <p className="text-xs opacity-80">These cards are already in your flashcards.</p>;

  const keep = async () => {
    setBusy(true);
    const roomSubject = room.subject > 0 ? subjectText(room.subject) : null;
    let deckId: string;
    let name = `Cards from ${roomNameText(room.name)}`;
    let subject = roomSubject;
    let source: DeckSource = "manual";
    if (ref.bottleId) {
      deckId = `bottle:${ref.bottleId}`;
      source = "bottle";
      // Read fresh: a deck reported out of Bottle Bay since the game began isn't handed out any more.
      const { bottleStillShared } = await import("../../lib/bottleBay.js");
      const shared = await bottleStillShared(ref.bottleId).catch(() => null);
      if (shared === false) {
        setBusy(false);
        setRefused(true);
        return;
      }
      if (shared === null) {
        setBusy(false);
        useUi.getState().toast("Couldn't reach Bottle Bay to keep these cards. Try again in a moment.", "warning");
        return;
      }
      const info = await bottleInfo(ref.bottleId).catch(() => null);
      if (info) {
        name = info.title;
        subject = info.subject || roomSubject;
      }
    } else {
      deckId = `room:${room.code}:${room.at}`;
    }
    const recall = useRecall.getState();
    const ids = new Set(recall.cards.map((c) => c.id));
    const have = new Set(recall.cards.map((c) => pairKey(c.front, c.back)));
    const created = Date.now();
    const add = deck
      .filter((c) => !have.has(pairKey(c.front, c.back)))
      .map((c) => ({ id: `${deckId}#${ref.bottleId ? c.id : cardTextId(c.front, c.back)}`, deckId, front: c.front, back: c.back, created, schedule: newReviewSchedule() }))
      .filter((c) => !ids.has(c.id));
    const known = recall.decks.some((d) => d.id === deckId);
    recall.importCards({ decks: known ? [] : [{ id: deckId, name, subject, created, source }], cards: add });
    setBusy(false);
    useUi.getState().toast(add.length ? `Kept ${add.length} ${add.length === 1 ? "card" : "cards"} in your flashcards${known ? "" : `, in "${name}"`}.` : "These cards are already in your flashcards.", "reward");
  };

  return (
    <div className="grid justify-items-center gap-1">
      <button type="button" disabled={busy} onClick={() => void keep()} className={cx(SEAFOAM_BUTTON, "text-sm")}>
        {busy ? "Keeping…" : `Keep these cards (${fresh.length})`}
      </button>
      <p className="text-xs opacity-80">They start fresh in your Flashcards, ready to review.</p>
    </div>
  );
}
