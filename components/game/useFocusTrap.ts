"use client";

import { type RefObject, useEffect } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps Tab inside `ref` while `active`, focuses the first focusable element
 * (or `initial`) on open, and restores focus to whatever had it before.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  options: { initial?: RefObject<HTMLElement | null>; onEscape?: () => void } = {},
) {
  const { initial, onEscape } = options;

  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;

    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = initial?.current ?? root.querySelector<HTMLElement>(FOCUSABLE);
    // Defer so the dialog has painted before focus moves (avoids scroll jumps).
    const raf = requestAnimationFrame(() => (first ?? root).focus());

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onEscape) {
        e.preventDefault();
        e.stopPropagation();
        onEscape();
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === firstItem || !root.contains(current))) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && (current === lastItem || !root.contains(current))) {
        e.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown, true);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [active, ref, initial, onEscape]);
}
