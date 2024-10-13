export const navItems = [
	{ name: "About", link: "#about" },
	{ name: "Projects", link: "#projects" },
	{ name: "Experience", link: "#experience" },
	{ name: "Contact", link: "#contact" },
];

export const gridItems = [
	{
		id: 1,
		title:
			"I am passionate, creative, and currently looking for an internship starting in January 2025.",
		description: "",
		className: "lg:col-span-3 md:col-span-6 md:row-span-4 lg:min-h-[60vh]",
		imgClassName: "w-full h-full",
		titleClassName: "justify-end",
		img: "/b1.svg",
		spareImg: "",
	},
	{
		id: 2,
		title: "I'm currently in Burnaby, BC. However, I'm willing to relocate.",
		description: "",
		className: "lg:col-span-2 md:col-span-3 md:row-span-2",
		imgClassName: "",
		titleClassName: "justify-start",
		img: "",
		spareImg: "",
	},
	{
		id: 3,
		title: "My tech stack",
		description: "I constantly try to improve",
		className: "lg:col-span-2 md:col-span-3 md:row-span-2",
		imgClassName: "",
		titleClassName: "justify-center",
		img: "",
		spareImg: "",
	},
	{
		id: 4,
		title: "Tech enthusiast with a passion for development.",
		description: "",
		className: "lg:col-span-2 md:col-span-3 md:row-span-1",
		imgClassName: "",
		titleClassName: "justify-start",
		img: "/grid.svg",
		spareImg: "/b4.svg",
	},

	{
		id: 5,
		title: "Tech Stack",
		description: "",
		className: "md:col-span-3 md:row-span-2",
		imgClassName: "absolute right-0 bottom-0 md:w-96 w-60",
		titleClassName: "justify-center md:justify-start lg:justify-center",
		img: "",
		spareImg: "/grid.svg",
	},
	{
		id: 6,
		title: "If you find my portfolio a match with your company's roles, please send me an email.",
		description: "",
		className: "lg:col-span-2 md:col-span-3 md:row-span-1",
		imgClassName: "",
		titleClassName: "justify-center md:max-w-full max-w-60 text-center",
		img: "",
		spareImg: "",
	},
];

export const projects = [
	{
		id: 1,
		title: "FitUp",
		des: "Empower your fitness journey with FitUp, a smart AI-driven app, offering personalized tasks, real-time progress updates, and nutrition recommendations to achieve your goals alongside friends, so join FitUp today!",
		img: "/fitup.png",
		iconLists: ["/nodejs.svg", "/ggspeech.svg", "/three.svg", "/mongo.svg", "/tf.svg", "groq.svg"],
		link: "https://fitupapp.onrender.com/",
	},
	{
		id: 2,
		title: "Zooom",
		des: "Simplify your video conferencing experience with Zooom. Seamlessly connect with colleagues and friends.",
		img: "/p2.svg",
		iconLists: ["/next.svg", "/tail.svg", "/ts.svg", "/stream.svg", "/c.svg"],
		link: "zoom-clone-psi-bay.vercel.app",
	},
	{
		id: 3,
		title: "Imaginify",
		des: "A REAL Software-as-a-Service app with AI features and a payments and credits system using the latest tech stack.",
		img: "/p3.svg",
		iconLists: ["/re.svg", "/tail.svg", "/ts.svg", "/three.svg", "/c.svg"],
		link: "imaginify-gamma-neon.vercel.app",
	},
	{
		id: 4,
		title: "iPhone15",
		des: "Recreated the Apple iPhone 15 Pro website, combining GSAP animations and Three.js 3D effects..",
		img: "/p4.svg",
		iconLists: ["/next.svg", "/tail.svg", "/ts.svg", "/three.svg", "/gsap.svg"],
		link: "iphone15-clone-alpha.vercel.app",
	},
	{
		id: 5,
		title: "LiveDoc",
		des: "A real-time collaborative editor with Lexical and Liveblocks for markdown support, real-time nested comments, and emoji integration.",
		img: "/livedoc.png",
		iconLists: ["/next.svg", "/tail.svg", "/ts.svg", "/socket-io.svg", "/liveblocks.svg"],
		link: "live-document-editor.vercel.app",
	},
	{
		id: 6,
		title: "Farmify",
		des: "A commercial app that connects farmers directly with consumers to reduce the cost and time spent buying fresh and healthy produce while supporting local, small-scale farms that contributes to our community's sustainability and increase the farmers' profit share. Users can now create a post, write their reviews, bookmark their favorites, add items to their carts, and send a message to the farms. Users can also enjoy better experience using the app thanks to improved UI design, add items to cart with the price calculated and go to checkout page, review and leave star rating for each post, view their current location with Google map on our app, unsave bookmarks.",
		img: "/farmify.png",
		iconLists: ["/html.svg", "/css.svg", "/bootstrap.svg", "/firebase.svg", "/js.svg"],
		link: "https://comp1800-bby14-b87af.web.app/",
	},
];

