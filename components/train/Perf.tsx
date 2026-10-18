"use client";

import { PerformanceMonitor } from "@react-three/drei";
import { useRef } from "react";

import { useTrain } from "./store";

/** Steps the pixel ratio down (1.75 → 1.25 → 1.0) and then turns bloom off when the frame rate drops; steps back up when it recovers. */
export function Perf() {
  const level = useRef(0);
  const lowEnd = useTrain((s) => s.env.lowEnd);
  const setQuality = useTrain((s) => s.setQuality);
  const top = lowEnd ? 1.5 : 1.75;
  const apply = () => {
    const l = level.current;
    setQuality({ dpr: l === 0 ? top : l === 1 ? 1.25 : 1.0, bloom: !lowEnd && l < 3 });
  };
  return (
    <PerformanceMonitor
      ms={250}
      iterations={8}
      flipflops={4}
      onDecline={() => {
        level.current = Math.min(3, level.current + 1);
        apply();
      }}
      onIncline={() => {
        level.current = Math.max(0, level.current - 1);
        apply();
      }}
    />
  );
}
