import { contact } from "@/data";
import { type HeadingTag, kickerFor, Links, PanelShell } from "./PanelShell";

export function ContactPanel({ code, as = "h2" }: { code?: string; as?: HeadingTag }) {
  return (
    <PanelShell id="contact" title={contact.heading} kicker={kickerFor(code, "Contact")} as={as}>
      <a className="email" href={`mailto:${contact.email}`}>
        {contact.email}
      </a>
      <p>{contact.body}</p>
      <Links
        links={[
          { label: "GitHub", href: contact.github },
          { label: "LinkedIn", href: contact.linkedin },
        ]}
      >
        <li>
          <a className="pill" href={contact.resume} target="_blank" rel="noreferrer noopener">
            Resume (PDF)
          </a>
        </li>
      </Links>
    </PanelShell>
  );
}
