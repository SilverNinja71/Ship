// The Fleet Log: connect Canvas, Todoist, calendars and Google Drive, and
// import Parchment notebooks, study decks and calendar files.

import { useRef, useState } from "react";
import type { IntegrationId } from "@ship/shared-types";
import { relativeTime } from "../../lib/format.js";
import { useFleet } from "../../stores/fleetStore.js";
import type { ImportSummary } from "../../stores/fleetStore.js";
import { useSettings } from "../../stores/settingsStore.js";
import { IconRefresh, IconScroll, IconUpload } from "../icons.js";
import { Badge, Button, Card, EmptyState, Field, Panel, Tabs, TextInput, cx, readFile } from "../ui.js";

type Tab = "connections" | "import" | "notes";

export function FleetLogPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("connections");
  const notes = useFleet((s) => s.notes.length);
  return (
    <Panel title="Fleet Log" subtitle="Bring in deadlines, notes and decks" icon={<IconScroll />} onClose={onClose} wide>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "connections", label: "Connections" },
          { id: "import", label: "Import files" },
          { id: "notes", label: "Notes & library", badge: notes || undefined },
        ]}
      />
      {tab === "connections" && <Connections />}
      {tab === "import" && <Import />}
      {tab === "notes" && <NotesLibrary />}
    </Panel>
  );
}

function Status({ id }: { id: IntegrationId }) {
  const status = useFleet((s) => s.statuses[id]);
  const busy = useFleet((s) => s.busy[id]);
  const count = useFleet((s) => s.assignments.filter((a) => a.source === id).length);
  if (busy) return <p className="text-sm font-bold text-brass-700">Syncing…</p>;
  if (!status) return null;
  return (
    <div className="text-sm">
      {status.lastSyncAt && (
        <p className="text-ink/60">
          Synced {relativeTime(status.lastSyncAt)}
          {id !== "google-drive" && ` · ${count} item${count === 1 ? "" : "s"}`}
        </p>
      )}
      {status.error && <p className="mt-1 rounded-lg bg-coral-500/15 px-2 py-1 font-bold text-coral-700">{status.error}</p>}
    </div>
  );
}