export const companies = [
	{
		id: 1,
		name: "cloudinary",
		img: "/cloud.svg",
		nameImg: "/cloudName.svg",
	},
	{
		id: 2,
		name: "appwrite",
		img: "/app.svg",
		nameImg: "/appName.svg",
	},
	{
		id: 3,
		name: "HOSTINGER",
		img: "/host.svg",
		nameImg: "/hostName.svg",
	},
	{
		id: 4,
		name: "stream",
		img: "/s.svg",
		nameImg: "/streamName.svg",
	},
	{
		id: 5,
		name: "docker.",
		img: "/dock.svg",
		nameImg: "/dockerName.svg",
	},
];

export const workExperience = [
	{
		id: 1,
		title: "Medical Interpreter L4",
		desc: "Ensured 100% accuracy in English-Vietnamese conversations by actively listening, analyzing nuanced meanings, and applying correct industry terminology across healthcare, insurance, finance, and other technical sectors.",
		className: "md:col-span-2 overflow-hidden",
		thumbnail: "/exp1.svg",
	},
	{
		id: 2,
		title: "Project Manager",
		desc: "Designed and developed a new cafe concept that result in a 166% sales increase, expenses below 25% of budget, and monthly profits exceeding targets by 320%. ",
		className: "md:col-span-2 overflow-hidden", // change to md:col-span-2
		thumbnail: "/exp2.svg",
	},
	{
		id: 3,
		title: "Training & Development Specialist",
		desc: " improve workflow while developing and delivering training programs that boosted sales by 198%, reduced labor costs by 130% and customer wait times by 5 times.",
		className: "md:col-span-2 overflow-hidden", // change to md:col-span-2
		thumbnail: "/exp3.svg",
	},
	{
		id: 4,
		title: "Operation Supervisor",
		desc: "Optimized team operations, ensuring efficiency and hygiene, driving significant sales growth: 150% increase in merchandise sales, 600% increase in whole coffee package sales, 175% increase in food sales",
		className: "md:col-span-2",
		thumbnail: "/exp4.svg",
	},
];

export const socialMedia = [
	{
		id: 1,
		img: "/git.svg",
		link: "https://github.com/linhoangce",
	},
	{
		id: 3,
		img: "/link.svg",
		link: "https://www.linkedin.com/in/lhoang-bcit/",
	},
];

export const skills = [
	{ name: "Java", logoUrl: "/java.png" },
	{ name: "C", logoUrl: "/c.png" },
	{ name: "TypeScript", logoUrl: "/typescript.png" },
	{ name: "JavaScript", logoUrl: "/js.png" },
	{ name: "CSS", logoUrl: "/css.png" },
	{ name: "HTML", logoUrl: "/html.png" },
	{ name: "React", logoUrl: "/react.png" },
	{ name: "Next.js", logoUrl: "nextjs.png" },
	{ name: "Tailwind CSS", logoUrl: "/tailwind.png" },
	{ name: "MySQL", logoUrl: "mysql.png" },
	{ name: "NodeJS", logoUrl: "nodejs.png" },
	{ name: "OpenAI", logoUrl: "openai.png" },
	{ name: "TensorflowJS", logoUrl: "/tensorflowjs.png" },
	{ name: "THREE.js", logoUrl: "three.png" },
	{ name: "Figma", logoUrl: "/figma.png" },
	{ name: "Git", logoUrl: "git.png" },
];
