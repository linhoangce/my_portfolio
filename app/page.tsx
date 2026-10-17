import Link from "next/link";

import { GameGate } from "@/components/game/GameGate";
import { about, contact, featured, person } from "@/data";

export default function Home() {
  return (
    <>
      <GameGate />
      {/* Crawlable summary of the content that lives inside the game. Visually hidden; /flat is the readable page. */}
      <main className="sr-only" aria-label="Portfolio summary">
        <h1>{person.name}</h1>
        <p>{person.tagline}</p>
        <p>{about.bio}</p>
        <p>
          This page is an interactive portfolio: a small penguin game set in the Tide Lab outpost. The same content is on{" "}
          <Link href="/flat">the flat version</Link>.
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
