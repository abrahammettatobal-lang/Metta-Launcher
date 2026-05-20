/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: [
          "Inter Tight",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        ink: {
          DEFAULT: "#f4eadc",
          soft: "#d8cdb9",
          muted: "#9d958a",
          faint: "#6e675f",
          dim: "#4a4540",
        },
        canvas: {
          deep: "#050504",
          DEFAULT: "#0a0908",
          raised: "#100f0d",
          card: "#171511",
          lift: "#1f1c17",
        },
        line: {
          subtle: "rgba(244, 234, 220, 0.05)",
          DEFAULT: "rgba(244, 234, 220, 0.08)",
          strong: "rgba(244, 234, 220, 0.14)",
          gold: "rgba(201, 162, 39, 0.18)",
        },
        gold: {
          50: "#fbf3d8",
          100: "#f6e6a7",
          200: "#eed275",
          300: "#e4bc3c",
          400: "#d4a528",
          500: "#c9a227",
          600: "#a07e1a",
          700: "#7a5f13",
          800: "#52400d",
          900: "#332806",
          glow: "rgba(228, 188, 60, 0.22)",
          haze: "rgba(228, 188, 60, 0.10)",
        },
      },
      borderRadius: {
        xl2: "1.125rem",
        "2xl": "1.25rem",
        "3xl": "1.5rem",
        pill: "999px",
      },
      boxShadow: {
        ambient:
          "0 1px 0 rgba(255,255,255,0.04) inset, 0 24px 60px -20px rgba(0,0,0,0.75)",
        plate:
          "0 1px 0 rgba(255,255,255,0.045) inset, 0 18px 48px -22px rgba(0,0,0,0.7), 0 0 0 1px rgba(244,234,220,0.05)",
        floating:
          "0 1px 0 rgba(255,255,255,0.04) inset, 0 30px 80px -40px rgba(0,0,0,0.85)",
        gold: "0 18px 40px -18px rgba(228, 188, 60, 0.55), 0 1px 0 rgba(255,255,255,0.18) inset",
        "gold-soft":
          "0 10px 30px -14px rgba(228, 188, 60, 0.35), 0 1px 0 rgba(255,255,255,0.12) inset",
        "ring-gold":
          "0 0 0 1px rgba(228, 188, 60, 0.45), 0 0 0 4px rgba(228, 188, 60, 0.10)",
        innerline: "inset 0 0 0 1px rgba(244, 234, 220, 0.06)",
      },
      backgroundImage: {
        "grain":
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.045 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        "gold-radial":
          "radial-gradient(ellipse 110% 70% at 50% -10%, rgba(228,188,60,0.10), transparent 55%), radial-gradient(ellipse 50% 40% at 110% 25%, rgba(160,126,26,0.10), transparent), linear-gradient(170deg, #100e0b 0%, #0a0908 45%, #060503 100%)",
        "card-gloss":
          "linear-gradient(180deg, rgba(244,234,220,0.045) 0%, rgba(244,234,220,0) 35%, rgba(0,0,0,0) 100%)",
        "gold-button":
          "linear-gradient(180deg, #f0d160 0%, #e4bc3c 38%, #c9a227 100%)",
        "gold-button-hover":
          "linear-gradient(180deg, #f6dc7a 0%, #ecc54a 38%, #d4a82a 100%)",
        "hero-night":
          "linear-gradient(180deg, rgba(8,7,6,0) 0%, rgba(8,7,6,0.35) 55%, rgba(8,7,6,0.92) 100%), radial-gradient(ellipse 60% 50% at 70% 35%, rgba(228,188,60,0.28), transparent 65%), linear-gradient(135deg, #1a1208 0%, #2b1d10 25%, #3a2410 45%, #1a1a26 75%, #08070a 100%)",
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "pulse-glow": {
          "0%,100%": { boxShadow: "0 0 0 0 rgba(228, 188, 60, 0.35)" },
          "50%": { boxShadow: "0 0 0 8px rgba(228, 188, 60, 0)" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 320ms cubic-bezier(0.22, 1, 0.36, 1)",
        "shimmer": "shimmer 2.4s linear infinite",
        "pulse-glow": "pulse-glow 2.2s ease-out infinite",
      },
      transitionTimingFunction: {
        soft: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};
