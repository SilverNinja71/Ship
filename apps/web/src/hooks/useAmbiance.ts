// Plays the sea/study ambience and chimes when sound is switched on,
// and auto-pauses when other audio/media plays on the computer.

import { useEffect, useSyncExternalStore } from "react";
import { findCuratedTrack, sound } from "../lib/audio.js";
import type { ChimeKind } from "../lib/audio.js";
import { useSettings } from "../stores/settingsStore.js";
import { useUi } from "../stores/uiStore.js";
import { onVoyageEvent } from "../stores/voyageStore.js";

let activeTrackId: string = useSettings.getState().soundTrack;
const trackListeners = new Set<() => void>();

function notifyTrack() {
  trackListeners.forEach((fn) => fn());
}

export function getActiveAudioTrackId(): string {
  return activeTrackId;
}

export function selectAudioTrack(trackId: string, turnOn = true): void {
  const track = findCuratedTrack(trackId);
  activeTrackId = track.id;
  sound.setTrack(track.id);
  const patch: { soundOn?: boolean; soundTrack?: typeof track.baseTrack } = {};
  if (turnOn) patch.soundOn = true;
  if (track.baseTrack) patch.soundTrack = track.baseTrack;
  useSettings.getState().set(patch);
  notifyTrack();
}

export function useActiveAudioTrack(): string {
  return useSyncExternalStore(
    (cb) => {
      trackListeners.add(cb);
      return () => trackListeners.delete(cb);
    },
    () => activeTrackId,
    () => activeTrackId,
  );
}

/** Rings the ship's bell if the sailor has sound and chimes on. */
export function ringChime(kind: ChimeKind): void {
  const s = useSettings.getState();
  if (s.soundOn && s.chimesOn) sound.chime(kind);
}

function pauseShipAudioForExternalMedia(notify = true): void {
  const settings = useSettings.getState();
  if (!settings.soundOn && !sound.isPlaying()) return;
  sound.stopAmbience();
  if (settings.soundOn) {
    settings.set({ soundOn: false });
    if (notify) useUi.getState().toast("Ship audio paused for other media", "info");
  }
}

export function useAmbiance(): void {
  const soundOn = useSettings((s) => s.soundOn);
  const volume = useSettings((s) => s.ambienceVolume);
  const settingsTrack = useSettings((s) => s.soundTrack);
  const curatedTrackId = useActiveAudioTrack();

  useEffect(() => {
    // Keep curatedTrackId aligned if settingsTrack changed externally (e.g. Settings panel)
    const current = findCuratedTrack(activeTrackId);
    if (current.baseTrack && current.baseTrack !== settingsTrack) {
      activeTrackId = settingsTrack;
      notifyTrack();
    }
    sound.setTrack(activeTrackId);
  }, [settingsTrack, curatedTrackId]);

  useEffect(() => {
    if (!soundOn) {
      sound.stopAmbience();
      if ("mediaSession" in navigator) {
        try {
          navigator.mediaSession.playbackState = "none";
        } catch {
          // ignore
        }
      }
      return;
    }

    sound.setVolume(volume);
    sound.startAmbience();

    if ("mediaSession" in navigator) {
      try {
        const track = findCuratedTrack(activeTrackId);
        if (typeof MediaMetadata !== "undefined") {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title,
            artist: "Pwedo Pomo",
            album: "Ship Focus Ambiance",
          });
        }
        navigator.mediaSession.playbackState = "playing";
      } catch {
        // ignore unsupported mediaSession fields
      }
    }
  }, [soundOn, volume, curatedTrackId]);

  useEffect(() => {
    // 1. MediaSession API: pause/stop when OS or another media app takes focus
    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.setActionHandler("pause", () => pauseShipAudioForExternalMedia(true));
        navigator.mediaSession.setActionHandler("stop", () => pauseShipAudioForExternalMedia(true));
        navigator.mediaSession.setActionHandler("play", () => {
          useSettings.getState().set({ soundOn: true });
        });
      } catch {
        // ignore unsupported action handlers
      }
    }

    // 2. AudioContext interruption / suspension listener
    const offInterrupt = sound.onInterruption(() => {
      pauseShipAudioForExternalMedia(true);
    });

    // 3. Browser AudioSession API (Safari / WebKit audio focus)
    const navWithAudioSession = navigator as Navigator & {
      audioSession?: {
        type?: string;
        state?: string;
        addEventListener?: (type: string, fn: () => void) => void;
        removeEventListener?: (type: string, fn: () => void) => void;
      };
    };
    const audioSession = navWithAudioSession.audioSession;
    const onAudioSessionChange = () => {
      if (audioSession?.state === "interrupted" || audioSession?.state === "inactive") {
        pauseShipAudioForExternalMedia(true);
      }
    };
    if (audioSession?.addEventListener) {
      try {
        audioSession.type = "playback";
        audioSession.addEventListener("statechange", onAudioSessionChange);
      } catch {
        // ignore
      }
    }

    // 4. In-page <audio> / <video> playback (e.g. embedded video or audio player)
    const onExternalMediaPlay = (e: Event) => {
      if (e.target instanceof HTMLMediaElement) {
        pauseShipAudioForExternalMedia(true);
      }
    };
    document.addEventListener("play", onExternalMediaPlay, true);

    // 5. Page hide / tab unload
    const onPageHide = () => pauseShipAudioForExternalMedia(false);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      offInterrupt();
      document.removeEventListener("play", onExternalMediaPlay, true);
      window.removeEventListener("pagehide", onPageHide);
      if (audioSession?.removeEventListener) {
        try {
          audioSession.removeEventListener("statechange", onAudioSessionChange);
        } catch {
          // ignore
        }
      }
      if ("mediaSession" in navigator) {
        try {
          navigator.mediaSession.setActionHandler("pause", null);
          navigator.mediaSession.setActionHandler("stop", null);
          navigator.mediaSession.setActionHandler("play", null);
        } catch {
          // ignore
        }
      }
    };
  }, []);

  useEffect(
    () =>
      onVoyageEvent((kind) => {
        if (kind === "focus-complete") ringChime("shore-leave");
        else if (kind === "break-over" || kind === "started") ringChime("set-sail");
      }),
    [],
  );

  useEffect(() => () => sound.close(), []);
}
