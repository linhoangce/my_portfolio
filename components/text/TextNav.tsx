import Link from "next/link";
import { TrainFront } from "lucide-react";

import { person } from "@/data";

const items = [
  { href: "#about", label: "About" },
  { href: "#experience", label: "Experience" },
  { href: "#projects", label: "Projects" },
  { href: "#contact", label: "Contact" },
];

export function TextNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur-md">
      <nav aria-label="Primary" className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <a href="#top" className="font-serif text-xl tracking-tight text-fg">
          {person.name}
        </a>
        <ul className="hidden items-center gap-5 text-sm text-muted sm:flex">
          {items.map((item) => (
            <li key={item.href}>
              <a href={item.href} className="transition-colors hover:text-fg">
                {item.label}
              </a>
            </li>
          ))}
        </ul>
        <Link href="/" className="btn">
          <TrainFront className="h-4 w-4 text-accent" aria-hidden="true" />
          Back to the train
        </Link>
      </nav>
    </header>
  );
}
