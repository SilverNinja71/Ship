// Flashcards: typed-answer reviews with spaced repetition, deck management,
// and adding or importing cards.

import { useEffect, useMemo, useRef, useState } from "react";
import { RECALL_RATINGS } from "@ship/shared-types";
import type { Flashcard, RecallRating } from "@ship/shared-types";
import { formatInterval, gradeTypedAnswer, previewIntervals } from "@ship/active-recall-engine";
import type { AnswerGrade } from "@ship/active-recall-engine";
import { formatClock } from "../../lib/format.js";
import { useFleet } from "../../stores/fleetStore.js";
import { dueNow, useRecall } from "../../stores/recallStore.js";
import { useSettings } from "../../stores/settingsStore.js";
import { useUi } from "../../stores/uiStore.js";
import { useNow } from "../Hud.js";
import { IconCards, IconUpload } from "../icons.js";
import { Badge, Button, Card, EmptyState, Field, Panel, Select, Tabs, TextArea, TextInput, cx, readFile } from "../ui.js";

type Tab = "review" | "decks" | "add";

export function FlashcardsPanel({ onClose }: { onClose: () => void }) {
  const cards = useRecall((s) => s.cards);
  const now = useNow(15_000);
  const due = dueNow(cards, now).length;
  const [tab, setTab] = useState<Tab>(cards.length ? "review" : "add");
  return (
    <Panel title="Flashcards" subtitle={`${cards.length} cards · ${due} due now`} icon={<IconCards />} onClose={onClose}>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "review", label: "Review", badge: due || undefined },
          { id: "decks", label: "Decks" },
          { id: "add", label: "Add cards" },
        ]}
      />
      {tab === "review" && <Review onAdd={() => setTab("add")} />}
      {tab === "decks" && <Decks />}
      {tab === "add" && <AddCards />}
    </Panel>
  );
}

