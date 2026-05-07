#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distEntry = resolve(packageRoot, "dist/index.js");

if (existsSync(distEntry)) {
  await import(pathToFileURL(distEntry).href);
} else {
  const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const child = spawn(
    executable,
    ["exec", "tsx", "src/index.ts", ...process.argv.slice(2)],
    {
      cwd: packageRoot,
      stdio: "inherit",
    },
  );

  child.on("error", (error) => {
    console.error(error.message);
    process.exit(1);
  });

  child.on("exit", (code) => {
    process.exit(code ?? 1);
  });
}
