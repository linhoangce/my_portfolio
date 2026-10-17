import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif } from "next/font/google";

import "./globals.css";
import { ThemeProvider } from "./provider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument",
  display: "swap",
});

const description =
  "Linh Hoang's portfolio, playable as a penguin exploring the Tide Lab outpost. Projects in machine learning, backend systems and LLM agents: Awdon, Planktoneer, Vessel Vision, AI Weed Detector and ABCKidz.";

export const metadata: Metadata = {
  metadataBase: new URL("https://linh-hoang.vercel.app"),
  title: {
    default: "Linh Hoang — Tide Lab",
    template: "%s · Linh Hoang",
  },
  description,
  openGraph: {
    title: "Linh Hoang — Tide Lab",
    description,
    url: "/",
    siteName: "Linh Hoang",
    type: "website",
    images: [{ url: "/thumbnail.png", width: 800, height: 600, alt: "Linh Hoang portfolio" }],
  },
  icons: { icon: "/logo.png" },
};

export const viewport: Viewport = {
  themeColor: "#05070f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${instrument.variable}`}>
      <body className="font-sans">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
