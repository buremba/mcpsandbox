import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "@assistant-ui/react",
        "@assistant-ui/react-markdown",
        "@ai-sdk/openai",
        "@ai-sdk/anthropic",
        "ai",
        "zod",
        "remark-gfm",
        "mermaid",
        "react-shiki",
      ],
      output: {
        preserveModules: true,
        preserveModulesRoot: "src",
      },
    },
    cssCodeSplit: false,
    sourcemap: true,
  },
});
