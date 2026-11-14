import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { linguaApi } from "./server/vite-plugin.mjs";

export default defineConfig({
  base: "/LinguaAI-2.0/",
  plugins: [react(), linguaApi()],
  server: {
    port: 5173,
    open: false,
  },
});
