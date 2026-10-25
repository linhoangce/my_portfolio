import { inspirations } from "@/data";
import { ForewordLink } from "./PanelActions";
import { type HeadingTag, PanelShell } from "./PanelShell";

/** Where the ride's new designs came from, then the vision. Not a stop: on the ride it takes the Foreword's place. */
export function InspirationsPanel({ as = "h2" }: { as?: HeadingTag }) {
  return (
    <PanelShell id="inspirations" title={inspirations.title} kicker="Behind the ride" as={as} className="scroll-mt-20">
      <p className="lead">{inspirations.intro}</p>
      <ul className="inspo">
        {inspirations.items.map((item) => (
          <li key={item.title}>
            <b>{item.title}</b> {item.copy}
          </li>
        ))}
      </ul>
      <h3 className="kicker mb-0 mt-5">The vision</h3>
      <p>{inspirations.vision}</p>
      <ForewordLink />
    </PanelShell>
  );
}
