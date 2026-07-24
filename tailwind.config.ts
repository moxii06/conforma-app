import type { Config } from "tailwindcss";

// "Bleu nuit & laiton" — graphite ink and matte brass on a warm-neutral
// ground, deliberately away from the cream+serif+terracotta look that
// reads as generic/AI-templated (see the palette-proposals review). Token
// *names* (ink, seal, sage, rust, slate, line, paper) are kept stable so
// every component that already styles through them repaints automatically
// — only the hex values and the role each color plays changed.
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1B2430",
        "ink-soft": "#2C3648",
        paper: "#F5F4F0",
        seal: "#8C6B2E",
        "seal-dark": "#5C481D",
        sage: "#4B6358",
        rust: "#8E4433",
        slate: "#6A6D74",
        line: "#E2DFD6",
        // Four neutrals that kept reappearing as identical raw hex arbitrary
        // values across ~25 components (inset panels, hover rows, chips,
        // progress tracks, muted icons) instead of a shared token — audit
        // pass, see "Audit de cohérence des composants". Also reconciles
        // two near-duplicate near-white panel shades (#FAF9F6 and #F7F5F0)
        // that different components had each landed on separately for the
        // same "barely-there panel wash" role into the single `mist` token.
        linen: "#EFEDE7",
        pebble: "#E6E3DA",
        ash: "#B9B6AA",
        mist: "#FAF9F6",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "-apple-system", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "10px",
      },
    },
  },
  plugins: [],
};

export default config;
