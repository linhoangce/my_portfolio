import { about } from "@/data";
import { type HeadingTag, PanelShell } from "./PanelShell";

export function AboutPanel({ as = "h2" }: { as?: HeadingTag }) {
  return (
    <PanelShell id="about" title="About" eyebrow="Linh Hoang" as={as}>
      <p className="max-w-measure text-pretty">{about.bio}</p>
      <dl className="grid gap-4 sm:grid-cols-2">
        {about.skillGroups.map((group) => (
          <div key={group.name} className="rounded-xl border border-border/15 bg-surface/50 p-3.5">
            <dt className="eyebrow mb-2">{group.name}</dt>
            <dd className="flex flex-wrap gap-1.5">
              {group.items.map((item) => (
                <span key={item} className="chip">
                  {item}
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-cyan">{about.now}</p>
    </PanelShell>
  );
}
