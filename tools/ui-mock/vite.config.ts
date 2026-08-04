import { defineConfig, loadEnv } from "vite";
import type { ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export const LOCAL_API_PROXY = {
  target: "http://127.0.0.1:5177",
  changeOrigin: false,
  xfwd: true,
} satisfies ProxyOptions;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const runtimeMode = env.CRYPTO_EDGE_RUNTIME_MODE ?? process.env.CRYPTO_EDGE_RUNTIME_MODE ?? "";
  const aiResearchRenderPreview = (env.CRYPTO_EDGE_AI_RESEARCH_RENDER_PREVIEW
    ?? process.env.CRYPTO_EDGE_AI_RESEARCH_RENDER_PREVIEW) === "1";

  return {
    define: {
      __CRYPTO_EDGE_RUNTIME_MODE__: JSON.stringify(runtimeMode),
      __CRYPTO_EDGE_AI_RESEARCH_RENDER_PREVIEW__: JSON.stringify(aiResearchRenderPreview),
    },
    publicDir: runtimeMode === "DEVELOPMENT_DEMO" ? "public" : false,
    plugins: [react()],
    resolve: {
      alias: {
        "./runtimeApp": path.resolve(
          __dirname,
          runtimeMode === "DEVELOPMENT_DEMO" ? "src/App.tsx" : "src/ProductApp.tsx",
        ),
      },
    },
    server: {
      allowedHosts: true,
      proxy: {
        "/api": {
          ...LOCAL_API_PROXY,
          target: `http://127.0.0.1:${process.env.SCANNER_API_PORT ?? "5177"}`,
        },
      },
    },
  };
});
