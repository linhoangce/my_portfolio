import { depart } from "@/data";
import { type HeadingTag, kickerFor, PanelShell } from "./PanelShell";

export function DepartPanel({ code, as = "h2" }: { code?: string; as?: HeadingTag }) {
  return (
    <PanelShell id="depart" title={depart.title} kicker={kickerFor(code, "Depart")} as={as}>
      <p className="lead">{depart.lead}</p>
      <p className="meta">
        {depart.meta[0]}
        <br />
        {depart.meta[1]}
      </p>
      <p>{depart.body}</p>
    </PanelShell>
  );
}
