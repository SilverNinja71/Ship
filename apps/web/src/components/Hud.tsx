// Minimal Pwedo Pomo Studio HUD over the scene: a clean top bar with essential
// controls, toasts, and the compact Pwedo Pomo timer pill at the bottom.

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { useModalBehavior } from "../hooks/useModalBehavior.js";
import {
  dismissSignInPromptStorage,
  getSavedProfile,
  hasSeenTutorial,
  isSignInPromptDismissed,
  saveLocalProfile,
} from "../lib/accountData.js";
import { retryCloudSync } from "../hooks/useCloudSync.js";
import { signInWithGoogle, signOutGoogle, subscribeAuthUser } from "../lib/firebase.js";
import { useFleet } from "../stores/fleetStore.js";
import { useLookout } from "../stores/lookoutStore.js";
import { plannedToday, usePlanner } from "../stores/plannerStore.js";
import { dueNow, useRecall } from "../stores/recallStore.js";
import { useSettings } from "../stores/settingsStore.js";
import { useSync } from "../stores/syncStore.js";
import type { SyncState } from "../stores/syncStore.js";
import { useUi } from "../stores/uiStore.js";
import type { PanelId } from "../stores/uiStore.js";
import { LegalModal, type LegalTab } from "./LegalModal.js";
import { OnboardingModal, SignInPromptToast } from "./OnboardingModal.js";
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
  IconNotebook,
  IconBottle,
  IconScroll,
  IconShirt,
  IconSpyglass,
  IconSwap,
} from "./icons.js";
import { cx } from "./ui.js";
import { VoyageDock } from "./VoyageDock.js";

/** Kept exported for SettingsPanel keyboard-shortcut reference. */
export const PANELS: { id: PanelId; label: string; icon: (p: { size?: number }) => React.ReactNode }[] = [
  { id: "helm", label: "Helm", icon: IconHelm },
  { id: "planner", label: "Banana Planna", icon: IconCalendar },
  { id: "log", label: "Study Sheets", icon: IconLog },
  { id: "notes", label: "Note Nook", icon: IconNotebook },
  { id: "bay", label: "Bottle Bay", icon: IconBottle },
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
  const loginOpen = useUi((s) => s.loginOpen);
  const setLoginOpen = useUi((s) => s.setLoginOpen);
  const [tutorialOpen, setTutorialOpen] = useState(() => !hasSeenTutorial());
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);

  useEffect(() => subscribeAuthUser(setAuthUser), []);

  useEffect(() => {
    if (authUser) {
      setShowSignInPrompt(false);
      return;
    }
    const triggerPrompt = () => {
      if (!isSignInPromptDismissed()) setShowSignInPrompt(true);
    };

    const unsubPlanner = usePlanner.subscribe((state, prev) => {
      if (
        state.weeklyCells !== prev.weeklyCells ||
        state.weeklyTitle !== prev.weeklyTitle ||
        state.weeklyGoal !== prev.weeklyGoal ||
        state.habits !== prev.habits ||
        state.pomodoros !== prev.pomodoros ||
        state.monthCells !== prev.monthCells ||
        state.monthNotes !== prev.monthNotes
      ) {
        triggerPrompt();
      }
    });
    const unsubRecall = useRecall.subscribe((state, prev) => {
      if (
        state.blurts.length > prev.blurts.length ||
        state.decks.length > prev.decks.length ||
        state.cards.length > prev.cards.length
      ) {
        triggerPrompt();
      }
    });
    const unsubFleet = useFleet.subscribe((state, prev) => {
      if (state.notes.length > prev.notes.length || state.assignments.length > prev.assignments.length) {
        triggerPrompt();
      }
    });

    return () => {
      unsubPlanner();
      unsubRecall();
      unsubFleet();
    };
  }, [authUser]);

  const dismissSignInPrompt = () => {
    setShowSignInPrompt(false);
    dismissSignInPromptStorage();
  };

  return (
    <>
      <TopBar authUser={authUser} onOpenLogin={() => setLoginOpen(true)} onOpenTutorial={() => setTutorialOpen(true)} />
      <div className="pointer-events-none absolute inset-x-3 bottom-4 z-20 flex flex-col items-center gap-2">
        <VoyageDock />
      </div>
      <Toasts />
      {showSignInPrompt && !authUser && !loginOpen && !tutorialOpen && (
        <SignInPromptToast
          onSignIn={() => {
            setShowSignInPrompt(false);
            setLoginOpen(true);
          }}
          onDismiss={dismissSignInPrompt}
        />
      )}
      {tutorialOpen && (
        <OnboardingModal
          onClose={() => setTutorialOpen(false)}
          onOpenLogin={() => setLoginOpen(true)}
          signedIn={Boolean(authUser)}
        />
      )}
      {loginOpen && <LoginModal authUser={authUser} onClose={() => setLoginOpen(false)} />}
    </>
  );
}

