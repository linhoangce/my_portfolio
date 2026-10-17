import Link from "next/link";
import { Gamepad2 } from "lucide-react";

import { person } from "@/data";

const items = [
  { href: "#about", label: "About" },
  { href: "#projects", label: "Projects" },
  { href: "#experience", label: "Experience" },
  { href: "#contact", label: "Contact" },
];

export function FlatNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-border/10 bg-bg/80 backdrop-blur-md">
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6"
      >
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
        <Link href="/?play=1" className="btn-ghost min-h-10 px-4 text-sm">
          <Gamepad2 className="h-4 w-4 text-cyan" aria-hidden="true" />
          Play the game
        </Link>
      </nav>
    </header>
  );
}
