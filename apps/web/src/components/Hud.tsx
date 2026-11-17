// Minimal Mr. Tiny Studio HUD over the scene: a clean top bar with essential
// controls, toasts, and the compact Pwedo Pomo timer pill at the bottom.

import { useEffect, useState } from "react";
import { useFleet } from "../stores/fleetStore.js";
import { useLookout } from "../stores/lookoutStore.js";
import { dueNow, useRecall } from "../stores/recallStore.js";
import { useSettings } from "../stores/settingsStore.js";
import { useUi } from "../stores/uiStore.js";
import type { PanelId } from "../stores/uiStore.js";
import { PastelMinionBadge } from "./PastelMinionBadge.js";
import {
  IconCabin,
  IconCalendar,
  IconCards,
  IconCrew,
  IconDeck,
  IconGear,
  IconHammer,
  IconHelm,
  IconLog,
  IconScroll,
  IconShirt,
  IconSpyglass,
} from "./icons.js";
import { cx } from "./ui.js";
import { VoyageDock } from "./VoyageDock.js";

/** Kept exported for SettingsPanel keyboard-shortcut reference. */
export const PANELS: { id: PanelId; label: string; icon: (p: { size?: number }) => React.ReactNode }[] = [
  { id: "helm", label: "Helm", icon: IconHelm },
  { id: "planner", label: "Banana Planna", icon: IconCalendar },
  { id: "log", label: "Study Sheets", icon: IconLog },
  { id: "flashcards", label: "Flashcards", icon: IconCards },
  { id: "shipwright", label: "Shipwright", icon: IconHammer },
  { id: "wardrobe", label: "Wardrobe", icon: IconShirt },
  { id: "crew", label: "Crew", icon: IconCrew },
  { id: "fleet", label: "Fleet Log", icon: IconScroll },
  { id: "lookout", label: "Lookout", icon: IconSpyglass },
];

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
  const [loginOpen, setLoginOpen] = useState(false);
  return (
    <>
      <TopBar onOpenLogin={() => setLoginOpen(true)} />
      <div className="pointer-events-none absolute inset-x-3 bottom-4 z-20 flex flex-col items-center gap-2">
        <VoyageDock />
      </div>
      <Toasts />
      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}
    </>
  );
}

const SOFT_PILL =
  "border-0 bg-transparent font-serif font-normal tracking-wide text-[#6D655C] shadow-none transition hover:underline underline-offset-4 focus:outline-none";

function TopBar({ onOpenLogin }: { onOpenLogin: () => void }) {
  const view = useSettings((s) => s.view);
  const setSettings = useSettings((s) => s.set);
  const openPanel = useUi((s) => s.openPanel);
  const cards = useRecall((s) => s.cards);
  const driveStatus = useFleet((s) => s.statuses["google-drive"]);
  const now = useNow(30_000);
  const due = dueNow(cards, now).length;

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-center justify-between gap-3 p-3 sm:px-6 sm:py-4">
      <nav aria-label="Primary controls" className="pointer-events-auto flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => openPanel("planner")}
          className={cx("flex items-center gap-1.5 py-1 text-sm", SOFT_PILL)}
          title="Banana Planna (P)"
        >
          <IconCalendar size={15} />
          <span>Banana Planna</span>
        </button>

        <button
          type="button"
          onClick={() => openPanel("log")}
          className={cx("flex items-center gap-1.5 py-1 text-sm", SOFT_PILL)}
          title="Study Sheets & Active Recall (L)"
        >
          <IconLog size={15} />
          <span>Study Sheets</span>
        </button>

        <button
          type="button"
          onClick={() => openPanel("flashcards")}
          className={cx("relative flex items-center gap-1.5 py-1 text-sm", SOFT_PILL)}
          title="Flashcards (F)"
        >
          <IconCards size={15} />
          <span className="hidden sm:inline">Flashcards</span>
          {due > 0 && (
            <span className="rounded-full bg-[#FDE2DD] px-1.5 py-0.5 text-[11px] text-[#8A4A40] tabular-nums">
              {due > 99 ? "99+" : due}
            </span>
          )}
        </button>
      </nav>

      <div className="pointer-events-auto flex items-center gap-4">
        <StatusDots />

        <button
          type="button"
          onClick={() => setSettings({ view: view === "deck" ? "quarters" : "deck" })}
          className={cx("flex items-center gap-1.5 py-1 text-sm", SOFT_PILL)}
          title="Switch view (Q)"
        >
          {view === "deck" ? <IconCabin size={15} /> : <IconDeck size={15} />}
          <span className="hidden sm:inline">{view === "deck" ? "Desk" : "Ship"}</span>
        </button>

        <button
          type="button"
          onClick={onOpenLogin}
          className={cx("py-1 text-sm", SOFT_PILL)}
          title="Sign in & sync across devices"
        >
          {driveStatus?.connected ? "Synced ✓" : "Log in"}
        </button>

        <button
          type="button"
          onClick={() => openPanel("settings")}
          aria-label="Settings"
          title="Settings (,)"
          className={cx("flex items-center gap-1 py-1 text-sm", SOFT_PILL)}
        >
          <IconGear size={16} />
        </button>
      </div>
    </header>
  );
}

