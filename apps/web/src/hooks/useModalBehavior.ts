// Shared accessible modal behavior: Escape-to-close and focus restoration on unmount.

import { useEffect, useRef } from "react";

export function useModalBehavior(onClose: () => void, active = true) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    containerRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previous?.focus?.();
    };
  }, [active, onClose]);

  return containerRef;
}
