/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          DEFAULT: '#0A0A0B',
          card: '#18181B',
          lighter: '#1F1F23',
          border: '#27272A',
        },
        accent: {
          purple: '#8B5CF6',
          'purple-light': '#C084FC',
          cyan: '#06B6D4',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
