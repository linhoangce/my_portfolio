"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { createContext, useContext } from "react";

import { Links } from "./PanelShell";

/**
 * What a panel can ask of the page it is on: the ride swaps the Foreword for the Inspirations in its column and back;
 * /text has the Inspirations as a section of their own further down.
 */
export const PanelActions = createContext<{ showInspirations?: () => void; showForeword?: () => void }>({});

/** The way to the Inspirations: a button where the page swaps them in, a link to their section otherwise. */
export function InspirationsLink() {
  const { showInspirations } = useContext(PanelActions);
  const inner = (
    <>
      Inspirations
      <ArrowRight className="h-3 w-3" aria-hidden="true" />
    </>
  );
  return showInspirations ? (
    <button type="button" className="pill" onClick={showInspirations}>
      {inner}
    </button>
  ) : (
    <a className="pill" href="#inspirations">
      {inner}
    </a>
  );
}

/** Back to the Foreword, where the Inspirations took its place; nothing where they are a section of their own. */
export function ForewordLink() {
  const { showForeword } = useContext(PanelActions);
  if (!showForeword) return null;
  return (
    <Links links={[]}>
      <li>
        <button type="button" className="pill" onClick={showForeword}>
          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
          Foreword
        </button>
      </li>
    </Links>
  );
}
