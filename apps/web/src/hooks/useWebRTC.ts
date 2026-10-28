// Mic and camera for crew rooms. Both start off; the browser only asks for
// permission when the sailor clicks a toggle.

import { useEffect } from "react";
import { create } from "zustand";
import { CrewMesh } from "../lib/rtcMesh.js";
import { onSignal, sendPresence, sendSignal, useCrew } from "../stores/crewStore.js";
import { useUi } from "../stores/uiStore.js";

export interface MediaState {
  audio: boolean;
  video: boolean;
  local: MediaStream | null;
  remote: Record<string, MediaStream>;
  setRemote(peerId: string, stream: MediaStream | null): void;
  set(patch: Partial<Pick<MediaState, "audio" | "video" | "local">>): void;
}

export const useMedia = create<MediaState>()((set, get) => ({
  audio: false,
  video: false,
  local: null,
  remote: {},
  setRemote: (peerId, stream) => {
    const remote = { ...get().remote };
    if (stream) remote[peerId] = stream;
    else delete remote[peerId];
    set({ remote });
  },
  set: (patch) => set(patch),
}));

let mesh: CrewMesh | null = null;

async function applyMedia(audio: boolean, video: boolean): Promise<void> {
  const media = useMedia.getState();
  media.local?.getTracks().forEach((t) => t.stop());
  let local: MediaStream | null = null;
  if (audio || video) {
    try {
      local = await navigator.mediaDevices.getUserMedia({ audio, video: video ? { width: 320, height: 240 } : false });
    } catch {
      useUi.getState().toast("Ship couldn't use your microphone or camera. Check the browser's permission.", "warning");
      audio = false;
      video = false;
    }
  }
  media.set({ audio, video, local });
  mesh?.setLocalStream(local);
  sendPresence({ audio, video });
}

export function toggleMic(): Promise<void> {
  const m = useMedia.getState();
  return applyMedia(!m.audio, m.video);
}

export function toggleCamera(): Promise<void> {
  const m = useMedia.getState();
  return applyMedia(m.audio, !m.video);
}

export function useWebRTC(): void {
  const peerId = useCrew((s) => s.peerId);

  useEffect(() => {
    if (!peerId) return;
    const media = useMedia.getState();
    mesh = new CrewMesh(peerId, sendSignal, media.setRemote);
    mesh.setLocalStream(media.local);
    mesh.setPeers(useCrew.getState().members.map((m) => m.peerId));
    const unMembers = useCrew.subscribe((s, prev) => {
      if (s.members !== prev.members) mesh?.setPeers(s.members.map((m) => m.peerId));
    });
    const unSignals = onSignal((from, data) => mesh?.handleSignal(from, data));
    return () => {
      unMembers();
      unSignals();
      mesh?.close();
      mesh = null;
      // Leaving the room turns the mic and camera off.
      const m = useMedia.getState();
      m.local?.getTracks().forEach((t) => t.stop());
      m.set({ audio: false, video: false, local: null });
    };
  }, [peerId]);
}
