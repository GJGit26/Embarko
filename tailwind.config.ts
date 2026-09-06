import type { Config } from "tailwindcss";

// Design system: "Embarko" — a wayfinding / topographic-map identity.
// Deep ink navy + brass signal amber + trail teal. Serif display (Fraunces)
// paired with IBM Plex Sans for UI text and IBM Plex Mono for coordinates,
// durations, percentages and phase numbers.
const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#10151A",
          soft: "#1A2129",
          softer: "#232C36",
          line: "#2E3944",
        },
        mist: {
          DEFAULT: "#EEF1EC",
          dim: "#E3E7DF",
          line: "#D3D9CD",
        },
        charcoal: "#1B211F",
        amber: {
          DEFAULT: "#E8A33D",
          dim: "#C6862A",
          bright: "#F4BE6C",
        },
        teal: {
          DEFAULT: "#2F6F62",
          dim: "#22544A",
          bright: "#4C9384",
        },
        rust: "#B4483A",
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "Georgia", "serif"],
        sans: ["var(--font-plex-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      backgroundImage: {
        contour:
          "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
      },
      borderRadius: {
        none: "0px",
        sm: "2px",
        DEFAULT: "3px",
        md: "4px",
        lg: "6px",
      },
      maxWidth: {
        prose: "68ch",
      },
      transitionTimingFunction: {
        trail: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
