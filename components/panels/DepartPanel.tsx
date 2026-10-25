import { Fragment } from "react";

import { depart } from "@/data";
import { DesignNotesLink } from "./PanelActions";
import { type HeadingTag, kickerFor, Links, PanelShell } from "./PanelShell";

export function DepartPanel({ code, as = "h2" }: { code?: string; as?: HeadingTag }) {
  return (
    <PanelShell id="depart" title={depart.title} kicker={kickerFor(code, "Explore")} as={as}>
      <p className="lead">{depart.lead}</p>
      <p>{depart.how}</p>
      <p className="meta">
        {depart.meta.map((line, i) => (
          <Fragment key={line}>
            {i ? <br /> : null}
            {line}
          </Fragment>
        ))}
      </p>
      <Links links={[]}>
        <li>
          <DesignNotesLink />
        </li>
      </Links>
    </PanelShell>
  );
}
