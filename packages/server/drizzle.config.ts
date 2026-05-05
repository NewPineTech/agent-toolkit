import { resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

process.loadEnvFile(resolve(__dirname, "../../.env"));

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env["DATABASE_URL"]!,
  },
});
