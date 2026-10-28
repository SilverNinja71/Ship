// The Captain's Log: blurting practice. Pick reference notes, hide them,
// write down everything you remember, then see what you recalled.

import { useMemo, useState } from "react";
import { BLURT_STATUS_COLORS } from "@ship/shared-types";
import type { BlurtConceptResult, BlurtResult } from "@ship/shared-types";
import { annotateBlurt, annotateNotes, checkBlurt } from "@ship/active-recall-engine";
import type { TextSpan } from "@ship/active-recall-engine";
import { relativeTime } from "../../lib/format.js";
import { useFleet } from "../../stores/fleetStore.js";
import { useRecall } from "../../stores/recallStore.js";
import { useUi } from "../../stores/uiStore.js";
import { IconLog } from "../icons.js";
import { Badge, Button, Card, EmptyState, Field, Panel, ProgressBar, Select, Tabs, TextArea, TextInput, cx } from "../ui.js";

type Step = "notes" | "blurt" | "results";
type Tab = "practice" | "history";

const STATUS_MARK: Record<BlurtConceptResult["status"], string> = { mastered: "✓", partial: "~", missed: "✗" };
const STATUS_LABEL: Record<BlurtConceptResult["status"], string> = { mastered: "Recalled", partial: "Partly", missed: "Missed" };

export function CaptainsLogPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("practice");
  const [step, setStep] = useState<Step>("notes");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [blurt, setBlurt] = useState("");
  const [result, setResult] = useState<BlurtResult | null>(null);
  const saveBlurt = useRecall((s) => s.saveBlurt);

  const check = () => {
    const r = checkBlurt(blurt, notes);
    setResult(r);
    setStep("results");
    saveBlurt({ title: title.trim() || "Untitled notes", notes, blurt, coverage: r.coverage });
  };

  return (
    <Panel title="Captain's Log" subtitle="Blurt everything you remember, then check it against your notes" icon={<IconLog />} onClose={onClose} wide>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "practice", label: "Practice" },
          { id: "history", label: "Past entries" },
        ]}
      />
      {tab === "history" ? (
        <History
          onOpen={(t, n) => {
            setTitle(t);
            setNotes(n);
            setBlurt("");
            setResult(null);
            setStep("notes");
            setTab("practice");
          }}
        />
      ) : step === "notes" ? (
        <NotesStep title={title} notes={notes} onTitle={setTitle} onNotes={setNotes} onStart={() => setStep("blurt")} />
      ) : step === "blurt" ? (
        <BlurtStep title={title} blurt={blurt} onBlurt={setBlurt} onBack={() => setStep("notes")} onCheck={check} />
      ) : (
        result && (
          <Results
            title={title}
            notes={notes}
            blurt={blurt}
            result={result}
            onRetry={() => {
              setBlurt("");
              setStep("blurt");
            }}
            onNew={() => {
              setNotes("");
              setTitle("");
              setBlurt("");
              setStep("notes");
            }}
          />
        )
      )}
    </Panel>
  );
}

