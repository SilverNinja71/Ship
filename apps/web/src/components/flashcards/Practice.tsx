// Practice modes in the style of Quizlet: Learn, Test and Match. They work
// through a deck now and never change when a card is next due for review.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MATCH_PENALTY_MS,
  answerLearn,
  buildTest,
  gradeTestQuestion,
  gradeTypedAnswer,
  learnProgress,
  matchBoard,
  nextLearn,
  seededRng,
  startLearn,
  testPercent,
} from "@ship/active-recall-engine";
import type { LearnQuestion, LearnState, MatchTile, PracticeCard, QuestionResult, Rng, TestAnswer, TestQuestion, TestQuestionKind } from "@ship/active-recall-engine";
import { useRecall } from "../../stores/recallStore.js";
import { useNow } from "../Hud.js";
import { Badge, Button, Card, EmptyState, ProgressBar, Select, TextInput, cx } from "../ui.js";
import { ChoiceButtons } from "./ChoiceButtons.js";
import { MatchTiles } from "./MatchTiles.js";

type Mode = "learn" | "test" | "match";

const MODES: { id: Mode; label: string; blurb: string }[] = [
  { id: "learn", label: "Learn", blurb: "Multiple choice first, then typed answers. Cards you miss come back until you've mastered them all." },
  { id: "test", label: "Test", blurb: "A practice test with a mix of question types, scored at the end." },
  { id: "match", label: "Match", blurb: "Pair each question with its answer as fast as you can. A wrong pair adds a second." },
];

const freshRng = (): Rng => seededRng((Date.now() ^ Math.floor(Math.random() * 2 ** 31)) >>> 0);

export function Practice() {
  const cards = useRecall((s) => s.cards);
  const decks = useRecall((s) => s.decks);
  const [deckId, setDeckId] = useState("");
  const [mode, setMode] = useState<Mode>("learn");
  const pool = useMemo<PracticeCard[]>(() => (deckId ? cards.filter((c) => c.deckId === deckId) : cards).map(({ id, front, back }) => ({ id, front, back })), [cards, deckId]);
  // Starting a mode over (a new deck, or a new mode) gets a fresh key.
  const runKey = `${mode}:${deckId}`;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Practice mode" className="flex gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)] p-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => setMode(m.id)}
              className={cx("rounded-lg px-3 py-1 text-sm font-bold transition", mode === m.id ? "bg-[var(--surface-1)] text-[var(--page-ink)] shadow-sm" : "text-[var(--muted-ink)] hover:text-[var(--page-ink)]")}
            >
              {m.label}
            </button>
          ))}
        </div>
        {decks.length > 1 && (
          <Select value={deckId} onChange={(e) => setDeckId(e.target.value)} className="w-auto" aria-label="Deck to practise">
            <option value="">All decks</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        )}
      </div>
      <p className="mb-3 text-sm text-[var(--muted-ink)]">{MODES.find((m) => m.id === mode)!.blurb} Practice doesn&apos;t change when cards are due for review.</p>
      {pool.length < 2 ? (
        <EmptyState title="Add a few more cards first">Practice needs at least two cards in the deck.</EmptyState>
      ) : mode === "learn" ? (
        <Learn key={runKey} cards={pool} />
      ) : mode === "test" ? (
        <Test key={runKey} cards={pool} />
      ) : (
        <Match key={runKey} cards={pool} deckKey={deckId} />
      )}
    </div>
  );
}

// ---- Learn --------------------------------------------------------------------------------------

