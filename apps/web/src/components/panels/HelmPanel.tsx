// The Helm opens the Navigation Map: every deadline from Canvas, Todoist and
// calendars in one itinerary, plus the logbook of past voyages.

import { useState } from "react";
import type { Assignment } from "@ship/shared-types";
import { shipOrStarter } from "@ship/ship-theme-kit";
import { dueBucket, formatDue, formatMinutes, relativeTime } from "../../lib/format.js";
import type { DueBucket } from "../../lib/format.js";
import { DAY_MS, dayKey, streakDays } from "../../lib/voyageLogic.js";
import { isDone, sortItinerary, useFleet } from "../../stores/fleetStore.js";
import { useSettings } from "../../stores/settingsStore.js";
import { useUi } from "../../stores/uiStore.js";
import { useVoyage } from "../../stores/voyageStore.js";
import { useNow } from "../Hud.js";
import { IconCheck, IconHelm, IconPlay } from "../icons.js";
import { Badge, Button, Card, EmptyState, Panel, Tabs, cx } from "../ui.js";

type Tab = "itinerary" | "logbook";

const BUCKETS: { id: DueBucket; label: string }[] = [
  { id: "overdue", label: "Overdue" },
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "later", label: "Later" },
  { id: "undated", label: "No due date" },
];

const SOURCE_COLOR: Record<string, string> = {
  canvas: "#E2604F",
  todoist: "#DB4C3F",
  lodestar: "#46609A",
  "google-drive": "#3FB59A",
  parchment: "#C9962A",
  paper: "#6B4C9A",
};

export function HelmPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("itinerary");
  const assignments = useFleet((s) => s.assignments);
  const done = useFleet((s) => s.done);
  const open = assignments.filter((a) => !isDone(a, done)).length;
  return (
    <Panel title="Navigation Map" subtitle="Deadlines ahead and voyages behind" icon={<IconHelm />} onClose={onClose}>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "itinerary", label: "Itinerary", badge: open || undefined },
          { id: "logbook", label: "Logbook" },
        ]}
      />
      {tab === "itinerary" ? <Itinerary onClose={onClose} /> : <Logbook />}
    </Panel>
  );
}

