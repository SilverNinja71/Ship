// Crew rooms: one WebSocket to the crew server, the room's members and quest,
// shouts, and "ghost ships" (a friend's last session, replayed when they're away).

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { QUEST_BEASTS } from "@ship/shared-types";
import type { AvatarState, ClientMessage, CrewMember, CrewMemberPatch, GhostRecording, QuestState, RtcSignal, ServerMessage } from "@ship/shared-types";
import { shipStorage, storageKey } from "../lib/storage.js";
import { useEconomy } from "./economyStore.js";
import { crewSocketUrl, useSettings } from "./settingsStore.js";
import { useUi } from "./uiStore.js";

export type CrewStatus = "offline" | "connecting" | "online" | "error";

export interface Shout {
  from: string;
  name: string;
  text: string;
  at: number;
}

export type JoinInfo = Extract<ClientMessage, { t: "join" }>["member"];

export interface CrewState {
  status: CrewStatus;
  room: string | null;
  peerId: string | null;
  members: CrewMember[];
  quest: QuestState | null;
  shouts: Shout[];
  error: string | null;
  /** Remembered so the Crew panel can offer it again. */
  lastRoom: string;
  ghosts: GhostRecording[];
  /** `me` is called on every (re)connect so a rejoin sends fresh presence. */
  join(room: string, me: () => JoinInfo): void;
  leave(): void;
  shout(text: string): void;
  forgetGhost(id: string): void;
}

const MAX_SHOUTS = 60;
const MAX_GHOSTS = 12;
const MIN_GHOST_SECONDS = 60;

let socket: WebSocket | null = null;
let wantRoom: { room: string; me: () => JoinInfo } | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 1000;
let pingTimer: ReturnType<typeof setInterval> | null = null;

const signalListeners = new Set<(from: string, data: RtcSignal) => void>();

/** WebRTC listens here for offers, answers and ICE from crewmates. */
export function onSignal(fn: (from: string, data: RtcSignal) => void): () => void {
  signalListeners.add(fn);
  return () => signalListeners.delete(fn);
}

function send(msg: ClientMessage): boolean {
  if (socket?.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(msg));
  return true;
}

export function sendPresence(patch: CrewMemberPatch): void {
  send({ t: "presence", patch });
}

export function sendFocusTick(minutes: number): void {
  if (minutes > 0) send({ t: "focus-tick", minutes });
}

export function sendSignal(to: string, data: RtcSignal): void {
  send({ t: "signal", to, data });
}

// Each crewmate's state timeline while they're in the room, kept to make a ghost when they leave.
interface Timeline {
  member: CrewMember;
  segments: { state: AvatarState; since: number }[];
}
const timelines = new Map<string, Timeline>();

function track(member: CrewMember, now = Date.now()): void {
  const tl = timelines.get(member.peerId);
  if (!tl) {
    timelines.set(member.peerId, { member, segments: [{ state: member.state, since: now }] });
    return;
  }
  tl.member = member;
  if (tl.segments[tl.segments.length - 1].state !== member.state) tl.segments.push({ state: member.state, since: now });
}

function toGhost(tl: Timeline, now: number): GhostRecording | null {
  const segments = tl.segments.map((s, i) => ({
    state: s.state,
    seconds: Math.round(((tl.segments[i + 1]?.since ?? now) - s.since) / 1000),
  })).filter((s) => s.seconds > 0);
  const total = segments.reduce((a, s) => a + s.seconds, 0);
  if (total < MIN_GHOST_SECONDS) return null;
  const m = tl.member;
  return { id: `ghost:${m.name.toLowerCase()}`, name: m.name, avatar: m.avatar, shipId: m.shipId, recordedAt: now, segments };
}

