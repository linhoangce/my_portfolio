import type { Metadata } from "next";

import { FlatPage } from "@/components/flat/FlatPage";
import { about, contact, person } from "@/data";

export const metadata: Metadata = {
  title: "Portfolio",
  description: `${person.tagline}. ${about.bio}`,
  alternates: { canonical: "/flat" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: person.name,
  url: person.url,
  email: `mailto:${contact.email}`,
  jobTitle: "Software developer",
  alumniOf: "British Columbia Institute of Technology",
  sameAs: [contact.github, contact.linkedin],
};

export default function Flat() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <FlatPage />
    </>
  );
}
