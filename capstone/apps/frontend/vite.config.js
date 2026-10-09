import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Plain Vite + React. The dev server runs on 5173, the address the API's CORS list allows.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  // Amplify's login screen and the charts make one ~1 MB bundle; fine for this app, so no warning.
  build: { chunkSizeWarningLimit: 1200 },
});
