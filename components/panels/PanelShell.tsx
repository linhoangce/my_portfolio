import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";

import type { ProjectLink } from "@/data";
import { cn } from "@/lib/utils";

export type HeadingTag = "h1" | "h2" | "h3";

type PanelShellProps = {
  title: string;
  eyebrow?: string;
  as?: HeadingTag;
  id?: string;
  className?: string;
  children: ReactNode;
};

/**
 * Shared frame for every content panel. The same markup renders on /flat and
 * inside the in-world screens, so it carries no layout assumptions of its own.
 */
export function PanelShell({ title, eyebrow, as: Heading = "h2", id, className, children }: PanelShellProps) {
  return (
    <article id={id} className={cn("prose-panel flex flex-col gap-5", className)}>
      <header className="flex flex-col gap-1.5">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <Heading className="font-serif text-3xl leading-tight tracking-tight text-fg sm:text-4xl">{title}</Heading>
      </header>
      {children}
    </article>
  );
}

export function Tags({ tags, label }: { tags: string[]; label?: string }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={label ?? "Technologies"}>
      {tags.map((tag) => (
        <li key={tag} className="chip">
          {tag}
        </li>
      ))}
    </ul>
  );
}

export function Links({ links }: { links: ProjectLink[] }) {
  if (links.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {links.map((link) => (
        <li key={link.href}>
          <a className="link-pill" href={link.href} target="_blank" rel="noreferrer noopener">
            {link.label}
            <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
          </a>
        </li>
      ))}
    </ul>
  );
}
