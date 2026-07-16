import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const runtimeMode = env.CRYPTO_EDGE_RUNTIME_MODE ?? process.env.CRYPTO_EDGE_RUNTIME_MODE ?? "";

  return {
    define: {
      __CRYPTO_EDGE_RUNTIME_MODE__: JSON.stringify(runtimeMode),
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
        "/api": "http://localhost:5177",
      },
    },
  };
});