function LoginModal({ onClose }: { onClose: () => void }) {
  const driveClientId = useFleet((s) => s.settings.googleDrive?.clientId ?? "");
  const setDriveClientId = useFleet((s) => s.setDriveClientId);
  const connectDrive = useFleet((s) => s.connectDrive);
  const driveStatus = useFleet((s) => s.statuses["google-drive"]);
  const toast = useUi((s) => s.toast);
  const [name, setName] = useState(() => localStorage.getItem("ship:profile-name") ?? "");
  const [email, setEmail] = useState(() => localStorage.getItem("ship:profile-email") ?? "");

  const saveProfile = () => {
    localStorage.setItem("ship:profile-name", name.trim());
    localStorage.setItem("ship:profile-email", email.trim());
    toast("Saved profile locally!", "info");
    onClose();
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Log in" className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[#6D655C]/20 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-sm rounded-3xl bg-[#FFFDF7] p-6 font-serif text-[#6D655C] shadow-[4px_4px_0_#EAE5DA]">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <PastelMinionBadge costume="banana" size={44} />
            <div>
              <h2 className="text-lg tracking-wide text-[#5D564E]">Log in &amp; Sync</h2>
              <p className="text-xs text-[#8E887F]">Keep your sheets and Banana Planna together</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-[#8E887F] hover:underline">
            Close
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs tracking-wider text-[#8E887F]">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name..."
              className="w-full border-b border-[#A29C93]/40 bg-transparent py-1 focus:border-[#6D655C] focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs tracking-wider text-[#8E887F]">Email (for monthly reports)</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border-b border-[#A29C93]/40 bg-transparent py-1 focus:border-[#6D655C] focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs tracking-wider text-[#8E887F]">Google Drive OAuth Client ID (optional)</span>
            <input
              value={driveClientId}
              onChange={(e) => setDriveClientId(e.target.value)}
              placeholder="123456.apps.googleusercontent.com"
              className="w-full border-b border-[#A29C93]/40 bg-transparent py-1 text-xs focus:border-[#6D655C] focus:outline-none"
            />
          </label>
        </div>

        <div className="mt-5 flex items-center justify-between gap-2 text-sm">
          <button
            type="button"
            onClick={() => void connectDrive()}
            className="text-[#5D564E] hover:underline underline-offset-4"
          >
            {driveStatus?.connected ? "Google Drive Connected ✓" : "Sign in with Google Drive"}
          </button>
          <button type="button" onClick={saveProfile} className="rounded-full bg-[#FFF3A8] px-4 py-1 text-[#5D564E] hover:underline underline-offset-4">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusDots() {
  const lookout = useLookout((s) => s.connected);
  const openPanel = useUi((s) => s.openPanel);
  return (
    <div className="hidden items-center md:flex">
      <button
        type="button"
        onClick={() => openPanel("lookout")}
        className="flex items-center gap-1.5 px-1.5 py-1 font-serif text-xs font-bold text-[#6D655C] transition hover:text-[#4F4841] hover:underline underline-offset-4 focus:outline-none"
        title={lookout ? "Lookout connected" : "Lookout extension"}
      >
        <span className={cx("size-2 rounded-full", lookout ? "bg-[#7FC8B2]" : "bg-[#C7BFB3]")} />
        Lookout
      </button>
    </div>
  );
}

function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-16 z-40 flex flex-col items-center gap-2 px-3">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={cx(
            "pointer-events-auto max-w-md rounded-2xl border border-[#A29C93]/60 px-4 py-2 text-left text-sm font-bold text-[#6D655C] shadow-[3px_3px_0_#EAE5DA] focus:outline-none",
            t.tone === "reward" && "bg-[#FFF7D6]",
            t.tone === "info" && "bg-[#FAF6E8]",
            t.tone === "warning" && "bg-[#FDE8E4]",
          )}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}
