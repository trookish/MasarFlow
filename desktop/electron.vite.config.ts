import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "electron-vite";

const shared = resolve(__dirname, "src/shared");
const rendererRoot = resolve(__dirname, "src/renderer");

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
  renderer: {
    root: rendererRoot,
    resolve: {
      alias: {
        "@": resolve(rendererRoot, "src"),
        "@shared": shared,
      },
    },
    plugins: [react(), tailwindcss()],
    build: {
      outDir: "out/renderer",
      assetsDir: ".",
    },
  },
});
