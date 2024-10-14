import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";
import { ThemeProvider } from "./provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
	title: "Linh's Portfolio",
	description:
		"Explore Linh's modern and creative portfolio, showcasing innovative web development projects, design skills, and expertise in building responsive, high-performance applications using cutting-edge technologies like Next.js, TypeScript, and AI-powered tools",
	openGraph: {
		title: "Linh's Portfolio",
		description:
			"Explore Linh's modern and creative portfolio, showcasing innovative web development projects, design skills, and expertise in building responsive, high-performance applications using cutting-edge technologies like Next.js, TypeScript, and AI-powered tools",
		url: "https://linh-hoang.vercel.app",
		type: "website",
		images: [
			{
				url: "/thumbnail.png",
				width: 800,
				height: 600,
				alt: "Linh's Portfolio",
			},
		],
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			lang="en"
			suppressHydrationWarning
		>
			<head>
				<link
					rel="icon"
					href="/logo.png"
					sizes="any"
				/>
			</head>
			<body className={inter.className}>
				<ThemeProvider
					attribute="class"
					defaultTheme="dark"
					enableSystem
					disableTransitionOnChange
				>
					{children}
				</ThemeProvider>
			</body>
		</html>
	);
}
