// Crew rooms: study together, fight the quest beast with focus minutes,
// shout encouragement, and (optionally) see and hear each other.

import { useEffect, useRef, useState } from "react";
import { QUEST_BEASTS } from "@ship/shared-types";
import type { AvatarState } from "@ship/shared-types";
import { FIGUREHEADS, shipOrStarter } from "@ship/ship-theme-kit";
import { myCrewInfo } from "../../hooks/useCrewSync.js";
import { toggleCamera, toggleMic, useMedia } from "../../hooks/useWebRTC.js";
import { formatMinutes, relativeTime } from "../../lib/format.js";
import { useCrew } from "../../stores/crewStore.js";
import { useSettings } from "../../stores/settingsStore.js";
import { AvatarPreview } from "../AvatarPreview.js";
import { IconCamera, IconCrew, IconMic, IconMute, IconSound } from "../icons.js";
import { Badge, Button, Card, EmptyState, Field, Panel, ProgressBar, TextInput, cx } from "../ui.js";

const STATE_LABEL: Record<AvatarState, string> = {
  SAILING_FOCUS: "Focusing",
  SHORE_LEAVE_BREAK: "On a break",
  DRIFTING_IDLE: "Drifting",
};

export function CrewPanel({ onClose }: { onClose: () => void }) {
  const status = useCrew((s) => s.status);
  const room = useCrew((s) => s.room);
  return (
    <Panel title="Crew" subtitle={room ? `Room “${room}”` : "Study together, in real time"} icon={<IconCrew />} onClose={onClose} wide>
      {status === "online" ? <Aboard /> : <JoinRoom />}
      <Ghosts />
    </Panel>
  );
}

function JoinRoom() {
  const lastRoom = useCrew((s) => s.lastRoom);
  const status = useCrew((s) => s.status);
  const error = useCrew((s) => s.error);
  const join = useCrew((s) => s.join);
  const leave = useCrew((s) => s.leave);
  const server = useSettings((s) => s.crewServer);
  const [room, setRoom] = useState(lastRoom || "");
  const valid = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(room.trim().toLowerCase());

  return (
    <div className="space-y-3">
      <p className="text-ink/80">Pick a room name and share it with friends. Everyone in the room sees each other's sailors at the galley tables, and every focus minute anyone sails hits the crew's quest beast.</p>
      <div className="flex gap-2">
        <Field label="Room name" hint="Lowercase letters, numbers and dashes. Up to 8 sailors.">
          <TextInput value={room} onChange={(e) => setRoom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && valid && join(room, () => myCrewInfo())} placeholder="e.g. bio-study-crew" />
        </Field>
        <div className="flex items-start pt-6">
          {status === "connecting" ? (
            <Button onClick={leave}>Cancel</Button>
          ) : (
            <Button variant="primary" disabled={!valid} onClick={() => join(room, () => myCrewInfo())}>
              Join
            </Button>
          )}
        </div>
      </div>
      {status === "connecting" && <p className="text-sm font-bold text-brass-700">Hailing the crew server at {server}…</p>}
      {error && <p className="rounded-xl bg-coral-500/15 px-3 py-2 text-sm font-bold text-coral-700">{error}</p>}
      <p className="text-xs text-ink/60">
        Crew rooms need the crew server running (it starts with <code>npm run dev</code>). Server: {server} (change it in Settings).
      </p>
    </div>
  );
}

function Aboard() {
  const members = useCrew((s) => s.members);
  const peerId = useCrew((s) => s.peerId);
  const quest = useCrew((s) => s.quest);
  const leave = useCrew((s) => s.leave);
  const beast = QUEST_BEASTS.find((b) => b.id === quest?.beastId);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <section>
          <h3 className="mb-2 font-display font-extrabold">Aboard ({members.length}/8)</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {[...members]
              .sort((a, b) => a.seat - b.seat)
              .map((m) => (
                <li key={m.peerId} className={cx("flex items-center gap-2 rounded-2xl border-2 bg-cream-50 p-2", m.peerId === peerId ? "border-brass-500" : "border-ink/10")}>
                  <AvatarPreview avatar={m.avatar} state={m.state} size={56} animated={false} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">
                      {m.name}
                      {m.peerId === peerId && <span className="text-ink/50"> (you)</span>}
                    </p>
                    <p className="text-xs text-ink/60">
                      {STATE_LABEL[m.state]} · {formatMinutes(m.focusMinutesToday)} today
                    </p>
                    <p className="truncate text-xs text-ink/50">{shipOrStarter(m.shipId).name}</p>
                  </div>
                  <div className="flex gap-0.5 text-ink/50">
                    {m.audio && <IconMic size={16} />}
                    {m.video && <IconCamera size={16} />}
                  </div>
                </li>
              ))}
          </ul>
        </section>
        {quest && beast && (
          <Card className="bg-navy-900 text-cream-50">
            <p className="text-xs font-bold tracking-wide text-cream-50/60 uppercase">Crew quest</p>
            <h3 className="font-display text-lg font-extrabold">{beast.name}</h3>
            <ProgressBar value={quest.hp / quest.maxHp} color="#E2604F" label={`${beast.name} health`} className="mt-2 border-cream-50/30 bg-cream-50/10" />
            <p className="mt-1 text-sm tabular-nums">
              {Math.ceil(quest.hp)} / {quest.maxHp} HP
            </p>
            <p className="mt-2 text-sm text-cream-50/75">Every focus minute anyone sails deals 1 damage. Defeat it to unlock the {FIGUREHEADS.find((f) => f.id === beast.reward)?.name} figurehead for the whole crew.</p>
            {quest.defeated > 0 && (
              <p className="mt-2 text-sm">
                Beasts defeated: <span className="font-bold">{quest.defeated}</span>
                <span className="block text-cream-50/75">Rewards: {quest.rewards.map((r) => FIGUREHEADS.find((f) => f.id === r)?.name ?? r).join(", ")}</span>
              </p>
            )}
          </Card>
        )}
      </div>
      <Media />
      <Shouts />
      <div className="flex justify-end">
        <Button onClick={leave}>Leave the room</Button>
      </div>
    </div>
  );
}

