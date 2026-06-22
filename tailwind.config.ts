import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: { DEFAULT: "#F8F2E6", soft: "#F1E9D7", deep: "#EADFC6" },
        ink: { DEFAULT: "#1A1614", soft: "#3A3330", muted: "#736961" },
        terracotta: { DEFAULT: "#B8451E", soft: "#E8C8B7", deep: "#9A3F23" },
        gold: { DEFAULT: "#C9913A", soft: "#EAD4A8" },
        teal: { DEFAULT: "#3A6256", soft: "#B7CEC4" },
        sage: { DEFAULT: "#7A8B6B", soft: "#CFD7C3" },
        rule: "#D9CFB9",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        "kpi": ["32px", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        "display-xl": ["56px", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
      },
    },
  },
  plugins: [],
};

export default config;
