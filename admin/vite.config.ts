import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import pkg from "./package.json" with { type: "json" };

const { version } = pkg;
const revision = process.env.WILDBOY_ADMIN_REVISION;
const adminVersion = revision ? `v${version} · ${revision}` : `v${version}`;

export default defineConfig({
  plugins: [vue()],
  define: { __ADMIN_VERSION__: JSON.stringify(adminVersion) },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET || "http://localhost:8080",
        changeOrigin: true,
      },
      "/assets": {
        target: process.env.API_PROXY_TARGET || "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
  test: { environment: "jsdom", clearMocks: true, restoreMocks: true },
});
