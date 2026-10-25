/** One petal of the blossom, pointing up from the flower's heart: narrow there so the petals part, notched at its tip. */
const PETAL = "M0 -4.86C-11.34 -9.18 -14.04 -24.3 -4.59 -27L0 -21.6L4.59 -27C14.04 -24.3 11.34 -9.18 0 -4.86Z";

/**
 * The site's mark, the blossom stop: five cherry blossom petals round a station dot (app/icon.svg is the same drawing
 * on the night ground, for the favicon). Its colours are the theme's (globals.css `.mark`), so it follows day and night;
 * the dot's ring takes `--mark-ring`, the colour of whatever it stands on.
 */
export function BlossomMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className ? `mark ${className}` : "mark"} aria-hidden="true" focusable="false">
      <g className="mark-petals">
        {[0, 72, 144, 216, 288].map((a) => (
          <path key={a} d={PETAL} transform={`translate(32 33.5) rotate(${a})`} />
        ))}
      </g>
      <circle className="mark-dot" cx="32" cy="33.5" r="6.4" strokeWidth="2.4" />
    </svg>
  );
}
