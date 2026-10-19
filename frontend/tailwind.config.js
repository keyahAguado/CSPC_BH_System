/** @type {import('tailwindcss').Config} */
export default {
  content: {relative:true, files: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}", // Scan all Vue and JS files
  ]},
  theme: {
    extend: {},
  },
  plugins: [],
}