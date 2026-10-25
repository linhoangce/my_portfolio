import type { SectionId } from "@/data";
import { projectById } from "@/data";

import { AboutPanel } from "./AboutPanel";
import { ContactPanel } from "./ContactPanel";
import { DepartPanel } from "./DepartPanel";
import { ExperiencePanel } from "./ExperiencePanel";
import { MoreProjectsPanel } from "./MoreProjectsPanel";
import type { HeadingTag } from "./PanelShell";
import { ProjectPanel } from "./ProjectPanel";

/** Renders the panel for a section; used by the station dock and /text. */
export function PanelFor({ id, as = "h2" }: { id: SectionId; as?: HeadingTag }) {
  switch (id) {
    case "depart":
      return <DepartPanel as={as} />;
    case "about":
      return <AboutPanel as={as} />;
    case "experience":
      return <ExperiencePanel as={as} />;
    case "more-projects":
      return <MoreProjectsPanel as={as} />;
    case "contact":
      return <ContactPanel as={as} />;
    default:
      return <ProjectPanel project={projectById[id]} as={as} />;
  }
}
