// Privacy Policy, Terms of Service, Cookie/Storage Policy, Free-Tier/Refund Notice,
// Accessibility Statement, Operator Contact Info, and one-click Account & Local Data Deletion flow.

import { useState } from "react";
import { useModalBehavior } from "../hooks/useModalBehavior.js";
import { deleteAllUserData, isGpcEnabled } from "../lib/accountData.js";
import { useUi } from "../stores/uiStore.js";
import { IconClose } from "./icons.js";
import { cx } from "./ui.js";

export type LegalTab = "privacy" | "terms" | "cookies" | "refunds" | "accessibility";

export function LegalModal({
  initialTab = "privacy",
  onClose,
}: {
  initialTab?: LegalTab;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<LegalTab>(initialTab);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const toast = useUi((s) => s.toast);
  const modalRef = useModalBehavior(onClose);
  const gpc = isGpcEnabled();

  const handleDeleteAll = async () => {
    setDeleting(true);
    try {
      const { wasSignedIn, deletedFirebaseAccount } = await deleteAllUserData();
      toast(
        deletedFirebaseAccount
          ? "Deleted your account, its cloud copy and this browser's study data. Reloading..."
          : wasSignedIn
            ? "Deleted your cloud copy and this browser's study data, and signed you out. Google wants a fresh log-in before deleting the account itself: log in again and repeat this. Reloading..."
            : "Cleared this browser's study data. Reloading...",
        "info",
      );
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      toast(`Nothing was deleted: ${e instanceof Error ? e.message : "the cloud copy couldn't be removed"}`, "warning");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Legal, Privacy & Data Controls"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[rgb(0_0_0_/_0.22)] p-4 backdrop-blur-[2px]"
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="modal-enter flex max-h-[88dvh] w-full max-w-xl flex-col rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3 font-serif text-[var(--page-ink)] shadow-sm outline-none"
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[12px] border border-[rgb(0_0_0_/_0.08)] bg-[var(--surface-1)] p-4">
          <div className="mb-3 flex items-center justify-between gap-2 border-b border-[rgb(0_0_0_/_0.1)] pb-3">
            <div>
              <h2 className="text-lg font-bold text-[var(--page-ink)]">Privacy, Terms &amp; Accessibility</h2>
              <p className="text-xs text-[var(--muted-ink)]">Ship · Pwedo Pomo Studio</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close legal dialog"
              className="grid size-8 place-items-center rounded-full text-[var(--muted-ink)] transition hover:bg-[rgb(0_0_0_/_0.06)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
            >
              <IconClose size={15} />
            </button>
          </div>

          <div role="tablist" className="mb-3 flex flex-wrap gap-1 rounded-xl border border-[rgb(0_0_0_/_0.1)] bg-[var(--surface-2)] p-1 text-xs">
            {(
              [
                { id: "privacy", label: "Privacy Policy" },
                { id: "terms", label: "Terms of Service" },
                { id: "cookies", label: "Cookies & Storage" },
                { id: "refunds", label: "Free Tier & Contact" },
                { id: "accessibility", label: "Accessibility" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
                className={cx(
                  "rounded-lg px-2.5 py-1 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]",
                  tab === item.id
                    ? "bg-[var(--surface-1)] font-bold text-[var(--page-ink)]"
                    : "text-[var(--muted-ink)] hover:underline underline-offset-4",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 text-sm leading-relaxed text-[var(--page-ink)]">
            {tab === "privacy" && (
              <>
                <p><strong>Minimal Data Collection:</strong> Ship stores your flashcards, study sheets, Pomodoro logs, and Banana Planna schedules in your browser (<code>localStorage</code> and <code>IndexedDB</code>). We do not sell, rent, or run third-party advertising trackers on your study data.</p>
                <p><strong>Obsidian Vaults:</strong> If you open an Obsidian vault, Ship reads its Markdown files inside your browser and writes only clippings and its own <code>Ship</code> folder there. Nothing from your vault is sent to Ship&apos;s operator, and you can close the vault at any time in the Note Nook.</p>
                <p><strong>Bottle Bay (Shared Anonymously):</strong> When you choose to set a bottle afloat, its title, link, subject, tags, description and (for a deck) its cards are stored in Firestore, where every logged-in sailor can read them. A bottle holds no name, email or account id, and links have tracking and sharer codes removed. Your account keeps a private note of which bottles are yours, so you can take them back; Ship&apos;s operator could see that link in the database, but other sailors can&apos;t. Reports are counted, and the database records who reported so each sailor reports once; nobody can read those records through Ship. Deleting your account takes your bottles back too.</p>
                <p><strong>Cloud Sync When You Log In:</strong> If you log in with Google, Ship also keeps a copy of your planner, timer history, flashcards, study sheets and uploaded notes, coins, unlocks and timer settings in Google Cloud Firestore (part of Firebase), stored under your account so that only you can read or change it. Your Gemini key, Canvas and Todoist logins, calendar feed links, sound settings and notes read from an Obsidian vault are never uploaded. Signing out stops syncing. Delete account &amp; data (below) erases the cloud copy too.</p>
                <p><strong>Google Sign-In &amp; Drive:</strong> Logging in with Google (Firebase Authentication) shares your basic profile (name and email) with Ship. If you connect your own Google Drive client ID, Ship reads only the Drive files you authorize, to import them. If you use your own Gemini API key, prompts go directly from your browser to Google&apos;s Gemini API.</p>
                <p><strong>Age Gate:</strong> By creating an account or signing in with Google, you confirm that you are 13 years or older (or using Ship with parent/school consent).</p>
              </>
            )}

            {tab === "terms" && (
              <>
                <p><strong>Acceptable Use:</strong> Ship Pwedo Pomo is provided as a calm student productivity and active-recall study workspace. Please upload only study materials you own or have permission to study from.</p>
                <p><strong>Service Availability:</strong> Your progress lives in your browser, and in your Google account if you log in. Keep occasional backups (Settings → Download a backup) before clearing browser data.</p>
                <p><strong>No Unverified Medical or Academic Guarantees:</strong> Study recommendations and spaced-repetition intervals are educational helpers and carry no academic grade warranty.</p>
              </>
            )}

            {tab === "cookies" && (
              <>
                <p><strong>Essential Browser Storage Only:</strong> Ship uses browser <code>localStorage</code> (under <code>ship:*</code> keys) and <code>IndexedDB</code> (<code>ship-notes</code>, and <code>ship-vault</code> for the vault folder you open) strictly to remember your Pomodoro preferences, uploaded notes, tutorial progress, your Firebase Authentication session and, when you&apos;re logged in, what cloud sync last saved.</p>
                <p><strong>Global Privacy Control (GPC):</strong> Ship automatically detects browser <code>Sec-GPC</code> / <code>navigator.globalPrivacyControl</code> signals{gpc ? " (currently active in your browser)" : ""} and defaults to strictly essential local storage with zero tracking cookies.</p>
                <p><strong>Consent Choice:</strong> Choosing &ldquo;Essential Only&rdquo; or &ldquo;Accept Storage&rdquo; lets you keep core session state without third-party analytics cookies.</p>
              </>
            )}

            {tab === "refunds" && (
              <>
                <p><strong>100% Free &amp; Open Access (Refund Policy):</strong> Ship Pwedo Pomo charges zero subscription fees, zero in-app purchases, and collects no payment card data. Any virtual doubloons shown inside the study workspace are earned through study focus only and have no monetary value, so no refunds apply.</p>
                <p><strong>Operator &amp; Contact Details:</strong> Ship · Pwedo Pomo Studio · Operated by Antonio Lin · Hosted on Firebase (<code>ship-pwedo-pomo.web.app</code>). For privacy or data inquiries, use your GitHub repository issues (<code>SilverNinja71/Ship</code>) or delete all local/account data directly below.</p>
              </>
            )}

            {tab === "accessibility" && (
              <>
                <p><strong>WCAG 2.2 AA Commitment:</strong> Ship is built to follow WCAG 2.2 Level AA guidelines across all 10 study themes, maintaining accessible text contrast ratios, semantic HTML landmarks, descriptive alt text, and visible keyboard focus indicators (<code>:focus-visible</code>).</p>
                <p><strong>Keyboard &amp; Motion Support:</strong> Every panel, modal, sticker picker, and study control works without a mouse (<code>Tab</code>, <code>Enter</code>, <code>Space</code>, <code>Escape</code> to close modals with automatic focus restoration, <code>Q</code> to toggle deck/desk, <code>F</code> for flashcards). All animations automatically turn off when your device enables <code>prefers-reduced-motion</code>.</p>
                <p><strong>No Overlay Widgets &amp; Direct Support:</strong> We maintain native HTML/ARIA semantics rather than third-party accessibility overlay widgets. If you encounter any barrier or screen-reader issue, please report it via GitHub (<code>SilverNinja71/Ship</code>).</p>
              </>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[rgb(0_0_0_/_0.1)] pt-3 text-xs">
            <span className="text-[var(--muted-ink)]">Unsubscribe / Data Removal</span>
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => void handleDeleteAll()}
                  className="rounded-full border border-[rgb(0_0_0_/_0.14)] bg-[#FDE8E4] px-3 py-1 font-bold text-[#8A3B31] transition hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
                >
                  {deleting ? "Deleting..." : "Confirm Delete All Data"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="text-[var(--muted-ink)] hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="font-semibold text-[#8A3B31] hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
              >
                Delete my account & all local data
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
