// Settings: sound (off until you turn it on), voyages, flashcards, Gemini
// grading for the Captain's Log, motion, the crew server, and your data.

import { useRef, useState } from "react";
import { DEFAULT_GEMINI_MODEL, GEMINI_KEY_URL, checkGeminiModel, normalizeGeminiModel } from "@ship/integrations";
import { PANEL_KEYS } from "../../hooks/useKeyboard.js";
import { makeBackup, restoreBackup } from "../../lib/backup.js";
import { browserFetch } from "../../lib/network.js";
import { useSettings } from "../../stores/settingsStore.js";
import type { MotionPreference } from "../../stores/settingsStore.js";
import { useUi } from "../../stores/uiStore.js";
import { PANELS } from "../Hud.js";
import { IconGear } from "../icons.js";
import { Button, Card, Field, Panel, Select, TextInput, Toggle, cx } from "../ui.js";

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  const toast = useUi((u) => u.toast);
  const [server, setServer] = useState(s.crewServer);
  const [confirmReset, setConfirmReset] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const exportData = () => {
    const blob = new Blob([JSON.stringify(makeBackup(localStorage), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ship-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const importData = async (f: File | undefined) => {
    if (!f) return;
    try {
      restoreBackup(localStorage, JSON.parse(await f.text()));
      location.reload();
    } catch (e) {
      toast(`That file isn't a Ship backup (${e instanceof Error ? e.message : "unreadable"}).`, "warning");
    }
  };

  const reset = () => {
    for (const key of Object.keys(localStorage)) if (key.startsWith("ship:")) localStorage.removeItem(key);
    location.reload();
  };

  return (
    <Panel title="Settings" icon={<IconGear />} onClose={onClose}>
      <div className="space-y-4">
        <Card>
          <h3 className="font-display font-extrabold">Sound</h3>
          <Toggle checked={s.soundOn} onChange={(v) => s.set({ soundOn: v })} label="Sound" hint="Off by default. Plays a gentle sea and the ship's bell." />
          {s.soundOn && (
            <>
              <label className="flex items-center gap-3 py-2">
                <span className="w-32 font-bold">Sea volume</span>
                <input type="range" min={0} max={1} step={0.05} value={s.ambienceVolume} onChange={(e) => s.set({ ambienceVolume: Number(e.target.value) })} className="flex-1 accent-[var(--color-seafoam-500)]" />
              </label>
              <Toggle checked={s.chimesOn} onChange={(v) => s.set({ chimesOn: v })} label="Bell chimes" hint="Rings when a voyage starts, a break begins and a break ends." />
            </>
          )}
        </Card>

        <Card>
          <h3 className="mb-2 font-display font-extrabold">Voyages</h3>
          <Field label="Drift after no activity" hint="With Ship open and no mouse or keyboard input, the voyage pauses until you're back. Studying in another tab keeps counting.">
            <Select value={s.idleMinutes} onChange={(e) => s.set({ idleMinutes: Number(e.target.value) })}>
              <option value={0}>Never</option>
              {[5, 10, 15, 20, 30, 45].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </Select>
          </Field>
        </Card>

        <Card>
          <h3 className="mb-2 font-display font-extrabold">Flashcards</h3>
          <Field label="Scheduler" hint="SM-2 matches Parchment's schedule. FSRS predicts forgetting more precisely and usually means fewer reviews. You can switch any time.">
            <Select value={s.scheduler} onChange={(e) => s.set({ scheduler: e.target.value as "sm2" | "fsrs" })}>
              <option value="sm2">SM-2 (like Parchment)</option>
              <option value="fsrs">FSRS-4.5</option>
            </Select>
          </Field>
        </Card>

        <GeminiCard />

        <Card>
          <h3 className="mb-2 font-display font-extrabold">Motion</h3>
          <Field label="Animation">
            <Select value={s.motion} onChange={(e) => s.set({ motion: e.target.value as MotionPreference })}>
              <option value="system">Follow my computer's setting</option>
              <option value="reduce">Calm seas (reduced motion)</option>
              <option value="full">Full motion</option>
            </Select>
          </Field>
        </Card>

        <Card>
          <h3 className="mb-2 font-display font-extrabold">Crew server</h3>
          <Field label="Address" hint="Crew rooms and the Canvas relay live here. npm run dev starts one at http://localhost:8787.">
            <div className="flex gap-2">
              <TextInput value={server} onChange={(e) => setServer(e.target.value)} />
              <Button onClick={() => s.set({ crewServer: server.trim() || s.crewServer })} disabled={server.trim() === s.crewServer}>
                Save
              </Button>
            </div>
          </Field>
          <Toggle checked={s.showHitRegions} onChange={(v) => s.set({ showHitRegions: v })} label="Show clickable areas" hint="Outlines the parts of the ship you can click." />
        </Card>

        <Card>
          <h3 className="mb-2 font-display font-extrabold">Your data</h3>
          <p className="mb-2 text-sm text-ink/70">Everything Ship knows lives in this browser. Save a backup to move it or keep it safe. Backups leave out your Gemini key.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={exportData}>Download a backup</Button>
            <Button onClick={() => file.current?.click()}>Restore a backup</Button>
            <input ref={file} type="file" accept=".json" className="hidden" onChange={(e) => void importData(e.target.files?.[0])} />
            <Button variant={confirmReset ? "danger" : "secondary"} onClick={() => (confirmReset ? reset() : setConfirmReset(true))}>
              {confirmReset ? "Really erase everything?" : "Start over"}
            </Button>
          </div>
        </Card>

        <Card>
          <h3 className="mb-2 font-display font-extrabold">Keyboard</h3>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <li>
              <Kbd>Space</Kbd> set sail / anchor
            </li>
            <li>
              <Kbd>Q</Kbd> deck / quarters
            </li>
            {PANELS.map((p) => (
              <li key={p.id}>
                <Kbd>{Object.entries(PANEL_KEYS).find(([, id]) => id === p.id)?.[0].toUpperCase()}</Kbd> {p.label}
              </li>
            ))}
            <li>
              <Kbd>Esc</Kbd> close a panel
            </li>
          </ul>
        </Card>
      </div>
    </Panel>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="mr-1 inline-block min-w-6 rounded-md border-2 border-ink/30 bg-cream-50 px-1.5 text-center font-mono text-xs font-bold">{children}</kbd>;
}

/** Your own Gemini key for grading the Captain's Log. Without one, blurts are graded on this device. */
function GeminiCard() {
  const s = useSettings();
  const [key, setKey] = useState(s.geminiApiKey);
  const [model, setModel] = useState(s.geminiModel === DEFAULT_GEMINI_MODEL ? "" : s.geminiModel);
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const cleanKey = key.trim();
  const cleanModel = normalizeGeminiModel(model.trim() || DEFAULT_GEMINI_MODEL);
  const changed = cleanKey !== s.geminiApiKey || cleanModel !== s.geminiModel;

  const save = () => {
    s.set({ geminiApiKey: cleanKey, geminiModel: cleanModel });
    setModel(cleanModel === DEFAULT_GEMINI_MODEL ? "" : cleanModel);
    setStatus({ ok: true, text: cleanKey ? "Saved. The Captain's Log will grade with Gemini." : "Saved. The Captain's Log will grade on this device." });
  };

  const check = async () => {
    setChecking(true);
    setStatus({ ok: true, text: `Asking Gemini about ${cleanModel}…` });
    const r = await checkGeminiModel(browserFetch, cleanKey, cleanModel);
    setChecking(false);
    setStatus(r.ok ? { ok: true, text: `The key works: ${r.displayName} is ready.${changed ? " Press Save to use it." : ""}` } : { ok: false, text: r.message });
  };

  const remove = () => {
    s.set({ geminiApiKey: "" });
    setKey("");
    setStatus({ ok: true, text: "Key removed. The Captain's Log will grade on this device." });
  };

  return (
    <Card>
      <h3 className="mb-1 font-display font-extrabold">Captain's Log grading</h3>
      <p className="mb-2 text-sm text-ink/70">
        With your own Gemini API key, Gemini grades your blurts: it understands your own wording and points out mistakes. Without one, Ship grades them on this
        device by matching key words.
      </p>
      <Field
        label="Gemini API key"
        hint={
          <>
            Get one free at{" "}
            <a href={GEMINI_KEY_URL} target="_blank" rel="noreferrer" className="font-bold underline">
              Google AI Studio
            </a>
            . It stays in this browser and is sent only to Google. When it's set, grading sends your notes and blurt to Gemini.
          </>
        }
      >
        <div className="flex gap-2">
          <TextInput
            type={show ? "text" : "password"}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Paste your key"
            autoComplete="off"
            spellCheck={false}
            aria-label="Gemini API key"
          />
          <Button onClick={() => setShow(!show)} disabled={!key}>
            {show ? "Hide" : "Show"}
          </Button>
        </div>
      </Field>
      <Field label="Model" hint="Gemini model names change now and then. Leave this empty to use Google's newest Flash model.">
        <TextInput value={model} onChange={(e) => setModel(e.target.value)} placeholder={DEFAULT_GEMINI_MODEL} spellCheck={false} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={save} disabled={!changed}>
          Save
        </Button>
        <Button onClick={() => void check()} disabled={!cleanKey || checking}>
          Check key
        </Button>
        <Button onClick={remove} disabled={!s.geminiApiKey}>
          Remove key
        </Button>
      </div>
      {status && (
        <p role="status" className={cx("mt-2 text-sm font-bold", status.ok ? "text-ink/70" : "text-coral-700")}>
          {status.text}
        </p>
      )}
    </Card>
  );
}