function Learn({ cards }: { cards: PracticeCard[] }) {
  const rng = useRef(freshRng()).current;
  const [session, setSession] = useState<{ state: LearnState; question: LearnQuestion | null }>(() => nextLearn(startLearn(cards, rng), cards, rng));
  const [typed, setTyped] = useState("");
  const [feedback, setFeedback] = useState<{ correct: boolean; given: string; close?: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { state, question } = session;
  const progress = learnProgress(state);

  useEffect(() => {
    if (!feedback && question?.kind === "written") inputRef.current?.focus();
  }, [question, feedback]);

  const answer = (given: string) => {
    if (!question || feedback) return;
    if (question.kind === "choice") return setFeedback({ correct: given === question.card.back, given });
    const verdict = gradeTypedAnswer(given, question.card.back).verdict;
    setFeedback({ correct: verdict !== "incorrect", given, close: verdict === "close" });
  };

  const next = () => {
    if (!question || !feedback) return;
    const answered = answerLearn(state, question.card.id, feedback.correct);
    setSession(nextLearn(answered, cards, rng));
    setFeedback(null);
    setTyped("");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (feedback && e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (!feedback && question?.kind === "choice" && /^[1-4]$/.test(e.key)) {
        const pick = question.options[Number(e.key) - 1];
        if (pick !== undefined) answer(pick);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const total = cards.length;
  const bar = (
    <div className="mb-3">
      <ProgressBar value={progress.mastered / total} label="Cards mastered" />
      <p className="mt-1 flex flex-wrap gap-x-4 text-xs text-[var(--muted-ink)]">
        <span>Not yet: {progress.notYet}</span>
        <span>Familiar: {progress.familiar}</span>
        <span className="font-bold text-[var(--page-ink)]">Mastered: {progress.mastered} of {total}</span>
      </p>
    </div>
  );

  if (!question) {
    return (
      <div>
        {bar}
        <EmptyState title={`You've mastered all ${total} cards!`}>
          <Button variant="primary" className="mt-3" onClick={() => setSession(nextLearn(startLearn(cards, rng), cards, rng))}>
            Learn them again
          </Button>
        </EmptyState>
      </div>
    );
  }

  return (
    <div>
      {bar}
      <Card className="min-h-28">
        <p className="text-xs font-bold tracking-wide text-[var(--muted-ink)] uppercase">{question.kind === "choice" ? "Pick the answer" : "Type the answer"}</p>
        <p className="mt-1 font-display text-xl leading-snug font-bold whitespace-pre-wrap">{question.card.front}</p>
      </Card>
      {question.kind === "choice" ? (
        <ChoiceButtons options={question.options} onPick={answer} reveal={feedback ? { right: question.card.back, picked: feedback.given } : undefined} />
      ) : (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (typed.trim()) answer(typed);
          }}
        >
          <TextInput ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)} disabled={Boolean(feedback)} placeholder="Your answer" aria-label="Your answer" />
          <Button type="submit" variant="primary" disabled={Boolean(feedback) || !typed.trim()}>
            Check
          </Button>
        </form>
      )}
      {feedback && (
        <div role="status" className={cx("mt-3 rounded-xl border px-3 py-2", feedback.correct ? "border-seafoam-700 bg-seafoam-500/15" : "border-coral-700 bg-coral-500/15")}>
          <p className="font-bold">{feedback.correct ? (feedback.close ? "Close enough!" : "Correct!") : "Not quite."}</p>
          {(!feedback.correct || feedback.close) && <p className="text-sm">The answer is: {question.card.back}</p>}
          <Button size="sm" variant="primary" className="mt-2" onClick={next}>
            Continue (Enter)
          </Button>
        </div>
      )}
    </div>
  );
}

// ---- Test ---------------------------------------------------------------------------------------

const KIND_LABELS: Record<TestQuestionKind, string> = { written: "Written", choice: "Multiple choice", truefalse: "True or false", match: "Matching" };

