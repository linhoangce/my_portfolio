import Link from "next/link";

export function LoadingScreen({ message = "Loading the outpost…", hideSpinner = false }: { message?: string; hideSpinner?: boolean }) {
  return (
    <div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-bg px-6 text-center"
      role="status"
      aria-live="polite"
    >
      <Link
        href="/flat"
        className="absolute left-4 top-4 rounded-full border border-border/25 bg-surface/60 px-4 py-2 text-sm text-fg hover:border-cyan/60 hover:text-cyan"
      >
        Skip to flat version
      </Link>
      <p className="eyebrow">Tide Lab</p>
      <h1 className="font-serif text-4xl text-fg sm:text-5xl">Linh Hoang</h1>
      <p className="max-w-sm text-sm text-muted">{message}</p>
      {!hideSpinner ? (
        <div className="relative h-1 w-48 overflow-hidden rounded-full bg-surface" aria-hidden="true">
          <div className="absolute inset-y-0 w-1/3 animate-[slide_1.2s_ease-in-out_infinite] rounded-full bg-cyan" />
        </div>
      ) : null}
      <p className="text-xs text-muted">WASD to waddle · Shift to slide · Space to jump · E to read · M for the menu</p>
      <style>{`@keyframes slide { 0% { left: -33% } 100% { left: 100% } }`}</style>
    </div>
  );
}
