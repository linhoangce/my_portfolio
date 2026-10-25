import Image from "next/image";

import type { Project } from "@/data";
import { type HeadingTag, Links, PanelShell, Tags } from "./PanelShell";

export function ProjectPanel({ project, as = "h2" }: { project: Project; as?: HeadingTag }) {
  const tall = project.shot ? project.shot.height > project.shot.width : false;
  return (
    <PanelShell id={project.id} title={project.title} kicker={project.context} as={as}>
      <p className="lead">{project.lead}</p>
      <dl className="par">
        <dt>Problem</dt>
        <dd>{project.problem}</dd>
        <dt>Approach</dt>
        <dd>{project.approach}</dd>
        <dt>Result</dt>
        <dd>{project.result}</dd>
      </dl>
      <Tags tags={project.tags} />
      <Links links={project.links} />
      {project.shot ? (
        <figure className="shot">
          <div className="bar" aria-hidden="true">
            <i />
            <i />
            <i />
            <span>{project.shot.caption}</span>
          </div>
          <div className={tall ? "relative aspect-[16/9] overflow-hidden" : undefined}>
            <Image
              src={project.shot.src}
              alt={`${project.title}: ${project.shot.caption}`}
              width={project.shot.width}
              height={project.shot.height}
              sizes="(max-width: 860px) 100vw, 420px"
              className={tall ? "absolute inset-0 h-full w-full object-cover object-top" : "block h-auto w-full"}
            />
          </div>
        </figure>
      ) : null}
    </PanelShell>
  );
}
