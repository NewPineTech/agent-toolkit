import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { StorybookConfig } from "@storybook/react-vite";

const __dir = dirname(fileURLToPath(import.meta.url));

function loadEnvVar(key: string): string {
  const envPaths = [resolve(__dir, "../../../.env"), resolve(__dir, "../.env")];
  for (const p of envPaths) {
    try {
      const match = readFileSync(p, "utf-8")
        .split("\n")
        .find((l) => l.startsWith(`${key}=`));
      if (match) return match.slice(key.length + 1).trim();
    } catch {}
  }
  return "";
}

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [
    "@chromatic-com/storybook",
    "@storybook/addon-vitest",
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-onboarding",
  ],
  framework: "@storybook/react-vite",
  async viteFinal(config) {
    const widgetApiUrl =
      process.env.WIDGET_API_URL ||
      loadEnvVar("WIDGET_API_URL") ||
      "";
    config.define = {
      ...config.define,
      "process.env.WIDGET_API_URL": JSON.stringify(widgetApiUrl),
    };
    return config;
  },
};
export default config;
