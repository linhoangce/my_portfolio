import React from "react";
import { Timeline } from "./ui/Timeline";
import { workExperience } from "@/data";
import { BackgroundBeams } from "./ui/BackgroundBeam";

const Development = () => {
	return (
		<div className="h-auto relative z-10 w-full">
			<Timeline data={workExperience} />
			<BackgroundBeams />
		</div>
	);
};

export default Development;
