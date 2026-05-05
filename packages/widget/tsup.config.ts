import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "tsup";

const __dir = dirname(fileURLToPath(import.meta.url));

function loadEnv(): Record<string, string> {
  const envPaths = [resolve(__dir, "../../.env"), resolve(__dir, ".env")];
  const vars: Record<string, string> = {};
  for (const p of envPaths) {
    try {
      const content = readFileSync(p, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        vars[key] = value;
      }
    } catch {}
  }
  return vars;
}

const env = loadEnv();
const widgetApiUrl = process.env.WIDGET_API_URL || env.WIDGET_API_URL || "";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      "hooks/useAgentChat": "src/hooks/useAgentChat.ts",
      "embed-loader": "src/embed-loader.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    splitting: true,
    clean: false,
    external: ["react", "react-dom"],
  },
  {
    entry: { embed: "src/embed-loader.ts" },
    format: ["iife"],
    globalName: "AgentToolkitEmbed",
    clean: false,
    define: {
      "process.env.WIDGET_API_URL": JSON.stringify(widgetApiUrl),
    },
  },
  {
    entry: { standalone: "src/standalone.tsx" },
    format: ["iife"],
    globalName: "AgentToolkitWidget",
    noExternal: [/.*/],
    platform: "browser",
    clean: false,
    minify: true,
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env.WIDGET_API_URL": JSON.stringify(widgetApiUrl),
    },
  },
]);
