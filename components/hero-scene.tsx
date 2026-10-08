// A CSS/SVG "trail" animation — replaces the earlier Spline-based hero.
// Pure vector + CSS keyframes: no WebGL, no continuous render loop, no GPU
// cost worth mentioning, and nothing to license or watermark. Respects
// prefers-reduced-motion via the global rule in app/globals.css.
export function HeroScene() {
  return (
    <svg
      viewBox="0 0 500 500"
      className="h-full w-full"
      role="img"
      aria-label="An illustrated trail connecting waypoints, representing a learning roadmap"
    >
      <defs>
        <filter id="trail-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g className="text-mist-line/70 dark:text-ink-line/70" fill="currentColor">
        {Array.from({ length: 8 }).map((_, row) =>
          Array.from({ length: 8 }).map((_, col) => (
            <circle key={`${row}-${col}`} cx={30 + col * 62} cy={30 + row * 62} r="1.4" />
          ))
        )}
      </g>

      <path
        id="trail-path"
        d="M40 440 C 140 440, 110 300, 210 300 S 300 160, 320 140 S 420 90, 460 60"
        fill="none"
        stroke="#E8A33D"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="10 9"
        filter="url(#trail-glow)"
        className="animate-trail-flow"
        opacity="0.85"
      />

      {[
        { cx: 40, cy: 440, delay: "0s" },
        { cx: 210, cy: 300, delay: "0.6s" },
        { cx: 320, cy: 140, delay: "1.2s" },
        { cx: 460, cy: 60, delay: "1.8s" },
      ].map((p, i) => (
        <g key={i} style={{ transformBox: "fill-box", transformOrigin: "center" }}>
          <circle
            cx={p.cx}
            cy={p.cy}
            r="14"
            fill="#E8A33D"
            opacity="0.15"
            className="animate-trail-pulse"
            style={{ animationDelay: p.delay }}
          />
          <circle cx={p.cx} cy={p.cy} r="5.5" fill="#E8A33D" filter="url(#trail-glow)" />
        </g>
      ))}

      <circle r="4" fill="#F4BE6C" filter="url(#trail-glow)">
        <animateMotion dur="6s" repeatCount="indefinite" rotate="auto">
          <mpath href="#trail-path" />
        </animateMotion>
      </circle>
    </svg>
  );
}