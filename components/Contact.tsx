import { useState, useRef } from "react";
import { motion } from "framer-motion";
import emailjs from "@emailjs/browser";

import { styles } from "./styles";
import { EarthCanvas, StarsCanvas } from "./canvas";
import { SectionWrapper } from "../hoc";
import { slideIn } from "@/lib/motion";
import MagicButton from "./MagicButton";
import { FaLocationArrow } from "react-icons/fa6";
import { socialMedia } from "@/data";

const Contact = () => {
	const [form, setForm] = useState({
		name: "",
		email: "",
		message: "",
	});
	const [loading, setLoading] = useState(false);
	const formRef = useRef();

	const handleChange = (e) => {
		const { name, value } = e.target;

		setForm({ ...form, [name]: value });
	};

	const handleSubmit = (e) => {
		e.preventDefault();

		setLoading(true);

		emailjs
			.send(
				"service_rh9lm4a",
				"template_5pemkoo",
				{
					from_name: form.name,
					to_name: "Linh",
					from_email: form.email,
					to_email: "linhoang.ce@gmail.com",
					message: form.message,
				},
				"6Y19uZYNwmTBMVtD0"
			)
			.then(
				() => {
					setLoading(false);
					alert("Thank you. I will be in touch as soon as possible.");

					setForm({
						name: "",
						email: "",
						message: "",
					});
				},
				(error) => {
					setLoading(false);

					console.log("Error sending contact information!", error);

					alert("Something went wrong, please try again!");
				}
			);
	};

	return (
		<div className="w-full xl:mt-12 flex xl:flex-row flex-col-reverse gap-10 overflow-hidden z-50">
			<motion.div
				variants={slideIn("left", "tween", 0.2, 1)}
				className="flex-[0.75] bg-black100 p-8 rounded-2xl z-50"
			>
				<p className={styles.sectionSubText}>Get in touch</p>
				<h3 className={styles.sectionHeadText}>Contact.</h3>
				<form
					ref={formRef}
					onSubmit={handleSubmit}
					className="mt-12 flex flex-col gap-8"
				>
					<label
						htmlFor=""
						className="flex flex-col"
					>
						<span className="text-white font-medium mb-4">Your name</span>
						<input
							type="text"
							name="name"
							value={form.name}
							onChange={handleChange}
							placeholder="What's your name?"
							className="bg-tertiary px-6 py-4 placeholder:text-secondary text-white rounded-lg outlined-none border-none font-medium"
						/>
					</label>
					<label
						htmlFor=""
						className="flex flex-col"
					>
						<span className="text-white font-medium mb-4">Your email</span>
						<input
							type="email"
							name="email"
							value={form.email}
							onChange={handleChange}
							placeholder="What's your email?"
							className="bg-tertiary px-6 py-4 placeholder:text-secondary text-white rounded-lg outlined-none border-none font-medium"
						/>
					</label>
					<label
						htmlFor=""
						className="flex flex-col"
					>
						<span className="text-white font-medium mb-4">Your message</span>
						<textarea
							rows="7"
							name="message"
							value={form.message}
							onChange={handleChange}
							placeholder="Type your message here..."
							className="bg-tertiary px-6 py-4 placeholder:text-secondary text-white rounded-lg outlined-none border-none font-medium"
						/>
					</label>
					<button
						type="submit"
						className="bg-tertiary py-3 px-8 outline-none w-fit text-white font-bold shadow-md shadow-primary rounded-xl"
					>
						{loading ? "Sending..." : "Send"}
					</button>
				</form>
			</motion.div>
			<motion.div
				variants={slideIn("right", "tween", 0.2, 1)}
				className="xl:flex-1 xl:h-auto md:h-[550px] h-[350px]"
			>
				<StarsCanvas />
				<EarthCanvas />
			</motion.div>
		</div>
	);
};

export default SectionWrapper(Contact, "contact");
