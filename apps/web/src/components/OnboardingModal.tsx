// Warm, kawaii first-visit tutorial modal and gentle Google Drive sign-in prompt
// in Mr. Tiny Studio stationery style.

import { useState } from "react";
import { markTutorialSeen } from "../lib/accountData.js";
import { PastelMinionBadge } from "./PastelMinionBadge.js";
import { cx } from "./ui.js";

interface TutorialStep {
  id: string;
  costume: "banana" | "teddy" | "bunny" | "frog";
  badge: string;
  badgeBg: string;
  badgeText: string;
  title: string;
  subtitle: string;
  body: string;
  tip: string;
}

const STEPS: TutorialStep[] = [
  {
    id: "ship",
    costume: "banana",
    badge: "Step 1 · Your Ship",
    badgeBg: "#FFF3A8",
    badgeText: "#6D655C",
    title: "Welcome aboard the Woolly Wanderer!",
    subtitle: "Your cozy floating study sanctuary",
    body: "You and your tiny pastel crew sail together while you study. Switch between Ship and Desk views anytime in the top bar, or visit the Shipwright to unlock kawaii pastel ships like Golden Mane, Floating Galley, Sunfish, and Crimson Corsair.",
    tip: "Tip: Press Q anytime to hop between your ship's deck and your study desk.",
  },
  {
    id: "pomo",
    costume: "teddy",
    badge: "Step 2 · Pwedo Pomo",
    badgeBg: "#FCE2DB",
    badgeText: "#8A534A",
    title: "Focus with Pwedo Pomo",
    subtitle: "Gentle timer & ambient focus sounds",
    body: "Use the compact Pwedo Pomo pill at the bottom to start a focus voyage. Pick your focus & break rhythm, add cozy rain, lo-fi, or ocean ambiance, and earn doubloons for every completed cycle.",
    tip: "Tip: Your Pomodoro Tracker below automatically ticks off focus & break boxes as cycles finish!",
  },
  {
    id: "sheets",
    costume: "bunny",
    badge: "Step 3 · Study Sheets",
    badgeBg: "#E8DCF8",
    badgeText: "#614D7A",
    title: "Active Recall & Study Sheets",
    subtitle: "Remember what you learn without cramming",
    body: "Open Study Sheets to jot down blurt notes and check what you remember against your source material, or review Flashcards with spaced repetition right from the top bar.",
    tip: "Tip: Tag sessions with #hashtags (like #biology or #finals) to see your top subjects in Monthly Stats.",
  },
  {
    id: "planna",
    costume: "frog",
    badge: "Step 4 · Banana Planna",
    badgeBg: "#D7F0DC",
    badgeText: "#3F6948",
    title: "Plan your week with Banana Planna",
    subtitle: "Weekly Plan, Habits & Pomodoro Tracker",
    body: "Scroll down below the ship, or click Banana Planna in the top bar, to fill in your numbered Weekly Plan, check off daily habits, and log tasks inside your Pomodoro sessions.",
    tip: "Tip: Sign in with Google Drive anytime to keep your plans, notes, and progress synced across devices.",
  },
];

