import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [viteSingleFile()],
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
