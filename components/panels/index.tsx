import type { SectionId } from "@/data";
import { projectById } from "@/data";

import { AboutPanel } from "./AboutPanel";
import { ContactPanel, type ScoreSummary } from "./ContactPanel";
import { ExperiencePanel } from "./ExperiencePanel";
import { MoreProjectsPanel } from "./MoreProjectsPanel";
import type { HeadingTag } from "./PanelShell";
import { ProjectPanel } from "./ProjectPanel";

export type { ScoreSummary };

/** Renders the panel for a section id; used by the in-world screens and the menu. */
export function PanelFor({ id, as = "h2", score }: { id: SectionId; as?: HeadingTag; score?: ScoreSummary }) {
  switch (id) {
    case "about":
      return <AboutPanel as={as} />;
    case "more-projects":
      return <MoreProjectsPanel as={as} />;
    case "experience":
      return <ExperiencePanel as={as} />;
    case "contact":
      return <ContactPanel as={as} score={score} />;
    default: {
      const project = projectById[id];
      return project ? <ProjectPanel project={project} as={as} /> : null;
    }
  }
}
