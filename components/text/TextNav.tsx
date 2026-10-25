import Link from "next/link";
import { TrainFront } from "lucide-react";

import { person, stations } from "@/data";

const items = stations.filter((s) => ["about", "experience", "awdon", "contact"].includes(s.panel));

export function TextNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur-md">
      <nav aria-label="Primary" className="mx-auto flex max-w-[720px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <a href="#top" className="font-serif text-xl tracking-tight text-fg">
          {person.name}
        </a>
        <ul className="hidden items-center gap-5 text-sm text-muted sm:flex">
          {items.map((item) => (
            <li key={item.id}>
              <a href={`#stop-${item.code}`} className="transition-colors hover:text-fg">
                {item.panel === "awdon" ? "Projects" : item.section}
              </a>
            </li>
          ))}
        </ul>
        <Link href="/" className="btn">
          <TrainFront className="h-4 w-4 text-accentText" aria-hidden="true" />
          Back to the train
        </Link>
      </nav>
    </header>
  );
}
