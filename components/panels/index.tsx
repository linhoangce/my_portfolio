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
export function PanelFor({ id, code, as = "h2" }: { id: SectionId; code?: string; as?: HeadingTag }) {
  switch (id) {
    case "depart":
      return <DepartPanel code={code} as={as} />;
    case "about":
      return <AboutPanel code={code} as={as} />;
    case "experience":
      return <ExperiencePanel code={code} as={as} />;
    case "more-projects":
      return <MoreProjectsPanel code={code} as={as} />;
    case "contact":
      return <ContactPanel code={code} as={as} />;
    default:
      return <ProjectPanel project={projectById[id]} code={code} as={as} />;
  }
}
