import { resolve } from "node:path";
import { defineConfig } from "electron-vite";

const shared = resolve(__dirname, "src/shared");

export default defineConfig({
  main: {
    resolve: { alias: { "@shared": shared } },
    build: {
      outDir: "out/main",
      rollupOptions: {
        external: ["node-pty"],
      },
    },
  },
  preload: {
    resolve: { alias: { "@shared": shared } },
    build: {
      outDir: "out/preload",
      rollupOptions: {
        external: ["node-pty"],
      },
    },
  },
});
