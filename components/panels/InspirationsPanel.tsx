import { MAP_SOURCES } from "@/components/train/mapSources";
import { acknowledgements, inspirations, landAcknowledgement } from "@/data";
import { ForewordLink } from "./PanelActions";
import { type HeadingTag, PanelShell } from "./PanelShell";

/**
 * Where the ride's new designs came from, then the vision, then every acknowledgement: the land, the Indigenous art by
 * name and the map's sources. Not a stop: on the ride it takes the Foreword's place.
 */
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
      <h3 className="kicker mb-0 mt-6">Acknowledgements</h3>
      <h4 className="ack-h">The land</h4>
      <p className="ack">{landAcknowledgement}</p>
      <h4 className="ack-h">Indigenous art</h4>
      <p className="ack">{acknowledgements.art}</p>
      <ul className="acks">
        {acknowledgements.works.map((w) => (
          <li key={w.name}>
            <b>{w.name}</b> {w.note}
            {w.work ? (
              <>
                {" "}
                <cite>{w.work}</cite>.
              </>
            ) : null}
          </li>
        ))}
      </ul>
      <h4 className="ack-h">Map data</h4>
      <ul className="acks">
        {MAP_SOURCES.map((m) => (
          <li key={m.label}>
            <a href={m.href} target="_blank" rel="noreferrer noopener">
              {m.label}
            </a>
            : {m.note}
          </li>
        ))}
      </ul>
      <ForewordLink />
    </PanelShell>
  );
}
