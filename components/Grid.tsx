import { gridItems } from "@/data";
import { BentoGrid, BentoGridItem } from "./ui/BentoGrid";
import Laptop from "./canvas/Laptop";

const Grid = () => {
	return (
		<section
			id="about"
			className="max-w-7xl w-full mx-auto sm:px-10 px-0"
		>
			<BentoGrid className="w-full p-20">
				{gridItems.map((item, i) => (
					<BentoGridItem
						id={item.id}
						key={i}
						title={item.title}
						description={item.description}
						// remove icon prop
						// remove original classname condition
						className={item.className}
						img={item.img}
						imgClassName={item.imgClassName}
						titleClassName={item.titleClassName}
						spareImg={item.spareImg}
					/>
				))}
			</BentoGrid>
		</section>
	);
};

export default Grid;
