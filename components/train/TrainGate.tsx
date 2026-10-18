"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Gate = "checking" | "redirect" | "ok";

type NavigatorExtras = Navigator & { connection?: { saveData?: boolean } };

/** WebGL2 and data-saver check; anything that fails goes to /text. */
function canRide(): boolean {
  try {
    const nav = navigator as NavigatorExtras;
    if (nav.connection?.saveData) return false;
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Client gate for the home page: checks capabilities, redirects to /text when
 * the ride would be a bad experience, otherwise mounts the scene.
 */
export function TrainGate() {
  const router = useRouter();
  const [gate, setGate] = useState<Gate>("checking");

  useEffect(() => {
    if (canRide()) {
      setGate("ok");
    } else {
      setGate("redirect");
      router.replace("/text");
    }
  }, [router]);

  useEffect(() => {
    if (gate !== "ok") return;
    document.documentElement.dataset.train = "1";
    return () => {
      delete document.documentElement.dataset.train;
    };
  }, [gate]);

  if (gate === "redirect") {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-bg px-6 text-center text-sm text-muted">
        <p>
          This browser cannot run the ride, so here is the text version.{" "}
          <Link href="/text" className="text-fg underline underline-offset-4">
            Open it
          </Link>
          .
        </p>
      </div>
    );
  }
  return <div className="fixed inset-0 bg-bg" aria-hidden="true" />;
}
