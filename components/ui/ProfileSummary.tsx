"use client";
import { TypewriterEffectSmooth } from "../ui/Typewriter";

export default function ProfileSummary() {
	const words = [
		{
			text: "With",
		},
		{
			text: "10",
		},
		{
			text: "years",
		},
		{
			text: "of",
		},
		{
			text: "diverse",
		},
		{
			text: "experience,",
		},
		{
			text: "I",
		},
		{
			text: "specialized",
		},
		{
			text: "in",
		},
		{
			text: "client",
		},
		{
			text: "service,",
		},
		{
			text: "team",
		},
		{
			text: "management",
		},
		{
			text: "and",
		},
		{
			text: "training",
		},
		{
			text: "development",
		},
		{
			text: "across",
		},
		{
			text: "industries.",
		},
		{
			text: "I",
		},
		{
			text: "led",
		},
		{
			text: "successful",
		},
		{
			text: "transitions",
		},
		{
			text: "and",
		},
		{
			text: "operational",
		},
		{
			text: "improvements,",
		},
		{
			text: "significantly",
		},
		{
			text: "enhancing",
		},
		{
			text: "client",
		},
		{
			text: "satisfaction,",
		},
		{
			text: "sales",
		},
		{
			text: "growth,",
		},
		{
			text: "and",
		},
		{
			text: "budget",
		},
		{
			text: "management.",
		},
		{
			text: "These",
		},
		{
			text: "experiences",
		},
		{
			text: "highlight",
		},
		{
			text: "my",
		},
		{
			text: "adaptability,",
			className: "text-blue-500 dark:text-blue-500",
		},
		{
			text: "leadership,",
			className: "text-blue-500 dark:text-blue-500",
		},
		{
			text: "and",
		},
		{
			text: "aproblem-solving",
			className: "text-blue-500 dark:text-blue-500",
		},
		{
			text: "abilities",
		},
		{
			text: "across",
		},
		{
			text: "international",
		},
		{
			text: "contexts.",
		},
	];
	return (
		<div className="flex flex-col items-center justify-center h-[20rem]">
			<TypewriterEffectSmooth words={words} />
		</div>
	);
}
