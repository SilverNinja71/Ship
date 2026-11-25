// Shared accessible modal behavior: Escape-to-close and focus restoration on unmount.
// Escape is caught before anything else hears it (window, capture phase) and only by the modal
// opened last, so it closes that one window and never the panel underneath (useKeyboard closes
// panels on Escape, and skips a key a modal has already handled).

import { useEffect, useRef } from "react";

/** Open modals, oldest first: only the newest answers Escape. */
const openModals: symbol[] = [];

export function useModalBehavior(onClose: () => void, active = true) {
  const containerRef = useRef<HTMLDivElement>(null);
  // The latest onClose, so a parent's re-render doesn't re-run the effect (which would move focus).
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) return;
    const id = Symbol("modal");
    openModals.push(id);
    const previous = document.activeElement as HTMLElement | null;
    containerRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || openModals[openModals.length - 1] !== id) return;
      e.preventDefault();
      e.stopPropagation();
      closeRef.current();
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      const at = openModals.indexOf(id);
      if (at >= 0) openModals.splice(at, 1);
      previous?.focus?.();
    };
  }, [active]);

  return containerRef;
}
