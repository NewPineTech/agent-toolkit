import { defineConfig } from "vite";

export default defineConfig({
  appType: "spa",
  server: {
    host: "127.0.0.1",
    port: 5178,
    strictPort: true,
  },
  clearScreen: false,
});
