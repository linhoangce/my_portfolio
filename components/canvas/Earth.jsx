import { Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Preload, useGLTF, Float, useAnimations } from "@react-three/drei";
import { useRef } from "react";

import CanvasLoader from "./Loader";

const Earth = () => {
	const group = useRef();
	const {scene, animations} = useGLTF("./planet/scene.gltf");
	const { actions } = useAnimations(animations, group);

	useFrame((state, delta) => {
		if (actions) {
			Object.keys(actions).forEach((key) => {
				actions[key].play();
			})
		}
	});

	return (
		<Float>
			<primitive
				ref={group}
				object={scene}
				scale={1.5}
				position-y={0}
				rotation-y={0}
			/>
			<ambientLight intensity={2} />
			<directionalLight position={[0, 0, 2]} />
		</Float>
	);
};

const EarthCanvas = () => {
	return (
		<Canvas
			shadows
			frameloop="demand"
			gl={{ preserveDrawingBuffer: true }}
			camera={{
				fov: 45,
				near: 0.1,
				far: 200,
				position: [-4, 3, 6],
			}}
		>
			<Suspense fallback={<CanvasLoader />}>
				<OrbitControls
					autoRotate
					enableZoom={true}
					maxPolarAngle={Math.PI}
					minPolarAngle={0}
				/>
				<Earth />
				<Preload all />
			</Suspense>
		</Canvas>
	);
};

export default EarthCanvas;
