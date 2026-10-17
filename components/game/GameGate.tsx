"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { type CapabilityReason, checkCapabilities, reasonText } from "@/lib/capabilities";

import { LoadingScreen } from "./LoadingScreen";

const Game = dynamic(() => import("./Game"), {
  ssr: false,
  loading: () => <LoadingScreen />,
});

type Status = { kind: "checking" } | { kind: "redirect"; reason: CapabilityReason } | { kind: "loading" } | { kind: "ready" } | { kind: "lost" };

/**
 * Client gate for the home page: checks capabilities, redirects to /flat when
 * the game would be a bad experience, otherwise lazy-loads the game chunk.
 */
export function GameGate() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "checking" });

  useEffect(() => {
    const force = new URLSearchParams(window.location.search).get("play") === "1";
    const result = checkCapabilities({ force });
    if (result.ok) {
      setStatus({ kind: "loading" });
    } else {
      setStatus({ kind: "redirect", reason: result.reason });
      router.replace("/flat");
    }
  }, [router]);

  useEffect(() => {
    if (status.kind === "redirect") return;
    document.documentElement.dataset.game = "1";
    return () => {
      delete document.documentElement.dataset.game;
    };
  }, [status.kind]);

  const onReady = useCallback(() => setStatus({ kind: "ready" }), []);
  const onContextLost = useCallback(() => setStatus({ kind: "lost" }), []);

  if (status.kind === "redirect") {
    return (
      <LoadingScreen
        hideSpinner
        message={`${reasonText[status.reason]} If it does not open, use the link in the corner.`}
      />
    );
  }
  if (status.kind === "checking") return <LoadingScreen />;
  if (status.kind === "lost") {
    return (
      <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-bg px-6 text-center" role="alert">
        <h1 className="font-serif text-3xl text-fg">The graphics context was lost.</h1>
        <p className="max-w-sm text-sm text-muted">The browser dropped WebGL. Reload to try again, or read the flat version.</p>
        <div className="flex gap-2">
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <Link href="/flat" className="btn-ghost">
            Flat version
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {status.kind === "loading" ? <LoadingScreen /> : null}
      <Game onReady={onReady} onContextLost={onContextLost} />
    </>
  );
}
