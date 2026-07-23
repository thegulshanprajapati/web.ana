/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        wa: {
          green: '#10b981',
          'green-dark': '#059669',
          glow: 'rgba(16, 185, 129, 0.15)',
        },
        bg: {
          primary: '#0b0f19',
          secondary: '#111827',
          panel: 'rgba(17, 24, 39, 0.7)',
        }
      },
      fontFamily: {
        sans: ['Outfit', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
