import { depart } from "@/data";
import { InspirationsLink } from "./PanelActions";
import { type HeadingTag, kickerFor, Links, PanelShell } from "./PanelShell";

export function DepartPanel({ code, as = "h2" }: { code?: string; as?: HeadingTag }) {
  return (
    <PanelShell id="depart" title={depart.title} kicker={kickerFor(code, "Explore")} as={as}>
      <p className="lead">{depart.lead}</p>
      <Links links={[]}>
        <li>
          <InspirationsLink />
        </li>
      </Links>
    </PanelShell>
  );
}
