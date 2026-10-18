import type { SectionId } from "@/data";
import { projectById } from "@/data";

import { AboutPanel } from "./AboutPanel";
import { ContactPanel } from "./ContactPanel";
import { ExperiencePanel } from "./ExperiencePanel";
import { MoreProjectsPanel } from "./MoreProjectsPanel";
import type { HeadingTag } from "./PanelShell";
import { ProjectPanel } from "./ProjectPanel";

/** Renders the panel for a section id; used by the station dock and /text. */
export function PanelFor({ id, as = "h2" }: { id: SectionId; as?: HeadingTag }) {
  switch (id) {
    case "about":
      return <AboutPanel as={as} />;
    case "more-projects":
      return <MoreProjectsPanel as={as} />;
    case "experience":
      return <ExperiencePanel as={as} />;
    case "contact":
      return <ContactPanel as={as} />;
    default: {
      const project = projectById[id];
      return project ? <ProjectPanel project={project} as={as} /> : null;
    }
  }
}