function Review({ onAdd }: { onAdd: () => void }) {
  const cards = useRecall((s) => s.cards);
  const decks = useRecall((s) => s.decks);
  const review = useRecall((s) => s.review);
  const scheduler = useSettings((s) => s.scheduler);
  const [deckId, setDeckId] = useState("");
  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState<{ cardId: string; grade: AnswerGrade | null } | null>(null);
  const [reviewed, setReviewed] = useState(0);
  const shownAt = useRef(Date.now());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const now = useNow(1000);

  const pool = useMemo(() => (deckId ? cards.filter((c) => c.deckId === deckId) : cards), [cards, deckId]);
  const queue = dueNow(pool, now);
  const card: Flashcard | undefined = revealed ? pool.find((c) => c.id === revealed.cardId) : queue[0];

  useEffect(() => {
    if (!revealed) {
      shownAt.current = Date.now();
      inputRef.current?.focus();
    }
  }, [card?.id, revealed]);

  const check = (skipTyping = false) => {
    if (!card || revealed) return;
    const grade = skipTyping || !answer.trim() ? null : gradeTypedAnswer(answer, card.back, { responseMs: Date.now() - shownAt.current });
    setRevealed({ cardId: card.id, grade });
  };

  const rate = (rating: RecallRating) => {
    if (!card) return;
    review(card.id, rating);
    setRevealed(null);
    setAnswer("");
    setReviewed((n) => n + 1);
  };

  useEffect(() => {
    if (!revealed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 5) rate(n as RecallRating);
      if (e.key === "Enter" && revealed.grade) rate(revealed.grade.suggestedRating);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!cards.length) {
    return (
      <EmptyState title="No cards in the hold yet">
        <p>Add a few cards, or import a Parchment study.json, CSV or TSV deck.</p>
        <Button variant="primary" className="mt-3" onClick={onAdd}>
          Add cards
        </Button>
      </EmptyState>
    );
  }

  const deckPicker = decks.length > 1 && (
    <Select value={deckId} onChange={(e) => setDeckId(e.target.value)} className="mb-3 w-auto" aria-label="Deck to review">
      <option value="">All decks</option>
      {decks.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </Select>
  );

  if (!card) {
    const next = pool.filter((c) => c.schedule.due > now).sort((a, b) => a.schedule.due - b.schedule.due)[0];
    return (
      <div>
        {deckPicker}
        <EmptyState title={reviewed ? `Nicely done: ${reviewed} card${reviewed === 1 ? "" : "s"} reviewed.` : "Nothing due right now"}>
          {next && next.schedule.due - now < 15 * 60_000 ? (
            <p>The next card comes back in {formatClock(next.schedule.due - now)}.</p>
          ) : next ? (
            <p>Next review in {formatInterval(next.schedule.due - now)}.</p>
          ) : null}
        </EmptyState>
      </div>
    );
  }

  const deck = decks.find((d) => d.id === card.deckId);
  const preview = previewIntervals(card.schedule, now, { kind: scheduler });
  const grade = revealed?.grade ?? null;

  return (
    <div>
      {deckPicker}
      <div className="mb-2 flex items-center justify-between text-sm text-ink/60">
        <span>
          {deck?.name ?? "Deck"} · {queue.length} due
        </span>
        <span>{scheduler === "fsrs" ? "FSRS" : "SM-2"} scheduler</span>
      </div>
      <Card className="min-h-36">
        <p className="text-xs font-bold tracking-wide text-ink/50 uppercase">Question</p>
        <p className="mt-1 font-display text-2xl leading-snug font-bold whitespace-pre-wrap">{card.front}</p>
        {revealed && (
          <div className="mt-4 border-t-2 border-dashed border-ink/15 pt-3">
            <p className="text-xs font-bold tracking-wide text-ink/50 uppercase">Answer</p>
            <p className="mt-1 text-lg whitespace-pre-wrap">{card.back}</p>
          </div>
        )}
      </Card>

      {!revealed ? (
        <div className="mt-3">
          <TextArea
            ref={inputRef}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                check();
              }
            }}
            placeholder="Type your answer, then press Enter"
            className="min-h-20"
            aria-label="Your answer"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button onClick={() => check(true)}>Just show me</Button>
            <Button variant="primary" onClick={() => check()} disabled={!answer.trim()}>
              Check answer
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          {grade && (
            <div
              className={cx(
                "mb-3 rounded-xl border-2 px-3 py-2 font-bold",
                grade.verdict === "correct" && "border-seafoam-700 bg-seafoam-500/15 text-seafoam-700",
                grade.verdict === "close" && "border-brass-500 bg-brass-300/30 text-brass-700",
                grade.verdict === "incorrect" && "border-coral-700 bg-coral-500/15 text-coral-700",
              )}
            >
              {grade.verdict === "correct" ? "Spot on!" : grade.verdict === "close" ? "Close!" : "Not quite."} You wrote: <span className="font-normal">“{answer}”</span>
              {grade.missing.length > 0 && grade.verdict !== "correct" && <span className="block text-sm font-normal">Missing: {grade.missing.join(", ")}</span>}
            </div>
          )}
          <p className="mb-2 text-sm text-ink/60">How well did you know it? (keys 1–5{grade ? ", Enter takes the suggestion" : ""})</p>
          <div className="grid grid-cols-5 gap-1.5">
            {RECALL_RATINGS.map(({ rating, label, color }) => (
              <button
                key={rating}
                type="button"
                onClick={() => rate(rating)}
                className={cx(
                  "rounded-xl border-2 px-1 py-2 text-center font-display font-extrabold text-white transition hover:brightness-110",
                  grade?.suggestedRating === rating ? "border-ink ring-3 ring-brass-400" : "border-ink/40",
                )}
                style={{ background: color }}
              >
                <span className="block text-sm">
                  {rating} · {label}
                </span>
                <span className="block text-xs font-bold opacity-85">{formatInterval(preview[rating])}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Decks() {
  const decks = useRecall((s) => s.decks);
  const cards = useRecall((s) => s.cards);
  const { addDeck, renameDeck, deleteDeck, deleteCard, updateCard } = useRecall.getState();
  const [open, setOpen] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const now = useNow(30_000);

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(addDeck("New deck").id)}>
          + New deck
        </Button>
      </div>
      {!decks.length && <EmptyState title="No decks yet">Cards you add or import are grouped into decks.</EmptyState>}
      {decks.map((d) => {
        const inDeck = cards.filter((c) => c.deckId === d.id);
        const due = dueNow(inDeck, now).length;
        const isOpen = open === d.id;
        const shown = inDeck.filter((c) => !search || `${c.front} ${c.back}`.toLowerCase().includes(search.toLowerCase())).slice(0, 200);
        return (
          <Card key={d.id} className="p-3">
            <div className="flex items-center gap-2">
              <button type="button" className="min-w-0 flex-1 truncate text-left font-display text-lg font-extrabold" onClick={() => setOpen(isOpen ? null : d.id)}>
                {isOpen ? "▾" : "▸"} {d.name}
              </button>
              {d.source !== "manual" && <Badge>{d.source}</Badge>}
              <Badge tone={due ? "coral" : "plain"}>{due} due</Badge>
              <Badge>{inDeck.length} cards</Badge>
            </div>
            {isOpen && (
              <div className="mt-3 space-y-2">
                <div className="flex gap-2">
                  <TextInput defaultValue={d.name} onBlur={(e) => renameDeck(d.id, e.target.value)} aria-label="Deck name" />
                  <Button
                    variant={confirmDelete === d.id ? "danger" : "secondary"}
                    onClick={() => (confirmDelete === d.id ? deleteDeck(d.id) : setConfirmDelete(d.id))}
                  >
                    {confirmDelete === d.id ? `Delete ${inDeck.length} cards?` : "Delete deck"}
                  </Button>
                </div>
                {inDeck.length > 5 && <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search this deck" />}
                <ul className="max-h-80 space-y-1 overflow-y-auto">
                  {shown.map((c) => (
                    <li key={c.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 rounded-lg bg-cream-100 p-2 text-sm">
                      <input defaultValue={c.front} onBlur={(e) => e.target.value.trim() && updateCard(c.id, { front: e.target.value })} className="min-w-0 rounded bg-transparent px-1 font-bold" aria-label="Front" />
                      <input defaultValue={c.back} onBlur={(e) => e.target.value.trim() && updateCard(c.id, { back: e.target.value })} className="min-w-0 rounded bg-transparent px-1" aria-label="Back" />
                      <button type="button" onClick={() => deleteCard(c.id)} className="px-2 text-coral-700 hover:underline" aria-label={`Delete card ${c.front}`}>
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function AddCards() {
  const decks = useRecall((s) => s.decks);
  const { addDeck, addCard } = useRecall.getState();
  const importFiles = useFleet((s) => s.importFiles);
  const toast = useUi((s) => s.toast);
  const [deckId, setDeckId] = useState(decks[0]?.id ?? "");
  const [newDeck, setNewDeck] = useState("");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const frontRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const add = () => {
    let target = deckId;
    if (!target || target === "__new") target = addDeck(newDeck || "My deck").id;
    if (addCard(target, front, back)) {
      setDeckId(target);
      setFront("");
      setBack("");
      frontRef.current?.focus();
    }
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const read = await Promise.all([...files].map(readFile));
    const summary = importFiles(read);
    toast(`Imported ${summary.cards} new card${summary.cards === 1 ? "" : "s"} in ${summary.decks} new deck${summary.decks === 1 ? "" : "s"}.`, "info");
    if (summary.warnings.length) toast(summary.warnings.slice(0, 2).join(" "), "warning");
  };

  return (
    <div className="space-y-3">
      <Field label="Deck">
        <Select value={decks.length ? deckId : "__new"} onChange={(e) => setDeckId(e.target.value)}>
          {decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
          <option value="__new">+ New deck…</option>
        </Select>
      </Field>
      {(!decks.length || deckId === "__new") && (
        <Field label="New deck name">
          <TextInput value={newDeck} onChange={(e) => setNewDeck(e.target.value)} placeholder="e.g. Biology: cell respiration" />
        </Field>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Front (question)">
          <TextArea ref={frontRef} value={front} onChange={(e) => setFront(e.target.value)} placeholder="What makes most of a cell's ATP?" />
        </Field>
        <Field label="Back (answer)" hint="List alternatives with “ / ” or “;”.">
          <TextArea
            value={back}
            onChange={(e) => setBack(e.target.value)}
            onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && add()}
            placeholder="The electron transport chain"
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button onClick={() => fileRef.current?.click()}>
          <IconUpload size={18} /> Import a deck file
        </Button>
        <input ref={fileRef} type="file" multiple accept=".csv,.tsv,.txt,.json,.parchment" className="hidden" onChange={(e) => void onFiles(e.target.files)} />
        <Button variant="primary" onClick={add} disabled={!front.trim() || !back.trim()}>
          Add card
        </Button>
      </div>
      <p className="text-sm text-ink/60">Imports: Parchment study.json and .parchment notebooks, CSV/TSV (front, back, optional deck).</p>
    </div>
  );
}
