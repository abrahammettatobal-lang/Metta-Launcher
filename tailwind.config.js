/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"],
        display: [
          "Barlow Semi Condensed",
          "Bahnschrift",
          "Arial Narrow",
          "system-ui",
          "sans-serif",
        ],
        mono: ["Consolas", "SFMono-Regular", "monospace"],
      },
      colors: {
        canvas: {
          deep: "#0b0d10",
          DEFAULT: "#111316",
          secondary: "#17191c",
          raised: "#212429",
          card: "#1b1d21",
          lift: "#2c3036",
        },
        ink: {
          DEFAULT: "#f3f4f5",
          soft: "#d2d6da",
          muted: "#abb0b7",
          faint: "#939aa3",
          dim: "#626972",
        },
        line: {
          subtle: "#2a2d32",
          DEFAULT: "#33373d",
          strong: "#555b63",
          gold: "#86492e",
        },
        gold: {
          50: "#fff2e9",
          100: "#ffdbc3",
          200: "#ffb485",
          300: "#ff965e",
          400: "#ff7940",
          500: "#ff692f",
          600: "#d55121",
          700: "#a3401f",
          800: "#71301b",
          900: "#462419",
          glow: "#743b25",
          haze: "#46291f",
        },
      },
      borderRadius: {
        lg: "4px",
        xl: "5px",
        "2xl": "6px",
        "3xl": "7px",
        pill: "4px",
      },
      boxShadow: {
        innerline: "inset 0 1px 0 #ffffff0d",
        plate: "inset 0 1px 0 #ffffff09",
        ambient: "0 8px 24px #0003",
        floating: "0 8px 20px #0004",
        "gold-soft": "inset 0 1px 0 #ffffff19",
      },
      backgroundImage: {
        "gold-gradient": "linear-gradient(90deg,#e85421,#ff8c52)",
      },
      transitionTimingFunction: { soft: "cubic-bezier(.2,.8,.2,1)" },
    },
  },
  plugins: [],
};
