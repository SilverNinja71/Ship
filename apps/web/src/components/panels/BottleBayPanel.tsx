// Bottle Bay: study sources and flashcard decks that sailors choose to share,
// anonymously. Fish (browse, keep, report), Set one afloat (share, with a
// preview of exactly what goes out and a check for personal details), and My
// bottles (take one back). Logging in is needed to keep spam out; a bottle
// never shows who set it afloat. Loaded only when opened.

import { useEffect, useMemo, useState } from "react";
import type { QueryDocumentSnapshot } from "firebase/firestore";
import { BOTTLE_LIMITS, newReviewSchedule } from "@ship/shared-types";
import type { Bottle, BottleCard, BottleKind, BottleReportReason } from "@ship/shared-types";
import { useAuthUser } from "../../hooks/useAuthUser.js";
import { bayProblem, deckCards, listBottles, myBottles, reportBottle, setAfloat, takeBack } from "../../lib/bottleBay.js";
import { bottleNoteMarkdown, checkDraft, visibleBottles } from "../../lib/bottleRules.js";
import { useFleet } from "../../stores/fleetStore.js";
import { useRecall } from "../../stores/recallStore.js";
import { useUi } from "../../stores/uiStore.js";
import { IconBottle } from "../icons.js";
import { PastelMinionBadge } from "../PastelMinionBadge.js";
import { Button, Panel, Tabs, TextArea, TextInput, cx } from "../ui.js";

type BayTab = "fish" | "afloat" | "mine";

const REASONS: { id: BottleReportReason; label: string }[] = [
  { id: "spam", label: "Spam or an ad" },
  { id: "wrong", label: "Wrong or misleading" },
  { id: "unkind", label: "Unkind or not for school" },
  { id: "personal", label: "Has someone's personal details" },
];

const TYPE_LABEL: Record<string, string> = { website: "website", video: "video", pdf: "PDF", article: "article", book: "book", other: "link" };

const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });

/** When this browser last set a bottle afloat, for the 20-second cooldown the database also enforces. */
let lastAfloatAt = 0;

export function BottleBayPanel({ onClose }: { onClose: () => void }) {
  const user = useAuthUser();
  const [tab, setTab] = useState<BayTab>("fish");
  return (
    <Panel title="Bottle Bay" subtitle="Study treasures sailors set afloat, anonymously" icon={<IconBottle />} onClose={onClose} wide>
      {!user ? (
        <div className="grid place-items-center gap-3 rounded-3xl border border-dashed border-[var(--border-subtle)] px-6 py-10 text-center">
          <PastelMinionBadge costume="pwedo" size={76} />
          <p className="font-display text-xl">Fish for study treasures</p>
          <p className="max-w-md text-sm text-[var(--muted-ink)]">
            Sailors drop good videos, articles and flashcard decks into the bay for anyone to find. Nobody can see who set a bottle afloat. Log in to fish some out or share your own: logging in keeps spam out, and your name never goes in a bottle.
          </p>
          <Button variant="primary" className="rounded-full bg-[#FFE27A] px-4 font-semibold text-[#4B3A0B] hover:no-underline hover:bg-[#FFD95A]" onClick={() => useUi.getState().setLoginOpen(true)}>
            Log in to visit the bay
          </Button>
        </div>
      ) : (
        <>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "fish", label: "Fish" },
              { id: "afloat", label: "Set one afloat" },
              { id: "mine", label: "My bottles" },
            ]}
          />
          {tab === "fish" && <Fish />}
          {tab === "afloat" && <SetAfloat uid={user.uid} onDone={() => setTab("mine")} />}
          {tab === "mine" && <MyBottles uid={user.uid} />}
        </>
      )}
    </Panel>
  );
}

// ---- Fish: browse the bay ----------------------------------------------------------------------

