import { FaLocationArrow } from "react-icons/fa6";

import MagicButton from "./MagicButton";
import { Spotlight } from "./ui/Spotlight";
import { TextGenerateEffect } from "./ui/TextGenerateEffect";
import { ComputersCanvas } from "./canvas";
import { styles } from "./styles";

const Hero = () => {
	return (
		<section className="w-full relative w-full h-screen mx-auto bg-hero-pattern bg-cover bg-no-repeat bg-center">
			<div className="flex flex-col absolute inset-0 top-[120px] max-w-7xl mx-auto items-start gap-5">
				<div
					className={`${styles.paddingX} inset-0 top-[120px] max-w-7xl mx-auto flex flex-col items-start gap-5 `}
				>
					{/* <p className="uppercase tracking-widest text-xm text-center absolute top-[-10%]">
						<span className="text-purple">Hi, welcome to my portfolio!</span>
					</p> */}
					{/* text-[#915eff] */}
					<div className="flex flex-col items-center justify-center z-10">
						<TextGenerateEffect
							words={`I'm Linh. I'm a student at BCIT in the Computer System Technology Co-op program.`}
							className="text-center text-[30px] md:text-3xl lg:text-4xl"
						/>

						<a
							className="absolute bottom-10"
							href="#about"
						>
							<MagicButton
								title="Get to know me"
								icon={<FaLocationArrow />}
								position="right"
							/>
						</a>
					</div>
				</div>
			</div>

			<ComputersCanvas />
		</section>
	);
};

export default Hero;
