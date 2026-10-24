"use client";

import { useThree } from "@react-three/fiber";
import { type ReactNode, useEffect, useMemo } from "react";

import { createWorld, WorldContext } from "./world";

/** Creates the shared materials, lights and sky once per canvas and hands them to every scene component. */
export function WorldProvider({ lowEnd, children }: { lowEnd: boolean; children: ReactNode }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const world = useMemo(() => createWorld(gl, scene, lowEnd), [gl, scene, lowEnd]);

  useEffect(() => {
    gl.domElement.setAttribute("role", "img");
    gl.domElement.setAttribute(
      "aria-label",
      "A SkyTrain on the Expo Line through a stylized Vancouver. Ten stops, one per portfolio section.",
    );
  }, [gl]);

  return <WorldContext.Provider value={world}>{children}</WorldContext.Provider>;
}
