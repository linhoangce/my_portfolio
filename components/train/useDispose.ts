import { useEffect, useRef } from "react";

const mounted = new WeakMap<object, number>();

/**
 * Dispose what a component built once it has really gone. StrictMode mounts, unmounts and mounts again with the same
 * memo, and a BatchedMesh disposed in between has lost the textures it draws from (its frames then throw); so the
 * disposal waits a tick, and a remount in that tick keeps it.
 */
export function useDispose<T extends object>(built: T, dispose: (b: T) => void): void {
  const fn = useRef(dispose);
  fn.current = dispose;
  useEffect(() => {
    mounted.set(built, (mounted.get(built) ?? 0) + 1);
    return () => {
      mounted.set(built, (mounted.get(built) ?? 1) - 1);
      setTimeout(() => {
        if (!mounted.get(built)) fn.current(built);
      }, 0);
    };
  }, [built]);
}
