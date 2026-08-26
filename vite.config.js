import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        learn: resolve(import.meta.dirname, "learn.html"),
        setup: resolve(import.meta.dirname, "setup.html"),
        banking: resolve(import.meta.dirname, "banking.html"),
        audit: resolve(import.meta.dirname, "audit.html")
      }
    }
  }
});
