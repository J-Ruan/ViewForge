import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: process.env.VITE_BASE_PATH || "/",
  worker: { format: "es" },
  test: { include: ["tests/**/*.test.ts"], testTimeout: 30000 },
});
