import { roles } from "@/data";
import { type HeadingTag, kickerFor, PanelShell } from "./PanelShell";

export function ExperiencePanel({ code, as = "h2" }: { code?: string; as?: HeadingTag }) {
  return (
    <PanelShell id="experience" title="Experience" kicker={kickerFor(code, "Experience")} as={as}>
      <ol className="mt-3.5 list-none p-0">
        {roles.map((role) => (
          <li key={`${role.period}-${role.title}`} className="role">
            <span className="when">{role.period}</span>
            <div>
              <b>{role.title}</b>
              <br />
              <span>{role.detail}</span>
            </div>
          </li>
        ))}
      </ol>
    </PanelShell>
  );
}
