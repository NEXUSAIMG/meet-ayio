/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        tinta: { DEFAULT: '#14213d', 2: '#24324f' },
        mar: { 50: '#eef6f6', 100: '#d5eaea', 500: '#1f8a8a', 600: '#176f70', 700: '#115557' },
        sol: { 400: '#f4b740', 500: '#e9a21f' },
        areia: '#f7f4ee',
      },
      fontFamily: {
        sans: ['var(--fonte-texto)', 'system-ui', 'sans-serif'],
        titulo: ['var(--fonte-titulo)', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
