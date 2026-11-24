// The skipper picks the cards for the break games. Open rooms use Bottle Bay decks only; invite
// rooms may also use one of the skipper's own decks, checked first: contact details block it,
// other personal details show as warnings, and the skipper ticks that everyone aboard may see it
// (and keep a copy). Bottle Bay's code (and Firestore) loads only when this opens, and each
// subject's list is read once per visit to the page.

import { useEffect, useMemo, useRef, useState } from "react";
import { BOTTLE_LIMITS, ROOM_LIMITS } from "@ship/shared-types";
import type { Bottle, Room } from "@ship/shared-types";
import type { BottlePage } from "../../lib/bottleBay.js";
import { hasContactDetails, personalInfoWarnings, subjectKey, visibleBottles, ROOM_DECK_CONTACT_PROBLEM } from "../../lib/bottleRules.js";
import { subjectText } from "../../lib/roomRules.js";
import { useRecall } from "../../stores/recallStore.js";
import { useRooms } from "../../stores/roomStore.js";
import { useUi } from "../../stores/uiStore.js";
import { PastelMinionBadge } from "../PastelMinionBadge.js";
import { cx } from "../ui.js";
import { HELD, ROOM_FOCUS_RING, SEAFOAM_BUTTON, chipClass, heldButton, skipperAction } from "./roomStyle.js";

const { min: MIN_CARDS, max: MAX_CARDS } = ROOM_LIMITS.deckCards;

// ---- Bottle Bay deck names --------------------------------------------------------------------

/** Deck names this device already knows, by bottle id (the room itself stores only the id). */
const bottleTitles = new Map<string, { title: string; subject: string }>();

/** A Bottle Bay deck's title and subject: from this device's memory, or one read of the bottle. */
export async function bottleInfo(id: string): Promise<{ title: string; subject: string } | null> {
  const known = bottleTitles.get(id);
  if (known) return known;
  const [{ doc, getDoc }, { firestore }] = await Promise.all([import("firebase/firestore"), import("../../lib/db.js")]);
  const d: unknown = (await getDoc(doc(firestore(), "bottles", id))).data();
  const rec = (d ?? {}) as { title?: unknown; subject?: unknown };
  if (typeof rec.title !== "string") return null;
  const info = { title: rec.title.slice(0, BOTTLE_LIMITS.title), subject: typeof rec.subject === "string" ? rec.subject.slice(0, BOTTLE_LIMITS.subject) : "" };
  bottleTitles.set(id, info);
  return info;
}

/** The deck's title if this device has seen it (the skipper's, once picked here), else null. */
export function knownBottleTitle(id: string): string | null {
  return bottleTitles.get(id)?.title ?? null;
}

/** Decks already fished out on this page, by subject ("" = the newest), so opening the picker again reads nothing. */
const fished = new Map<string, { decks: Bottle[]; cursor: BottlePage["cursor"] }>();

// ---- The picker ---------------------------------------------------------------------------------

type Source = "bay" | "mine";

export function DeckPicker({ room, onDone }: { room: Room; onDone: () => void }) {
  const [source, setSource] = useState<Source>("bay");
  const ownAllowed = room.mode === "invite";
  return (
    <div className="mt-3 rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-2)] p-3">
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        {ownAllowed ? (
          <div role="radiogroup" aria-label="Where the cards come from" className="flex flex-wrap gap-1.5">
            <button type="button" role="radio" aria-checked={source === "bay"} onClick={() => setSource("bay")} className={chipClass(source === "bay")}>
              Bottle Bay decks
            </button>
            <button type="button" role="radio" aria-checked={source === "mine"} onClick={() => setSource("mine")} className={chipClass(source === "mine")}>
              My decks
            </button>
          </div>
        ) : (
          <p className="text-xs text-[var(--muted-ink)]">Open rooms play with Bottle Bay decks, so everything aboard is something sailors chose to share.</p>
        )}
        <button type="button" onClick={onDone} className={cx("ml-auto rounded-md px-1.5 text-xs text-[var(--muted-ink)] hover:text-[var(--page-ink)]", ROOM_FOCUS_RING)}>
          Close
        </button>
      </div>
      {source === "bay" || !ownAllowed ? <BayDecks room={room} onDone={onDone} /> : <MyDecks room={room} onDone={onDone} />}
    </div>
  );
}

