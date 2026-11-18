// The Captain's Log: blurting practice. Pick reference notes, hide them,
// write down everything you remember, then see what you recalled. Gemini
// grades it when the sailor has added their own key in Settings; otherwise,
// or when Gemini can't answer, the offline engine does.

import { useMemo, useRef, useState } from "react";
import { BLURT_STATUS_COLORS } from "@ship/shared-types";
import type { BlurtConceptResult, BlurtResult } from "@ship/shared-types";
import { annotateBlurt, annotateNotes } from "@ship/active-recall-engine";
import type { TextSpan } from "@ship/active-recall-engine";
import {
  FIRST_STRETCH,
  LONG_FILE_PAGES,
  buildNoteSources,
  mergeHashtags,
  suggestHashtags,
} from "../../lib/captainsLogService.js";
import type { NoteSource } from "../../lib/captainsLogService.js";
import { clozeFront, gradeLogEntry } from "../../lib/blurtGrading.js";
import { relativeTime } from "../../lib/format.js";
import { useFleet } from "../../stores/fleetStore.js";
import { useRecall } from "../../stores/recallStore.js";
import { useSettings } from "../../stores/settingsStore.js";
import { useUi } from "../../stores/uiStore.js";
import { IconLog } from "../icons.js";
import { Badge, Button, Card, EmptyState, Field, Panel, ProgressBar, Select, Tabs, TextArea, TextInput, cx, readFile } from "../ui.js";

type Step = "notes" | "blurt" | "results";
type Tab = "practice" | "history";

const STATUS_MARK: Record<BlurtConceptResult["status"], string> = { mastered: "✓", partial: "~", missed: "✗" };
const STATUS_LABEL: Record<BlurtConceptResult["status"], string> = { mastered: "Recalled", partial: "Partly", missed: "Missed" };