function Test({ cards }: { cards: PracticeCard[] }) {
  const [count, setCount] = useState(Math.min(10, cards.length));
  const [kinds, setKinds] = useState<TestQuestionKind[]>(["choice", "written", "truefalse", "match"]);
  const [questions, setQuestions] = useState<TestQuestion[] | null>(null);
  const [answers, setAnswers] = useState<TestAnswer[]>([]);
  const [results, setResults] = useState<QuestionResult[] | null>(null);

  const start = (same?: TestQuestion[]) => {
    const qs = same ?? buildTest(cards, { count, kinds }, freshRng());
    setQuestions(qs);
    setAnswers(qs.map(() => null));
    setResults(null);
  };
  const setAnswer = (i: number, a: TestAnswer) => setAnswers((prev) => prev.map((x, j) => (j === i ? a : x)));

  if (!questions) {
    const sizes = [5, 10, 20, cards.length].filter((n, i, all) => n <= cards.length && all.indexOf(n) === i);
    return (
      <Card className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-bold">
          Questions
          <Select value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-auto">
            {sizes.map((n) => (
              <option key={n} value={n}>
                {n === cards.length ? `All ${n}` : n}
              </option>
            ))}
          </Select>
        </label>
        <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <legend className="mb-1 font-bold">Question types</legend>
          {(Object.keys(KIND_LABELS) as TestQuestionKind[]).map((k) => (
            <label key={k} className="flex items-center gap-1.5">
              <input type="checkbox" checked={kinds.includes(k)} onChange={(e) => setKinds(e.target.checked ? [...kinds, k] : kinds.filter((x) => x !== k))} />
              {KIND_LABELS[k]}
            </label>
          ))}
        </fieldset>
        <Button variant="primary" onClick={() => start()} disabled={!kinds.length}>
          Start the test
        </Button>
      </Card>
    );
  }

  const percent = results ? testPercent(questions, results) : null;
  return (
    <div className="space-y-3">
      {percent !== null && (
        <Card className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-display text-2xl font-extrabold">{percent}%</p>
          <p className="text-sm text-[var(--muted-ink)]">{percent >= 90 ? "Excellent work." : percent >= 70 ? "Nearly there: look over the ones you missed." : "Keep going: Learn mode helps with the ones you missed."}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => start(questions)}>
              Retake
            </Button>
            <Button size="sm" variant="primary" onClick={() => start()}>
              New test
            </Button>
          </div>
        </Card>
      )}
      <ol className="space-y-3">
        {questions.map((q, i) => (
          <li key={i}>
            <TestItem n={i + 1} q={q} answer={answers[i] ?? null} onAnswer={(a) => setAnswer(i, a)} result={results?.[i] ?? null} />
          </li>
        ))}
      </ol>
      {!results && (
        <div className="flex justify-end">
          <Button variant="primary" onClick={() => setResults(questions.map((q, i) => gradeTestQuestion(q, answers[i] ?? null)))}>
            Check my answers
          </Button>
        </div>
      )}
    </div>
  );
}

