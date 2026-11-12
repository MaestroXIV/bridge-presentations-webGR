// Builds the BBO collector bookmarklet (src/studio/bbo/collector.ts) as one
// self-contained script: public/bbo-collect.js (readable, also served by the
// app) and docs/bbo-collect.bookmarklet.txt (the javascript: link).
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "url";
import { readFileSync, writeFileSync } from "fs";

export default defineConfig({
  resolve: {
    alias: [{ find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) }],
  },
  build: {
    outDir: "public",
    emptyOutDir: false,
    copyPublicDir: false,
    minify: "esbuild",
    lib: {
      entry: fileURLToPath(new URL("./src/studio/bbo/collector.ts", import.meta.url)),
      formats: ["iife"],
      name: "bridgePresenterCollector",
      fileName: () => "bbo-collect.js",
    },
  },
  plugins: [
    {
      name: "bookmarklet",
      closeBundle() {
        const code = readFileSync(fileURLToPath(new URL("./public/bbo-collect.js", import.meta.url)), "utf8").trim();
        writeFileSync(fileURLToPath(new URL("./docs/bbo-collect.bookmarklet.txt", import.meta.url)), "javascript:" + encodeURIComponent(`(()=>{${code}})()`) + "\n");
      },
    },
  ],
});
