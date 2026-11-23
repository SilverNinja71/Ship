// Break reflection prompt shown after each focus round, matching Pwedo Pomo Studio's Reflect card.

import { useState } from "react";
import { useVoyage } from "../stores/voyageStore.js";
import { PastelMinionBadge } from "./PastelMinionBadge.js";
import { Button } from "./ui.js";

export function BreakReflectModal() {
  const show = useVoyage((s) => s.showBreakReflection);
  const cyclesCompleted = useVoyage((s) => s.cyclesCompleted);
  const cyclesTotal = useVoyage((s) => s.cyclesTotal);
  const submit = useVoyage((s) => s.submitBreakReflection);
  const dismiss = useVoyage((s) => s.dismissBreakReflection);

  const [howWasSession, setHowWasSession] = useState("");
  const [whatWorked, setWhatWorked] = useState("");
  const [nextAdjustment, setNextAdjustment] = useState("");

  if (!show) return null;

  const handleSave = () => {
    submit({
      howWasSession: howWasSession.trim(),
      whatWorked: whatWorked.trim(),
      nextAdjustment: nextAdjustment.trim(),
    });
    setHowWasSession("");
    setWhatWorked("");
    setNextAdjustment("");
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Break Reflection"
      className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-ink/25 p-4 backdrop-blur-[2px]"
    >
      <div className="w-full max-w-md rounded-3xl border-[3px] border-ink bg-cream-50 p-5 text-ink shadow-card">
        <div className="mb-3 flex items-center gap-3">
          <PastelMinionBadge costume="teddy" size={44} />
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-wider text-ink/60">
              Break · Round {cyclesCompleted} of {cyclesTotal}
            </p>
            <h2 className="font-display text-xl font-extrabold">Reflect:</h2>
          </div>
        </div>

        <div className="space-y-3 font-mono text-sm">
          <label className="block">
            <span className="mb-1 block font-bold text-ink">-How was your session?</span>
            <input
              value={howWasSession}
              onChange={(e) => setHowWasSession(e.target.value)}
              placeholder="Focused, calm, a bit sleepy..."
              className="w-full rounded-xl border-2 border-ink/25 bg-cream-100 px-3 py-2 font-body text-sm focus:border-ink focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1 block font-bold text-ink">-What worked? What didnt?</span>
            <textarea
              rows={2}
              value={whatWorked}
              onChange={(e) => setWhatWorked(e.target.value)}
              placeholder="Active recall sheet helped; phone was distracting..."
              className="w-full resize-none rounded-xl border-2 border-ink/25 bg-cream-100 px-3 py-2 font-body text-sm focus:border-ink focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-1 block font-bold text-ink">-What could you do to improve or adjust for the next round?</span>
            <textarea
              rows={2}
              value={nextAdjustment}
              onChange={(e) => setNextAdjustment(e.target.value)}
              placeholder="Put phone in another room, review page 4..."
              className="w-full resize-none rounded-xl border-2 border-ink/25 bg-cream-100 px-3 py-2 font-body text-sm focus:border-ink focus:outline-none"
            />
          </label>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={dismiss}>
            Skip
          </Button>
          <Button variant="primary" onClick={handleSave}>
            Save reflection
          </Button>
        </div>
      </div>
    </div>
  );
}
