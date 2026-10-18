import { about } from "@/data";
import { type HeadingTag, kickerFor, PanelShell } from "./PanelShell";

export function AboutPanel({ code, as = "h2" }: { code?: string; as?: HeadingTag }) {
  return (
    <PanelShell id="about" title={about.title} kicker={kickerFor(code, "About")} as={as}>
      <p className="lead">{about.bio}</p>
      <div className="skills">
        {about.skillGroups.map((group) => (
          <div key={group.name}>
            <span className="kicker">{group.name}</span>
            <ul className="tags" aria-label={group.name}>
              {group.items.map((item) => (
                <li key={item} className="chip">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="meta">{about.now}</p>
    </PanelShell>
  );
}
