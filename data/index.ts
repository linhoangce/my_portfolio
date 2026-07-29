export const navItems = [
	{ name: "About", link: "#about" },
	{ name: "Projects", link: "#projects" },
	{ name: "Experience", link: "#experience" },
	{ name: "Contact", link: "#contact" },
];

export const gridItems = [
	{
		id: 1,
		title: "I am passionate, creative, and analytic. ",
		// description:
		// 	"A 2026 BCIT CST graduate looking to leverage data-driven insights in a full-time Junior Developer or Machine Learning Engineer capacity.",
		className: "lg:col-span-3 md:col-span-6 md:row-span-4 lg:min-h-[60vh]",
		imgClassName: "w-full h-full",
		titleClassName: "justify-end",
		img: "/b1.svg",
		spareImg: "",
	},
	{
		id: 2,
		title: "",
		description: "Building in Vancouver, Canada",
		className: "lg:col-span-2 md:col-span-3 md:row-span-2",
		imgClassName: "",
		titleClassName: "justify-start",
		img: "",
		spareImg: "",
	},
	{
		id: 3,
		title: "My latest tech stack",
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
		title: "If you are curious about what we're building, please reach out.",
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
		id: 8,
		title: "Mini OpenClaw",
		des: "An AI assistant gateway with Telegram support, persistent memory, filesystem/shell/cron tools, and automated monitoring using Python, asynchronous architecture, and the OpenAI API.",
		img: "/miniclaw.png",
		iconLists: ["/python.png", "/openai-logo.svg", "/telegram.png"],
		link: "https://github.com/linhoangce/mini_openclaw",
	},

	{
		id: 9,
		title: "LEXMind",
		des: "An AI legal assistant with OpenAI Realtime voice interaction, specialized agents, and an Obsidian-compatible knowledge vault.",
		img: "/vibe_code_hack.png",
		iconLists: ["/typescript.png", "/openai-logo.svg", "/react.png"],
		link: "https://github.com/linhoangce/law-hacks",
	},

	{
		id: 10,
		title: "AI Weed Detector",
		des: "For an industry-sponsored project, collected and labelled a custom blueberry-field dataset, then built and evaluated an RF-DETR detection pipeline with Roboflow, Google Colab, and Weights & Biases. It achieved 0.6354 mAP@50 and 0.6782 F1.",
		img: "/weed.png",
		iconLists: ["/python.png", "/roboflow.png", "/wandb.png"],
		link: "https://colab.research.google.com/drive/17qp86__5waQNhgb6oadyiIXPdealv-4C#scrollTo=1c04f3b7&uniqifier=8",
	},

	{
		id: 10,
		title: "ABCKidz Website",
		des: "Built a REST API backend for a children’s learning platform, including role-based access control, PostgreSQL/Prisma data models, Azure GPT-4o chatbot integration with prompt caching, and streamed Azure Blob Storage uploads/downloads up to 100 MB.",
		img: "/abckidz.png",
		iconLists: ["/typescript.png", "/azure.jpg", "/postgres.png"],
		link: "https://www.abckidz.org/",
	},

	{
		id: 7,
		title: "Vessel Vision",
		des: "High-performance marine surveillance system developed for Ocean Hackathon Victoria 2025, leveraging state-of-the-art YOLO models and SAHI-enhanced inference to detect multi-scale vessels in high-resolution imagery with production-ready deployment for maritime security and monitoring.",
		img: "/vessel.png",
		iconLists: ["/python.png", "/ultralytics.svg", "/hf-logo.svg", "/pytorch.svg"],
		link: "https://huggingface.co/spaces/linhoang/yolo_boat_detector",
	},

	{
		id: 1,
		title: "Zentry Replica",
		des: "A high-performance replica of the Awwward-winning Zentry website, featuring immersive 3D scroll animations, seamless page transitions, and a gaming-inspired UI built with React and GSAP",
		img: "/zentry.png",
		iconLists: ["/next.svg", "/tail.svg", "/ts.svg", "/gsap.svg"],
		link: "https://animated-website-zentry.vercel.app/",
	},
	{
		id: 2,
		title: "Zooom",
		des: "Simplify your video conferencing experience with Zooom. Seamlessly connect with colleagues and friends.",
		img: "/p2.svg",
		iconLists: ["/next.svg", "/tail.svg", "/ts.svg", "/stream.svg", "/c.svg"],
		link: "https://zoom-clone-psi-bay.vercel.app",
	},
	{
		id: 3,
		title: "Imaginify",
		des: "A REAL Software-as-a-Service app with AI features and a payments and credits system using the latest tech stack.",
		img: "/p3.svg",
		iconLists: ["/re.svg", "/tail.svg", "/ts.svg", "/c.svg"],
		link: "https://imaginify-gamma-neon.vercel.app",
	},
	{
		id: 4,
		title: "iPhone15",
		des: "Recreated the Apple iPhone 15 Pro website, combining GSAP animations and Three.js 3D effects..",
		img: "/p4.svg",
		iconLists: ["/next.svg", "/tail.svg", "/ts.svg", "/three.svg", "/gsap.svg"],
		link: "https://iphone15-clone-alpha.vercel.app",
	},
	{
		id: 5,
		title: "LiveDoc",
		des: "A real-time collaborative editor with Lexical and Liveblocks for markdown support, real-time nested comments, and emoji integration.",
		img: "/livedoc.png",
		iconLists: ["/next.svg", "/tail.svg", "/ts.svg", "/socket-io.svg", "/liveblocks.svg"],
		link: "https://live-document-editor.vercel.app",
	},
	{
		id: 6,
		title: "FitUp",
		des: "Empower your fitness journey with FitUp, a smart AI-driven app, offering personalized tasks, real-time progress updates, and nutrition recommendations to achieve your goals alongside friends, so join FitUp today!",
		img: "/fitup.png",
		iconLists: ["/nodejs.svg", "/ggspeech.svg", "/three.svg", "/mongo.svg", "/tf.svg", "groq.svg"],
		link: "https://fit-up-hy4k.onrender.com",
	},
	{
		id: 7,
		title: "Farmify",
		des: "A commercial app that connects farmers directly with consumers to reduce the cost and time spent buying fresh and healthy produce while supporting local, small-scale farms that contributes to our community's sustainability and increase the farmers' profit share. Users can now create a post, write their reviews, bookmark their favorites, add items to their carts, and send a message to the farms. Users can also enjoy better experience using the app thanks to improved UI design, add items to cart with the price calculated and go to checkout page, review and leave star rating for each post, view their current location with Google map on our app, unsave bookmarks.",
		img: "/farmify.png",
		iconLists: ["/html.svg", "/css.svg", "/bootstrap.svg", "/firebase.svg", "/js.svg"],
		link: "https://comp1800-bby14-b87af.web.app/",
	},
];

