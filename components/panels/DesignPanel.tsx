import { Fragment } from "react";

import { designNotes } from "@/data";
import { type HeadingTag, PanelShell } from "./PanelShell";

/** Where each of the ride's designs came from, then what's new. Not a stop: the ride shows it as a dialog, /text inline. */
export function DesignPanel({ as = "h2", kicker = true }: { as?: HeadingTag; kicker?: boolean }) {
  return (
    <PanelShell id="design-notes" title={designNotes.title} kicker={kicker ? "Behind the ride" : undefined} as={as} className="scroll-mt-20">
      <p className="lead">{designNotes.intro}</p>
      <dl className="par">
        {designNotes.notes.map((note) => (
          <Fragment key={note.title}>
            <dt>{note.title}</dt>
            <dd>{note.copy}</dd>
          </Fragment>
        ))}
      </dl>
      <h3 className="kicker mb-0 mt-6">What&apos;s new</h3>
      <ul className="news">
        {designNotes.whatsNew.map((item) => (
          <li key={item.copy}>
            <span className="when">{item.date}</span>
            <span>{item.copy}</span>
          </li>
        ))}
      </ul>
    </PanelShell>
  );
}
