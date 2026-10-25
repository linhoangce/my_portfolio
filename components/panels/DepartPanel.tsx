import { depart } from "@/data";
import { InspirationsLink } from "./PanelActions";
import { type HeadingTag, Links, PanelShell } from "./PanelShell";

export function DepartPanel({ as = "h2" }: { as?: HeadingTag }) {
  return (
    <PanelShell id="depart" title={depart.title} as={as}>
      <p className="lead">{depart.lead}</p>
      <Links links={[]}>
        <li>
          <InspirationsLink />
        </li>
      </Links>
    </PanelShell>
  );
}
