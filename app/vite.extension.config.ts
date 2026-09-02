import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  publicDir: false,
  build: {
    emptyOutDir: false,
    outDir: "../extension/dist",
    lib: { entry: resolve(__dirname, "src/extension/mercariContent.ts"), name: "PcPartsFinderMercari", formats: ["iife"], fileName: () => "mercari-content.js" },
    minify: false,
  },
});
