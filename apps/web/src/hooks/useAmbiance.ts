// Plays the sea ambience and chimes, but only when sound is switched on.

import { useEffect } from "react";
import { sound } from "../lib/audio.js";
import type { ChimeKind } from "../lib/audio.js";
import { useSettings } from "../stores/settingsStore.js";
import { onVoyageEvent } from "../stores/voyageStore.js";

/** Rings the ship's bell if the sailor has sound and chimes on. */
export function ringChime(kind: ChimeKind): void {
  const s = useSettings.getState();
  if (s.soundOn && s.chimesOn) sound.chime(kind);
}

export function useAmbiance(): void {
  const soundOn = useSettings((s) => s.soundOn);
  const volume = useSettings((s) => s.ambienceVolume);

  useEffect(() => {
    if (!soundOn) {
      sound.stopAmbience();
      return;
    }
    sound.setVolume(volume);
    sound.startAmbience();
  }, [soundOn, volume]);

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
