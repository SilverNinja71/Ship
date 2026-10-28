// The heads-up display over the scene: stats along the top, the panel
// toolbar, toasts, and the voyage dock along the bottom.

import { useEffect, useState } from "react";
import { levelForXp, xpForLevel } from "@ship/shared-types";
import { shipOrStarter } from "@ship/ship-theme-kit";
import { PANEL_KEYS } from "../hooks/useKeyboard.js";
import { formatNumber } from "../lib/format.js";
import { streakDays } from "../lib/voyageLogic.js";
import { useCrew } from "../stores/crewStore.js";
import { useEconomy } from "../stores/economyStore.js";
import { useLookout } from "../stores/lookoutStore.js";
import { dueNow, useRecall } from "../stores/recallStore.js";
import { useSettings } from "../stores/settingsStore.js";
import { useCustomizer } from "../stores/shipCustomizer.js";
import { useUi } from "../stores/uiStore.js";
import type { PanelId } from "../stores/uiStore.js";
import { useVoyage } from "../stores/voyageStore.js";
import { Doubloon, IconCabin, IconCards, IconCrew, IconDeck, IconFlame, IconGear, IconHammer, IconHelm, IconLog, IconScroll, IconShirt, IconSpyglass } from "./icons.js";
import { cx } from "./ui.js";
import { VoyageDock } from "./VoyageDock.js";

export const PANELS: { id: PanelId; label: string; icon: (p: { size?: number }) => React.ReactNode }[] = [
  { id: "helm", label: "Helm", icon: IconHelm },
  { id: "log", label: "Captain's Log", icon: IconLog },
  { id: "flashcards", label: "Flashcards", icon: IconCards },
  { id: "shipwright", label: "Shipwright", icon: IconHammer },
  { id: "wardrobe", label: "Wardrobe", icon: IconShirt },
  { id: "crew", label: "Crew", icon: IconCrew },
  { id: "fleet", label: "Fleet Log", icon: IconScroll },
  { id: "lookout", label: "Lookout", icon: IconSpyglass },
];

const shortcutFor = (id: PanelId) => Object.entries(PANEL_KEYS).find(([, p]) => p === id)?.[0]?.toUpperCase();

/** Re-renders every `ms` so clocks and "due" counts stay fresh. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

export function Hud() {
  return (
    <>
      <TopBar />
      {/* On phones the toolbar sits on top of the dock; from sm up each places itself. */}
      <div className="pointer-events-none absolute inset-x-2 bottom-2 z-20 flex flex-col items-center gap-2 sm:contents">
        <Toolbar />
        <VoyageDock />
      </div>
      <Toasts />
    </>
  );
}

function TopBar() {
  const xp = useEconomy((s) => s.xp);
  const doubloons = useEconomy((s) => s.doubloons);
  const shipId = useCustomizer((s) => s.activeShipId);
  const records = useVoyage((s) => s.records);
  const view = useSettings((s) => s.view);
  const setSettings = useSettings((s) => s.set);
  const openPanel = useUi((s) => s.openPanel);
  const now = useNow(60_000);
  const level = levelForXp(xp);
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  const streak = streakDays(records, now);
  const ship = shipOrStarter(shipId);

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-2 sm:p-3">
      <div className="pointer-events-auto flex min-w-0 shrink items-center gap-3 rounded-2xl border-2 border-ink bg-navy-900/90 px-2 py-1.5 text-cream-50 shadow-card backdrop-blur sm:px-3 sm:py-2">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-ink bg-brass-400 font-display text-lg font-extrabold text-ink" title={`Level ${level}`}>
          {level}
        </div>
        <div className="hidden min-w-0 sm:block">
          <p className="truncate font-display text-[15px] leading-tight font-extrabold">{ship.name}</p>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-2 w-28 overflow-hidden rounded-full bg-cream-50/20 sm:w-36" role="progressbar" aria-label="Experience" aria-valuenow={xp - from} aria-valuemin={0} aria-valuemax={to - from}>
              <div className="h-full rounded-full bg-seafoam-400" style={{ width: `${((xp - from) / (to - from)) * 100}%` }} />
            </div>
            <span className="hidden text-xs text-cream-50/70 sm:inline">
              {formatNumber(xp - from)} / {formatNumber(to - from)} XP
            </span>
          </div>
        </div>
      </div>

      <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2">
        <Pill title={streak ? `${streak}-day streak` : "Finish a voyage today to start a streak"}>
          <span className={streak ? "text-coral-400" : "text-cream-50/50"}>
            <IconFlame size={18} />
          </span>
          {streak}
        </Pill>
        <Pill title="Doubloons" onClick={() => openPanel("shipwright")}>
          <Doubloon size={18} />
          {formatNumber(doubloons)}
        </Pill>
        <button
          type="button"
          onClick={() => setSettings({ view: view === "deck" ? "quarters" : "deck" })}
          className="flex items-center gap-1.5 rounded-full border-2 border-ink bg-cream-50 px-3 py-1.5 font-display text-sm font-bold text-ink shadow-card hover:bg-white"
          title="Switch view (Q)"
        >
          {view === "deck" ? <IconCabin size={18} /> : <IconDeck size={18} />}
          <span className="hidden sm:inline">{view === "deck" ? "Quarters" : "Deck"}</span>
        </button>
        <StatusDots />
        <button
          type="button"
          onClick={() => openPanel("settings")}
          aria-label="Settings"
          title="Settings (,)"
          className="grid size-10 place-items-center rounded-full border-2 border-ink bg-navy-900/90 text-cream-50 shadow-card hover:bg-navy-800"
        >
          <IconGear />
        </button>
      </div>
    </header>
  );
}

