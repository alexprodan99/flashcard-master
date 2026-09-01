import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  plugins: [svelte()],
  build: {
    outDir: path.resolve(__dirname, "../dist/client"),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3000",
    },
  },
});