import React from "react";
import { Timeline } from "./ui/Timeline";
import { workExperience } from "@/data";
import { BackgroundBeams } from "./ui/BackgroundBeam";

const Development = () => {
	return (
		<div
			className="h-auto relative z-10 w-full mt-20 mb-20"
			id="experience"
		>
			<Timeline data={workExperience} />
			<BackgroundBeams className="pb-20" />
		</div>
	);
};

export default Development;