function Pill({ children, title, onClick }: { children: React.ReactNode; title: string; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      title={title}
      className="flex items-center gap-1.5 rounded-full border-2 border-ink bg-navy-900/90 px-3 py-1.5 font-display text-sm font-extrabold text-cream-50 tabular-nums shadow-card"
    >
      {children}
    </Tag>
  );
}

function StatusDots() {
  const crew = useCrew((s) => s.status);
  const members = useCrew((s) => s.members.length);
  const lookout = useLookout((s) => s.connected);
  const openPanel = useUi((s) => s.openPanel);
  return (
    <div className="hidden items-center gap-1 rounded-full border-2 border-ink bg-navy-900/90 px-2 py-1.5 shadow-card md:flex">
      <button type="button" onClick={() => openPanel("crew")} className="flex items-center gap-1 rounded-full px-1.5 text-xs font-bold text-cream-50" title={crew === "online" ? `${members} aboard` : "Not in a crew room"}>
        <span className={cx("size-2.5 rounded-full", crew === "online" ? "bg-seafoam-400" : crew === "connecting" ? "bg-brass-400" : "bg-cream-50/30")} />
        Crew{crew === "online" ? ` ${members}` : ""}
      </button>
      <button type="button" onClick={() => openPanel("lookout")} className="flex items-center gap-1 rounded-full px-1.5 text-xs font-bold text-cream-50" title={lookout ? "The Lookout is watching" : "The Lookout extension isn't connected"}>
        <span className={cx("size-2.5 rounded-full", lookout ? "bg-seafoam-400" : "bg-cream-50/30")} />
        Lookout
      </button>
    </div>
  );
}

function Toolbar() {
  const open = useUi((s) => s.panel);
  const openPanel = useUi((s) => s.openPanel);
  const cards = useRecall((s) => s.cards);
  const now = useNow(30_000);
  const due = dueNow(cards, now).length;
  return (
    <nav
      aria-label="Ship's quarters"
      className="pointer-events-auto relative z-20 flex max-w-full gap-0.5 overflow-x-auto rounded-2xl border-2 border-ink bg-navy-900/90 p-1 shadow-card backdrop-blur sm:absolute sm:top-1/2 sm:left-3 sm:gap-1 sm:overflow-visible sm:p-1.5 sm:-translate-y-1/2 sm:flex-col"
    >
      {PANELS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => openPanel(id)}
          title={`${label} (${shortcutFor(id)})`}
          aria-label={label}
          className={cx(
            "group relative grid size-10 place-items-center rounded-xl text-cream-50 transition hover:bg-cream-50/15 sm:size-11",
            open === id && "bg-brass-400 text-ink hover:bg-brass-400",
          )}
        >
          <Icon size={22} />
          {id === "flashcards" && due > 0 && (
            <span className="absolute -top-1 -right-1 min-w-5 rounded-full border-2 border-ink bg-coral-500 px-1 text-[11px] font-extrabold text-white">{due > 99 ? "99+" : due}</span>
          )}
          <span className="pointer-events-none absolute left-full ml-2 hidden rounded-lg bg-ink px-2 py-1 text-xs font-bold whitespace-nowrap text-cream-50 opacity-0 transition group-hover:opacity-100 sm:block">
            {label}
          </span>
        </button>
      ))}
    </nav>
  );
}

function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);
  return (
    <div aria-live="polite" className="pointer-events-none absolute inset-x-0 top-20 z-40 flex flex-col items-center gap-2 px-3">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={cx(
            "pointer-events-auto max-w-md rounded-2xl border-2 border-ink px-4 py-2 text-left font-bold shadow-card",
            t.tone === "reward" && "bg-brass-300 text-ink",
            t.tone === "info" && "bg-cream-50 text-ink",
            t.tone === "warning" && "bg-coral-400 text-ink",
          )}
        >
          {t.tone === "reward" && <span className="mr-1.5 inline-block align-[-4px]"><Doubloon size={18} /></span>}
          {t.text}
        </button>
      ))}
    </div>
  );
}
