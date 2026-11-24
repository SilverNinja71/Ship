// Review statistics in the style of Anki's: today's numbers, a calendar of
// study days, the week ahead and how settled the cards are.

import { useMemo, useState } from "react";
import { MATURE_DAYS, reviewStats } from "@ship/active-recall-engine";
import type { DayCount } from "@ship/active-recall-engine";
import { useRecall } from "../../stores/recallStore.js";
import { useSettings } from "../../stores/settingsStore.js";
import { useNow } from "../Hud.js";
import { Card, cx } from "../ui.js";

const WEEKS = 16;
const dayLabel = (t: number, opts: Intl.DateTimeFormatOptions) => new Date(t).toLocaleDateString(undefined, opts);
/** One hue, getting stronger with more reviews; an empty day is the surface itself. */
const STEPS = ["var(--surface-3)", "color-mix(in oklch, var(--color-seafoam-500) 30%, var(--surface-1))", "color-mix(in oklch, var(--color-seafoam-500) 55%, var(--surface-1))", "color-mix(in oklch, var(--color-seafoam-500) 80%, var(--surface-1))", "var(--color-seafoam-700)"];

function step(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((count / max) * 4)));
}

export function Stats() {
  const cards = useRecall((s) => s.cards);
  const log = useRecall((s) => s.reviewLog);
  const cap = useSettings((s) => s.newCardsPerDay);
  const now = useNow(60_000);
  const stats = useMemo(() => reviewStats(cards, log, now, WEEKS * 7), [cards, log, now]);

  const tiles: { label: string; value: string; hint?: string }[] = [
    { label: "Reviewed today", value: String(stats.today.reviews) },
    { label: "New cards today", value: cap > 0 ? `${stats.today.newCards} of ${cap}` : String(stats.today.newCards), hint: "Settings → New cards per day" },
    { label: "Day streak", value: String(stats.streak), hint: "Days in a row with a review" },
    { label: "Remembered", value: stats.retention === null ? "–" : `${Math.round(stats.retention * 100)}%`, hint: "Reviews in the last 30 days rated Hard or better" },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="p-3">
            <p className="text-xs text-[var(--muted-ink)]">{t.label}</p>
            <p className="font-display text-2xl font-extrabold tabular-nums">{t.value}</p>
            {t.hint && <p className="text-[11px] leading-tight text-[var(--muted-ink)]">{t.hint}</p>}
          </Card>
        ))}
      </div>
      <Heatmap days={stats.daily} />
      <Forecast days={stats.forecast} />
      <Card>
        <h3 className="mb-2 font-display font-extrabold">Your cards</h3>
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {[
            { label: "New", value: stats.counts.new, hint: "Not reviewed yet" },
            { label: "Learning", value: stats.counts.learning, hint: "Due again within a day" },
            { label: "Young", value: stats.counts.young, hint: `Due in under ${MATURE_DAYS} days` },
            { label: "Mature", value: stats.counts.mature, hint: `Due in ${MATURE_DAYS} days or more` },
          ].map((c) => (
            <div key={c.label}>
              <dt className="text-xs text-[var(--muted-ink)]">{c.label}</dt>
              <dd className="font-display text-xl font-extrabold tabular-nums">{c.value}</dd>
              <dd className="text-[11px] text-[var(--muted-ink)]">{c.hint}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}

function Heatmap({ days }: { days: DayCount[] }) {
  const [hover, setHover] = useState<DayCount | null>(null);
  const max = Math.max(0, ...days.map((d) => d.count));
  const studied = days.filter((d) => d.count > 0).length;
  // Rows run Monday to Sunday, so the first column starts with blanks up to the first day's weekday.
  const lead = (new Date(days[0]!.day).getDay() + 6) % 7;
  const describe = (d: DayCount) => `${dayLabel(d.day, { weekday: "short", day: "numeric", month: "short" })}: ${d.count} review${d.count === 1 ? "" : "s"}`;

  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display font-extrabold">Study days</h3>
        <p className="text-xs text-[var(--muted-ink)]" aria-live="polite">
          {hover ? describe(hover) : `${studied} of the last ${days.length} days`}
        </p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <div className="grid shrink-0 grid-rows-7 gap-[2px] text-[10px] leading-[11px] text-[var(--muted-ink)]" aria-hidden="true">
          {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
        <div
          role="img"
          aria-label={`Reviews per day for the last ${WEEKS} weeks: ${studied} days with reviews, the busiest with ${max}.`}
          className="grid grid-flow-col grid-rows-7 gap-[2px]"
          onMouseLeave={() => setHover(null)}
        >
          {Array.from({ length: lead }, (_, i) => (
            <span key={`pad${i}`} className="size-[11px]" />
          ))}
          {days.map((d) => (
            <span
              key={d.day}
              title={describe(d)}
              onMouseEnter={() => setHover(d)}
              className={cx("size-[11px] rounded-[2px]", hover?.day === d.day && "outline-2 outline-offset-1 outline-[var(--page-ink)]")}
              style={{ background: STEPS[step(d.count, max)] }}
            />
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1 text-[10px] text-[var(--muted-ink)]" aria-hidden="true">
        Fewer
        {STEPS.map((c) => (
          <span key={c} className="size-[11px] rounded-[2px]" style={{ background: c }} />
        ))}
        More
      </div>
    </Card>
  );
}

function Forecast({ days }: { days: DayCount[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((n, d) => n + d.count, 0);
  return (
    <Card>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display font-extrabold">Reviews coming up</h3>
        <p className="text-xs text-[var(--muted-ink)]">{total} in the next 7 days</p>
      </div>
      <div className="grid h-28 grid-cols-7 items-end gap-[6px] border-b border-[var(--border-subtle)]" role="img" aria-label={`Reviews due over the next 7 days: ${days.map((d, i) => `${i === 0 ? "today" : dayLabel(d.day, { weekday: "long" })} ${d.count}`).join(", ")}.`}>
        {days.map((d, i) => (
          <div key={d.day} className="flex h-full items-end" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} title={`${d.count} due`}>
            <div
              className={cx("w-full rounded-t-[4px] transition-opacity", hover !== null && hover !== i && "opacity-60")}
              style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? 3 : 0, background: "var(--color-seafoam-500)" }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-[6px] text-center text-[11px] text-[var(--muted-ink)]">
        {days.map((d, i) => (
          <div key={d.day}>
            <span className="block">{i === 0 ? "Today" : dayLabel(d.day, { weekday: "short" })}</span>
            <span className={cx("block tabular-nums", hover === i ? "font-bold text-[var(--page-ink)]" : "")}>{d.count}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
