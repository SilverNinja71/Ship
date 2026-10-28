// Ship's sounds, synthesized with WebAudio so there are no audio files:
// a rolling-sea ambience and bell chimes. Nothing here runs until the sailor
// turns sound on, and the AudioContext is only created then.

export type ChimeKind = "bell" | "shore-leave" | "set-sail";

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: { source: AudioBufferSourceNode; gain: GainNode; lfo: OscillatorNode } | null = null;
  private volume = 0.35;

  private context(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
    }
    // Browsers start contexts suspended until a click; resuming is harmless otherwise.
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.ambience && this.ctx) this.ambience.gain.gain.setTargetAtTime(this.volume * 0.5, this.ctx.currentTime, 0.3);
  }

  startAmbience(): void {
    if (this.ambience) return;
    const ctx = this.context();
    // Brown noise: a random walk, which sounds like distant surf once low-passed.
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 520;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(this.volume * 0.5, ctx.currentTime, 1.5);
    // A slow swell, like waves rolling in every ~11 seconds.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 260;
    lfo.connect(lfoDepth).connect(filter.frequency);
    source.connect(filter).connect(gain).connect(this.master!);
    source.start();
    lfo.start();
    this.ambience = { source, gain, lfo };
  }

  stopAmbience(): void {
    if (!this.ambience || !this.ctx) return;
    const { source, gain, lfo } = this.ambience;
    gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    source.stop(this.ctx.currentTime + 2);
    lfo.stop(this.ctx.currentTime + 2);
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
