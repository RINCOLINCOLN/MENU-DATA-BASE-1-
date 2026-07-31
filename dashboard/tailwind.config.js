/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#0D0D0D',
          primary: '#F59E0B',
          glow: '#FBBF24',
          accent: '#D97706',
          surface: '#1A1A1A',
          'surface-alt': '#262626',
          text: '#F5F0E8',
          muted: '#78716C',
          border: '#333333',
        },
      },
      fontFamily: {
        heading: ['Outfit', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}