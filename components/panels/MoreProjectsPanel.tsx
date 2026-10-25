import { ArrowUpRight } from "lucide-react";

import { moreProjects } from "@/data";
import { type HeadingTag, PanelShell } from "./PanelShell";

/** One-column list: title, one-line description, external-link arrow. */
export function MoreProjectsPanel({ as = "h2" }: { as?: HeadingTag }) {
  return (
    <PanelShell id="more-projects" title="Project Gallery" as={as}>
      <p className="lead">Hackathon weekends, tools I use myself and experiments that taught me something.</p>
      <div className="more">
        {moreProjects.map((item) =>
          item.href ? (
            <a key={item.title} href={item.href} target="_blank" rel="noreferrer noopener">
              <div>
                <b>{item.title}</b>
                <small>{item.copy}</small>
              </div>
              <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
            </a>
          ) : (
            <div key={item.title}>
              <div>
                <b>{item.title}</b>
                <small>{item.copy}</small>
              </div>
              <span />
            </div>
          ),
        )}
      </div>
    </PanelShell>
  );
}
