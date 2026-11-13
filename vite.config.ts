// T010 — Vite config: React UI entry is index.html -> src/ui/main.tsx.
// `base: "./"` keeps the built assets relative so the dist output can
// be opened from a local folder without a server.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
});
