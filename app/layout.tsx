import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";
import { ThemeProvider } from "./provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
	title: "Linh's Portfolio",
	description: "Learn more about Linh's skills and experience",
	openGraph: {
		title: "Linh's Portfolio",
		description: "Modern & Creative Portfolio",
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