export function CaptainsLogPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("practice");
  const [step, setStep] = useState<Step>("notes");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [blurt, setBlurt] = useState("");
  const [result, setResult] = useState<BlurtResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [grading, setGrading] = useState(false);
  const saveBlurt = useRecall((s) => s.saveBlurt);
  const usesGemini = useSettings((s) => s.geminiApiKey.trim().length > 0);

  const check = async () => {
    setGrading(true);
    const graded = await gradeLogEntry(blurt, notes, useSettings.getState());
    setGrading(false);
    setResult(graded.result);
    setNotice(graded.notice);
    setStep("results");
    saveBlurt({
      title: title.trim() || "Untitled notes",
      notes,
      blurt,
      coverage: graded.result.coverage,
      hashtags: hashtags.length > 0 ? hashtags : undefined,
      gradedBy: graded.result.gradedBy ?? "heuristic",
    });
  };

  return (
    <Panel title="Study Sheets" subtitle="Upload notes, add #hashtags, and practice active recall" icon={<IconLog />} onClose={onClose} wide>
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
          onOpen={(t, n, nextTags) => {
            setTitle(t);
            setNotes(n);
            setHashtags(nextTags ?? []);
            setBlurt("");
            setResult(null);
            setStep("notes");
            setTab("practice");
          }}
        />
      ) : step === "notes" ? (
        <NotesStep title={title} notes={notes} hashtags={hashtags} onTitle={setTitle} onNotes={setNotes} onHashtags={setHashtags} onStart={() => setStep("blurt")} />
      ) : step === "blurt" ? (
        <BlurtStep title={title} blurt={blurt} onBlurt={setBlurt} onBack={() => setStep("notes")} onCheck={() => void check()} grading={grading} usesGemini={usesGemini} />
      ) : (
        result && (
          <Results
            title={title}
            notes={notes}
            blurt={blurt}
            result={result}
            notice={notice}
            usesGemini={usesGemini}
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

function NotesStep({
  title,
  notes,
  hashtags,
  onTitle,
  onNotes,
  onHashtags,
  onStart,
}: {
  title: string;
  notes: string;
  hashtags: string[];
  onTitle: (v: string) => void;
  onNotes: (v: string) => void;
  onHashtags: (v: string[]) => void;
  onStart: () => void;
}) {
  const imported = useFleet((s) => s.notes);
  const library = useFleet((s) => s.library);
  const importFiles = useFleet((s) => s.importFiles);
  const toast = useUi((s) => s.toast);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [tagDraft, setTagDraft] = useState("");

  const addHashtagsFromInput = (raw: string) => {
    const merged = mergeHashtags(hashtags, raw);
    if (merged.length !== hashtags.length) onHashtags(merged);
    setTagDraft("");
  };

  const sources = useMemo<NoteSource[]>(() => buildNoteSources(imported, library), [imported, library]);
  const [picked, setPicked] = useState<{ source: NoteSource; from: number; to: number } | null>(null);
  const choose = (source: NoteSource, from: number, to: number) => {
    setPicked({ source, from, to });
    const { pages } = source;
    const range = from === to ? `page ${pages[from].label}` : `pages ${pages[from].label}–${pages[to].label}`;
    onTitle(from === 0 && to === pages.length - 1 ? source.title : `${source.title} (${range})`);
    onNotes(pages.slice(from, to + 1).map((p) => p.text).join("\n\n"));
  };

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    try {
      const files = await Promise.all(Array.from(fileList).map(readFile));
      const summary = await importFiles(files);
      const latestNote = useFleet.getState().notes.at(-1);
      if (latestNote) {
        onTitle(latestNote.title);
        onNotes(latestNote.pages.map((p) => p.text).join("\n\n"));
      }
      toast(`Uploaded ${summary.files} file${summary.files === 1 ? "" : "s"} (${summary.notes} note${summary.notes === 1 ? "" : "s"}).`, "reward");
    } catch {
      toast("Could not read one of the uploaded files.", "warning");
    } finally {
      setUploading(false);
    }
  };

  const words = notes.trim() ? notes.trim().split(/\s+/).length : 0;
  const blurts = useRecall((s) => s.blurts);
  const suggestions = useMemo(() => suggestHashtags(blurts, hashtags, tagDraft), [blurts, hashtags, tagDraft]);

  return (
    <div className="space-y-3">
      {/* Direct file upload & drag-and-drop inside Study Sheets */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleUpload(e.dataTransfer.files);
        }}
        className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-dashed px-3.5 py-3 transition ${
          dragging ? "border-[#6D655C] bg-[#FFF5B8]/60" : "border-ink/25 bg-cream-50"
        }`}
      >
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">
            {dragging ? "Drop files to upload!" : "Upload or drag & drop files here"}
          </p>
          <p className="text-xs text-ink/60">PDF, Parchment, Markdown, Word (.docx), PowerPoint (.pptx), or TXT</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.md,.txt,.docx,.pptx,.parchment,.csv,.apkg"
          className="hidden"
          onChange={(e) => {
            void handleUpload(e.target.files);
            e.target.value = "";
          }}
        />
        <Button size="sm" variant="secondary" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? "Uploading…" : "Upload"}
        </Button>
      </div>

      {sources.length > 0 && (
        <Field label="Use an uploaded file or note">
          <Select
            defaultValue=""
            onChange={(e) => {
              const s = sources.find((x) => x.id === e.target.value);
              if (!s) setPicked(null);
              else choose(s, 0, Math.min(s.pages.length > LONG_FILE_PAGES ? FIRST_STRETCH : s.pages.length, s.pages.length) - 1);
            }}
          >
            <option value="">Pick a file or note…</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {picked && picked.source.pages.length > 1 && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="From page">
            <Select
              value={picked.from}
              onChange={(e) => {
                const from = Number(e.target.value);
                choose(picked.source, from, Math.max(from, picked.to));
              }}
            >
              {picked.source.pages.map((p, i) => (
                <option key={i} value={i}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="To page">
            <Select
              value={picked.to}
              onChange={(e) => {
                const to = Number(e.target.value);
                choose(picked.source, Math.min(picked.from, to), to);
              }}
            >
              {picked.source.pages.map((p, i) => (
                <option key={i} value={i}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <p className="col-span-2 text-sm text-ink/60">A few pages at a time works best: Ship picks at most 30 key ideas from whatever you choose.</p>
        </div>
      )}
      <Field label="Topic">
        <TextInput value={title} onChange={(e) => onTitle(e.target.value)} placeholder="e.g. Cellular respiration" />
      </Field>

      {/* Hashtag tags */}
      <Field label="Tags" hint="Type hashtags like #bio101 #unit2 #ch4 #week3 and press Space or Enter.">
        <div className="space-y-2">
          <TextInput
            value={tagDraft}
            onChange={(e) => {
              const val = e.target.value;
              if (val.endsWith(" ") || val.endsWith(",")) addHashtagsFromInput(val);
              else setTagDraft(val);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addHashtagsFromInput(tagDraft);
              }
            }}
            onBlur={() => addHashtagsFromInput(tagDraft)}
            placeholder="#class #unit #chapter #week"
          />
          {suggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[#8E887F]">Suggestions:</span>
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onHashtags(Array.from(new Set([...hashtags, s])))}
                  className="bg-transparent px-1.5 py-0.5 text-[#6D655C] hover:underline underline-offset-4"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {hashtags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onHashtags(hashtags.filter((t) => t !== tag))}
                  className="rounded-full bg-[#FFF3A8]/70 px-2.5 py-0.5 text-xs text-[#6D655C] hover:underline"
                  title="Click to remove tag"
                >
                  {tag} ×
                </button>
              ))}
            </div>
          )}
        </div>
      </Field>

      <Field label="Reference notes" hint="Headings, “Term: definition” lines and **bold** words count as key ideas.">
        <TextArea value={notes} onChange={(e) => onNotes(e.target.value)} className="min-h-48" placeholder="Paste your notes here or upload a file above. Study them, then start blurting." />
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

function BlurtStep({
  title,
  blurt,
  onBlurt,
  onBack,
  onCheck,
  grading,
  usesGemini,
}: {
  title: string;
  blurt: string;
  onBlurt: (v: string) => void;
  onBack: () => void;
  onCheck: () => void;
  grading: boolean;
  usesGemini: boolean;
}) {
  return (
    <div className="space-y-3">
      <Card className="bg-navy-900 text-cream-50">
        <p className="font-display text-lg font-extrabold">No peeking, captain.</p>
        <p className="text-sm text-cream-50/80">Write everything you remember{title ? ` about ${title}` : ""}: facts, terms, how things connect. Messy is fine.</p>
      </Card>
      <TextArea autoFocus value={blurt} onChange={(e) => onBlurt(e.target.value)} className="min-h-72 text-lg" placeholder="Start writing…" aria-label="Your blurt" readOnly={grading} />
      <div className="flex items-center justify-between gap-2">
        <Button onClick={onBack} disabled={grading}>
          Back to notes
        </Button>
        <span className="flex items-center gap-2">
          {usesGemini && <span className="hidden text-sm text-ink/60 sm:inline">Gemini grades this</span>}
          <Button variant="primary" onClick={onCheck} disabled={!blurt.trim() || grading} aria-busy={grading}>
            {grading ? "Grading with Gemini…" : "Check my blurt"}
          </Button>
        </span>
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

function Results({
  title,
  notes,
  blurt,
  result,
  notice,
  usesGemini,
  onRetry,
  onNew,
}: {
  title: string;
  notes: string;
  blurt: string;
  result: BlurtResult;
  notice: string | null;
  usesGemini: boolean;
  onRetry: () => void;
  onNew: () => void;
}) {
  const { addDeck, addCard } = useRecall.getState();
  const toast = useUi((s) => s.toast);
  const counts = { mastered: 0, partial: 0, missed: 0 };
  result.concepts.forEach((c) => counts[c.status]++);
  const pct = Math.round(result.coverage * 100);
  const byGemini = result.gradedBy === "gemini";
  // Gemini's notes on what to add or fix, biggest ideas first.
  const advice = result.concepts.filter((c) => c.status !== "mastered" && c.feedback).sort((a, b) => b.concept.weight - a.concept.weight);
  const misconceptions = result.misconceptions ?? [];

  const makeCards = () => {
    const missed = result.concepts.filter((c) => c.status !== "mastered");
    if (!missed.length) return;
    const deck = addDeck(`Log: ${title.trim() || "notes"}`, title.trim() || null);
    let made = 0;
    for (const c of missed) {
      const front = clozeFront(c.concept.display, c.concept.sentence);
      if (front && addCard(deck.id, front, c.concept.display)) made++;
    }
    toast(`Made ${made} flashcard${made === 1 ? "" : "s"} from what you missed.`, "info");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={byGemini ? "seafoam" : "plain"}>{byGemini ? "Graded by Gemini" : "Graded on this device"}</Badge>
        {!byGemini && !usesGemini && <span className="text-ink/60">Add a Gemini key in Settings to have your own wording understood.</span>}
      </div>
      {notice && (
        <p role="status" className="rounded-xl bg-brass-400/20 px-3 py-2 text-sm font-bold">
          {notice}
        </p>
      )}
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
            title={c.feedback ? `${c.concept.sentence}\n\n${c.feedback}` : c.concept.sentence}
          >
            <span aria-label={STATUS_LABEL[c.status]}>{STATUS_MARK[c.status]}</span>
            {c.concept.display}
          </span>
        ))}
      </div>

      {result.summary && <p className="font-display text-lg font-bold">{result.summary}</p>}

      {(advice.length > 0 || misconceptions.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {advice.length > 0 && (
            <Card>
              <h3 className="mb-1 font-display font-extrabold">What to work on</h3>
              <ul className="space-y-1.5 text-sm">
                {advice.map((c) => (
                  <li key={c.concept.id}>
                    <span className="font-bold" style={{ color: c.status === "missed" ? "var(--color-coral-700)" : undefined }}>
                      {STATUS_MARK[c.status]} {c.concept.display}:
                    </span>{" "}
                    {c.feedback}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {misconceptions.length > 0 && (
            <Card>
              <h3 className="mb-1 font-display font-extrabold">Check these</h3>
              <ul className="space-y-1.5 text-sm">
                {misconceptions.map((m, i) => (
                  <li key={i}>
                    <span className="font-bold">“{m.quote}”</span> {m.correction}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

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

function History({ onOpen }: { onOpen: (title: string, notes: string, hashtags?: string[]) => void }) {
  const blurts = useRecall((s) => s.blurts);
  const [filter, setFilter] = useState("");
  if (!blurts.length) return <EmptyState title="No study entries yet">Your blurts, #hashtags, and scores will be kept here.</EmptyState>;
  const q = filter.trim().toLowerCase();
  const visible = [...blurts]
    .reverse()
    .filter((b) => {
      if (!q) return true;
      const hay = [b.title, ...(b.hashtags ?? [])].join(" ").toLowerCase();
      return hay.includes(q);
    });
  return (
    <div className="space-y-2.5">
      <TextInput value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by #hashtag or topic…" />
      <ul className="space-y-1.5">
        {visible.map((b) => (
          <li key={b.id}>
            <button type="button" onClick={() => onOpen(b.title, b.notes, b.hashtags)} className="flex w-full flex-wrap items-center gap-2 rounded-xl bg-cream-50/70 px-3 py-2 text-left hover:underline">
              <Badge tone={b.coverage >= 0.75 ? "seafoam" : b.coverage >= 0.4 ? "brass" : "coral"}>{Math.round(b.coverage * 100)}%</Badge>
              <span className="min-w-0 flex-1 truncate">{b.title}</span>
              {(b.hashtags ?? []).map((tag) => (
                <Badge key={tag} tone="brass">{tag}</Badge>
              ))}
              {b.gradedBy === "gemini" && <Badge tone="navy">Gemini</Badge>}
              <span className="text-xs text-ink/50">{relativeTime(b.at)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
