import type { Config } from "tailwindcss";

// Color tokens carried over 1:1 from the approved prototype (prototype-crm-ofp.jsx)
// so implementation stays visually consistent with what the client has already validated.
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1C2B45",
        "ink-soft": "#2E4064",
        paper: "#FBF8F1",
        seal: "#C99A3E",
        "seal-dark": "#8F6D26",
        sage: "#5E7D5B",
        rust: "#B5583A",
        slate: "#6B6F76",
        line: "#E7E2D6",
      },
      fontFamily: {
        display: ["'Source Serif 4'", "Georgia", "serif"],
        sans: ["Inter", "-apple-system", "sans-serif"],
      },
      borderRadius: {
        card: "10px",
      },
    },
  },
  plugins: [],
};

export default config;
