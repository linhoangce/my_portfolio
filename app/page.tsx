import Link from "next/link";

import { TrainGate } from "@/components/train/TrainGate";
import { about, contact, featured, person } from "@/data";

export default function Home() {
  return (
    <>
      <TrainGate />
      {/* Crawlable summary of the content that lives along the line. Visually hidden; /text is the readable page. */}
      <main className="sr-only" aria-label="Portfolio summary">
        <h1>{person.name}</h1>
        <p>{person.tagline}</p>
        <p>{about.bio}</p>
        <p>
          This page is an interactive portfolio: a ride on the Expo Line through a stylized Vancouver, one stop per
          section. The same content is on <Link href="/text">the text version</Link>.
        </p>
        <h2>Projects</h2>
        <ul>
          {featured.map((project) => (
            <li key={project.id}>
              <strong>{project.title}</strong> — {project.context}. {project.copy}{" "}
              {project.links.map((link) => (
                <a key={link.href} href={link.href}>
                  {link.label}
                </a>
              ))}
            </li>
          ))}
        </ul>
        <h2>Contact</h2>
        <p>
          <a href={`mailto:${contact.email}`}>{contact.email}</a> · <a href={contact.github}>GitHub</a> ·{" "}
          <a href={contact.linkedin}>LinkedIn</a>
        </p>
      </main>
    </>
  );
}
