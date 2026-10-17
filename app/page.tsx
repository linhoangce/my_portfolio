import Link from "next/link";

import { person } from "@/data";

// Placeholder until the game gate lands in the next step.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-start justify-center gap-6 px-6">
      <h1 className="font-serif text-5xl text-fg">{person.name}</h1>
      <p className="text-muted">{person.tagline}</p>
      <Link href="/flat" className="btn-primary">
        See the portfolio
      </Link>
    </main>
  );
}
