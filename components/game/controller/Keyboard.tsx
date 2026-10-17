"use client";

import { useEffect } from "react";

import { useGame } from "../store";
import { MOVE_CODES, clearInput, input, queueJump, recomputeMove } from "./input";

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

/**
 * Window-level key handling. Game keys only act in play mode, so an open
 * dialog or menu never moves the penguin. M toggles the portfolio menu.
 */
export function Keyboard() {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const state = useGame.getState();
      if (e.code === "KeyM" && !e.repeat) {
        if (state.mode === "play") {
          e.preventDefault();
          state.openMenu();
        } else if (state.mode === "menu") {
          e.preventDefault();
          state.closeMenu();
        }
        return;
      }
      if (state.mode !== "play") return;

      if (MOVE_CODES.has(e.code)) {
        input.keys.add(e.code);
        recomputeMove();
        e.preventDefault();
        return;
      }
      switch (e.code) {
        case "Space":
          if (!e.repeat) queueJump();
          e.preventDefault();
          break;
        case "ShiftLeft":
        case "ShiftRight":
          input.slide = true;
          break;
        case "KeyE":
          if (!e.repeat && state.nearScreen) {
            e.preventDefault();
            state.enterFocus(state.nearScreen);
          }
          break;
        default:
          break;
      }
    };

    const up = (e: KeyboardEvent) => {
      if (MOVE_CODES.has(e.code)) {
        input.keys.delete(e.code);
        recomputeMove();
      } else if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
        input.slide = false;
      }
    };

    const release = () => clearInput();
    const onVisibility = () => {
      if (document.hidden) clearInput();
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", onVisibility);

    // Release every key the moment a dialog opens, so a held W does not stick.
    const unsubscribe = useGame.subscribe((s, prev) => {
      if (s.mode !== prev.mode && s.mode !== "play") clearInput();
    });

    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", onVisibility);
      unsubscribe();
      clearInput();
    };
  }, []);
  return null;
}
