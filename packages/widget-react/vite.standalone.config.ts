import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js";

/**
 * Vite config for standalone IIFE bundle
 * This bundles everything (including React) into a single file
 * for embedding via <script> tag
 *
 * Heavy dependencies (mermaid, shiki) are NOT bundled - they are
 * loaded from CDN at runtime when the corresponding plugin is enabled.
 */
export default defineConfig({
  plugins: [react(), cssInjectedByJsPlugin()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    lib: {
      entry: resolve(__dirname, "src/standalone.tsx"),
      name: "OneMCPWidget",
      formats: ["iife"],
      fileName: () => "widget.js",
    },
    outDir: "dist/standalone",
    rollupOptions: {
      // Externalize heavy dependencies - loaded from CDN at runtime
      external: [
        "mermaid",
        "react-shiki",
        "shiki",
      ],
      output: {
        // Inline all dynamic imports
        inlineDynamicImports: true,
        // Ensure CSS is injected into JS
        assetFileNames: "widget.[ext]",
        // Map externals to globals (not used since we load from CDN via dynamic import)
        globals: {
          mermaid: "mermaid",
          "react-shiki": "ReactShiki",
          shiki: "shiki",
        },
      },
    },
    // Minify for production (esbuild is bundled with Vite)
    minify: "esbuild",
    // Generate source maps for debugging
    sourcemap: true,
    // Don't split CSS
    cssCodeSplit: false,
  },
});
