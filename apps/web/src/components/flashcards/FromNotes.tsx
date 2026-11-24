// Flashcards from an uploaded note, like Quizlet's Magic Notes: Gemini writes
// them with the sailor's own key, or Ship makes simpler ones on the device.
// Nothing is added until the sailor has looked the cards over.

import { useMemo, useState } from "react";
import type { DraftCard } from "@ship/active-recall-engine";
import { buildNoteSources } from "../../lib/captainsLogService.js";
import { makeStudySet } from "../../lib/studySets.js";
import type { DraftSet } from "../../lib/studySets.js";
import { useFleet } from "../../stores/fleetStore.js";
import { useRecall } from "../../stores/recallStore.js";
import { useSettings } from "../../stores/settingsStore.js";
import { useUi } from "../../stores/uiStore.js";
import { Button, Card, Field, Select, TextInput } from "../ui.js";

interface Draft extends DraftCard {
  keep: boolean;
}

export function FromNotes() {
  const notes = useFleet((s) => s.notes);
  const library = useFleet((s) => s.library);
  const decks = useRecall((s) => s.decks);
  const toast = useUi((s) => s.toast);
  const sources = useMemo(() => buildNoteSources(notes, library), [notes, library]);
  const [sourceId, setSourceId] = useState("");
  const [count, setCount] = useState(15);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ set: DraftSet; drafts: Draft[]; title: string } | null>(null);
  const [deckId, setDeckId] = useState("__new");
  const [deckName, setDeckName] = useState("");
  const [reversed, setReversed] = useState(false);

  const source = sources.find((s) => s.id === sourceId) ?? sources[0];

  const make = async () => {
    if (!source) return;
    setBusy(true);
    try {
      const { geminiApiKey, geminiModel } = useSettings.getState();
      const set = await makeStudySet(source.pages.map((p) => p.text).join("\n\n"), { geminiApiKey, geminiModel }, count);
      setMade({ set, drafts: set.cards.map((c) => ({ ...c, keep: true })), title: source.title });
      setDeckName(source.title);
      setDeckId("__new");
    } finally {
      setBusy(false);
    }
  };

  const edit = (i: number, patch: Partial<Draft>) => made && setMade({ ...made, drafts: made.drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)) });

  const add = () => {
    if (!made) return;
    const { addDeck, addCard } = useRecall.getState();
    const target = deckId === "__new" ? addDeck(deckName.trim() || made.title).id : deckId;
    let added = 0;
    for (const d of made.drafts) {
      if (!d.keep || !d.front.trim() || !d.back.trim()) continue;
      if (addCard(target, d.front, d.back)) added++;
      if (reversed && addCard(target, d.back, d.front)) added++;
    }
    toast(`Added ${added} card${added === 1 ? "" : "s"}. Try them in Practice → Learn.`, "reward");
    setMade(null);
  };

  if (!sources.length) {
    return <p className="text-sm text-[var(--muted-ink)]">Upload notes (PDF, Word, PowerPoint, images or links) in Study Sheets or the Fleet Log, and Ship can turn them into flashcards here.</p>;
  }

  const hasKey = Boolean(useSettings.getState().geminiApiKey.trim());
  const kept = made?.drafts.filter((d) => d.keep).length ?? 0;

  return (
    <Card className="space-y-3">
      <div>
        <h3 className="font-display font-extrabold">Make cards from your notes</h3>
        <p className="text-sm text-[var(--muted-ink)]">
          {hasKey ? "Gemini writes question-and-answer cards from a note, using only what the note says." : "Ship makes fill-in-the-blank and definition cards from a note. Add a Gemini key in Settings for cards written like a tutor would."}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <Field label="Note">
          <Select value={source?.id ?? ""} onChange={(e) => setSourceId(e.target.value)}>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Up to">
          <Select value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[10, 15, 20, 30].map((n) => (
              <option key={n} value={n}>
                {n} cards
              </option>
            ))}
          </Select>
        </Field>
        <Button variant="primary" onClick={() => void make()} disabled={busy}>
          {busy ? (hasKey ? "Gemini is writing…" : "Making cards…") : "Make cards"}
        </Button>
      </div>

      {made && (
        <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
          <p className="text-sm text-[var(--muted-ink)]">
            {made.set.madeBy === "gemini" ? "Written by Gemini: check them before adding." : "Made on this device."} {made.set.notice}
          </p>
          {made.drafts.length === 0 ? (
            <p className="text-sm">This note didn&apos;t give Ship anything to make cards from. Notes with “Term: meaning” lines or full sentences work best.</p>
          ) : (
            <ul className="max-h-80 space-y-1.5 overflow-y-auto">
              {made.drafts.map((d, i) => (
                <li key={i} className="grid grid-cols-[auto_1fr] items-start gap-2 rounded-lg bg-[var(--surface-2)] p-2 sm:grid-cols-[auto_1fr_1fr]">
                  <input type="checkbox" className="mt-2" checked={d.keep} onChange={(e) => edit(i, { keep: e.target.checked })} aria-label={`Keep card ${i + 1}`} />
                  <TextInput value={d.front} onChange={(e) => edit(i, { front: e.target.value })} aria-label={`Card ${i + 1} question`} />
                  <TextInput value={d.back} onChange={(e) => edit(i, { back: e.target.value })} aria-label={`Card ${i + 1} answer`} className="col-start-2 sm:col-start-auto" />
                </li>
              ))}
            </ul>
          )}
          {made.drafts.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2 sm:items-end">
              <Field label="Add to">
                <Select value={deckId} onChange={(e) => setDeckId(e.target.value)}>
                  <option value="__new">A new deck</option>
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {deckId === "__new" && (
                <Field label="New deck name">
                  <TextInput value={deckName} onChange={(e) => setDeckName(e.target.value)} />
                </Field>
              )}
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={reversed} onChange={(e) => setReversed(e.target.checked)} />
                Also add each card the other way round (answer → question)
              </label>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button onClick={() => setMade(null)}>Discard</Button>
                <Button variant="primary" onClick={add} disabled={!kept}>
                  Add {kept * (reversed ? 2 : 1)} card{kept * (reversed ? 2 : 1) === 1 ? "" : "s"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
