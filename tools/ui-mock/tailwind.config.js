/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        base:    "#0b0f19",
        surface: "#111827",
        card:    "#141d2e",
        raised:  "#1a2540",
        hover:   "#1f2d47",
        border:  "#1e2d45",
        "border-sub": "#243352",
        primary:   "#e8edf5",
        secondary: "#7b8db0",
        muted:     "#4a5a7a",
        accent:    "#3b82f6",
        "accent-green":  "#22c55e",
        "accent-amber":  "#f59e0b",
        "accent-red":    "#ef4444",
        "accent-slate":  "#64748b",
      },
      fontSize: {
        "2xs": ["10px", "14px"],
        xs:    ["11px", "16px"],
        sm:    ["12px", "18px"],
        base:  ["13px", "20px"],
        md:    ["14px", "20px"],
        lg:    ["16px", "24px"],
        xl:    ["18px", "28px"],
        "2xl": ["22px", "30px"],
      },
    },
  },
  plugins: [],
};
