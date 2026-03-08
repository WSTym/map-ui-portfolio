import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [viteSingleFile()],
  // Se o nome do repositório no GitHub for 'map-ui-portfolio',
  // o base path deve ser '/map-ui-portfolio/' para funcionar no GitHub Pages.
  // Se for usar outro nome no repositório, altere aqui!
  base: "/map-ui-portfolio/",
  server: {
    proxy: {
      "/api": {
        target: "https://map.fuelnaija.com",
        changeOrigin: true,
      },
    },
  },
});
