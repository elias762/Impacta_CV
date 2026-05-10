import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        impacta: {
          DEFAULT: "#0b1f3a",
          accent: "#c9a14a",
        },
      },
    },
  },
  plugins: [],
};

export default config;