export const workExperience = [
	{
		id: 1,
		time: "2025-Present",
		title: "Software QA Engineer - Internship",
		content:
			"Technical QA Intern with hands-on experience in automating distributed systems using Playwright, Java, and Jenkins, specifically focusing on high-throughput telecom and messaging platforms. I specialize in the configuration and troubleshooting of multi-VM Linux environments, ensuring seamless service-to-service communication across protocols like Kafka, MQTT, and TR-069",
		className: "md:col-span-2 overflow-hidden",
		thumbnail: "/incognito.jpg",
	},
	{
		id: 2,
		time: "2021-2023",
		title: "Medical Interpreter L4",
		content:
			"Ensured 100% accuracy in English-Vietnamese conversations by actively listening, analyzing nuanced meanings, and applying correct industry terminology across healthcare, insurance, finance, and other technical sectors.",
		className: "md:col-span-2 overflow-hidden",
		thumbnail: "/lls.png",
	},
	{
		id: 3,
		time: "2019-2020",
		title: "Project Manager",
		content:
			"Designed and developed a new cafe concept that result in a 166% sales increase, expenses below 25% of budget, and monthly profits exceeding targets by 320%. ",
		className: "md:col-span-2 overflow-hidden", // change to md:col-span-2
		thumbnail: "/haviland.jpg",
	},
	{
		id: 4,
		time: "2018-2019",
		title: "Training & Development Specialist",
		content:
			"Applied lean thinking and operational excellence methodologies to improve workflow while developing and delivering training programs that boosted sales by 198%, reduced labor costs by 130% and customer wait times by 5 times.",
		className: "md:col-span-2 overflow-hidden", // change to md:col-span-2
		thumbnail: "/christina.jpg",
	},
	{
		id: 5,
		time: "2014-2016",
		title: "Operation Supervisor",
		content:
			"Optimized team operations, ensuring efficiency and hygiene, driving significant sales growth: 150% increase in merchandise sales, 600% increase in whole coffee package sales, 175% increase in food sales",
		className: "md:col-span-2",
		thumbnail: "/starbucks.jpg",
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
	{ name: "Python", logoUrl: "python.png" },
	{ name: "Pytorch", logoUrl: "pytorch.png" },
	{ name: "ScikitLearn", logoUrl: "sklearn.png" },
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
	{ name: "TensorflowJS", logoUrl: "tensorflow.png" },
	{ name: "THREE.js", logoUrl: "three.png" },
	{ name: "Figma", logoUrl: "/figma.png" },
	{ name: "Git", logoUrl: "git.png" },
	{ name: "GCP", logoUrl: "google-cloud.png" },
	{ name: "Blender", logoUrl: "blender.png" },
];
