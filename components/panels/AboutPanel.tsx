import { about } from "@/data";
import { type HeadingTag, PanelShell } from "./PanelShell";

export function AboutPanel({ as = "h2" }: { as?: HeadingTag }) {
  return (
    <PanelShell id="about" title={about.title} as={as}>
      <p className="lead">{about.bio}</p>
      <div className="skills">
        <span className="kicker">Favourite tools</span>
        <ul className="tags" aria-label="Favourite tools">
          {about.tools.map((item) => (
            <li key={item} className="chip">
              {item}
            </li>
          ))}
        </ul>
      </div>
      <p className="meta">{about.now}</p>
    </PanelShell>
  );
}
