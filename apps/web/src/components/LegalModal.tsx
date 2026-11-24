// Privacy Policy, Terms of Service, Community Rules, Cookie/Storage Policy, Free-Tier/Refund Notice,
// Accessibility Statement, Operator Contact Info, and one-click Account & Local Data Deletion flow.

import { useState } from "react";
import { useModalBehavior } from "../hooks/useModalBehavior.js";
import { deleteAllUserData, isGpcEnabled } from "../lib/accountData.js";
import { useUi } from "../stores/uiStore.js";
import { IconClose } from "./icons.js";
import { cx } from "./ui.js";

export type LegalTab = "privacy" | "terms" | "community" | "cookies" | "refunds" | "accessibility";

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
      // Part of the cloud copy may already be gone (PartlyDeleted says what): then "Nothing was deleted" would be wrong.
      const partly = e instanceof Error && e.name === "PartlyDeleted";
      toast(partly ? e.message : `Nothing was deleted: ${e instanceof Error ? e.message : "the cloud copy couldn't be removed"}`, "warning");
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
                { id: "community", label: "Community Rules" },
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
                <p><strong>Bottle Bay (Shared Anonymously):</strong> When you choose to set a bottle afloat, its title, link, subject, tags, description and (for a deck) its cards are stored in Firestore, where every logged-in sailor can read them. A bottle holds no name, email or account id, and links have tracking and sharer codes removed. Your account keeps a private note of which bottles are yours, so you can take them back; Ship&apos;s operator could see that link in the database, but other sailors can&apos;t. Taking a bottle back deletes its cards and empties it, leaving only an empty marker so the same bottle can never come back with different contents. Reports are counted, and the database records who reported so each sailor reports once, and when you last reported a bottle (one every 30 seconds); nobody can read those records through Ship. A bottle reported three times is hidden: only its sharer can still see it, and a hidden deck&apos;s cards are deleted. Deleting your account takes your bottles back too.</p>
                <p><strong>Study Rooms (Shared With Your Room):</strong> When you open or join a study room, Ship stores in Firestore the room&apos;s made-up name and subject, and for each sailor a made-up nickname, a character and accessory, whether they&apos;re focusing, on a break or in port and how long is left, their latest cheer or sticker (picked from a list), their focus minutes and game progress in that room, and when they were last seen. Only the sailors in the room can read these. Each room also has a public card: its made-up name and subject, whether it&apos;s an invite or open room, whether its door is locked, how many sailors are aboard, when it opened and when its skipper was last seen. Anyone logged in who has the room&apos;s code or link can read that card, and anyone logged in who says they&apos;re 13 or older can see the cards of open rooms, but nobody can see from it who is aboard. Your Google name, email and photo, your sailor&apos;s name and your timer goals are never shown; there&apos;s no typed chat, voice or video; and you get a new nickname and a different room id in every room (Hop back in keeps the nickname you had in that room). Ship&apos;s operator could connect a room id to an account in the database; other sailors can&apos;t. Reports are counted on the room without saying who sent them, and are deleted with it. If a skipper picks one of their own flashcard decks for a game in an invite room, its cards are kept with the room, where the sailors aboard can read them, and deleted with it; any sailor aboard can also keep a copy of a game&apos;s cards in their own flashcards, and that copy stays with them. Your account also keeps a private note of the rooms you&apos;re in or recently left, and whether you&apos;d been aboard five minutes when you left (so you can still report a room after leaving it, and so a report counts towards taking an open room off the list only from sailors who stayed a while; after the room ends, Ship clears the note the next time you open Study Rooms, or open Ship on a device where you&apos;ve used them, and deleting your account clears it too), when you last opened or joined one (and which), the open room you run (one at a time), and your answer to &ldquo;I&apos;m 13 or older&rdquo;; only you can read these. A room ends 12 hours after it opens, or 25 minutes after its skipper was last seen; after that nobody can change it, and any sailor&apos;s app may delete it; a room nobody returns to can stay in the database until it&apos;s cleared. When a room is deleted, its public card is emptied rather than deleted, leaving only an empty marker so its code is never used for another room. Deleting your account takes you out of your rooms and closes rooms you skipper.</p>
                <p><strong>Cloud Sync When You Log In:</strong> If you log in with Google, Ship also keeps a copy of your planner, timer history, flashcards, study sheets and uploaded notes, coins, unlocks and timer settings in Google Cloud Firestore (part of Firebase), stored under your account so that only you can read or change it (except what you choose to share in Bottle Bay or Study Rooms). Your Gemini key, Canvas and Todoist logins, calendar feed links, sound settings and notes read from an Obsidian vault are never uploaded. Signing out stops syncing. Delete account &amp; data (below) erases the cloud copy too.</p>
                <p><strong>Google Sign-In &amp; Drive:</strong> Logging in with Google (Firebase Authentication) shares your basic profile (name and email) with Ship. Ship never shows your name or email to other sailors. If you connect your own Google Drive client ID, Ship reads only the Drive files you authorize, to import them. If you use your own Gemini API key, prompts go directly from your browser to Google&apos;s Gemini API.</p>
                <p><strong>Age Gate:</strong> By creating an account or signing in with Google, you confirm that you are 13 years or older (or using Ship with parent/school consent). Open study rooms are for sailors 13 and older.</p>
              </>
            )}

            {tab === "terms" && (
              <>
                <p><strong>Acceptable Use:</strong> Ship Pwedo Pomo is provided as a calm student productivity and active-recall study workspace. Please upload only study materials you own or have permission to study from.</p>
                <p><strong>Service Availability:</strong> Your progress lives in your browser, and in your Google account if you log in. Keep occasional backups (in Settings, Download a backup) before clearing browser data.</p>
                <p><strong>No Unverified Medical or Academic Guarantees:</strong> Study recommendations and spaced-repetition intervals are educational helpers and carry no academic grade warranty.</p>
              </>
            )}

            {tab === "community" && (
              <>
                <p><strong>Community Rules (Bottle Bay &amp; Study Rooms):</strong> Be kind. Never share personal details, yours or anyone else&apos;s: real names, schools, addresses, phone numbers, social accounts, photos or plans to meet. Room skippers can remove anyone from their room; rooms and bottles that get reported are hidden; Ship&apos;s operator may delete any room or bottle. Share invite links only with people you&apos;d study with.</p>
                <p><strong>If Something Feels Wrong:</strong> You can leave a room at any time, hide a sailor&apos;s cheers or mute all cheers. Use <strong>⚑ Report</strong> in the room or on the bottle; in a room it still works after you leave or a skipper asks you to leave (Study Rooms shows the Report button right after you leave). Other sailors never see who reported. If anyone makes you feel unsafe or asks to meet up, leave the room, report it, and tell a parent, teacher or another adult you trust.</p>
                <p>
                  <strong>Reaching Ship&apos;s Operator:</strong> For anything a report can&apos;t cover, use the contact route under{" "}
                  {/* No private safety address yet, so this points at the existing contact text rather than inventing one. */}
                  <button
                    type="button"
                    onClick={() => setTab("refunds")}
                    className="font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
                  >
                    Free Tier &amp; Contact
                  </button>
                  . GitHub issues are public, so never put a room code or anyone&apos;s personal details in one.
                </p>
              </>
            )}

            {tab === "cookies" && (
              <>
                <p><strong>Essential Browser Storage Only:</strong> Ship uses browser <code>localStorage</code> (under <code>ship:*</code> keys) and <code>IndexedDB</code> (<code>ship-notes</code>, and <code>ship-vault</code> for the vault folder you open) strictly to remember your Pomodoro preferences, uploaded notes, tutorial progress, your Firebase Authentication session and, when you&apos;re logged in, what cloud sync last saved. <code>ship:rooms</code> keeps the study room you&apos;re in, your recent rooms, the sailors and rooms you hid, your cheer mute, the room rules tick, your last room look and which rooms you reported, on this device only. While you&apos;re in a study room, this browser tab&apos;s <code>sessionStorage</code> (under <code>ship:room-*</code> keys, named by a code that only works in that room) keeps your focus minutes not yet added to the crew and the Tidy the Deck game in progress, so a reload doesn&apos;t lose them. It empties when you leave the room or close the tab, and Start over and Delete everything clear it too.</p>
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
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[var(--muted-ink)]">This can take a minute or so.</span>
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
