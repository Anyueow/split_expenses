/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#6C5CE7",
        "primary-light": "#F0EEFF",
        success: "#00B894",
        danger: "#E17055",
        "neutral-900": "#1a1a2e",
        "neutral-500": "#888888",
        "neutral-100": "#F5F5FA",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
