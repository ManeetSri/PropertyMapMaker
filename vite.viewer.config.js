import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = dirname(fileURLToPath(import.meta.url));

// Second pass: overwrite dist/viewer.html with a single self-contained file
// that opens from disk on a phone, no server required.
export default defineConfig({
  base: "./",
  plugins: [react(), viteSingleFile()],
  build: {
    emptyOutDir: false,
    outDir: "dist",
    rollupOptions: {
      input: resolve(root, "viewer.html")
    }
  }
});
