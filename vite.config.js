import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vitest config lives alongside Vite config. `npm test` runs the suite in watch mode;
// `npm run test:run` runs once (CI-style).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.js"],
    css: false,
  },
});