function Itinerary({ onClose }: { onClose: () => void }) {
  const assignments = useFleet((s) => s.assignments);
  const done = useFleet((s) => s.done);
  const toggleDone = useFleet((s) => s.toggleDone);
  const openPanel = useUi((s) => s.openPanel);
  const phase = useVoyage((s) => s.phase);
  const start = useVoyage((s) => s.start);
  const [showDone, setShowDone] = useState(false);
  const now = useNow(60_000);

  if (!assignments.length) {
    return (
      <EmptyState title="No deadlines charted yet">
        <p>Connect Canvas, Todoist or a calendar feed, or drop in an .ics file, and your assignments will show up here.</p>
        <Button variant="primary" className="mt-3" onClick={() => openPanel("fleet")}>
          Open the Fleet Log
        </Button>
      </EmptyState>
    );
  }

  const sorted = sortItinerary(assignments, done);
  const pending = sorted.filter((a) => !isDone(a, done));
  const finished = sorted.filter((a) => isDone(a, done));

  const sailFor = (a: Assignment) => {
    const s = useSettings.getState();
    start({
      presetId: s.presetId,
      focusMinutes: s.presetId === "custom" ? s.customFocusMinutes : undefined,
      breakMinutes: s.presetId === "custom" ? s.customBreakMinutes : undefined,
      objective: a.title,
      assignmentId: a.id,
    });
    onClose();
  };

  return (
    <div className="space-y-5">
      {BUCKETS.map((b) => {
        const items = pending.filter((a) => dueBucket(a.dueAt, now) === b.id);
        if (!items.length) return null;
        return (
          <section key={b.id}>
            <h3 className={cx("mb-2 font-display text-sm font-extrabold tracking-wide uppercase", b.id === "overdue" ? "text-coral-700" : "text-ink/60")}>
              {b.label} <span className="text-ink/40">· {items.length}</span>
            </h3>
            <ul className="space-y-1.5">
              {items.map((a) => (
                <AssignmentRow key={a.id} a={a} done={false} now={now} onToggle={() => toggleDone(a.id)} onSail={phase === "docked" ? () => sailFor(a) : undefined} />
              ))}
            </ul>
          </section>
        );
      })}
      {!pending.length && <EmptyState title="All caught up!">Every charted deadline is done. Fair winds.</EmptyState>}
      {finished.length > 0 && (
        <section>
          <button type="button" className="mb-2 font-display text-sm font-extrabold text-ink/60 uppercase hover:text-ink" onClick={() => setShowDone(!showDone)}>
            {showDone ? "▾" : "▸"} Done · {finished.length}
          </button>
          {showDone && (
            <ul className="space-y-1.5">
              {finished.slice(0, 100).map((a) => (
                <AssignmentRow key={a.id} a={a} done now={now} onToggle={() => toggleDone(a.id)} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function AssignmentRow({ a, done, now, onToggle, onSail }: { a: Assignment; done: boolean; now: number; onToggle: () => void; onSail?: () => void }) {
  const color = a.courseColor ?? SOURCE_COLOR[a.source] ?? "#46609A";
  return (
    <li className={cx("flex items-center gap-3 rounded-xl border-2 border-ink/10 bg-cream-50 px-3 py-2", done && "opacity-60")}>
      <button
        type="button"
        onClick={onToggle}
        aria-label={done ? `Mark ${a.title} as not done` : `Mark ${a.title} as done`}
        className={cx("grid size-6 shrink-0 place-items-center rounded-md border-2 border-ink/50", done && "border-seafoam-700 bg-seafoam-500 text-white")}
      >
        {done && <IconCheck size={16} />}
      </button>
      <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className={cx("truncate font-bold", done && "line-through")}>
          {a.url ? (
            <a href={a.url} target="_blank" rel="noreferrer" className="hover:underline">
              {a.title}
            </a>
          ) : (
            a.title
          )}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink/65">
          {a.course && <span className="font-semibold">{a.course}</span>}
          <span className={cx(!done && a.dueAt !== null && a.dueAt < now && "font-bold text-coral-700")}>{formatDue(a.dueAt, now)}</span>
          {a.kind !== "assignment" && a.kind !== "task" && <Badge tone={a.kind === "exam" ? "coral" : "plain"}>{a.kind}</Badge>}
          {a.groupWeight !== null && <Badge tone="brass">{Math.round(a.groupWeight)}% of grade</Badge>}
          {a.priority !== null && a.priority >= 3 && <Badge tone="coral">P{5 - a.priority}</Badge>}
        </p>
      </div>
      {onSail && !done && (
        <Button size="sm" variant="primary" onClick={onSail} title="Start a voyage for this">
          <IconPlay size={14} /> Sail
        </Button>
      )}
    </li>
  );
}

const BAR_COLOR = "#2A9C82";

function Logbook() {
  const records = useVoyage((s) => s.records);
  const now = useNow(60_000);
  const completed = records.filter((r) => r.completed).length;
  const totalMinutes = records.reduce((a, r) => a + r.focusedMinutes, 0);
  const today = dayKey(now);
  const todayMinutes = records.filter((r) => dayKey(r.endedAt) === today).reduce((a, r) => a + r.focusedMinutes, 0);

  const days = Array.from({ length: 7 }, (_, i) => {
    const at = now - (6 - i) * DAY_MS;
    const key = dayKey(at);
    return {
      key,
      label: i === 6 ? "Today" : new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(at),
      minutes: records.filter((r) => dayKey(r.endedAt) === key).reduce((a, r) => a + r.focusedMinutes, 0),
    };
  });
  const max = Math.max(30, ...days.map((d) => d.minutes));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Today" value={formatMinutes(todayMinutes)} />
        <Stat label="Streak" value={`${streakDays(records, now)} days`} />
        <Stat label="Voyages completed" value={String(completed)} />
        <Stat label="All-time focus" value={formatMinutes(totalMinutes)} />
      </div>

      <Card>
        <h3 className="font-display font-extrabold">Focus minutes, last 7 days</h3>
        <div className="mt-3 flex h-36 items-end gap-[2px] border-b-2 border-ink/20" role="img" aria-label={days.map((d) => `${d.label}: ${d.minutes} minutes`).join(", ")}>
          {days.map((d) => (
            <div key={d.key} className="group relative flex h-full flex-1 flex-col justify-end">
              <div
                className="mx-auto w-full max-w-10 rounded-t-[4px] transition-[height] duration-500"
                style={{ height: `${(d.minutes / max) * 100}%`, minHeight: d.minutes ? 3 : 0, background: BAR_COLOR }}
              />
              <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 rounded-md bg-ink px-2 py-0.5 text-xs font-bold whitespace-nowrap text-cream-50 opacity-0 transition group-hover:opacity-100">
                {d.label}: {formatMinutes(d.minutes)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-[2px] text-center text-xs text-ink/60">
          {days.map((d) => (
            <span key={d.key} className={cx("flex-1", d.label === "Today" && "font-bold text-ink")}>
              {d.label}
            </span>
          ))}
        </div>
        <table className="sr-only">
          <caption>Focus minutes per day</caption>
          <tbody>
            {days.map((d) => (
              <tr key={d.key}>
                <th scope="row">{d.label}</th>
                <td>{d.minutes} minutes</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <section>
        <h3 className="mb-2 font-display font-extrabold">Recent voyages</h3>
        {records.length === 0 ? (
          <EmptyState title="The logbook is empty">Your voyages will be written here as you sail them.</EmptyState>
        ) : (
          <ul className="space-y-1.5">
            {[...records].reverse().slice(0, 25).map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl border-2 border-ink/10 bg-cream-50 px-3 py-2 text-sm">
                <Badge tone={r.completed ? "seafoam" : "coral"}>{r.completed ? "Completed" : "Ended early"}</Badge>
                <span className="font-bold tabular-nums">{formatMinutes(r.focusedMinutes)}</span>
                <span className="min-w-0 flex-1 truncate text-ink/70">{r.objective ?? shipOrStarter(r.shipId).name}</span>
                <span className="shrink-0 text-xs text-ink/50">{relativeTime(r.endedAt, now)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border-2 border-ink/15 bg-cream-50 px-3 py-2">
      <p className="text-xs font-bold text-ink/60">{label}</p>
      <p className="font-display text-xl font-extrabold tabular-nums">{value}</p>
    </div>
  );
}
