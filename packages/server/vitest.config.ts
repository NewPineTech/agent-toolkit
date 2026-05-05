import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    env: {
      NODE_ENV: "test",
    },
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/adapters/**", "src/factories/**"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
