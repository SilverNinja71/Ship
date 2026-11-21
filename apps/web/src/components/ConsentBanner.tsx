// First-visit Cookie & Browser Storage Consent Banner and persistent Legal Footer.

import { useState } from "react";
import { getConsentState, setConsentState } from "../lib/accountData.js";
import { LegalModal, type LegalTab } from "./LegalModal.js";

export function ConsentBanner() {
  const [consent, setConsent] = useState<"accepted" | "essential-only" | null>(() => getConsentState());
  const [legalTab, setLegalTab] = useState<LegalTab | null>(null);

  if (consent !== null && legalTab === null) return null;

  const choose = (choice: "accepted" | "essential-only") => {
    setConsentState(choice);
    setConsent(choice);
  };

  return (
    <>
      {consent === null && (
        <aside
          aria-label="Storage and privacy consent"
          className="pointer-events-auto fixed inset-x-3 bottom-3 z-40 mx-auto max-w-2xl rounded-2xl border border-[rgb(0_0_0_/_0.12)] bg-[var(--color-cream-50)]/95 p-2 shadow-sm backdrop-blur-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[var(--surface-1)] px-3 py-2 font-serif text-xs text-[var(--page-ink)]">
            <p className="min-w-0 flex-1 leading-relaxed">
              Ship saves your study sheets and focus logs in your browser, and in your Google account if you log in. Zero ads or tracking cookies.{" "}
              <button
                type="button"
                onClick={() => setLegalTab("cookies")}
                className="font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
              >
                Cookies & Privacy
              </button>
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => choose("essential-only")}
                className="px-2 py-1 text-[var(--muted-ink)] hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
              >
                Essential only
              </button>
              <button
                type="button"
                onClick={() => choose("accepted")}
                className="rounded-full border border-[rgb(0_0_0_/_0.12)] bg-[#FFF3A8] px-3 py-1 font-semibold text-[#524A42] transition hover:bg-[#FCEB8B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
              >
                Accept
              </button>
            </div>
          </div>
        </aside>
      )}
      {legalTab && <LegalModal initialTab={legalTab} onClose={() => setLegalTab(null)} />}
    </>
  );
}

export function LegalFooter() {
  const [legalTab, setLegalTab] = useState<LegalTab | null>(null);

  return (
    <footer className="border-t border-[rgb(0_0_0_/_0.1)] bg-[var(--surface-2)] px-4 py-6 font-serif text-xs text-[var(--muted-ink)] sm:px-8">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <span>Ship Pwedo Pomo · Antonio Lin Student Study Workspace · 100% Free</span>
        <nav aria-label="Legal and privacy links" className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => setLegalTab("privacy")}
            className="hover:text-[var(--page-ink)] hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
          >
            Privacy Policy
          </button>
          <button
            type="button"
            onClick={() => setLegalTab("terms")}
            className="hover:text-[var(--page-ink)] hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
          >
            Terms of Service
          </button>
          <button
            type="button"
            onClick={() => setLegalTab("cookies")}
            className="hover:text-[var(--page-ink)] hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
          >
            Cookies & Storage
          </button>
          <button
            type="button"
            onClick={() => setLegalTab("refunds")}
            className="hover:text-[var(--page-ink)] hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--page-ink)]"
          >
            Refunds, Contact & Delete Data
          </button>
        </nav>
      </div>
      {legalTab && <LegalModal initialTab={legalTab} onClose={() => setLegalTab(null)} />}
    </footer>
  );
}
