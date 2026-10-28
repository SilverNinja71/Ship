// Keeps the page's videos paused while the gate is up or a video is being
// judged, so a blocked page never plays sound. "play" doesn't bubble, but a
// capturing listener on the document still sees it.

export interface MediaHush {
  start(): void;
  /** Stop pausing; `resume` restarts what the hush itself paused (after a video is cleared). */
  stop(resume: boolean): void;
}

export function createMediaHush(doc: Document): MediaHush {
  let active = false;
  const paused = new Set<HTMLMediaElement>();

  const hush = (el: HTMLMediaElement) => {
    if (!el.paused) {
      el.pause();
      paused.add(el);
    }
  };
  const onPlay = (e: Event) => {
    if (active && e.target instanceof HTMLMediaElement) hush(e.target);
  };
  doc.addEventListener("play", onPlay, true);
  doc.addEventListener("playing", onPlay, true);

  return {
    start() {
      active = true;
      doc.querySelectorAll<HTMLMediaElement>("video, audio").forEach(hush);
    },
    stop(resume) {
      active = false;
      if (resume) for (const el of paused) if (el.isConnected) el.play().catch(() => undefined);
      paused.clear();
    },
  };
}
