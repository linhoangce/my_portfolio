"use client";

import { MessageCircle, X } from "lucide-react";

import { useTrain } from "../train/store";

/** The attendant's chat button, bottom right: opens the panel above it, and closes it again. */
export function AskButton() {
  const open = useTrain((s) => s.askOpen);
  const setAskOpen = useTrain((s) => s.setAskOpen);
  return (
    <button
      type="button"
      className="ask-fab"
      aria-label={open ? "Close the attendant" : "Ask the attendant"}
      title="Ask the attendant"
      aria-expanded={open}
      onClick={() => setAskOpen(!open)}
    >
      {open ? <X className="h-5 w-5" aria-hidden="true" /> : <MessageCircle className="h-5 w-5" aria-hidden="true" />}
    </button>
  );
}
