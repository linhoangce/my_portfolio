"use client";

import { ArrowRight } from "lucide-react";
import { createContext, useContext } from "react";

/** What a panel can ask of the page it is on: the ride opens the design notes as a dialog; /text has them further down. */
export const PanelActions = createContext<{ openDesign?: () => void }>({});

/** The way to the design notes: a button where the page can open them, a link to their section otherwise. */
export function DesignNotesLink() {
  const { openDesign } = useContext(PanelActions);
  const inner = (
    <>
      Design notes
      <ArrowRight className="h-3 w-3" aria-hidden="true" />
    </>
  );
  return openDesign ? (
    <button type="button" className="pill" onClick={openDesign}>
      {inner}
    </button>
  ) : (
    <a className="pill" href="#design-notes">
      {inner}
    </a>
  );
}
