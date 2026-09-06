"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

// @splinetool/react-spline pulls in a large runtime — load it only on the
// client, after the rest of the hero has already painted, so it never
// blocks first contentful paint or contributes to server render time.
const Spline = dynamic(() => import("@splinetool/react-spline"), {
  ssr: false,
  loading: () => <HeroSceneFallback />,
});

function HeroSceneFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="h-2 w-2 animate-pulse rounded-full bg-amber" />
    </div>
  );
}


// Swap this for your own Spline scene URL (exported from spline.design).
const SCENE_URL =
  "https://prod.spline.design/invEViyBFqcVlB2g/scene.splinecode";

export function HeroScene() {
  const [failed, setFailed] = useState(false);

  if (failed) {
    // Graceful fallback if the scene fails to load (offline, blocked, etc.)
    // — an abstract route-line drawing keeps the hero from ever looking broken.
    return (
      <svg viewBox="0 0 400 400" className="h-full w-full text-amber/60" aria-hidden>
        <path
          d="M40 340 C 120 340, 100 220, 180 220 S 260 100, 340 60"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="6 8"
        />
        <circle cx="40" cy="340" r="5" fill="currentColor" />
        <circle cx="180" cy="220" r="5" fill="currentColor" />
        <circle cx="340" cy="60" r="5" fill="currentColor" />
      </svg>
    );
  }

  return (
    <Spline
      scene={SCENE_URL}
      onError={() => setFailed(true)}
      style={{ width: "100%", height: "100%", background: "transparent" }}
    />
  );
}
