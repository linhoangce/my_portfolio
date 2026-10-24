"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { useTrain } from "../store";

/**
 * Day / night: switches the page tokens and, through Look, the scene palette, and stops the automatic cycle (the menu
 * turns it back on). L key does the same.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const light = mounted && resolvedTheme === "light";
  return (
    <button
      type="button"
      className="btn btn-icon"
      aria-label="Switch between day and night"
      title="Day / night (L)"
      onClick={() => {
        useTrain.setState({ autoLook: false });
        setTheme(light ? "dark" : "light");
      }}
    >
      {light ? <Moon className="h-[18px] w-[18px]" aria-hidden="true" /> : <Sun className="h-[18px] w-[18px]" aria-hidden="true" />}
    </button>
  );
}
