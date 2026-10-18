"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect } from "react";

import { useTrain } from "../store";

const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
};

/** W/S or arrows drive, Space brakes, 1–9 and 0 jump, E opens, C cab, L theme, T text version, Esc closes ask then dock. */
export function Keyboard() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (typing(e)) return;
      const st = useTrain.getState();
      if (e.key === "Escape") {
        if (st.askOpen) st.setAskOpen(false);
        else if (st.dockOpen) st.closeDock();
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
      } else if (k === "e" || k === "enter") {
        st.toggleDock();
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
    };
    const onBlur = () => {
      const st = useTrain.getState();
      st.setThrottle(0);
      st.setBraking(false);
      st.assist();
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
