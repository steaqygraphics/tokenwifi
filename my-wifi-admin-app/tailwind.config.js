// File: tailwind.config.js

/** @type {import('tailwindcss').Config} */
export default {
  // Bagian 'content' sangat penting! Ini memberitahu Tailwind di mana file-file Anda berada.
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // Cari di semua file JavaScript/JSX di dalam folder src/
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}