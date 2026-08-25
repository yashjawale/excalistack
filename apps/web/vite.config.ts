import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Vite configuration for the excalistack SPA. In development, `/api`
 * requests are proxied to the local API server on port 3000.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