// ---- Bottle Bay decks ---------------------------------------------------------------------------

function BayDecks({ room, onDone }: { room: Room; onDone: () => void }) {
  const roomSubject = room.subject > 0 ? subjectText(room.subject) : null;
  // null = the newest bottles in the bay.
  const [subject, setSubject] = useState<string | null>(roomSubject);
  const [typed, setTyped] = useState("");
  const [decks, setDecks] = useState<Bottle[] | null>(null);
  const [cursor, setCursor] = useState<BottlePage["cursor"]>(null);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const current = room.deck?.bottleId ?? null;
  // Only the latest look counts, so a slow answer for an older subject can't replace a newer list.
  const request = useRef(0);

  const load = async (more: boolean) => {
    const id = ++request.current;
    const cacheKey = subject ?? "";
    const cached = more ? undefined : fished.get(cacheKey);
    if (cached) {
      setDecks(cached.decks);
      setCursor(cached.cursor);
      return;
    }
    setLoading(true);
    setProblem(null);
    const bay = await import("../../lib/bottleBay.js");
    try {
      // A subject asks Bottle Bay for decks only; the newest list holds links too (sorting by time and kind would need a database index).
      const page = await bay.listBottles(subject ? { subjectKey: subjectKey(subject), kind: "deck" } : { after: more ? cursor : null });
      if (id !== request.current) return;
      const found = visibleBottles(page.bottles.filter((b) => b.kind === "deck"));
      const old = more ? (fished.get(cacheKey)?.decks ?? decks ?? []) : [];
      const list = more ? [...old, ...found.filter((b) => !old.some((o) => o.id === b.id))] : found;
      fished.set(cacheKey, { decks: list, cursor: page.cursor });
      setDecks(list);
      setCursor(page.cursor);
    } catch (e) {
      if (id === request.current) setProblem(bay.bayProblem(e, "load"));
    } finally {
      if (id === request.current) setLoading(false);
    }
  };

  useEffect(() => {
    setDecks(null);
    setCursor(null);
    void load(false);
    // Reload only when the subject changes; `load` reads the latest state itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject]);

  const use = async (b: Bottle) => {
    setSending(b.id);
    setProblem(null);
    bottleTitles.set(b.id, { title: b.title, subject: b.subject });
    const err = await skipperAction(() => useRooms.getState().pickBottleDeck(b.id, b.cardCount));
    if (err === undefined) return;
    setSending(null);
    if (err) return setProblem(err);
    useUi.getState().toast(`Deck ready: ${b.title}`, "info");
    onDone();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Which decks to show">
        {roomSubject && (
          <button type="button" role="radio" aria-checked={subject === roomSubject} onClick={() => setSubject(roomSubject)} className={chipClass(subject === roomSubject)}>
            {roomSubject}
          </button>
        )}
        <button type="button" role="radio" aria-checked={subject === null} onClick={() => setSubject(null)} className={chipClass(subject === null)}>
          Newest in the bay
        </button>
        {subject !== null && subject !== roomSubject && <span className={chipClass(true)}>{subject}</span>}
        <form
          className="ml-auto flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const s = typed.trim();
            if (s) setSubject(s);
          }}
        >
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            maxLength={BOTTLE_LIMITS.subject}
            placeholder="Another subject"
            aria-label="Look for decks on another subject"
            className="w-36 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-1)] px-2.5 py-0.5 text-xs text-[var(--page-ink)] placeholder:text-[var(--muted-ink)]"
          />
          <button type="submit" disabled={!typed.trim()} className={cx(chipClass(false), "disabled:opacity-50")}>
            Look
          </button>
        </form>
      </div>

      {problem && (
        <p role="alert" className="mt-2.5 rounded-xl border border-[#F4C7BE] bg-[#FDE8E4] px-3 py-2 text-sm text-[#8A3B31]">
          {problem}
        </p>
      )}

      {decks === null ? (
        <p className="mt-3 text-sm text-[var(--muted-ink)]">{loading ? "Fishing for decks…" : ""}</p>
      ) : decks.length === 0 ? (
        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-dashed border-[var(--border-subtle)] px-3 py-3">
          <PastelMinionBadge costume="teddy" size={48} />
          <p className="text-sm text-[var(--muted-ink)]">
            {subject ? `No ${subject} decks in Bottle Bay yet. Try the newest ones, or share a deck there.` : "No decks in Bottle Bay yet. Share one there and it'll show up here."}
          </p>
        </div>
      ) : (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {decks.map((b) => {
            const tooBig = b.cardCount > MAX_CARDS;
            const tooSmall = b.cardCount < MIN_CARDS;
            const inUse = b.id === current;
            return (
              <li key={b.id} className="flex flex-col gap-1.5 rounded-2xl border border-[#DCCCF0] bg-[#F7F2FD] px-3 py-2.5 text-[#56406A] [--ring:currentColor]">
                <p className="font-display text-base leading-snug wrap-anywhere">{b.title}</p>
                <p className="text-xs opacity-90">
                  {b.cardCount} {b.cardCount === 1 ? "card" : "cards"}
                  {b.subject && (
                    <>
                      {" "}
                      <span aria-hidden="true">·</span> {b.subject}
                    </>
                  )}
                </p>
                <div className="mt-auto pt-1">
                  {inUse ? (
                    <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-xs">In use</span>
                  ) : tooBig || tooSmall ? (
                    <span className="text-xs opacity-90">{tooBig ? `Too big for a room (${MAX_CARDS} cards at most)` : `Too small for a room (${MIN_CARDS} cards at least)`}</span>
                  ) : (
                    <button type="button" {...heldButton(sending !== null, () => void use(b))} className={cx(SEAFOAM_BUTTON, HELD, "px-3 py-1 text-sm")}>
                      {sending === b.id ? "Sending…" : "Use this deck"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {sending && <p className="mt-2 text-xs text-[var(--muted-ink)]">Rooms take one change every {ROOM_LIMITS.writeGapSeconds} seconds, so this can take a moment.</p>}
      {subject === null && cursor && decks && (
        <button type="button" disabled={loading} onClick={() => void load(true)} className={cx("mt-2 text-sm text-[var(--muted-ink)] underline-offset-4 hover:underline", ROOM_FOCUS_RING)}>
          {loading ? "Fishing…" : "Show more"}
        </button>
      )}
    </div>
  );
}

// ---- The skipper's own decks (invite rooms) -------------------------------------------------------

function MyDecks({ room, onDone }: { room: Room; onDone: () => void }) {
  const decks = useRecall((s) => s.decks);
  const cards = useRecall((s) => s.cards);
  const [chosen, setChosen] = useState<string | null>(null);
  const [okToShare, setOkToShare] = useState(false);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Decks fished out of Bottle Bay are someone else's: pick those from the bay instead.
  const mine = useMemo(
    () =>
      decks
        .filter((d) => d.source !== "bottle")
        .map((d) => {
          const filled = cards.filter((c) => c.deckId === d.id && c.front.trim() && c.back.trim());
          return { deck: d, texts: filled.flatMap((c) => [c.front.trim(), c.back.trim()]), count: filled.length, tooLong: filled.some((c) => c.front.trim().length > BOTTLE_LIMITS.cardSide || c.back.trim().length > BOTTLE_LIMITS.cardSide) };
        }),
    [decks, cards],
  );
  const pick = mine.find((m) => m.deck.id === chosen) ?? null;
  const blocked = useMemo(() => (pick ? hasContactDetails(pick.texts) : []), [pick]);
  const warnings = useMemo(() => (pick && !blocked.length ? personalInfoWarnings(pick.texts, null) : []), [pick, blocked]);
  const sizeProblem = pick
    ? pick.count < MIN_CARDS || pick.count > MAX_CARDS
      ? `Room decks need ${MIN_CARDS} to ${MAX_CARDS} cards with both sides filled in. This one has ${pick.count}.`
      : pick.tooLong
        ? `Cards in a room deck can have up to ${BOTTLE_LIMITS.cardSide} characters a side.`
        : null
    : null;

  const use = async () => {
    if (!pick) return;
    setSending(true);
    setProblem(null);
    const err = await skipperAction(() => useRooms.getState().pickOwnDeck(pick.deck.id));
    if (err === undefined) return;
    setSending(false);
    if (err) return setProblem(err);
    useUi.getState().toast(`Deck ready: ${pick.deck.name}`, "info");
    onDone();
  };

  if (!mine.length) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-dashed border-[var(--border-subtle)] px-3 py-3">
        <PastelMinionBadge costume="teddy" size={48} />
        <p className="text-sm text-[var(--muted-ink)]">You don't have a deck of your own yet. Make one in Flashcards, or pick a Bottle Bay deck.</p>
      </div>
    );
  }

  return (
    <div>
      <ul className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Your decks">
        {mine.map((m) => (
          <li key={m.deck.id}>
            <button
              type="button"
              role="radio"
              aria-checked={chosen === m.deck.id}
              onClick={() => {
                setChosen(m.deck.id);
                setOkToShare(false);
                setProblem(null);
              }}
              className={chipClass(chosen === m.deck.id)}
            >
              {/* Full ink: the count is small text, and a faded one fell under 4.5:1 on the chip. */}
              {m.deck.name} <span>· {m.count}</span>
            </button>
          </li>
        ))}
      </ul>

      {pick && (
        <div className="mt-3 space-y-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2.5">
          <p className="text-sm">
            <span className="font-display">{pick.deck.name}</span> <span aria-hidden="true">·</span> {pick.count} {pick.count === 1 ? "card" : "cards"}
          </p>
          <p className="text-xs text-[var(--muted-ink)]">
            Everyone in {room.mode === "invite" ? "this invite room" : "this room"} will see these cards, and can keep a copy in their own flashcards. The room's copy goes away when it closes; theirs stay.
          </p>
          {sizeProblem && <p className="rounded-xl border border-[#F4C7BE] bg-[#FDE8E4] px-3 py-1.5 text-sm text-[#8A3B31]">{sizeProblem}</p>}
          {blocked.length > 0 ? (
            <div role="alert" className="rounded-xl border border-[#F4C7BE] bg-[#FDE8E4] px-3 py-2 text-sm text-[#8A3B31] [--ring:currentColor]">
              <p>{ROOM_DECK_CONTACT_PROBLEM}</p>
              <ul className="mt-1 list-disc pl-5 text-xs">
                {blocked.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              {warnings.length > 0 && (
                <div className="rounded-xl border border-[#F1E3A0] bg-[#FFF9DC] px-3 py-2 text-sm text-[#4B3A0B] [--ring:currentColor]">
                  <p>Have a look before it goes up:</p>
                  <ul className="mt-1 list-disc pl-5 text-xs">
                    {warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input type="checkbox" checked={okToShare} onChange={(e) => setOkToShare(e.target.checked)} className="mt-0.5 size-4 accent-[#7FC8B2]" />
                Okay for everyone in this room to see and keep
              </label>
            </>
          )}
          {problem && (
            <p role="alert" className="rounded-xl border border-[#F4C7BE] bg-[#FDE8E4] px-3 py-1.5 text-sm text-[#8A3B31]">
              {problem}
            </p>
          )}
          <button type="button" disabled={!okToShare || blocked.length > 0 || !!sizeProblem} {...heldButton(sending, () => void use())} className={cx(SEAFOAM_BUTTON, HELD, "px-3 py-1 text-sm")}>
            {sending ? "Sending…" : "Use this deck"}
          </button>
        </div>
      )}
    </div>
  );
}
