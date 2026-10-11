import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Plain Vite + React. The dev server runs on 5173, the address the API's CORS list allows.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
});
