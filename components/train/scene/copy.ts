/**
 * The captions pinned to a station's set, derived from the content in data/index.ts. Only two stops have them: the
 * Experience portals carry each role's years, and Contact's signposts are the contact links themselves (that stop
 * has no sidebar). Everywhere else the set speaks for itself and the sidebar carries the words. Three-free.
 */
import { contact, roles, type SectionId, stations } from "@/data";

export type Caption = { value: string; label: string; prio: number; href?: string };

const handle = (url: string) => url.replace(/\/$/, "").split("/").pop() ?? url;

export function captionsFor(panel: SectionId): Caption[] {
  if (panel === "experience") return roles.map((r, i) => ({ value: r.period, label: r.short ?? r.title, prio: i + 1 }));
  if (panel === "contact")
    return [
      { value: "Email", label: contact.email, prio: 1, href: `mailto:${contact.email}` },
      { value: "GitHub", label: handle(contact.github), prio: 2, href: contact.github },
      { value: "LinkedIn", label: handle(contact.linkedin), prio: 3, href: contact.linkedin },
      { value: "Resume", label: "one page", prio: 4, href: contact.resume },
    ];
  return [];
}

/** Whether a stop's scene opens the section sidebar; Contact's captions are the content instead (film mode only). */
export const hasSidebar = (i: number, filmOn = true): boolean => !filmOn || stations[i]?.panel !== "contact";

/** A stop whose captions are its content: they are real, focusable links rather than decoration. */
export const captionsAreContent = (i: number): boolean => stations[i]?.panel === "contact";