function TestItem({ n, q, answer, onAnswer, result }: { n: number; q: TestQuestion; answer: TestAnswer; onAnswer: (a: TestAnswer) => void; result: QuestionResult | null }) {
  const done = result !== null;
  const mark = done && (
    <Badge tone={result.score === 1 ? "seafoam" : result.score > 0 ? "brass" : "coral"}>{result.score === 1 ? (result.close ? "Close enough" : "Correct") : result.score > 0 ? `${Math.round(result.score * 100)}%` : "Wrong"}</Badge>
  );
  return (
    <Card>
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-xs font-bold tracking-wide text-[var(--muted-ink)] uppercase">
          {n}. {KIND_LABELS[q.kind]}
        </p>
        {mark}
      </div>
      {q.kind === "match" ? (
        <div className="space-y-2">
          {q.cards.map((c) => {
            const picks = (answer as Record<string, string> | null) ?? {};
            return (
              <div key={c.id} className="grid items-center gap-2 sm:grid-cols-2">
                <span className="text-sm">{c.front}</span>
                <Select
                  value={picks[c.id] ?? ""}
                  disabled={done}
                  onChange={(e) => onAnswer({ ...picks, [c.id]: e.target.value })}
                  aria-label={`Answer for ${c.front}`}
                >
                  <option value="">Choose…</option>
                  {q.answers.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </Select>
                {done && picks[c.id] !== c.back && <span className="text-xs text-[var(--muted-ink)] sm:col-span-2">Answer: {c.back}</span>}
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <p className="mb-2 font-display text-lg leading-snug font-bold whitespace-pre-wrap">{q.card.front}</p>
          {q.kind === "written" && <TextInput value={(answer as string | null) ?? ""} disabled={done} onChange={(e) => onAnswer(e.target.value)} placeholder="Your answer" aria-label={`Answer to question ${n}`} />}
          {q.kind === "choice" && (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {q.options.map((opt) => (
                <label key={opt} className={cx("flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-sm", done && opt === q.card.back && "border-seafoam-700 bg-seafoam-500/15")}>
                  <input type="radio" name={`q${n}`} checked={answer === opt} disabled={done} onChange={() => onAnswer(opt)} />
                  {opt}
                </label>
              ))}
            </div>
          )}
          {q.kind === "truefalse" && (
            <div>
              <p className="mb-2 text-sm">
                Answer: <span className="font-bold">{q.shown}</span>
              </p>
              <div className="flex gap-2">
                {[true, false].map((v) => (
                  <Button key={String(v)} size="sm" variant={answer === v ? "primary" : "secondary"} disabled={done} onClick={() => onAnswer(v)} aria-pressed={answer === v}>
                    {v ? "True" : "False"}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {done && result.score < 1 && q.kind !== "truefalse" && <p className="mt-2 text-sm text-[var(--muted-ink)]">Answer: {q.card.back}</p>}
          {done && q.kind === "truefalse" && result.score < 1 && <p className="mt-2 text-sm text-[var(--muted-ink)]">It's {q.isTrue ? "true" : `false: the answer is ${q.card.back}`}.</p>}
        </>
      )}
    </Card>
  );
}

// ---- Match --------------------------------------------------------------------------------------

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

function Match({ cards, deckKey }: { cards: PracticeCard[]; deckKey: string }) {
  const best = useRecall((s) => s.matchBest[deckKey]);
  const recordMatch = useRecall((s) => s.recordMatch);
  const [tiles, setTiles] = useState<MatchTile[] | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [penalty, setPenalty] = useState(0);
  const [finished, setFinished] = useState<{ ms: number; record: boolean } | null>(null);
  const now = useNow(100);

  // A fresh board (a new array) also clears MatchTiles' own picks.
  const start = () => {
    setTiles(matchBoard(cards, freshRng()));
    setPenalty(0);
    setFinished(null);
    setStartedAt(Date.now());
  };

  const done = () => {
    const ms = Date.now() - startedAt + penalty;
    setFinished({ ms, record: recordMatch(deckKey, ms) });
  };

  if (!tiles || finished) {
    return (
      <Card className="text-center">
        {finished ? (
          <>
            <p className="font-display text-3xl font-extrabold">{formatSeconds(finished.ms)}</p>
            <p className="mt-1 text-sm text-[var(--muted-ink)]">{finished.record ? "A new best time for this deck!" : best !== undefined ? `Your best is ${formatSeconds(best)}.` : ""}</p>
          </>
        ) : (
          <p className="text-sm text-[var(--muted-ink)]">{best !== undefined ? `Your best time here is ${formatSeconds(best)}.` : "No best time yet."}</p>
        )}
        <Button variant="primary" className="mt-3" onClick={start}>
          {finished ? "Play again" : "Start"}
        </Button>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-display text-lg font-extrabold tabular-nums" aria-live="off">
          {formatSeconds(now - startedAt + penalty)}
        </span>
        {penalty > 0 && <span className="text-[var(--muted-ink)]">+{penalty / 1000} s for wrong pairs</span>}
      </div>
      <MatchTiles tiles={tiles} onCleared={done} onMistake={() => setPenalty((p) => p + MATCH_PENALTY_MS)} />
    </div>
  );
}
