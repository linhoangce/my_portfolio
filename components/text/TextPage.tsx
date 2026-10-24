import Link from "next/link";

import { PanelFor } from "@/components/panels";
import { contact, landAcknowledgement, person, stations } from "@/data";

import { Reveal } from "./Reveal";
import { TextNav } from "./TextNav";
import { MAP_SOURCES } from "@/components/train/mapSources";

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

      <main id="main" className="mx-auto flex max-w-[720px] flex-col gap-12 px-4 pb-24 pt-10 sm:px-6">
        <p className="kicker">{person.name} · the whole line as text</p>
        {stations.map((station, index) => (
          <Reveal key={station.id}>
            <section
              aria-labelledby={station.panel}
              className={index === 0 ? undefined : "border-t border-border pt-10"}
              id={index === 0 ? undefined : `stop-${station.code}`}
            >
              <PanelFor id={station.panel} code={station.code} as={index === 0 ? "h1" : "h2"} />
            </section>
          </Reveal>
        ))}
        <p className="text-sm text-muted">
          This is the text version of the site. The same content is a ride on the Expo Line at{" "}
          <Link href="/" className="text-fg underline decoration-border underline-offset-4">
            the home page
          </Link>
          .
        </p>
      </main>

      <footer className="mx-auto flex max-w-[720px] flex-wrap items-center justify-between gap-3 px-4 pb-12 text-sm text-muted sm:px-6">
        <p className="w-full text-xs">{landAcknowledgement}</p>
        <p className="w-full text-xs">
          The 3D ride&apos;s map:{" "}
          {MAP_SOURCES.map((m, i) => (
            <span key={m.label}>
              {i ? "; " : ""}
              <a href={m.href} className="hover:text-fg" target="_blank" rel="noreferrer noopener">
                {m.label}
              </a>{" "}
              ({m.note})
            </span>
          ))}
          .
        </p>
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
