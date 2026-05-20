import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type EnvFileName = ".env.prod" | ".env";

export interface LoadCliEnvDefaultsOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export type LoadedCliEnvDefaults = Record<EnvFileName, string[]>;

export function loadCliEnvDefaults(
  options: LoadCliEnvDefaultsOptions = {},
): LoadedCliEnvDefaults {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? findWorkspaceRoot();
  const loaded: LoadedCliEnvDefaults = {
    ".env.prod": [],
    ".env": [],
  };

  for (const fileName of [".env.prod", ".env"] as const) {
    const values = readEnvFile(cwd, fileName);
    for (const [key, value] of Object.entries(values)) {
      if (!hasValue(value) || hasValue(env[key])) continue;
      env[key] = value;
      loaded[fileName].push(key);
    }
  }

  return loaded;
}

function hasValue(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

function findWorkspaceRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
}

function readEnvFile(
  cwd: string,
  fileName: EnvFileName,
): Record<string, string> {
  const path = resolve(cwd, fileName);
  if (!existsSync(path)) return {};

  const values: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    if (!key) continue;

    values[key] = stripOptionalQuotes(trimmed.slice(equalsIndex + 1).trim());
  }
  return values;
}

function stripOptionalQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
