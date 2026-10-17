import { FileText, Mail } from "lucide-react";

import { contact } from "@/data";
import { type HeadingTag, Links, PanelShell } from "./PanelShell";

export type ScoreSummary = {
  score: number;
  missionsDone: number;
  missionsTotal: number;
};

export function ContactPanel({ as = "h2", score }: { as?: HeadingTag; score?: ScoreSummary }) {
  return (
    <PanelShell id="contact" title={contact.heading} eyebrow="Contact" as={as}>
      {score ? (
        <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border/15 bg-surface/50 p-3.5">
          <div>
            <dt className="eyebrow">Score</dt>
            <dd className="font-serif text-3xl text-cyan">{score.score}</dd>
          </div>
          <div>
            <dt className="eyebrow">Missions</dt>
            <dd className="font-serif text-3xl text-fg">
              {score.missionsDone}
              <span className="text-muted"> / {score.missionsTotal}</span>
            </dd>
          </div>
        </dl>
      ) : null}
      <p className="max-w-measure">
        The fastest way to reach me is email. I reply within a day.
      </p>
      <ul className="flex flex-wrap gap-2">
        <li>
          <a className="link-pill" href={`mailto:${contact.email}`}>
            <Mail className="h-4 w-4" aria-hidden="true" />
            {contact.email}
          </a>
        </li>
        <li>
          <a className="link-pill" href={contact.resume} target="_blank" rel="noreferrer noopener">
            <FileText className="h-4 w-4" aria-hidden="true" />
            Resume
          </a>
        </li>
      </ul>
      <Links
        links={[
          { label: "GitHub", href: contact.github },
          { label: "LinkedIn", href: contact.linkedin },
        ]}
      />
    </PanelShell>
  );
}
