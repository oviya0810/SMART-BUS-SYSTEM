/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        navy: {
          50: '#eef3ff', 100: '#dbe4fb', 200: '#b7c6ef', 300: '#8aa0d9', 400: '#5c76bd',
          500: '#3a539d', 600: '#283e7e', 700: '#1c2e63', 800: '#13214a', 900: '#0b1736', 950: '#060e24',
        },
        electric: {
          50: '#eef4ff', 100: '#d9e6ff', 200: '#b9d0ff', 300: '#8ab0ff', 400: '#5a88ff',
          500: '#2f63ff', 600: '#1f4ff2', 700: '#173ccf', 800: '#1734a6', 900: '#182f82',
        },
        cyan: { 400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2' },
      },
      boxShadow: {
        card: '0 1px 2px rgba(11,23,54,.06), 0 1px 3px rgba(11,23,54,.04)',
        pop: '0 12px 32px -8px rgba(11,23,54,.25)',
      },
      keyframes: {
        pulseRing: { '0%': { transform: 'scale(.6)', opacity: '.8' }, '100%': { transform: 'scale(2.2)', opacity: '0' } },
        fadeIn: { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        pulseRing: 'pulseRing 1.8s ease-out infinite',
        fadeIn: 'fadeIn .18s ease-out',
      },
    },
  },
  plugins: [],
};
