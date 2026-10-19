/**
 * The captions pinned to each station's set, derived from the content in data/index.ts so every number on screen is
 * a real one: a project's metrics, the skill groups, the roles, the side projects, the ways to get in touch.
 * Three-free; the order matches the set's anchors, and `prio` picks which survive on a phone.
 */
import { about, contact, depart, featured, moreProjects, roles, type SectionId, stations } from "@/data";

export type Caption = { value: string; label: string; prio: number; href?: string };

const handle = (url: string) => url.replace(/\/$/, "").split("/").pop() ?? url;

export function captionsFor(panel: SectionId): Caption[] {
  switch (panel) {
    case "depart": {
      const [school, year] = depart.meta[0].split(" · ");
      return [
        { value: year ?? school, label: school, prio: 1 },
        { value: "Now", label: roles[0].title, prio: 2 },
        { value: String(stations.length), label: "stops ahead", prio: 3 },
      ];
    }
    case "about":
      return about.skillGroups.map((g, i) => ({ value: g.name, label: g.items.slice(0, 3).join(", "), prio: i + 1 }));
    case "experience":
      return roles.map((r, i) => ({ value: r.period, label: r.title, prio: i + 1 }));
    case "more-projects":
      // the gist only ("AI assistant gateway", not the whole line), so six kiosks' captions fit side by side
      return moreProjects.map((p, i) => ({ value: p.title, label: p.copy.split(/ (?:with|on|for|reacting)\b|[.,]/)[0], prio: i + 1, href: p.href }));
    case "contact":
      return [
        { value: "Email", label: contact.email, prio: 1, href: `mailto:${contact.email}` },
        { value: "GitHub", label: handle(contact.github), prio: 2, href: contact.github },
        { value: "LinkedIn", label: handle(contact.linkedin), prio: 3, href: contact.linkedin },
        { value: "Resume", label: "one page", prio: 4, href: contact.resume },
      ];
    default: {
      const p = featured.find((f) => f.id === panel);
      return p ? p.metrics.map((m, i) => ({ value: m.value, label: m.label, prio: i + 1 })) : [];
    }
  }
}
