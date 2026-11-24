import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: process.env.BASE_PATH || "./",
  plugins: [react()],
  build: { target: "es2022" },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
