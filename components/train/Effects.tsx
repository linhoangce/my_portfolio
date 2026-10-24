"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { HalfFloatType, Vector2, WebGLRenderTarget } from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import { useWorld } from "./world";

/** Desktop-only bloom (strength eased by the look: 0.22 at night, 0.1 by day) through three's own composer, multisampled. */
export function Effects() {
  const world = useWorld();
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const viewport = useThree((s) => s.viewport);

  const built = useMemo(() => {
    // a 4× MSAA target: without it the composer renders aliased and the trees' alpha-to-coverage has nothing to work with
    const composer = new EffectComposer(gl, new WebGLRenderTarget(size.width, size.height, { type: HalfFloatType, samples: 4 }));
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new Vector2(size.width, size.height), 0.24, 0.45, 1.0);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    return { composer, bloom };
    // size is applied in the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera]);

  useEffect(() => {
    built.composer.setPixelRatio(viewport.dpr);
    built.composer.setSize(size.width, size.height);
  }, [built, size, viewport.dpr]);

  useEffect(() => {
    world.refs.bloom = built.bloom;
    return () => {
      world.refs.bloom = null;
      built.composer.dispose();
    };
  }, [world, built]);

  useFrame(() => {
    built.composer.render();
  }, 1);

  return null;
}
