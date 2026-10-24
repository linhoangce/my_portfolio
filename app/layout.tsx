import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Instrument_Sans, Instrument_Serif } from "next/font/google";

import "./globals.css";
import { ThemeProvider } from "./provider";

const sans = Instrument_Sans({
  subsets: ["latin"],
  weight: "variable",
  style: ["normal", "italic"],
  variable: "--font-sans",
  display: "swap",
});

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

const description =
  "Linh Hoang's portfolio as a ride on the Expo Line through a stylized Vancouver: ten stops, one per section. Projects in machine learning, backend systems and LLM agents: Awdon, Planktoneer, Vessel Vision, AI Weed Detector and ABCKidz.";

export const metadata: Metadata = {
  metadataBase: new URL("https://linh-hoang.vercel.app"),
  title: {
    default: "Linh Hoang — Expo Line",
    template: "%s · Linh Hoang",
  },
  description,
  openGraph: {
    title: "Linh Hoang — Expo Line",
    description,
    url: "/",
    siteName: "Linh Hoang",
    type: "website",
    images: [{ url: "/thumbnail.png", width: 800, height: 600, alt: "Linh Hoang portfolio" }],
  },
  icons: { icon: "/logo.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#070a12" },
    { media: "(prefers-color-scheme: light)", color: "#f3f5f9" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body className="font-sans">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
