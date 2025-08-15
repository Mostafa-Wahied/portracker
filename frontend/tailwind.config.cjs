const colors = require('tailwindcss/colors');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        slate: colors.slate,
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: 0, transform: "translateY(-8px)" },
          "100%": { opacity: 1, transform: "translateY(0)" }
        },
        "slide-in-from-right": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" }
        },
        "slide-out-to-right": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(100%)" }
        },
        "fade-in-overlay": {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 }
        },
        "fade-out": {
          "0%": { opacity: 1 },
          "100%": { opacity: 0 }
        }
      },
      animation: {
        "fade-in": "fade-in 200ms cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-in-from-right": "slide-in-from-right 300ms cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-out-to-right": "slide-out-to-right 300ms cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-in-overlay": "fade-in-overlay 200ms ease-out",
        "fade-out": "fade-out 200ms ease-out"
      }
    }
  },
  plugins: []
}
