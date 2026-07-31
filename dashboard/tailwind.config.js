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
          bg: '#0B0812',
          primary: '#8B5CF6',
          glow: '#A78BFA',
          accent: '#7C3AED',
          surface: '#151122',
          'surface-alt': '#1E1830',
          text: '#F5F0E8',
          muted: '#9B96A8',
          border: '#2D2640',
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