"use client";

import { useWorld } from "./world";

/** Gradient dome, sun / moon disc and stars; all follow the camera (see Look). */
export function Sky() {
  const { sky, precip } = useWorld();
  return (
    <>
      <primitive object={sky.mesh} />
      <primitive object={sky.disc} />
      <primitive object={sky.stars} />
      <primitive object={precip.rain} />
      <primitive object={precip.snow} />
    </>
  );
}