function Connections() {
  const fleet = useFleet();
  const crewServer = useSettings((s) => s.crewServer);
  const [canvasUrl, setCanvasUrl] = useState(fleet.settings.canvas?.baseUrl ?? "");
  const [canvasToken, setCanvasToken] = useState(fleet.settings.canvas?.token ?? "");
  const [todoistToken, setTodoistToken] = useState(fleet.settings.todoist?.token ?? "");
  const [feed, setFeed] = useState(fleet.calendarFeedUrl);
  const [clientId, setClientId] = useState(fleet.settings.googleDrive?.clientId ?? "");

  return (
    <div className="space-y-3">
      <p className="rounded-xl bg-navy-900 px-3 py-2 text-sm text-cream-50">Tokens are saved only in this browser on this computer, and are sent only to the service they belong to.</p>

      <ServiceCard
        title="Canvas"
        connected={Boolean(fleet.settings.canvas)}
        help={
          <>
            In Canvas: Account → Settings → <b>+ New Access Token</b>. Canvas blocks requests from web pages, so Ship sends them through your crew server at {crewServer} (run <code>npm run dev</code>). If your school's
            Canvas address doesn't end in <code>.instructure.com</code>, add it to the server's <code>CANVAS_HOSTS</code>.
          </>
        }
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Canvas address">
            <TextInput value={canvasUrl} onChange={(e) => setCanvasUrl(e.target.value)} placeholder="https://school.instructure.com" />
          </Field>
          <Field label="Access token">
            <TextInput type="password" autoComplete="off" value={canvasToken} onChange={(e) => setCanvasToken(e.target.value)} placeholder="Paste your token" />
          </Field>
        </div>
        <Actions
          canSave={Boolean(canvasUrl.trim() && canvasToken.trim())}
          onSave={() => {
            fleet.setCanvas(canvasUrl, canvasToken);
            void useFleet.getState().syncCanvas();
          }}
          onSync={fleet.settings.canvas ? () => void fleet.syncCanvas() : undefined}
          onDisconnect={fleet.settings.canvas ? () => fleet.disconnect("canvas") : undefined}
        />
        <Status id="canvas" />
      </ServiceCard>

      <ServiceCard title="Todoist" connected={Boolean(fleet.settings.todoist)} help={<>In Todoist: Settings → Integrations → Developer → copy your <b>API token</b>.</>}>
        <Field label="API token">
          <TextInput type="password" autoComplete="off" value={todoistToken} onChange={(e) => setTodoistToken(e.target.value)} placeholder="Paste your token" />
        </Field>
        <Actions
          canSave={Boolean(todoistToken.trim())}
          onSave={() => {
            fleet.setTodoist(todoistToken);
            void useFleet.getState().syncTodoist();
          }}
          onSync={fleet.settings.todoist ? () => void fleet.syncTodoist() : undefined}
          onDisconnect={fleet.settings.todoist ? () => fleet.disconnect("todoist") : undefined}
        />
        <Status id="todoist" />
      </ServiceCard>

      <ServiceCard
        title="Lodestar & calendar feeds"
        connected={Boolean(fleet.calendarFeedUrl)}
        help={<>Paste a calendar feed address (.ics or webcal://), such as a Lodestar calendar export or your Canvas calendar feed. You can also drop an .ics file in “Import files”.</>}
      >
        <Field label="Calendar feed address">
          <TextInput value={feed} onChange={(e) => setFeed(e.target.value)} placeholder="https://… or webcal://…" />
        </Field>
        <Actions
          canSave={Boolean(feed.trim())}
          onSave={() => {
            fleet.setCalendarFeed(feed);
            void useFleet.getState().syncCalendar();
          }}
          onSync={fleet.calendarFeedUrl ? () => void fleet.syncCalendar() : undefined}
          onDisconnect={fleet.calendarFeedUrl ? () => fleet.disconnect("lodestar") : undefined}
        />
        <Status id="lodestar" />
      </ServiceCard>

      <ServiceCard
        title="Google Drive"
        connected={Boolean(fleet.settings.googleDrive?.accessToken)}
        help={
          <>
            Ship needs your own Google OAuth client ID (Google Cloud console → APIs & Services → Credentials → OAuth client ID, type “Web application”, with <code>{location.origin}</code> as an authorized JavaScript origin). Ship only asks for
            read-only access.
          </>
        }
      >
        <Field label="OAuth client ID">
          <TextInput value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="1234-abc.apps.googleusercontent.com" />
        </Field>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="primary" disabled={!clientId.trim()} onClick={() => {
            fleet.setDriveClientId(clientId);
            void useFleet.getState().connectDrive();
          }}>
            Connect Google Drive
          </Button>
          {fleet.settings.googleDrive?.accessToken && (
            <Button onClick={() => void fleet.syncDrive()}>
              <IconRefresh size={16} /> Sync
            </Button>
          )}
          {fleet.settings.googleDrive && <Button onClick={() => fleet.disconnect("google-drive")}>Disconnect</Button>}
        </div>
        <p className="mt-1 text-xs text-ink/60">Google opens its own sign-in window when you click Connect.</p>
        <Status id="google-drive" />
      </ServiceCard>
    </div>
  );
}

function ServiceCard({ title, connected, help, children }: { title: string; connected: boolean; help: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-display text-lg font-extrabold">{title}</h3>
        {connected ? <Badge tone="seafoam">Connected</Badge> : <Badge>Not connected</Badge>}
      </div>
      <p className="mb-3 text-sm text-ink/70">{help}</p>
      {children}
    </Card>
  );
}

function Actions({ canSave, onSave, onSync, onDisconnect }: { canSave: boolean; onSave: () => void; onSync?: () => void; onDisconnect?: () => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <Button variant="primary" disabled={!canSave} onClick={onSave}>
        Save & sync
      </Button>
      {onSync && (
        <Button onClick={onSync}>
          <IconRefresh size={16} /> Sync now
        </Button>
      )}
      {onDisconnect && <Button onClick={onDisconnect}>Disconnect</Button>}
    </div>
  );
}

function Import() {
  const importFiles = useFleet((s) => s.importFiles);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const take = async (files: FileList | null) => {
    if (!files?.length) return;
    setSummary(importFiles(await Promise.all([...files].map(readFile))));
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void take(e.dataTransfer.files);
        }}
        className={cx("flex w-full flex-col items-center gap-2 rounded-3xl border-[3px] border-dashed px-6 py-10 text-center transition", over ? "border-seafoam-500 bg-seafoam-500/10" : "border-ink/25 hover:border-ink/50")}
      >
        <IconUpload size={36} />
        <span className="font-display text-lg font-extrabold">Drop files here, or click to choose</span>
        <span className="text-sm text-ink/60">.parchment notebooks · Parchment study.json · .csv / .tsv decks · .ics calendars · .txt / .md notes</span>
      </button>
      <input ref={input} type="file" multiple accept=".parchment,.json,.csv,.tsv,.txt,.md,.ics" className="hidden" onChange={(e) => void take(e.target.files)} />
      {summary && (
        <Card>
          <p className="font-bold">
            Imported {summary.files} file{summary.files === 1 ? "" : "s"}: {summary.cards} new cards, {summary.decks} new decks, {summary.notes} notes, {summary.assignments} calendar items.
          </p>
          {summary.warnings.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm text-ink/70">
              {summary.warnings.slice(0, 12).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </Card>
      )}
      <p className="text-sm text-ink/60">Parchment notebooks bring in their typed text (handwriting that was never converted to text isn't in the file). Notes show up in the Captain's Log for blurting.</p>
    </div>
  );
}

function NotesLibrary() {
  const notes = useFleet((s) => s.notes);
  const library = useFleet((s) => s.library);
  const removeNote = useFleet((s) => s.removeNote);
  return (
    <div className="space-y-4">
      <section>
        <h3 className="mb-2 font-display font-extrabold">Notes</h3>
        {notes.length === 0 ? (
          <EmptyState title="No notes yet">Import a .parchment notebook or a .txt file to blurt against it in the Captain's Log.</EmptyState>
        ) : (
          <ul className="space-y-1.5">
            {notes.map((n) => (
              <li key={n.id} className="flex items-center gap-3 rounded-xl border-2 border-ink/10 bg-cream-50 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{n.title}</p>
                  <p className="text-xs text-ink/60">
                    {n.subject ? `${n.subject} · ` : ""}
                    {n.pages.length} page{n.pages.length === 1 ? "" : "s"} · {n.source}
                  </p>
                </div>
                <button type="button" className="text-sm text-coral-700 hover:underline" onClick={() => removeNote(n.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {library.length > 0 && (
        <section>
          <h3 className="mb-2 font-display font-extrabold">Captain's Library (Google Drive)</h3>
          <ul className="space-y-1.5">
            {library.slice(0, 100).map((item) => (
              <li key={item.id} className="flex items-center gap-3 rounded-xl border-2 border-ink/10 bg-cream-50 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-bold">
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noreferrer" className="hover:underline">
                      {item.title}
                    </a>
                  ) : (
                    item.title
                  )}
                </span>
                {item.text ? <Badge tone="seafoam">text ready</Badge> : <Badge>file</Badge>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