export const useCrew = create<CrewState>()(
  persist(
    (set, get) => {
      const saveGhost = (peerId: string) => {
        const tl = timelines.get(peerId);
        timelines.delete(peerId);
        if (!tl || peerId === get().peerId) return;
        const ghost = toGhost(tl, Date.now());
        if (!ghost) return;
        set({ ghosts: [ghost, ...get().ghosts.filter((g) => g.id !== ghost.id)].slice(0, MAX_GHOSTS) });
      };

      const saveAllGhosts = () => {
        for (const peerId of [...timelines.keys()]) saveGhost(peerId);
      };

      const claimRewards = (quest: QuestState) => {
        for (const reward of quest.rewards) useEconomy.getState().grantPart("figurehead", reward);
      };

      const onMessage = (msg: ServerMessage) => {
        switch (msg.t) {
          case "welcome":
            retryDelay = 1000;
            msg.members.forEach((m) => track(m));
            claimRewards(msg.quest);
            set({ status: "online", error: null, room: msg.room, peerId: msg.peerId, members: msg.members, quest: msg.quest, lastRoom: msg.room });
            break;
          case "member-joined":
            track(msg.member);
            set({ members: [...get().members.filter((m) => m.peerId !== msg.member.peerId), msg.member] });
            useUi.getState().toast(`${msg.member.name} came aboard.`);
            break;
          case "member-updated":
            track(msg.member);
            set({ members: get().members.map((m) => (m.peerId === msg.member.peerId ? msg.member : m)) });
            break;
          case "member-left": {
            const who = get().members.find((m) => m.peerId === msg.peerId);
            saveGhost(msg.peerId);
            set({ members: get().members.filter((m) => m.peerId !== msg.peerId) });
            if (who) useUi.getState().toast(`${who.name} went ashore.`);
            break;
          }
          case "quest":
            claimRewards(msg.quest);
            set({ quest: msg.quest });
            if (msg.defeatedBeast) {
              const beast = QUEST_BEASTS.find((b) => b.id === msg.defeatedBeast);
              useUi.getState().toast(`Your crew defeated ${beast?.name ?? "the beast"}! New figurehead unlocked.`, "reward");
            }
            break;
          case "signal":
            signalListeners.forEach((fn) => fn(msg.from, msg.data));
            break;
          case "shout":
            set({ shouts: [...get().shouts, { from: msg.from, name: msg.name, text: msg.text, at: msg.at }].slice(-MAX_SHOUTS) });
            break;
          case "error":
            if (msg.code === "room-full") {
              wantRoom = null;
              socket?.close();
              set({ status: "error", error: "That room is full (8 sailors)." });
            } else if (msg.code === "rate-limited") {
              useUi.getState().toast("Easy there, sailor. Wait a moment before shouting again.", "warning");
            } else {
              set({ error: msg.message });
            }
            break;
          case "pong":
            break;
        }
      };

      const connect = () => {
        if (!wantRoom) return;
        const url = crewSocketUrl(useSettings.getState().crewServer);
        set({ status: "connecting", error: null });
        let ws: WebSocket;
        try {
          ws = new WebSocket(url);
        } catch {
          set({ status: "error", error: `The crew server address "${url}" doesn't look right.` });
          return;
        }
        socket = ws;
        ws.onopen = () => {
          if (wantRoom) ws.send(JSON.stringify({ t: "join", room: wantRoom.room, member: wantRoom.me() } satisfies ClientMessage));
          pingTimer = setInterval(() => send({ t: "ping" }), 25_000);
        };
        ws.onmessage = (e) => {
          try {
            onMessage(JSON.parse(String(e.data)) as ServerMessage);
          } catch {
            // A malformed frame from the server is ignored rather than crashing the room.
          }
        };
        ws.onclose = () => {
          if (pingTimer) clearInterval(pingTimer);
          pingTimer = null;
          if (socket !== ws) return;
          socket = null;
          saveAllGhosts();
          if (!wantRoom) {
            set({ status: "offline", members: [], peerId: null, room: null });
            return;
          }
          // Lost the server: keep trying, a little slower each time.
          set({ status: "connecting", members: [], error: `Lost the crew server. Retrying in ${Math.round(retryDelay / 1000)} s…` });
          retryTimer = setTimeout(connect, retryDelay);
          retryDelay = Math.min(15_000, retryDelay * 2);
        };
      };

      return {
        status: "offline",
        room: null,
        peerId: null,
        members: [],
        quest: null,
        shouts: [],
        error: null,
        lastRoom: "",
        ghosts: [],

        join: (room, me) => {
          get().leave();
          wantRoom = { room: room.trim().toLowerCase(), me };
          retryDelay = 1000;
          set({ shouts: [] });
          connect();
        },

        leave: () => {
          wantRoom = null;
          if (retryTimer) clearTimeout(retryTimer);
          retryTimer = null;
          saveAllGhosts();
          if (socket) {
            send({ t: "leave" });
            socket.close();
            socket = null;
          }
          set({ status: "offline", room: null, peerId: null, members: [], quest: null, error: null });
        },

        shout: (text) => {
          const clean = text.trim();
          if (clean) send({ t: "shout", text: clean });
        },

        forgetGhost: (id) => set({ ghosts: get().ghosts.filter((g) => g.id !== id) }),
      };
    },
    {
      name: storageKey("crew"),
      storage: shipStorage,
      version: 1,
      partialize: ({ lastRoom, ghosts }) => ({ lastRoom, ghosts }),
    },
  ),
);

/** A ghost's state at time t (seconds), looping through its recorded session. */
export function ghostStateAt(ghost: GhostRecording, t: number): AvatarState {
  const total = ghost.segments.reduce((a, s) => a + s.seconds, 0);
  if (total <= 0) return "SAILING_FOCUS";
  let at = ((t % total) + total) % total;
  for (const s of ghost.segments) {
    if (at < s.seconds) return s.state;
    at -= s.seconds;
  }
  return ghost.segments[ghost.segments.length - 1].state;
}

/** Ghosts of friends who aren't in the room right now. */
export function absentGhosts(ghosts: readonly GhostRecording[], members: readonly CrewMember[]): GhostRecording[] {
  const present = new Set(members.map((m) => m.name.toLowerCase()));
  return ghosts.filter((g) => !present.has(g.name.toLowerCase()));
}
