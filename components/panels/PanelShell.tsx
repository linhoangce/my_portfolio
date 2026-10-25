import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";

import type { ProjectLink } from "@/data";
import { cn } from "@/lib/utils";

export type HeadingTag = "h1" | "h2" | "h3";

type PanelShellProps = {
  title: string;
  /** Context above the heading where it says something the title does not (a project's event); never a station label. */
  kicker?: string;
  as?: HeadingTag;
  id?: string;
  className?: string;
  children: ReactNode;
};

/**
 * Shared frame for every content panel. The same markup renders on /text and
 * inside the station dock, so it carries no layout assumptions of its own. The
 * head (any context line and the title) is always the first child, so the
 * dock's staged reveal counts the same with or without a context line.
 */
export function PanelShell({ title, kicker, as: Heading = "h2", id, className, children }: PanelShellProps) {
  return (
    <article id={id} className={cn("panel", className)}>
      <header>
        {kicker ? <p className="kicker mb-1.5 mt-0">{kicker}</p> : null}
        <Heading className="font-serif text-fg">{title}</Heading>
      </header>
      {children}
    </article>
  );
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
