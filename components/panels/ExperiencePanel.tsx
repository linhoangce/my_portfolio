import { roles } from "@/data";
import { type HeadingTag, PanelShell } from "./PanelShell";

export function ExperiencePanel({ as = "h2" }: { as?: HeadingTag }) {
  return (
    <PanelShell id="experience" title="Experience" as={as}>
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
