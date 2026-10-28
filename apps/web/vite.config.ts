import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Lets several dev servers (e.g. the art galleries) run at once without
  // fighting over one dependency cache.
  cacheDir: process.env.VITE_CACHE_DIR ?? "node_modules/.vite",
  server: { port: 5173, strictPort: true, open: false },
});
