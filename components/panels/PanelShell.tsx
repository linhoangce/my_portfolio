import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";

import type { ProjectLink } from "@/data";
import { cn } from "@/lib/utils";

export type HeadingTag = "h1" | "h2" | "h3";

type PanelShellProps = {
  title: string;
  /** Kicker: "03 · Awdon" style line above the heading. */
  kicker?: string;
  as?: HeadingTag;
  id?: string;
  className?: string;
  children: ReactNode;
};

/**
 * Shared frame for every content panel. The same markup renders on /text and
 * inside the station dock, so it carries no layout assumptions of its own.
 */
export function PanelShell({ title, kicker, as: Heading = "h2", id, className, children }: PanelShellProps) {
  return (
    <article id={id} className={cn("panel", className)}>
      {kicker ? <p className="kicker mb-1.5 mt-0">{kicker}</p> : null}
      <Heading className="font-serif text-fg">{title}</Heading>
      {children}
    </article>
  );
}

/** "03 · Cursor Hackathon…" when a station code is given, the context alone otherwise. */
export function kickerFor(code: string | undefined, context: string): string {
  return code ? `${code} · ${context}` : context;
}

export function Tags({ tags, label }: { tags: string[]; label?: string }) {
  return (
    <ul className="tags" aria-label={label ?? "Technologies"}>
      {tags.map((tag) => (
        <li key={tag} className="chip">
          {tag}
        </li>
      ))}
    </ul>
  );
}

export function Links({ links, children }: { links: ProjectLink[]; children?: ReactNode }) {
  if (links.length === 0 && !children) return null;
  return (
    <ul className="links">
      {links.map((link) => (
        <li key={link.href}>
          <a className="pill" href={link.href} target="_blank" rel="noreferrer noopener">
            {link.label}
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </a>
        </li>
      ))}
      {children}
    </ul>
  );
}
