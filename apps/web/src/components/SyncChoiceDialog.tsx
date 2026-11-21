// Asked once per browser and account, when both already hold progress:
// which copy should cloud sync keep? Notes from both sides are always kept.

import { downloadBackup } from "../lib/backup.js";
import { useFleet } from "../stores/fleetStore.js";
import { useSync } from "../stores/syncStore.js";
import { PastelMinionBadge } from "./PastelMinionBadge.js";

const CHOICE =
  "w-full rounded-2xl border border-[rgb(0_0_0_/_0.12)] px-4 py-2.5 text-left transition hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5C544B]";

export function SyncChoiceDialog() {
  const status = useSync((s) => s.status);
  const choose = useSync((s) => s.choose);
  if (status !== "needs-choice" || !choose) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="sync-choice-title" className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-[rgb(0_0_0_/_0.22)] p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-3xl border border-[rgb(0_0_0_/_0.12)] bg-[#FFFDF7] p-6 font-serif text-[#5C544B] shadow-sm">
        <div className="mb-3 flex items-center gap-3">
          <PastelMinionBadge costume="teddy" size={44} />
          <h2 id="sync-choice-title" className="text-lg tracking-wide text-[#4D453E]">
            Which progress should Ship keep?
          </h2>
        </div>
        <p className="mb-4 text-sm leading-relaxed">
          Your Google account already has Ship progress saved, and this browser has some of its own. Ship keeps one of them for your planner, timer history, flashcards, coins and unlocks. Uploaded notes from both are kept.
        </p>
        <div className="space-y-2">
          <button type="button" onClick={() => choose("cloud")} className={`${CHOICE} bg-[#FFF3A8]`}>
            <span className="block font-semibold text-[#4D453E]">Use my account&apos;s progress</span>
            <span className="block text-xs text-[#6B635B]">Replaces what&apos;s in this browser.</span>
          </button>
          <button type="button" onClick={() => choose("local")} className={`${CHOICE} bg-[#FAF6E8]`}>
            <span className="block font-semibold text-[#4D453E]">Keep this browser&apos;s progress</span>
            <span className="block text-xs text-[#6B635B]">Replaces what&apos;s saved in your account.</span>
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[#6B635B]">
          <button type="button" onClick={() => downloadBackup(useFleet.getState().notes)} className="underline underline-offset-4">
            Download this browser&apos;s progress first
          </button>
          <button type="button" onClick={() => choose(null)} className="hover:underline underline-offset-4">
            Decide later
          </button>
        </div>
      </div>
    </div>
  );
}
