// Ship's sounds, synthesized with WebAudio so there are no audio files:
// rolling-sea ambience, rain, ASMR, lo-fi, soft felt piano, and bell chimes.
// Nothing here runs until the sailor turns sound on, and the AudioContext is
// only created then.

import type { SoundTrackId } from "../stores/settingsStore.js";

export type ChimeKind = "bell" | "shore-leave" | "set-sail";
export type SynthProfile = SoundTrackId | "piano" | "starlight";

export interface CuratedTrack {
  id: string;
  title: string;
  subtitle: string;
  category: "Suggestions" | "Lo-fi & Beats" | "Nature & ASMR" | "Piano & Ambient";
  profile: SynthProfile;
  /** Optional base SoundTrackId to persist in settingsStore when applicable. */
  baseTrack?: SoundTrackId;
  coverBg: string;
  coverAccent: string;
  emoji: string;
}

export const QUICK_AUDIO_SUGGESTIONS: CuratedTrack[] = [
  {
    id: "rain",
    title: "Rain Drops",
    subtitle: "Gentle window rain · Endless",
    category: "Suggestions",
    profile: "rain",
    baseTrack: "rain",
    coverBg: "#DCEAF9",
    coverAccent: "#8FB6D9",
    emoji: "🌧️",
  },
  {
    id: "asmr",
    title: "ASMR",
    subtitle: "Cozy paper & warm crackle",
    category: "Suggestions",
    profile: "asmr",
    baseTrack: "asmr",
    coverBg: "#F7E5DF",
    coverAccent: "#E2A699",
    emoji: "✨",
  },
  {
    id: "lofi",
    title: "Lo-fi",
    subtitle: "Warm Cmaj7 vinyl hum",
    category: "Suggestions",
    profile: "lofi",
    baseTrack: "lofi",
    coverBg: "#ECE4FA",
    coverAccent: "#B39DDB",
    emoji: "🎧",
  },
  {
    id: "ocean",
    title: "Ocean Waves",
    subtitle: "Soft coastal swell",
    category: "Suggestions",
    profile: "ocean",
    baseTrack: "ocean",
    coverBg: "#D8F0EA",
    coverAccent: "#7FC8B2",
    emoji: "🌊",
  },
  {
    id: "piano",
    title: "Soft Piano",
    subtitle: "Felt keys · Calm arpeggios",
    category: "Suggestions",
    profile: "piano",
    coverBg: "#FFF5C8",
    coverAccent: "#DFC36B",
    emoji: "🎹",
  },
];

export const CURATED_FOCUS_TRACKS: CuratedTrack[] = [
  ...QUICK_AUDIO_SUGGESTIONS,
  {
    id: "ghibli-piano",
    title: "Cloud Nine Felt Piano",
    subtitle: "Soft upright piano · 64 BPM",
    category: "Piano & Ambient",
    profile: "piano",
    coverBg: "#FFF3D6",
    coverAccent: "#E5B96B",
    emoji: "☁️",
  },
  {
    id: "matcha-lofi",
    title: "Matcha Morning Study",
    subtitle: "Warm Rhodes & tape hiss",
    category: "Lo-fi & Beats",
    profile: "lofi",
    baseTrack: "lofi",
    coverBg: "#E3F1DF",
    coverAccent: "#8CB885",
    emoji: "🍵",
  },
  {
    id: "midnight-library",
    title: "Midnight Library Rain",
    subtitle: "Distant rain & turning pages",
    category: "Nature & ASMR",
    profile: "rain",
    baseTrack: "rain",
    coverBg: "#DFEAFA",
    coverAccent: "#84A7D6",
    emoji: "📖",
  },
  {
    id: "fireplace-asmr",
    title: "Hearth & Sketchbook",
    subtitle: "Soft crackle & pencil texture",
    category: "Nature & ASMR",
    profile: "asmr",
    baseTrack: "asmr",
    coverBg: "#FCE5DC",
    coverAccent: "#E49A84",
    emoji: "🕯️",
  },
  {
    id: "starlight-ambient",
    title: "Starlight Drift",
    subtitle: "Airy pastel synth pad",
    category: "Piano & Ambient",
    profile: "starlight",
    coverBg: "#E9E3FA",
    coverAccent: "#A696DC",
    emoji: "🌙",
  },
  {
    id: "seaside-breeze",
    title: "Pastel Cove Waves",
    subtitle: "Slow tide & sea breeze",
    category: "Nature & ASMR",
    profile: "ocean",
    baseTrack: "ocean",
    coverBg: "#D7EFEA",
    coverAccent: "#77BFB0",
    emoji: "🐚",
  },
];

