import React, { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Decal, Float, OrbitControls, Preload, useTexture } from "@react-three/drei";

import CanvasLoader from "./Loader";

const Balls = (props) => {
	const [decal] = useTexture([props.imgUrl]);

	return (
		<Float
			speed={1.75}
			rotationIntensity={1}
			floatIntensity={2}
		>
			<ambientLight intensity={0.5} />
			<directionalLight position={[0, 5,5]} />
			<mesh
				castShadow
				receiveShadow
				scale={2.75}
			>
				<sphereGeometry args={[1, 32]} />
				<meshStandardMaterial
					color="#fff8eb"
					polygonOffset
					polygonOffsetFactor={-5}
					flatShading
				/>
				<Decal
					position={[0, 0, 1]}
					rotation={[2 * Math.PI, 0, 6.25]}
					flatShading
					map={decal}
				/>
			</mesh>
		</Float>
	);
};

const BallCanvas = ({ icon }) => {
	return (
		<Canvas
			frameloop="demand"
			gl={{ preserveDrawingBuffer: true }}
		>
			<Suspense fallback={<CanvasLoader />}>
				<OrbitControls enableZoom={false} />
				<Balls imgUrl={icon} />
			</Suspense>

			<Preload all />
		</Canvas>
	);
};

export default BallCanvas;