export function OnboardingModal({
  onClose,
  onOpenLogin,
  driveConnected,
}: {
  onClose: () => void;
  onOpenLogin: () => void;
  driveConnected: boolean;
}) {
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;

  const finish = () => {
    markTutorialSeen();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome tutorial"
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[#6D655C]/25 p-4 backdrop-blur-[2px]"
    >
      <div className="w-full max-w-lg rounded-3xl border border-[#A29C93]/60 bg-[#FFFDF7] p-6 font-serif text-[#6D655C] shadow-[6px_6px_0_#EAE5DA]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <span
            style={{ backgroundColor: step.badgeBg, color: step.badgeText }}
            className="inline-block rounded-full px-3 py-1 text-xs font-bold tracking-wide"
          >
            {step.badge}
          </span>
          <button
            type="button"
            onClick={finish}
            className="text-xs text-[#8E887F] transition hover:text-[#5D564E] hover:underline underline-offset-4"
          >
            Skip tutorial
          </button>
        </div>

        {/* Main Card */}
        <div className="mt-4 flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left sm:gap-5">
          <div className="mb-3 flex shrink-0 items-center justify-center rounded-3xl border border-[#A29C93]/30 bg-[#FAF6E8] p-3 shadow-[3px_3px_0_#EAE5DA] sm:mb-0">
            <PastelMinionBadge costume={step.costume} size={72} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold tracking-wide text-[#5D564E]">{step.title}</h2>
            <p className="mt-0.5 text-xs font-medium text-[#8E887F]">{step.subtitle}</p>
            <p className="mt-3 text-sm leading-relaxed text-[#6D655C]">{step.body}</p>
          </div>
        </div>

        {/* Cozy Tip */}
        <div className="mt-4 rounded-2xl border border-[#A29C93]/35 bg-[#FAF6E8] px-4 py-2.5 text-xs text-[#7B7369]">
          {step.tip}
        </div>

        {/* Stepper + Actions */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Tutorial steps">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={i === stepIdx}
                aria-label={s.badge}
                onClick={() => setStepIdx(i)}
                className={cx(
                  "h-2.5 rounded-full transition-all",
                  i === stepIdx ? "w-6 bg-[#E6C56B]" : "w-2.5 bg-[#DFD9CC] hover:bg-[#C7BFB3]",
                )}
              />
            ))}
          </div>

          <div className="flex items-center gap-2 text-sm">
            {stepIdx > 0 && (
              <button
                type="button"
                onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                className="rounded-full border border-[#A29C93]/50 bg-[#FAF6E8] px-3.5 py-1.5 text-xs font-medium text-[#6D655C] transition hover:bg-[#F3EDE0]"
              >
                Back
              </button>
            )}

            {isLast && !driveConnected && (
              <button
                type="button"
                onClick={() => {
                  finish();
                  onOpenLogin();
                }}
                className="rounded-full border border-[#A29C93]/60 bg-[#E8F4FA] px-3.5 py-1.5 text-xs font-bold text-[#4A6F82] transition hover:bg-[#D7EFFA]"
              >
                Sign in with Google
              </button>
            )}

            {isLast ? (
              <button
                type="button"
                onClick={finish}
                className="rounded-full border border-[#C9A66B]/60 bg-[#FFF3A8] px-4 py-1.5 text-xs font-bold text-[#5D564E] shadow-[2px_2px_0_#EAE5DA] transition hover:bg-[#FFE985]"
              >
                Start Studying!
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStepIdx((i) => Math.min(STEPS.length - 1, i + 1))}
                className="rounded-full border border-[#C9A66B]/60 bg-[#FFF3A8] px-4 py-1.5 text-xs font-bold text-[#5D564E] shadow-[2px_2px_0_#EAE5DA] transition hover:bg-[#FFE985]"
              >
                Next →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Gentle kawaii prompt shown after saving local data while not signed into Google. */
export function SignInPromptToast({
  onSignIn,
  onDismiss,
}: {
  onSignIn: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto fixed right-4 bottom-20 z-30 w-full max-w-xs rounded-3xl border border-[#A29C93]/60 bg-[#FFFDF7] p-4 font-serif text-[#6D655C] shadow-[4px_4px_0_#EAE5DA] sm:right-6"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-2xl bg-[#FAF6E8] p-1.5">
          <PastelMinionBadge costume="banana" size={38} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-[#5D564E]">Keep your study work safe!</p>
          <p className="mt-1 text-[11px] leading-relaxed text-[#8E887F]">
            You&apos;ve saved tasks or notes locally. Sign in with Google Drive to sync across devices on Google&apos;s servers.
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={onSignIn}
              className="rounded-full border border-[#C9A66B]/60 bg-[#FFF3A8] px-3 py-1 text-[11px] font-bold text-[#5D564E] shadow-[1px_1px_0_#EAE5DA] transition hover:bg-[#FFE985]"
            >
              Sign in with Google
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="px-1.5 py-1 text-[11px] text-[#8E887F] hover:text-[#5D564E] hover:underline underline-offset-4"
            >
              Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
