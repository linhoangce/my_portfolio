import { FaLocationArrow } from "react-icons/fa6";

import { socialMedia } from "@/data";
import MagicButton from "./MagicButton";
import { Boxes } from "./ui/BackgroundBoxes";

const Footer = () => {
	return (
		<footer className="w-full h-48 items-baseline">
			<div
				className="h-96 relative w-full overflow-hidden bg-slate-900 flex flex-col rounded-lg m-0"
				id="contact"
			>
				<div className="absolute inset-0 w-full h-full bg-slate-900 z-20 [mask-image:radial-gradient(transparent,white)] pointer-events-none" />
				<Boxes />
				<div className="flex mt-16 md:flex-row flex-col justify-between items-center">
					<p className="md:text-base text-sm md:font-normal font-light ml-5">
						Copyright © 2024 Linh Hoang
					</p>
					<div className="flex items-center md:gap-3 gap-6 mr-5">
						{socialMedia.map((info) => (
							<a
								key={info.id}
								className="w-10 h-10 cursor-pointer flex justify-center items-center backdrop-filter backdrop-blur-lg saturate-180 bg-opacity-75 bg-black-900 rounded-lg border border-black-300"
								href={info.link}
								target="_blank"
							>
								<img
									src={info.img}
									alt="icons"
									width={20}
									height={20}
								/>
							</a>
						))}
					</div>
				</div>
			</div>
		</footer>
	);
};

export default Footer;