function Fish() {
  const [bottles, setBottles] = useState<Bottle[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [kind, setKind] = useState<BottleKind | "all">("all");
  const [search, setSearch] = useState("");
  const [state, setState] = useState<"loading" | "ready" | string>("loading");

  const load = async (more = false) => {
    setState("loading");
    try {
      const page = await listBottles({ subjectKey: subject ?? undefined, after: more ? cursor : null });
      setBottles((old) => (more ? [...old, ...page.bottles] : page.bottles));
      setCursor(page.cursor);
      setState("ready");
    } catch (e) {
      setState(bayProblem(e, "load"));
    }
  };
  useEffect(() => {
    void load();
    // A new subject starts the list again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject]);

  const subjects = useMemo(() => {
    const counts = new Map<string, { label: string; n: number }>();
    for (const b of bottles) if (b.subjectKey) counts.set(b.subjectKey, { label: b.subject, n: (counts.get(b.subjectKey)?.n ?? 0) + 1 });
    return [...counts].sort((a, b) => b[1].n - a[1].n).slice(0, 10);
  }, [bottles]);
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = visibleBottles(bottles).filter(
    (b) => (kind === "all" || b.kind === kind) && words.every((w) => `${b.title} ${b.subject} ${b.description} ${b.tags.join(" ")}`.toLowerCase().includes(w)),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <TextInput type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the bay" aria-label="Search the bay" className="min-w-0 flex-1" />
        <div className="flex gap-1" role="group" aria-label="Kind of bottle">
          {(["all", "source", "deck"] as const).map((k) => (
            <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
              {k === "all" ? "All" : k === "source" ? "Sources" : "Decks"}
            </Chip>
          ))}
        </div>
      </div>
      {(subjects.length > 0 || subject) && (
        <div className="flex flex-wrap gap-1.5" aria-label="Subjects">
          {subject && (
            <Chip active onClick={() => setSubject(null)}>
              {bottles[0]?.subject || subject} ×
            </Chip>
          )}
          {!subject &&
            subjects.map(([key, { label }]) => (
              <Chip key={key} active={false} onClick={() => setSubject(key)}>
                {label}
              </Chip>
            ))}
        </div>
      )}

      {state !== "ready" && state !== "loading" && <p className="rounded-2xl bg-[#FBE0DA] px-3 py-2 text-sm text-[#8A3B31]">{state}</p>}
      {state === "ready" && shown.length === 0 && (
        <div className="grid place-items-center gap-2 py-10 text-center">
          <PastelMinionBadge costume="frog" size={60} />
          <p className="font-display text-lg">The bay is calm</p>
          <p className="text-sm text-[var(--muted-ink)]">{bottles.length ? "No bottles match that." : "No bottles yet. Be the first to set one afloat!"}</p>
        </div>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {shown.map((b) => (
          <li key={b.id}>
            <BottleCardView bottle={b} actions={<FishActions bottle={b} onReported={() => setBottles((list) => list.map((x) => (x.id === b.id ? { ...x, reports: x.reports + 1 } : x)))} />} />
          </li>
        ))}
      </ul>
      {state === "loading" && <p className="text-center text-sm text-[var(--muted-ink)]">Fishing…</p>}
      {cursor && state === "ready" && (
        <div className="text-center">
          <Button onClick={() => void load(true)}>Fish for more</Button>
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "rounded-full border px-2.5 py-0.5 text-xs transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]",
        active ? "border-transparent bg-[#CDEDE5] text-[#24584B]" : "border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--muted-ink)] hover:text-[var(--page-ink)]",
      )}
    >
      {children}
    </button>
  );
}

/** A bottle as everyone sees it. Used for browsing, the share preview and My bottles. */
function BottleCardView({ bottle, actions, note }: { bottle: Omit<Bottle, "id" | "at"> & { at?: number }; actions?: React.ReactNode; note?: string }) {
  const deck = bottle.kind === "deck";
  return (
    <article
      className={cx(
        "flex h-full flex-col gap-2 rounded-2xl border px-3.5 py-3 text-[var(--page-ink)] shadow-[0_2px_0_rgb(0_0_0_/_0.04)]",
        deck ? "border-[#DCCCF0] bg-[#F7F2FD]" : "border-[#C3E6DC] bg-[#F0FAF7]",
        "[[data-visual-style=storybook]_&]:border-[var(--border-subtle)] [[data-visual-style=storybook]_&]:bg-[var(--surface-2)]",
      )}
    >
      <div className="flex items-center gap-2 text-xs text-[var(--muted-ink)]">
        <span className={cx("rounded-full px-2 py-0.5", deck ? "bg-[#E9DDF8] text-[#56406A]" : "bg-[#D5F0E8] text-[#2D6252]")}>
          {deck ? `🃏 ${bottle.cardCount} card${bottle.cardCount === 1 ? "" : "s"}` : `🔗 ${TYPE_LABEL[bottle.sourceType ?? "other"] ?? "link"}`}
        </span>
        {bottle.subject && <span className="truncate">{bottle.subject}</span>}
        {bottle.at !== undefined && <span className="ml-auto shrink-0">afloat {day(bottle.at)}</span>}
      </div>
      <h3 className="font-display text-lg leading-snug">{bottle.title}</h3>
      {bottle.description && <p className="line-clamp-3 text-sm text-[var(--muted-ink)]">{bottle.description}</p>}
      {deck && bottle.preview.length > 0 && (
        <ul className="space-y-1 text-sm">
          {bottle.preview.map((c, i) => (
            <li key={i} className="rounded-lg bg-white/70 px-2 py-1 [[data-visual-style=storybook]_&]:bg-[var(--surface-3)]">
              <span className="font-semibold">{c.f}</span> <span className="text-[var(--muted-ink)]" aria-hidden="true">·</span> <span className="text-[var(--muted-ink)]">{c.b}</span>
            </li>
          ))}
        </ul>
      )}
      {!deck && bottle.url && <p className="truncate text-xs text-[var(--muted-ink)]">{bottle.url.replace(/^https:\/\/(www\.)?/, "")}</p>}
      {bottle.tags.length > 0 && <p className="text-xs text-[#6B5E8A]">{bottle.tags.map((t) => `#${t}`).join(" ")}</p>}
      {note && <p className="text-xs text-[#8A3B31]">{note}</p>}
      {actions && <div className="mt-auto flex flex-wrap items-center gap-x-1 pt-1">{actions}</div>}
    </article>
  );
}

function FishActions({ bottle, onReported }: { bottle: Bottle; onReported: () => void }) {
  const toast = useUi((s) => s.toast);
  const user = useAuthUser();
  const kept = useFleet((s) => s.notes.some((n) => n.id === `bottle:${bottle.id}`));
  const added = useRecall((s) => s.decks.some((d) => d.id === `bottle:${bottle.id}`));
  const [reporting, setReporting] = useState(false);
  const [busy, setBusy] = useState(false);

  const keepSource = () => {
    useFleet.getState().putNotes(
      [
        {
          id: `bottle:${bottle.id}`,
          source: "bottle",
          title: bottle.title,
          subject: bottle.subject || "Bottle Bay",
          created: bottle.at,
          modified: Date.now(),
          pages: [{ id: "1", text: bottleNoteMarkdown(bottle) }],
          ...(bottle.url ? { url: bottle.url } : {}),
          properties: { ...(bottle.url ? { source: bottle.url } : {}), tags: [...bottle.tags, "bottle-bay"] },
        },
      ],
      [],
    );
    toast(`Kept "${bottle.title}" in your Note Nook.`, "reward");
  };
  const addDeck = async () => {
    setBusy(true);
    try {
      const cards: BottleCard[] = await deckCards(bottle.id);
      const now = Date.now();
      const deckId = `bottle:${bottle.id}`;
      useRecall.getState().importCards({
        decks: [{ id: deckId, name: bottle.title, subject: bottle.subject || null, created: now, source: "bottle" }],
        cards: cards.map((c, i) => ({ id: `${deckId}#${i}`, deckId, front: c.f, back: c.b, created: now, schedule: newReviewSchedule() })),
      });
      toast(`Added "${bottle.title}" (${cards.length} cards) to your flashcards.`, "reward");
    } catch (e) {
      toast(bayProblem(e, "open"), "warning");
    } finally {
      setBusy(false);
    }
  };
  const report = async (reason: BottleReportReason) => {
    if (!user) return;
    setReporting(false);
    try {
      await reportBottle(user.uid, bottle.id, reason);
      onReported();
      toast("Thanks. Bottles with a few reports are hidden from everyone.", "info");
    } catch (e) {
      toast(bayProblem(e, "report"), "warning");
    }
  };

  if (reporting)
    return (
      <div className="w-full space-y-1">
        <p className="text-xs text-[var(--muted-ink)]">What's wrong with it?</p>
        <div className="flex flex-wrap gap-1">
          {REASONS.map((r) => (
            <Chip key={r.id} active={false} onClick={() => void report(r.id)}>
              {r.label}
            </Chip>
          ))}
          <Chip active={false} onClick={() => setReporting(false)}>
            Never mind
          </Chip>
        </div>
      </div>
    );
  return (
    <>
      {bottle.kind === "source" && bottle.url && (
        <a href={bottle.url} target="_blank" rel="noopener noreferrer" className="px-2 py-1 text-sm font-semibold text-[#2D6252] underline-offset-4 hover:underline">
          Open
        </a>
      )}
      {bottle.kind === "source" ? (
        <Button size="sm" disabled={kept} onClick={keepSource}>
          {kept ? "Kept ✓" : "Keep in Note Nook"}
        </Button>
      ) : (
        <Button size="sm" disabled={added || busy} onClick={() => void addDeck()}>
          {added ? "In your flashcards ✓" : busy ? "Fishing out…" : "Add to my flashcards"}
        </Button>
      )}
      <button type="button" onClick={() => setReporting(true)} className="ml-auto px-1.5 text-xs text-[var(--muted-ink)] underline-offset-4 hover:underline" aria-label={`Report "${bottle.title}"`}>
        ⚑ Report
      </button>
    </>
  );
}

// ---- Set one afloat: share -----------------------------------------------------------------------

function SetAfloat({ uid, onDone }: { uid: string; onDone: () => void }) {
  const notes = useFleet((s) => s.notes);
  const decks = useRecall((s) => s.decks);
  const cards = useRecall((s) => s.cards);
  const toast = useUi((s) => s.toast);
  const [kind, setKind] = useState<BottleKind>("source");
  const [deckId, setDeckId] = useState("");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [tags, setTags] = useState("");
  const [description, setDescription] = useState("");
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, tick] = useState(0);

  // Things the sailor found elsewhere; bottles they fished out aren't shared again.
  const linkNotes = notes.filter((n) => n.url && n.source !== "bottle");
  const ownDecks = decks.filter((d) => d.source !== "bottle" && cards.some((c) => c.deckId === d.id));
  const deckCardsList = cards.filter((c) => c.deckId === deckId);
  const check = checkDraft({ kind, title, url, subject, tags, description, cards: kind === "deck" ? deckCardsList : undefined });
  const wait = Math.ceil((lastAfloatAt + BOTTLE_LIMITS.cooldownSeconds * 1000 - Date.now()) / 1000);
  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => tick((n) => n + 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const fromNote = (id: string) => {
    const n = notes.find((x) => x.id === id);
    if (!n) return;
    setUrl(n.url ?? "");
    setTitle(n.title);
    setSubject(n.subject && !n.subject.includes("/") && n.subject !== "Clippings" ? n.subject : "");
    setChecked(false);
  };
  const fromDeck = (id: string) => {
    setDeckId(id);
    const d = decks.find((x) => x.id === id);
    if (d) {
      setTitle(d.name);
      setSubject(d.subject ?? "");
    }
    setChecked(false);
  };
  const launch = async () => {
    if (!check.ok || !checked || wait > 0) return;
    setBusy(true);
    setError(null);
    try {
      await setAfloat(uid, check.bottle, check.cards);
      lastAfloatAt = Date.now();
      toast("Your bottle is afloat! Nobody can see it came from you. 🍾", "reward");
      onDone();
    } catch (e) {
      setError(bayProblem(e, "share"));
    } finally {
      setBusy(false);
    }
  };

  const field = "mt-1 w-full";
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
      <div className="space-y-3">
        <div className="flex gap-1" role="group" aria-label="What goes in the bottle">
          <Chip active={kind === "source"} onClick={() => setKind("source")}>
            🔗 A source
          </Chip>
          <Chip active={kind === "deck"} onClick={() => setKind("deck")}>
            🃏 A flashcard deck
          </Chip>
        </div>

        {kind === "source" ? (
          <>
            {linkNotes.length > 0 && (
              <label className="block text-sm">
                From your notes and clips
                <select className={cx(field, "rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] px-2 py-1.5")} defaultValue="" onChange={(e) => fromNote(e.target.value)}>
                  <option value="">Pick one…</option>
                  {linkNotes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block text-sm">
              Link
              <TextInput className={field} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" inputMode="url" />
            </label>
          </>
        ) : (
          <label className="block text-sm">
            Deck
            <select className={cx(field, "rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] px-2 py-1.5")} value={deckId} onChange={(e) => fromDeck(e.target.value)}>
              <option value="">Pick a deck…</option>
              {ownDecks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({cards.filter((c) => c.deckId === d.id).length} cards)
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-sm">
          Title
          <TextInput className={field} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={BOTTLE_LIMITS.title} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Subject
            <TextInput className={field} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Biology" maxLength={BOTTLE_LIMITS.subject} />
          </label>
          <label className="block text-sm">
            Tags
            <TextInput className={field} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="ap-bio, cells" />
          </label>
        </div>
        <label className="block text-sm">
          Why it's good (optional)
          <TextArea className={field} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={BOTTLE_LIMITS.description} placeholder="Clear 8-minute walkthrough of the Krebs cycle." />
        </label>
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-[var(--muted-ink)]">
          <li>Share only things you're allowed to share, and that would help someone study.</li>
          <li>No names, emails, phone numbers or school details: yours or anyone's.</li>
          <li>Be kind. Bottles that get reported a few times are hidden.</li>
        </ul>
      </div>

      <div className="space-y-3">
        <p className="text-sm text-[var(--muted-ink)]">Exactly what other sailors will see:</p>
        {check.ok ? (
          <BottleCardView bottle={check.bottle} />
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] px-3 py-4 text-sm text-[var(--muted-ink)]">
            {check.problems.map((p) => (
              <p key={p}>• {p}</p>
            ))}
          </div>
        )}
        {check.ok && check.removedParams.length > 0 && <p className="text-xs text-[#2D6252]">✓ Took tracking codes out of the link ({check.removedParams.join(", ")}), so it can't point back at you.</p>}
        {check.ok && check.warnings.length > 0 && (
          <div className="rounded-2xl bg-[#FFF1D6] px-3 py-2 text-xs text-[#6B4B12]">
            <p className="font-semibold">Before you share, check:</p>
            {check.warnings.map((w) => (
              <p key={w}>• {w}</p>
            ))}
          </div>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 size-4 accent-[#3FA68B]" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>I checked it: no personal details, and it's okay for anyone to see.</span>
        </label>
        <button
          type="button"
          disabled={!check.ok || !checked || busy || wait > 0}
          onClick={() => void launch()}
          className="w-full rounded-2xl bg-[#BFE8DC] px-4 py-3 font-display text-base text-[#1F4D41] shadow-[0_3px_0_#8CCBB8] transition hover:bg-[#AEE0D2] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          {busy ? "Corking the bottle…" : wait > 0 ? `Wait ${wait} s for the next bottle` : "Set it afloat 🍾"}
        </button>
        {error && <p className="text-sm text-[#8A3B31]">{error}</p>}
        <p className="text-xs text-[var(--muted-ink)]">Anonymous: the bottle holds no name, email or account. Only your account privately remembers it's yours, so you can take it back from My bottles.</p>
      </div>
    </div>
  );
}

// ---- My bottles ----------------------------------------------------------------------------------

function MyBottles({ uid }: { uid: string }) {
  const toast = useUi((s) => s.toast);
  const [list, setList] = useState<Bottle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  useEffect(() => {
    myBottles(uid)
      .then(setList)
      .catch((e: unknown) => setError(bayProblem(e, "load")));
  }, [uid]);

  const back = async (id: string) => {
    try {
      await takeBack(uid, id);
      setList((l) => (l ?? []).filter((b) => b.id !== id));
      toast("Bottle taken back out of the bay.", "info");
    } catch (e) {
      toast(bayProblem(e, "take back"), "warning");
    }
  };

  if (error) return <p className="rounded-2xl bg-[#FBE0DA] px-3 py-2 text-sm text-[#8A3B31]">{error}</p>;
  if (!list) return <p className="text-sm text-[var(--muted-ink)]">Looking for your bottles…</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--muted-ink)]">Only you can see this list. Deleting your account takes these bottles back too.</p>
      {!list.length && <p className="py-6 text-center text-sm text-[var(--muted-ink)]">You haven't set any bottles afloat yet.</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {list.map((b) => (
          <li key={b.id}>
            <BottleCardView
              bottle={b}
              note={b.reports >= BOTTLE_LIMITS.hideAtReports ? "Hidden: other sailors reported it." : b.reports ? `Reported ${b.reports} time${b.reports === 1 ? "" : "s"}.` : undefined}
              actions={
                confirm === b.id ? (
                  <>
                    <span className="text-xs">Take it back for good?</span>
                    <Button size="sm" variant="danger" onClick={() => void back(b.id)}>
                      Yes, take it back
                    </Button>
                    <Button size="sm" onClick={() => setConfirm(null)}>
                      Keep it afloat
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="danger" onClick={() => setConfirm(b.id)}>
                    Take it back
                  </Button>
                )
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
