import type { Metadata } from "next";

import { TextPage } from "@/components/text/TextPage";
import { about, contact, person } from "@/data";

export const metadata: Metadata = {
  title: "Text version",
  description: `${person.tagline}. ${about.bio}`,
  alternates: { canonical: "/text" },
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

export default function Text() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <TextPage />
    </>
  );
}
