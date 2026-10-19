"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect } from "react";

import { MONUMENTS } from "../monumentData";
import { skipToHold } from "../scene/director";
import { resetView, zoomBy } from "../scene/view";
import { useTrain } from "../store";

const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
};

const ORBIT_KEYS: Record<string, number> = { a: 1, arrowleft: 1, d: -1, arrowright: -1 };

/**
 * W/S or ↑/↓ drive, Space brakes, 1–9 and 0 drive to a stop, A/D or ←/→ orbit, + / − zoom, R resets the view,
 * E shows or hides the scene, M circles the next monument, C cab, L theme, T text version, ? help. Esc closes the
 * menu or help, then the attendant, then the monument view, then the overlay, then ends the scene. Keys with
 * Ctrl, ⌘ or Alt are left to the browser.
 */
export function Keyboard() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    const held = new Set<string>();
    const syncHeld = () => {
      let v = 0;
      for (const k of held) v += ORBIT_KEYS[k] ?? 0;
      useTrain.getState().sim.held = Math.sign(v);
    };
    const onDown = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const st = useTrain.getState();
      if (e.key === "Escape") {
        if (st.ui) st.setUi(null);
        else if (st.askOpen) st.setAskOpen(false);
        else if (st.monument) st.closeMonument();
        else if (st.overlay) st.hideOverlay();
        else st.endScene();
        return;
      }
      if (e.key === "?") {
        st.setUi(st.ui === "help" ? null : "help");
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "w" || k === "arrowup") {
        st.setThrottle(1);
        e.preventDefault();
      } else if (k === "s" || k === "arrowdown") {
        st.setThrottle(-1);
        e.preventDefault();
      } else if (k === " ") {
        st.setBraking(true);
        e.preventDefault();
      } else if (k >= "0" && k <= "9") {
        st.driveTo(k === "0" ? 9 : Number(k) - 1);
      } else if (k in ORBIT_KEYS) {
        held.add(k);
        syncHeld();
        skipToHold(st);
        e.preventDefault();
      } else if (k === "+" || k === "=") {
        zoomBy(st, -0.15);
      } else if (k === "-" || k === "_") {
        zoomBy(st, 0.15);
      } else if (k === "r") {
        resetView(st);
      } else if (k === "e") {
        st.toggleOverlay();
      } else if (k === "m") {
        const i = MONUMENTS.findIndex((m) => m.key === st.monument);
        st.openMonument(MONUMENTS[(i + 1) % MONUMENTS.length].key);
      } else if (k === "c") {
        st.toggleCab();
      } else if (k === "t") {
        router.push("/text");
      } else if (k === "l") {
        setTheme(resolvedTheme === "light" ? "dark" : "light");
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (typing(e)) return;
      const st = useTrain.getState();
      const k = e.key.toLowerCase();
      if (k === "w" || k === "arrowup" || k === "s" || k === "arrowdown") {
        st.setThrottle(0);
        st.assist();
      }
      if (k === " ") st.setBraking(false);
      if (held.delete(k)) syncHeld();
    };
    const onBlur = () => {
      const st = useTrain.getState();
      st.setThrottle(0);
      st.setBraking(false);
      st.assist();
      held.clear();
      syncHeld();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [router, resolvedTheme, setTheme]);

  return null;
}
