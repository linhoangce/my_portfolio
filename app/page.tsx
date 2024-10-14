"use client";

import { navItems } from "@/data";

import Hero from "@/components/Hero";
import Grid from "@/components/Grid";
import Footer from "@/components/Footer";
import Approach from "@/components/Values";
import Experience from "@/components/Experience";
import RecentProjects from "@/components/RecentProjects";
import { FloatingNav } from "@/components/ui/FloatingNavbar";
import Contact from "@/components/Contact";
import Development from "@/components/Development";

const Home = () => {
	return (
		<main className="relative w-full bg-black-100 flex justify-center items-center flex-col overflow-hidden">
			<Hero />
			{/* <div className="max-w-7xl w-full mx-auto sm:px-10 px-0"> */}
				<FloatingNav navItems={navItems} />
				<Grid />
				<RecentProjects />
				{/* <Experience /> */}
				<Development />
				<Approach />
			{/* </div> */}
			<Contact />
			<Footer />
		</main>
	);
};

export default Home;
