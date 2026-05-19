/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        hana: {
          violet: "#7c3aed",
          indigo: "#4f46e5",
          slate: "#0f172a",
        },
      },
    },
  },
  plugins: [],
};
