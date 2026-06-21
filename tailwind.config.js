/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Neutral surface scale tuned for a dark-first studio UI
        surface: {
          0: '#0b0d12',
          1: '#12151c',
          2: '#181c25',
          3: '#212733',
          4: '#2b3340'
        },
        ink: {
          DEFAULT: '#e6e9ef',
          muted: '#9aa3b2',
          faint: '#6b7384'
        },
        accent: {
          DEFAULT: '#f97316',
          hover: '#fb8a3c',
          soft: '#7c3a12'
        },
        line: '#2b3340'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif']
      }
    }
  },
  plugins: []
}
