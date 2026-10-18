import Link from "next/link";

import { about, contact, featured, person } from "@/data";
import { AboutPanel } from "@/components/panels/AboutPanel";
import { ContactPanel } from "@/components/panels/ContactPanel";
import { ExperiencePanel } from "@/components/panels/ExperiencePanel";
import { MoreProjectsPanel } from "@/components/panels/MoreProjectsPanel";
import { ProjectPanel } from "@/components/panels/ProjectPanel";

import { Reveal } from "./Reveal";
import { TextNav } from "./TextNav";

/**
 * The whole line as one readable page. Server-rendered, no three.js.
 * Used directly for reduced-data and no-WebGL visitors, and linked from the
 * train at any time.
 */
export function TextPage() {
  return (
    <div id="top" className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-accentInk"
      >
        Skip to content
      </a>
      <TextNav />

      <main id="main" className="mx-auto flex max-w-3xl flex-col gap-12 px-4 pb-24 pt-12 sm:px-6">
        <section aria-labelledby="hero-heading" className="panel flex flex-col gap-4">
          <p className="kicker">Portfolio · Expo Line · Vancouver, BC</p>
          <h1 id="hero-heading" className="font-serif text-5xl leading-none tracking-tight text-fg sm:text-6xl">
            {person.name}
          </h1>
          <p className="lead max-w-measure">{person.tagline}</p>
          <p className="meta">{about.now}</p>
          <p className="text-sm text-muted">
            This is the text version of the site. The same content is a ride on the Expo Line at{" "}
            <Link href="/" className="text-fg underline decoration-border underline-offset-4">
              the home page
            </Link>
            .
          </p>
        </section>

        <Reveal>
          <section aria-labelledby="about" className="border-t border-border pt-10">
            <AboutPanel />
          </section>
        </Reveal>

        <Reveal>
          <section aria-labelledby="experience" className="border-t border-border pt-10">
            <ExperiencePanel />
          </section>
        </Reveal>

        <section aria-labelledby="projects-heading" className="flex flex-col gap-12">
          <h2 id="projects-heading" className="sr-only">
            Projects
          </h2>
          <span id="projects" className="block h-0" aria-hidden="true" />
          {featured.map((project, index) => (
            <Reveal key={project.id} delay={Math.min(index, 2) * 0.05}>
              <div className="border-t border-border pt-10">
                <ProjectPanel project={project} as="h3" />
              </div>
            </Reveal>
          ))}
        </section>

        <Reveal>
          <section aria-labelledby="more-projects" className="border-t border-border pt-10">
            <MoreProjectsPanel />
          </section>
        </Reveal>

        <Reveal>
          <section aria-labelledby="contact" className="border-t border-border pt-10">
            <ContactPanel />
          </section>
        </Reveal>
      </main>

      <footer className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 pb-12 text-sm text-muted sm:px-6">
        <p>
          {person.name} · {new Date().getFullYear()}
        </p>
        <p>
          <a href={contact.github} className="hover:text-fg" target="_blank" rel="noreferrer noopener">
            GitHub
          </a>
          {" · "}
          <a href={contact.linkedin} className="hover:text-fg" target="_blank" rel="noreferrer noopener">
            LinkedIn
          </a>
        </p>
      </footer>
    </div>
  );
}
