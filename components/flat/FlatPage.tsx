import Link from "next/link";
import { ArrowRight, Gamepad2 } from "lucide-react";

import { about, contact, featured, person } from "@/data";
import { AboutPanel } from "@/components/panels/AboutPanel";
import { ContactPanel } from "@/components/panels/ContactPanel";
import { ExperiencePanel } from "@/components/panels/ExperiencePanel";
import { MoreProjectsPanel } from "@/components/panels/MoreProjectsPanel";
import { ProjectPanel } from "@/components/panels/ProjectPanel";

import { FlatNav } from "./FlatNav";
import { Reveal } from "./Reveal";

/**
 * The whole portfolio as one readable page. Server-rendered, no three.js.
 * Used directly for reduced-motion, no-WebGL and saveData visitors, and as a
 * link from the game at any time.
 */
export function FlatPage() {
  return (
    <div id="top" className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-bg"
      >
        Skip to content
      </a>
      <FlatNav />

      <main id="main" className="mx-auto flex max-w-5xl flex-col gap-24 px-4 pb-24 pt-16 sm:px-6 sm:pt-24">
        <section aria-labelledby="hero-heading" className="flex flex-col gap-6">
          <p className="eyebrow">Portfolio</p>
          <h1 id="hero-heading" className="font-serif text-5xl leading-[1.02] tracking-tight text-fg sm:text-7xl">
            {person.name}
          </h1>
          <p className="max-w-measure text-lg text-muted sm:text-xl">{person.tagline}</p>
          <p className="text-sm text-cyan">{about.now}</p>
          <div className="flex flex-wrap gap-3 pt-2">
            <a href="#projects" className="btn-primary">
              See the work
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <Link href="/?play=1" className="btn-ghost">
              <Gamepad2 className="h-4 w-4 text-cyan" aria-hidden="true" />
              Play as the penguin
            </Link>
          </div>
          <p className="text-sm text-muted">
            This is the flat version of the site. The same content also lives inside a small penguin game at{" "}
            <Link href="/?play=1" className="text-fg underline decoration-border/40 underline-offset-4">
              the home page
            </Link>
            .
          </p>
        </section>

        <Reveal>
          <section aria-labelledby="about" className="glass p-6 sm:p-8">
            <AboutPanel />
          </section>
        </Reveal>

        <section aria-labelledby="projects-heading" className="flex flex-col gap-8">
          <Reveal>
            <header className="flex flex-col gap-1.5">
              <p className="eyebrow">Featured</p>
              <h2 id="projects-heading" className="font-serif text-4xl tracking-tight text-fg sm:text-5xl">
                Projects
              </h2>
              <span id="projects" className="block h-0" aria-hidden="true" />
            </header>
          </Reveal>
          <div className="grid gap-6">
            {featured.map((project, index) => (
              <Reveal key={project.id} delay={Math.min(index, 2) * 0.05}>
                <div className="glass p-6 sm:p-8">
                  <ProjectPanel project={project} as="h3" />
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <Reveal>
          <section aria-labelledby="more-projects" className="glass p-6 sm:p-8">
            <MoreProjectsPanel />
          </section>
        </Reveal>

        <Reveal>
          <section aria-labelledby="experience" className="glass p-6 sm:p-8">
            <ExperiencePanel />
          </section>
        </Reveal>

        <Reveal>
          <section aria-labelledby="contact" className="glass p-6 sm:p-8">
            <ContactPanel />
          </section>
        </Reveal>
      </main>

      <footer className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 pb-12 text-sm text-muted sm:px-6">
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
