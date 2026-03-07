import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  server: {
    proxy: {
      "/api": {
        target: "https://map.fuelnaija.com",
        changeOrigin: true,
      },
    },
  },
});
