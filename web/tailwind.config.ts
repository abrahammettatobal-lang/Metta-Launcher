import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "InterTight",
          "SF Pro Display",
          "system-ui",
          "sans-serif",
        ],
        display: [
          "InterTight",
          "Inter",
          "SF Pro Display",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "SFMono-Regular",
          "ui-monospace",
          "monospace",
        ],
      },
      colors: {
        canvas: {
          DEFAULT: "#080807",
          raised: "#100f0d",
          deep: "#050504",
        },
        ink: {
          DEFAULT: "#f4eadc",
          soft: "#d8cdb9",
          muted: "#9a907e",
          faint: "#5a5347",
        },
        line: "rgba(244, 234, 220, 0.08)",
        gold: {
          50: "#fbf3d5",
          100: "#f4e0a3",
          200: "#ecca6b",
          300: "#e0b441",
          400: "#d6a32d",
          500: "#c9a227",
          600: "#a98220",
          700: "#806117",
          800: "#5e4710",
          900: "#3a2c09",
        },
        "gold-haze": "rgba(201, 162, 39, 0.10)",
      },
      boxShadow: {
        gold: "0 18px 48px -22px rgba(214, 163, 45, 0.55)",
        ring: "0 0 0 1px rgba(244, 234, 220, 0.06), 0 30px 80px -20px rgba(0,0,0,0.7)",
        glow: "0 0 60px -10px rgba(201, 162, 39, 0.35)",
      },
      backgroundImage: {
        "grain":
          "radial-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)",
        "halo":
          "radial-gradient(60% 80% at 50% 0%, rgba(201,162,39,0.18) 0%, transparent 70%)",
        "vignette":
          "radial-gradient(120% 80% at 50% 50%, transparent 40%, rgba(0,0,0,0.85) 100%)",
        "gold-gradient":
          "linear-gradient(180deg, #e6c660 0%, #c9a227 45%, #8a6a14 100%)",
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.6rem",
      },
      keyframes: {
        floatY: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "0% 0%" },
          "100%": { backgroundPosition: "200% 0%" },
        },
      },
      animation: {
        floatY: "floatY 7s ease-in-out infinite",
        shimmer: "shimmer 6s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
