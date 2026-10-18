import { FileText, Mail } from "lucide-react";

import { contact } from "@/data";
import { type HeadingTag, Links, PanelShell } from "./PanelShell";

export function ContactPanel({ as = "h2" }: { as?: HeadingTag }) {
  return (
    <PanelShell id="contact" title={contact.heading} eyebrow="Contact" as={as}>
      <p className="max-w-measure">The fastest way to reach me is email. I reply within a day.</p>
      <ul className="flex flex-wrap gap-2">
        <li>
          <a className="pill" href={`mailto:${contact.email}`}>
            <Mail className="h-4 w-4" aria-hidden="true" />
            {contact.email}
          </a>
        </li>
        <li>
          <a className="pill" href={contact.resume} target="_blank" rel="noreferrer noopener">
            <FileText className="h-4 w-4" aria-hidden="true" />
            Resume
          </a>
        </li>
      </ul>
      <Links
        links={[
          { label: "GitHub", href: contact.github },
          { label: "LinkedIn", href: contact.linkedin },
        ]}
      />
    </PanelShell>
  );
}
