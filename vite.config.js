import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base:"./" keeps the built asset URLs relative, so dist/index.html works over
// file:// and when hosted on a subpath instead of rendering a blank page.
export default defineConfig({
  base: "./",
  plugins: [react()]
});
