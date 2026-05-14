/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["IBM Plex Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Syne", "IBM Plex Sans", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      colors: {
        ink: {
          DEFAULT: "#f4eadc",
          muted: "#a8a095",
          faint: "#6b6560",
        },
        surface: {
          deep: "#080807",
          DEFAULT: "#10100e",
          raised: "#171512",
          card: "#1c1a16",
        },
        line: {
          DEFAULT: "rgba(232, 220, 200, 0.09)",
          strong: "rgba(232, 220, 200, 0.14)",
        },
        accent: {
          DEFAULT: "#c9a227",
          bright: "#e4bc3c",
          dim: "#8a7020",
          glow: "rgba(201, 162, 39, 0.22)",
        },
      },
      boxShadow: {
        lift: "0 12px 40px rgba(0,0,0,0.55)",
        card: "0 1px 0 rgba(255,255,255,0.05) inset, 0 8px 24px rgba(0,0,0,0.35)",
        nav: "inset 0 1px 0 rgba(255,255,255,0.04)",
      },
    },
  },
  plugins: [],
};
