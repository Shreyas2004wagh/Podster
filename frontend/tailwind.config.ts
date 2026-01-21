import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f3f6ff",
          100: "#e2e9ff",
          200: "#c6d3ff",
          300: "#9eb0ff",
          400: "#7586ff",
          500: "#5c66ff",
          600: "#4b4de4",
          700: "#3c3ec0",
          800: "#303499",
          900: "#272b77"
        }
      },
      borderRadius: {
        xl: "14px"
      },
      boxShadow: {
        card: "0 16px 40px rgba(17, 24, 39, 0.12)"
      }
    }
  },
  plugins: []
};

export default config;
