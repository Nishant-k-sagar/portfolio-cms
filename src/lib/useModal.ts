import { useEffect, useRef } from "preact/hooks";

/**
 * Shared dialog behaviour: close on Escape and lock body scroll while open.
 * Used by the editor modals, the delete dialog and the media picker so every
 * overlay behaves consistently (previously only the media picker did this).
 */
export function useModal(onClose: () => void, enabled = true): void {
  // Keep the latest callback without re-subscribing on every render.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!enabled) return;
    document.body.classList.add("modal-open");
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [enabled]);
}