function NotesStep({ title, notes, onTitle, onNotes, onStart }: { title: string; notes: string; onTitle: (v: string) => void; onNotes: (v: string) => void; onStart: () => void }) {
  const imported = useFleet((s) => s.notes);
  const library = useFleet((s) => s.library);
  const sources = useMemo(
    () => [
      ...imported.map((n) => ({ id: n.id, title: n.title, text: n.pages.map((p) => p.text).join("\n\n") })),
      ...library.filter((l) => l.text).map((l) => ({ id: l.id, title: l.title, text: l.text ?? "" })),
    ],
    [imported, library],
  );
  const words = notes.trim() ? notes.trim().split(/\s+/).length : 0;
  return (
    <div className="space-y-3">
      {sources.length > 0 && (
        <Field label="Use imported notes">
          <Select
            defaultValue=""
            onChange={(e) => {
              const s = sources.find((x) => x.id === e.target.value);
              if (s) {
                onTitle(s.title);
                onNotes(s.text);
              }
            }}
          >
            <option value="">Pick from Parchment notes or Drive…</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Topic">
        <TextInput value={title} onChange={(e) => onTitle(e.target.value)} placeholder="e.g. Cellular respiration" />
      </Field>
      <Field label="Reference notes" hint="Headings, “Term: definition” lines and **bold** words count as key ideas.">
        <TextArea value={notes} onChange={(e) => onNotes(e.target.value)} className="min-h-56" placeholder="Paste your notes here. Study them, then start blurting." />
      </Field>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-ink/60">{words} words</span>
        <Button variant="primary" onClick={onStart} disabled={words < 5}>
          Hide notes and start blurting
        </Button>
      </div>
    </div>
  );
}

function BlurtStep({ title, blurt, onBlurt, onBack, onCheck }: { title: string; blurt: string; onBlurt: (v: string) => void; onBack: () => void; onCheck: () => void }) {
  return (
    <div className="space-y-3">
      <Card className="bg-navy-900 text-cream-50">
        <p className="font-display text-lg font-extrabold">No peeking, captain.</p>
        <p className="text-sm text-cream-50/80">Write everything you remember{title ? ` about ${title}` : ""}: facts, terms, how things connect. Messy is fine.</p>
      </Card>
      <TextArea autoFocus value={blurt} onChange={(e) => onBlurt(e.target.value)} className="min-h-72 text-lg" placeholder="Start writing…" aria-label="Your blurt" />
      <div className="flex justify-between gap-2">
        <Button onClick={onBack}>Back to notes</Button>
        <Button variant="primary" onClick={onCheck} disabled={!blurt.trim()}>
          Check my blurt
        </Button>
      </div>
    </div>
  );
}

const HIGHLIGHT: Record<string, string> = {
  mastered: `${BLURT_STATUS_COLORS.mastered}40`,
  partial: `${BLURT_STATUS_COLORS.partial}40`,
  missed: `${BLURT_STATUS_COLORS.missed}40`,
  extra: "#6B4C9A30",
};

function Spans({ spans }: { spans: TextSpan[] }) {
  return (
    <p className="leading-loose whitespace-pre-wrap">
      {spans.map((s, i) =>
        s.status ? (
          <mark
            key={i}
            className="rounded px-0.5 text-ink"
            style={{ background: HIGHLIGHT[s.status], borderBottom: `3px solid ${s.status === "extra" ? "#6B4C9A" : BLURT_STATUS_COLORS[s.status]}` }}
            title={s.status === "extra" ? "Not in your notes" : STATUS_LABEL[s.status]}
          >
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </p>
  );
}

function Results({ title, notes, blurt, result, onRetry, onNew }: { title: string; notes: string; blurt: string; result: BlurtResult; onRetry: () => void; onNew: () => void }) {
  const { addDeck, addCard } = useRecall.getState();
  const toast = useUi((s) => s.toast);
  const counts = { mastered: 0, partial: 0, missed: 0 };
  result.concepts.forEach((c) => counts[c.status]++);
  const pct = Math.round(result.coverage * 100);

  const makeCards = () => {
    const missed = result.concepts.filter((c) => c.status !== "mastered");
    if (!missed.length) return;
    const deck = addDeck(`Log: ${title.trim() || "notes"}`, title.trim() || null);
    let made = 0;
    for (const c of missed) {
      // A cloze card: the sentence with the concept blanked out.
      const escaped = c.concept.display.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const front = c.concept.sentence.replace(new RegExp(escaped, "i"), "_____");
      if (addCard(deck.id, front === c.concept.sentence ? `What is “${c.concept.display}”?` : front, c.concept.display)) made++;
    }
    toast(`Made ${made} flashcard${made === 1 ? "" : "s"} from what you missed.`, "info");
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="text-center sm:text-left">
          <p className="font-display text-5xl font-extrabold tabular-nums">{pct}%</p>
          <p className="text-sm font-bold text-ink/60">of the key ideas</p>
        </div>
        <div>
          <ProgressBar value={result.coverage} color={BLURT_STATUS_COLORS.mastered} label="Coverage" />
          <div className="mt-2 flex flex-wrap gap-2 text-sm font-bold">
            {(["mastered", "partial", "missed"] as const).map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className="size-3 rounded-full border border-ink/40" style={{ background: BLURT_STATUS_COLORS[s] }} aria-hidden="true" />
                {STATUS_MARK[s]} {STATUS_LABEL[s]}: {counts[s]}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {result.concepts.map((c) => (
          <span
            key={c.concept.id}
            className={cx("inline-flex items-center gap-1 rounded-full border-2 px-2.5 py-0.5 text-sm font-bold text-ink", c.concept.weight === 3 && "text-base")}
            style={{ borderColor: BLURT_STATUS_COLORS[c.status], background: HIGHLIGHT[c.status] }}
            title={c.concept.sentence}
          >
            <span aria-label={STATUS_LABEL[c.status]}>{STATUS_MARK[c.status]}</span>
            {c.concept.display}
          </span>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <h3 className="mb-1 font-display font-extrabold">Your notes</h3>
          <Spans spans={annotateNotes(notes, result)} />
        </Card>
        <Card>
          <h3 className="mb-1 font-display font-extrabold">Your blurt</h3>
          <Spans spans={annotateBlurt(blurt, result)} />
          {result.extraTerms.length > 0 && (
            <p className="mt-3 text-sm">
              <span className="font-bold">Not in your notes:</span> {result.extraTerms.join(", ")}. Worth a double-check: new ideas or slips?
            </p>
          )}
        </Card>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={onNew}>New notes</Button>
        {counts.mastered < result.concepts.length && (
          <Button variant="seafoam" onClick={makeCards}>
            Make flashcards from what I missed
          </Button>
        )}
        <Button variant="primary" onClick={onRetry}>
          Blurt again
        </Button>
      </div>
    </div>
  );
}

function History({ onOpen }: { onOpen: (title: string, notes: string) => void }) {
  const blurts = useRecall((s) => s.blurts);
  if (!blurts.length) return <EmptyState title="No log entries yet">Your blurts and their scores will be kept here.</EmptyState>;
  return (
    <ul className="space-y-1.5">
      {[...blurts].reverse().map((b) => (
        <li key={b.id}>
          <button type="button" onClick={() => onOpen(b.title, b.notes)} className="flex w-full items-center gap-3 rounded-xl border-2 border-ink/10 bg-cream-50 px-3 py-2 text-left hover:border-ink/30">
            <Badge tone={b.coverage >= 0.75 ? "seafoam" : b.coverage >= 0.4 ? "brass" : "coral"}>{Math.round(b.coverage * 100)}%</Badge>
            <span className="min-w-0 flex-1 truncate font-bold">{b.title}</span>
            <span className="text-xs text-ink/50">{relativeTime(b.at)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
