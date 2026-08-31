import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During `npm run dev` the API is proxied to the backend running on :8001
// (docker-compose). In the Docker image the frontend is built static and nginx
// does the /api proxying instead - see frontend/nginx.conf.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_DEV_API || "http://localhost:8001",
        changeOrigin: true,
      },
    },
  },
});
