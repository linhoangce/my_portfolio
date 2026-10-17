import { ExternalLink } from "lucide-react";

import { moreProjects } from "@/data";
import { type HeadingTag, PanelShell } from "./PanelShell";

export function MoreProjectsPanel({ as = "h2" }: { as?: HeadingTag }) {
  return (
    <PanelShell id="more-projects" title="More projects" eyebrow="The shelf" as={as}>
      <ul className="grid gap-2 sm:grid-cols-2">
        {moreProjects.map((item) => {
          const body = (
            <>
              <span className="flex items-center gap-1.5 font-medium text-fg">
                {item.title}
                {item.href ? <ExternalLink className="h-3.5 w-3.5 opacity-60" aria-hidden="true" /> : null}
              </span>
              <span className="text-sm text-muted">{item.copy}</span>
            </>
          );
          return (
            <li key={item.title}>
              {item.href ? (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex h-full flex-col gap-1 rounded-xl border border-border/15 bg-surface/50 p-3.5 transition-colors hover:border-cyan/50"
                >
                  {body}
                </a>
              ) : (
                <div className="flex h-full flex-col gap-1 rounded-xl border border-border/10 bg-surface/30 p-3.5">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </PanelShell>
  );
}
