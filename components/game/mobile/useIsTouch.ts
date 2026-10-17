"use client";

import { useEffect, useState } from "react";

/** True on coarse-pointer devices (phones, tablets). Stable after mount. */
export function useIsTouch(): boolean {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setTouch(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return touch;
}

export function isTouchDevice(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}
