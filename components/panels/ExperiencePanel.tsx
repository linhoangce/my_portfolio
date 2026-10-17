import { roles } from "@/data";
import { type HeadingTag, PanelShell } from "./PanelShell";

export function ExperiencePanel({ as = "h2" }: { as?: HeadingTag }) {
  return (
    <PanelShell id="experience" title="Experience" eyebrow="Timeline" as={as}>
      <ol className="relative flex flex-col gap-4 border-l border-border/20 pl-5">
        {roles.map((role) => (
          <li key={`${role.period}-${role.title}`} className="relative">
            <span
              className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full bg-cyan shadow-[0_0_12px_rgb(var(--cyan)/0.8)]"
              aria-hidden="true"
            />
            <p className="eyebrow">{role.period}</p>
            <p className="font-medium text-fg">{role.title}</p>
            {role.detail ? <p className="text-sm text-muted">{role.detail}</p> : null}
          </li>
        ))}
      </ol>
    </PanelShell>
  );
}
