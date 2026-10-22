import { about } from "@/data";
import { type HeadingTag, kickerFor, PanelShell } from "./PanelShell";

export function AboutPanel({ code, as = "h2" }: { code?: string; as?: HeadingTag }) {
  return (
    <PanelShell id="about" title={about.title} kicker={kickerFor(code, "About")} as={as}>
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
