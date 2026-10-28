// The Lookout: the browser extension that guards distractions during voyages.

import { relativeTime } from "../../lib/format.js";
import { useEconomy } from "../../stores/economyStore.js";
import { useLookout } from "../../stores/lookoutStore.js";
import { Doubloon, IconSpyglass } from "../icons.js";
import { Badge, Card, Panel } from "../ui.js";

export function LookoutPanel({ onClose }: { onClose: () => void }) {
  const connected = useLookout((s) => s.connected);
  const stats = useLookout((s) => s.stats);
  const version = useLookout((s) => s.version);
  const lastSeenAt = useLookout((s) => s.lastSeenAt);
  const ledger = useEconomy((s) => s.ledger);
  const paid = ledger.filter((e) => e.reason.startsWith("The Lookout"));

  return (
    <Panel title="The Lookout" subtitle="Keeps the sirens away while you sail" icon={<IconSpyglass />} onClose={onClose}>
      <div className="space-y-4">
        <Card className={connected ? "border-seafoam-500" : undefined}>
          <div className="flex items-center justify-between gap-2">
            <p className="font-display text-lg font-extrabold">{connected ? "The Lookout is in the crow's nest" : "The Lookout isn't connected"}</p>
            {connected ? <Badge tone="seafoam">Connected{version ? ` · v${version}` : ""}</Badge> : <Badge>Offline</Badge>}
          </div>
          <p className="mt-1 text-sm text-ink/70">
            {connected
              ? `It hears about your voyages and pays doubloons when you steer back to the ship. Last heard ${lastSeenAt ? relativeTime(lastSeenAt) : "just now"}.`
              : "Install the extension to block YouTube feeds and other distractions during voyages. Ship works fine without it."}
          </p>
          {stats && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Blocked today" value={stats.blockedToday} />
              <Stat label="Steered back" value={stats.steeredBackToday} />
              <Stat label="Leisure passes" value={stats.leisurePassesToday} />
              <Stat label="Gemini second opinion" value={stats.geminiReady ? "Ready" : "Off"} />
            </div>
          )}
        </Card>

        <Card>
          <h3 className="font-display font-extrabold">What it does</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink/80">
            <li>During a voyage, YouTube's home page, Shorts and feeds are blocked, along with any sites you add.</li>
            <li>A YouTube video is sorted against what you're studying by the Lookout's video groups (subjects, lessons, study audio and the usual distractions). When they aren't sure, Gemini decides, if you add your own API key in the extension's options.</li>
            <li>The Siren Gate offers a deal: answer 2 of your flashcards for a 5-minute pass, or steer back to the ship for +50 doubloons.</li>
          </ul>
        </Card>

        {!connected && (
          <Card>
            <h3 className="font-display font-extrabold">Install it (Chrome)</h3>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-ink/80">
              <li>
                Build it: <code>npm run build</code> in <code>apps/extension</code> (or keep <code>npm run dev</code> running).
              </li>
              <li>
                Open <code>chrome://extensions</code> and switch on <b>Developer mode</b>.
              </li>
              <li>
                Click <b>Load unpacked</b> and choose the <code>apps/extension/dist</code> folder.
              </li>
              <li>Reload this page. The dot in the top bar turns green when the Lookout says hello.</li>
            </ol>
          </Card>
        )}

        {paid.length > 0 && (
          <section>
            <h3 className="mb-2 font-display font-extrabold">Rewards from the Lookout</h3>
            <ul className="space-y-1">
              {[...paid].reverse().slice(0, 15).map((e) => (
                <li key={e.id} className="flex items-center gap-2 rounded-lg bg-cream-50 px-3 py-1.5 text-sm">
                  <Doubloon size={16} /> <span className="font-bold">+{e.doubloons}</span>
                  <span className="flex-1 text-ink/70">{e.reason}</span>
                  <span className="text-xs text-ink/50">{relativeTime(e.at)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-cream-100 px-3 py-2">
      <p className="text-xs font-bold text-ink/60">{label}</p>
      <p className="font-display text-lg font-extrabold">{value}</p>
    </div>
  );
}