export function findCuratedTrack(id: string): CuratedTrack {
  return CURATED_FOCUS_TRACKS.find((t) => t.id === id) ?? QUICK_AUDIO_SUGGESTIONS[0];
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: { stop: () => void; gain: GainNode } | null = null;
  private volume = 0.35;
  private trackId = "rain";
  private profile: SynthProfile = "rain";
  private intentionalStop = false;
  private interruptionListeners = new Set<(reason: string) => void>();

  onInterruption(fn: (reason: string) => void): () => void {
    this.interruptionListeners.add(fn);
    return () => this.interruptionListeners.delete(fn);
  }

  private emitInterruption(reason: string): void {
    this.interruptionListeners.forEach((fn) => fn(reason));
  }

  getTrackId(): string {
    return this.trackId;
  }

  isPlaying(): boolean {
    return this.ambience !== null;
  }

  setTrack(trackId: string): void {
    const curated = findCuratedTrack(trackId);
    if (this.trackId === curated.id && this.profile === curated.profile) return;
    this.trackId = curated.id;
    this.profile = curated.profile;
    if (this.ambience) {
      this.stopAmbience();
      this.startAmbience();
    }
  }

  private context(): AudioContext {
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(ctx.destination);

      ctx.addEventListener("statechange", () => {
        const state = ctx.state as string;
        if (this.ambience && !this.intentionalStop && (state === "interrupted" || state === "suspended")) {
          this.stopAmbience();
          this.emitInterruption("audio-context-interrupted");
        }
      });
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.ambience && this.ctx) {
      this.ambience.gain.gain.setTargetAtTime(this.volume * 0.5, this.ctx.currentTime, 0.3);
    }
  }

  startAmbience(): void {
    if (this.ambience) return;
    this.intentionalStop = false;
    const ctx = this.context();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(this.volume * 0.5, ctx.currentTime, 1.0);
    gain.connect(this.master!);

    const cleanups: (() => void)[] = [];

    if (this.profile === "piano") {
      // Gentle felt-piano arpeggio notes in Fmaj7 / Cmaj7
      const chords = [
        [261.63, 329.63, 392.0, 493.88],
        [220.0, 261.63, 329.63, 392.0],
        [174.61, 220.0, 261.63, 329.63],
        [196.0, 246.94, 293.66, 392.0],
      ];
      let step = 0;
      const playNote = () => {
        if (!this.ctx || !this.ambience) return;
        const chord = chords[Math.floor(step / 4) % chords.length];
        const freq = chord[step % chord.length];
        step += 1;
        const at = ctx.currentTime;
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = freq;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 780;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0, at);
        ng.gain.linearRampToValueAtTime(0.18, at + 0.04);
        ng.gain.exponentialRampToValueAtTime(0.0005, at + 3.2);
        osc.connect(lp).connect(ng).connect(gain);
        osc.start(at);
        osc.stop(at + 3.3);
      };
      playNote();
      const timer = window.setInterval(playNote, 1150);
      cleanups.push(() => window.clearInterval(timer));
    } else {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      if (this.profile === "rain" || this.profile === "asmr") {
        let b0 = 0,
          b1 = 0,
          b2 = 0;
        for (let i = 0; i < data.length; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.997 * b0 + white * 0.029;
          b1 = 0.985 * b1 + white * 0.032;
          b2 = 0.95 * b2 + white * 0.048;
          const crackle = this.profile === "asmr" && Math.random() < 0.0006 ? (Math.random() * 2 - 1) * 0.35 : 0;
          data[i] = (b0 + b1 + b2 + white * 0.03) * 0.75 + crackle;
        }
      } else {
        let last = 0;
        for (let i = 0; i < data.length; i++) {
          last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
          data[i] = last * 3.5;
        }
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = this.profile === "rain" ? "bandpass" : "lowpass";
      filter.frequency.value =
        this.profile === "rain"
          ? 1150
          : this.profile === "asmr"
            ? 1600
            : this.profile === "lofi"
              ? 340
              : this.profile === "starlight"
                ? 420
                : 520;
      if (this.profile === "rain") filter.Q.value = 0.55;

      const extraOscs: OscillatorNode[] = [];
      if (this.profile === "ocean") {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.09;
        const lfoDepth = ctx.createGain();
        lfoDepth.gain.value = 260;
        lfo.connect(lfoDepth).connect(filter.frequency);
        lfo.start();
        extraOscs.push(lfo);
      } else if (this.profile === "lofi" || this.profile === "starlight") {
        const freqs = this.profile === "starlight" ? [196.0, 246.94, 293.66, 369.99] : [130.81, 164.81, 196.0, 246.94];
        for (const freq of freqs) {
          const osc = ctx.createOscillator();
          osc.type = "sine";
          osc.frequency.value = freq;
          const og = ctx.createGain();
          og.gain.value = this.profile === "starlight" ? 0.045 : 0.055;
          osc.connect(og).connect(gain);
          osc.start();
          extraOscs.push(osc);
        }
      }

      source.connect(filter).connect(gain);
      source.start();
      cleanups.push(() => {
        try {
          source.stop(ctx.currentTime + 1.6);
        } catch {
          // ignore if already stopped
        }
        for (const o of extraOscs) {
          try {
            o.stop(ctx.currentTime + 1.6);
          } catch {
            // ignore
          }
        }
      });
    }

    this.ambience = {
      gain,
      stop: () => {
        this.intentionalStop = true;
        try {
          gain.gain.setTargetAtTime(0, ctx.currentTime, 0.35);
        } catch {
          // ignore if context closed
        }
        for (const fn of cleanups) fn();
      },
    };
  }

  stopAmbience(): void {
    if (!this.ambience || !this.ctx) return;
    this.ambience.stop();
    this.ambience = null;
  }

  /** A struck bell: a few inharmonic partials that ring out. */
  chime(kind: ChimeKind): void {
    const ctx = this.context();
    const strikes = kind === "bell" ? [0] : kind === "shore-leave" ? [0, 0.35] : [0, 0.25, 0.5];
    const base = kind === "set-sail" ? 784 : 659;
    for (const delay of strikes) {
      const at = ctx.currentTime + delay;
      for (const [ratio, level, decay] of [
        [1, 0.32, 2.4],
        [2.01, 0.14, 1.6],
        [2.76, 0.1, 1.1],
        [5.4, 0.05, 0.6],
      ] as const) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = base * ratio;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(level * Math.max(0.2, this.volume * 1.6), at + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
        osc.connect(g).connect(this.master!);
        osc.start(at);
        osc.stop(at + decay + 0.05);
      }
    }
  }

  close(): void {
    this.stopAmbience();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }
}

export const sound = new SoundEngine();