const SOFT_PILL =
  "border-0 bg-transparent font-serif font-normal tracking-wide text-[var(--page-ink)] shadow-none transition hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]";

function TopBar({
  authUser,
  onOpenLogin,
  onOpenTutorial,
}: {
  authUser: User | null;
  onOpenLogin: () => void;
  onOpenTutorial: () => void;
}) {
  const view = useSettings((s) => s.view);
  const setSettings = useSettings((s) => s.set);
  const openPanel = useUi((s) => s.openPanel);
  const cards = useRecall((s) => s.cards);
  const sync = useSync();
  const now = useNow(30_000);
  const due = dueNow(cards, now).length;
  const plannedTodayYet = usePlanner((s) => plannedToday(s));

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-center justify-between gap-3 p-3 sm:px-6 sm:py-4">
      <nav aria-label="Primary controls" className="pointer-events-auto flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => openPanel("planner")}
          className={cx("flex items-center gap-1.5 py-1 text-sm", SOFT_PILL)}
          title={plannedTodayYet ? "Banana Planna (P)" : "Banana Planna (P): take 10 minutes to plan today"}
        >
          <span className="relative">
            <IconCalendar size={15} />
            {!plannedTodayYet && <span className="absolute -right-1 -top-1 size-2 rounded-full bg-[#E8B84A] ring-2 ring-[var(--page-bg)]" aria-hidden="true" />}
          </span>
          <span>Banana Planna</span>
          {!plannedTodayYet && <span className="sr-only">(not planned yet today)</span>}
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
          onClick={() => openPanel("notes")}
          className={cx("flex items-center gap-1.5 py-1 text-sm", SOFT_PILL)}
          title="Note Nook: your notes and Obsidian vault (N)"
          aria-label="Note Nook"
        >
          <IconNotebook size={15} />
          <span className="hidden sm:inline">Note Nook</span>
        </button>

        <button
          type="button"
          onClick={() => openPanel("bay")}
          className={cx("flex items-center gap-1.5 py-1 text-sm", SOFT_PILL)}
          title="Bottle Bay: study sources and decks shared anonymously (B)"
          aria-label="Bottle Bay"
        >
          <IconBottle size={15} />
          <span className="hidden sm:inline">Bottle Bay</span>
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

        <button
          type="button"
          onClick={() => openPanel("wardrobe")}
          className={cx("py-1 text-sm", SOFT_PILL)}
          title="Kawaii Themes & Crew Wardrobe"
        >
          <span>Themes</span>
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
          <IconSwap swapKey={view}>
            {view === "deck" ? <IconCabin size={15} /> : <IconDeck size={15} />}
          </IconSwap>
          <span className="hidden sm:inline">{view === "deck" ? "Desk" : "Ship"}</span>
        </button>

        <button
          type="button"
          onClick={onOpenLogin}
          className={cx("py-1 text-sm", SOFT_PILL)}
          title={authUser ? syncSentence(sync) : "Log in with Google to keep your progress in your account and pick it up on any device"}
        >
          {authUser ? `${authUser.displayName?.split(" ")[0] ?? "Signed in"} ${syncMark(sync.status)}` : "Log in"}
        </button>

        <button
          type="button"
          onClick={onOpenTutorial}
          className={cx("py-1 text-sm", SOFT_PILL)}
          title="First-visit tutorial & guide"
          aria-label="Tutorial"
        >
          ?
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

function LoginModal({ authUser, onClose }: { authUser: User | null; onClose: () => void }) {
  const modalRef = useModalBehavior(onClose);
  const driveClientId = useFleet((s) => s.settings.googleDrive?.clientId ?? "");
  const setDriveClientId = useFleet((s) => s.setDriveClientId);
  const connectDrive = useFleet((s) => s.connectDrive);
  const driveStatus = useFleet((s) => s.statuses["google-drive"]);
  const toast = useUi((s) => s.toast);
  const [initialProfile] = useState(() => getSavedProfile());
  const [name, setName] = useState(() => authUser?.displayName ?? initialProfile.name);
  const [email, setEmail] = useState(() => authUser?.email ?? initialProfile.email);
  const [authBusy, setAuthBusy] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [legalTab, setLegalTab] = useState<LegalTab | null>(null);

  const handleGoogleSignIn = async () => {
    if (!consentChecked) {
      toast("Please confirm age (13+) and Privacy Policy consent before signing in.", "warning");
      return;
    }
    setAuthBusy(true);
    try {
      const user = await signInWithGoogle();
      setName(user.displayName ?? "");
      setEmail(user.email ?? "");
      toast(`Signed in as ${user.displayName ?? user.email ?? "Google user"}!`, "reward");
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not sign in with Google.";
      toast(msg, "warning");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleGoogleSignOut = async () => {
    setAuthBusy(true);
    try {
      await signOutGoogle();
      toast("Signed out. This browser keeps its copy; your account keeps its own.", "info");
    } finally {
      setAuthBusy(false);
    }
  };

  const saveProfile = () => {
    saveLocalProfile(name, email);
    toast("Saved profile locally!", "info");
    onClose();
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Log in" className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[rgb(0_0_0_/_0.22)] p-4 backdrop-blur-[2px]">
      <div ref={modalRef} tabIndex={-1} className="modal-enter w-full max-w-sm rounded-3xl border border-[rgb(0_0_0_/_0.12)] bg-[#FFFDF7] p-6 font-serif text-[#5C544B] shadow-sm outline-none">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <PastelMinionBadge costume="banana" size={44} />
            <div>
              <h2 className="text-lg tracking-wide text-[#4D453E]">Log in &amp; Sync</h2>
              <p className="text-xs text-[#6B635B]">Keep your sheets and Banana Planna together</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-[#6B635B] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5C544B]">
            Close
          </button>
        </div>

        <div className="mb-4 space-y-2.5 rounded-[14px] border border-[rgb(0_0_0_/_0.08)] bg-[#FAF6E8] p-3 text-sm">
          {authUser ? (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-[#4D453E]">{authUser.displayName ?? "Google Account"}</p>
                <p className="truncate text-xs text-[#6B635B]">{authUser.email}</p>
              </div>
              <button
                type="button"
                disabled={authBusy}
                onClick={() => void handleGoogleSignOut()}
                className="shrink-0 text-xs text-[#6B635B] hover:text-[#4D453E] hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5C544B]"
              >
                Sign out
              </button>
            </div>
          ) : (
            <>
              <p className="text-xs leading-snug text-[#5C544B]">
                Logging in keeps a copy of your progress in your Google account, so it follows you to any device you log in on.
              </p>
              <label className="flex cursor-pointer items-start gap-2 text-xs leading-snug text-[#5C544B]">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                  className="mt-0.5 accent-[#6B635B]"
                />
                <span>
                  I confirm I am 13+ (or have parent/school permission) and agree to the{" "}
                  <button
                    type="button"
                    onClick={() => setLegalTab("privacy")}
                    className="font-semibold underline underline-offset-2"
                  >
                    Privacy Policy
                  </button>{" "}
                  &amp;{" "}
                  <button
                    type="button"
                    onClick={() => setLegalTab("terms")}
                    className="font-semibold underline underline-offset-2"
                  >
                    Terms
                  </button>
                  .
                </span>
              </label>
              <button
                type="button"
                disabled={authBusy || !consentChecked}
                onClick={() => void handleGoogleSignIn()}
                className="w-full rounded-full border border-[rgb(0_0_0_/_0.12)] bg-[#FFF3A8] px-4 py-2 text-center font-semibold text-[#4D453E] transition hover:bg-[#FCEB8B] hover:underline underline-offset-4 disabled:cursor-not-allowed disabled:bg-[#F3EDE0] disabled:text-[#6B635B]"
              >
                {authBusy ? "Signing in..." : "Sign in with Google"}
              </button>
            </>
          )}
        </div>

        {authUser && <SyncStatusCard />}

        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs tracking-wider text-[#6B635B]">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name..."
              className="w-full border-b border-[rgb(0_0_0_/_0.16)] bg-transparent py-1 focus:border-[#5C544B] focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs tracking-wider text-[#6B635B]">Email (for monthly reports)</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border-b border-[rgb(0_0_0_/_0.16)] bg-transparent py-1 focus:border-[#5C544B] focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs tracking-wider text-[#6B635B]">Google Drive client ID (optional, for importing Google Docs)</span>
            <input
              value={driveClientId}
              onChange={(e) => setDriveClientId(e.target.value)}
              placeholder="123456.apps.googleusercontent.com"
              className="w-full border-b border-[rgb(0_0_0_/_0.16)] bg-transparent py-1 text-xs focus:border-[#5C544B] focus:outline-none"
            />
          </label>
        </div>

        <div className="mt-5 flex items-center justify-between gap-2 text-sm">
          <button
            type="button"
            onClick={() => void connectDrive()}
            className="text-[#4D453E] hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5C544B]"
          >
            {driveStatus?.connected ? "Google Drive connected ✓" : "Connect Google Drive"}
          </button>
          <button type="button" onClick={saveProfile} className="rounded-full border border-[rgb(0_0_0_/_0.12)] bg-[#FFF3A8] px-4 py-1 text-[#4D453E] hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5C544B]">
            Save
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-[rgb(0_0_0_/_0.08)] pt-2.5 text-xs text-[#6B635B]">
          <button type="button" onClick={() => setLegalTab("privacy")} className="hover:underline underline-offset-4">
            Privacy &amp; Terms
          </button>
          <button type="button" onClick={() => setLegalTab("refunds")} className="text-[#8A3B31] hover:underline underline-offset-4">
            Delete account &amp; data
          </button>
        </div>
      </div>
      {legalTab && <LegalModal initialTab={legalTab} onClose={() => setLegalTab(null)} />}
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

/** The mark after a signed-in name in the top bar. */
function syncMark(status: SyncState["status"]): string {
  if (status === "synced") return "✓";
  if (status === "error" || status === "paused" || status === "needs-choice") return "!";
  return "…";
}

/** One sentence on where cloud sync stands, for the top bar's tooltip and the Log in window. */
function syncSentence({ status, message, lastSyncedAt }: Pick<SyncState, "status" | "message" | "lastSyncedAt">): string {
  switch (status) {
    case "synced":
      return lastSyncedAt
        ? `Synced with your Google account at ${new Date(lastSyncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
        : "Synced with your Google account.";
    case "saving":
      return "Saving to your Google account…";
    case "needs-choice":
      return "Choose which progress to keep before syncing starts.";
    case "paused":
    case "error":
      return message ?? "Sync isn't running.";
    default:
      return "Connecting to your Google account…";
  }
}

function SyncStatusCard() {
  const sync = useSync();
  const canRetry = sync.status === "error" || sync.status === "paused";
  return (
    <div role="status" className="mb-4 space-y-1.5 rounded-[14px] border border-[rgb(0_0_0_/_0.08)] bg-[#FAF6E8] p-3 text-xs leading-snug">
      <p className={cx("font-semibold", sync.status === "error" ? "text-[#8A3B31]" : "text-[#4D453E]")}>{syncSentence(sync)}</p>
      <p className="text-[#6B635B]">
        Syncs your planner, timer history, flashcards, Study Sheets, coins, unlocks and timer settings. API keys, Canvas and Todoist logins, calendar links, sound
        settings and notes from an Obsidian vault stay on this device.
      </p>
      {sync.tooBig.length > 0 && <p className="text-[#8A3B31]">Too big to sync, so kept on this device only: {sync.tooBig.join(", ")}.</p>}
      {canRetry && (
        <button type="button" onClick={retryCloudSync} className="font-semibold text-[#4D453E] underline underline-offset-4">
          {sync.status === "paused" ? "Choose what to keep" : "Try again"}
        </button>
      )}
    </div>
  );
}
