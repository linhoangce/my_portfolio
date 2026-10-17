import Image from "next/image";

import type { Project } from "@/data";
import { type HeadingTag, Links, PanelShell, Tags } from "./PanelShell";

export function ProjectPanel({ project, as = "h2" }: { project: Project; as?: HeadingTag }) {
  return (
    <PanelShell id={project.id} title={project.title} eyebrow={project.context} as={as}>
      {project.image ? (
        <div className="relative aspect-[16/9] overflow-hidden rounded-xl border border-border/15 bg-surface">
          <Image
            src={project.image}
            alt={`${project.title} screenshot`}
            fill
            sizes="(max-width: 768px) 100vw, 640px"
            className="object-cover"
          />
        </div>
      ) : null}
      <p className="max-w-measure text-pretty">{project.copy}</p>
      <Tags tags={project.tags} />
      <Links links={project.links} />
    </PanelShell>
  );
}
