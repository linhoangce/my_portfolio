"use client";

import { useWorld } from "./world";

/** Hemisphere fill, the sun / moon (shadow caster, follows the train) and the warm point light over the nearest station. */
export function Lights() {
  const { lights } = useWorld();
  return (
    <>
      <primitive object={lights.hemi} />
      <primitive object={lights.sun} />
      <primitive object={lights.sun.target} />
      <primitive object={lights.stationLight} />
    </>
  );
}