function VideoTile({ stream, muted, label }: { stream: MediaStream; muted: boolean; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <figure className="overflow-hidden rounded-2xl border-2 border-ink/20 bg-navy-950">
      <video ref={ref} autoPlay playsInline muted={muted} className="aspect-[4/3] w-full object-cover" />
      <figcaption className="px-2 py-1 text-xs font-bold text-cream-50">{label}</figcaption>
    </figure>
  );
}

function Media() {
  const audio = useMedia((s) => s.audio);
  const video = useMedia((s) => s.video);
  const local = useMedia((s) => s.local);
  const remote = useMedia((s) => s.remote);
  const members = useCrew((s) => s.members);
  // Crewmates' voices stay muted until the sailor chooses to listen.
  const [hear, setHear] = useState(false);
  const streams = Object.entries(remote);
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="font-display font-extrabold">Call</h3>
        <Button size="sm" variant={audio ? "seafoam" : "secondary"} onClick={() => void toggleMic()} aria-pressed={audio}>
          <IconMic size={16} /> {audio ? "Mic on" : "Mic off"}
        </Button>
        <Button size="sm" variant={video ? "seafoam" : "secondary"} onClick={() => void toggleCamera()} aria-pressed={video}>
          <IconCamera size={16} /> {video ? "Camera on" : "Camera off"}
        </Button>
        <Button size="sm" variant={hear ? "seafoam" : "secondary"} onClick={() => setHear(!hear)} aria-pressed={hear}>
          {hear ? <IconSound size={16} /> : <IconMute size={16} />} {hear ? "Hearing crew" : "Hear crew"}
        </Button>
      </div>
      {local || streams.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {local && video && <VideoTile stream={local} muted label="You" />}
          {streams.map(([id, stream]) => (
            <VideoTile key={id} stream={stream} muted={!hear} label={members.find((m) => m.peerId === id)?.name ?? "Crewmate"} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink/60">Mic and camera are off. Turn one on to study face to face; the browser will ask first.</p>
      )}
    </section>
  );
}

function Shouts() {
  const shouts = useCrew((s) => s.shouts);
  const shout = useCrew((s) => s.shout);
  const [text, setText] = useState("");
  const send = () => {
    shout(text);
    setText("");
  };
  return (
    <section>
      <h3 className="mb-2 font-display font-extrabold">Shouts</h3>
      <ul className="mb-2 max-h-40 space-y-1 overflow-y-auto rounded-xl bg-cream-50 p-2 text-sm" aria-live="polite">
        {shouts.length === 0 && <li className="text-ink/50">No shouts yet. Cheer your crew on!</li>}
        {shouts.map((s, i) => (
          <li key={`${s.at}-${i}`}>
            <span className="font-bold">{s.name}:</span> {s.text} <span className="text-xs text-ink/40">{relativeTime(s.at)}</span>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <TextInput value={text} maxLength={280} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Ahoy! Five more minutes, crew!" />
        <Button variant="primary" onClick={send} disabled={!text.trim()}>
          Shout
        </Button>
      </div>
    </section>
  );
}

function Ghosts() {
  const ghosts = useCrew((s) => s.ghosts);
  const forget = useCrew((s) => s.forgetGhost);
  if (!ghosts.length) {
    return (
      <div className="mt-5">
        <EmptyState title="No ghost ships yet">When a crewmate leaves, their session is kept and replays as a translucent sailor at your galley tables while they're away.</EmptyState>
      </div>
    );
  }
  return (
    <section className="mt-5">
      <h3 className="mb-2 font-display font-extrabold">Ghost ships</h3>
      <ul className="grid gap-2 sm:grid-cols-2">
        {ghosts.map((g) => {
          const seconds = g.segments.reduce((a, s) => a + s.seconds, 0);
          return (
            <li key={g.id} className="flex items-center gap-2 rounded-2xl border-2 border-dashed border-ink/20 bg-cream-50 p-2">
              <AvatarPreview avatar={g.avatar} state="SAILING_FOCUS" size={48} animated={false} opacity={0.55} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{g.name}</p>
                <p className="text-xs text-ink/60">
                  {formatMinutes(seconds / 60)} session · recorded {relativeTime(g.recordedAt)}
                </p>
              </div>
              <Badge>ghost</Badge>
              <button type="button" onClick={() => forget(g.id)} className="text-sm text-coral-700 hover:underline">
                Forget
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
