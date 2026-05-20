import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type OperatorDefaultName =
  | "WIDGET_API_URL"
  | "LANGGRAPH_API_KEY"
  | "LANGGRAPH_PORT";

export type OperatorDefaultSource =
  | "process.env"
  | ".env.prod"
  | ".env"
  | "missing";

export interface ResolvedOperatorDefault {
  name: OperatorDefaultName;
  secret: boolean;
  source: OperatorDefaultSource;
  value: string | undefined;
}

export interface ResolveOperatorDefaultOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export function resolveOperatorDefault(
  name: OperatorDefaultName,
  options: ResolveOperatorDefaultOptions = {},
): ResolvedOperatorDefault {
  const env = options.env ?? process.env;
  const shellValue = normalizeDefaultValue(env[name]);
  if (shellValue !== undefined) {
    return resolvedDefault(name, shellValue, "process.env");
  }

  const cwd = options.cwd ?? process.cwd();
  for (const fileName of [".env.prod", ".env"] as const) {
    const fileValue = normalizeDefaultValue(readEnvFile(cwd, fileName)[name]);
    if (fileValue !== undefined) {
      return resolvedDefault(name, fileValue, fileName);
    }
  }

  return resolvedDefault(name, undefined, "missing");
}

export function getLangGraphBaseUrlDefault({
  runningInDocker = isRunningInDocker(),
  port,
}: {
  runningInDocker?: boolean;
  port: ResolvedOperatorDefault;
}): { value: string; source: string } {
  if (runningInDocker) {
    return { value: "http://langgraph:2024", source: "docker" };
  }

  const portValue = normalizeDefaultValue(port.value) ?? "2024";
  return {
    value: `http://localhost:${portValue}`,
    source: port.source === "missing" ? "default" : port.source,
  };
}

export function resolveOperatorDefaults(
  options: ResolveOperatorDefaultOptions = {},
): Record<OperatorDefaultName, ResolvedOperatorDefault> {
  return {
    LANGGRAPH_API_KEY: resolveOperatorDefault("LANGGRAPH_API_KEY", options),
    LANGGRAPH_PORT: resolveOperatorDefault("LANGGRAPH_PORT", options),
    WIDGET_API_URL: resolveOperatorDefault("WIDGET_API_URL", options),
  };
}

export function formatOperatorDefaultForReview(
  resolvedDefault: ResolvedOperatorDefault,
): string {
  const value = resolvedDefault.secret
    ? "[hidden]"
    : (resolvedDefault.value ?? "[missing]");
  return `${resolvedDefault.name}: ${value} (from ${resolvedDefault.source})`;
}

function resolvedDefault(
  name: OperatorDefaultName,
  value: string | undefined,
  source: OperatorDefaultSource,
): ResolvedOperatorDefault {
  return {
    name,
    secret: name === "LANGGRAPH_API_KEY",
    source,
    value,
  };
}

function readEnvFile(
  cwd: string,
  fileName: ".env.prod" | ".env",
): Partial<Record<OperatorDefaultName, string>> {
  const path = join(cwd, fileName);
  if (!existsSync(path)) return {};

  const values: Partial<Record<OperatorDefaultName, string>> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    if (!isOperatorDefaultName(key)) continue;

    values[key] = stripOptionalQuotes(trimmed.slice(equalsIndex + 1).trim());
  }
  return values;
}

function normalizeDefaultValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
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

function isOperatorDefaultName(value: string): value is OperatorDefaultName {
  return (
    value === "WIDGET_API_URL" ||
    value === "LANGGRAPH_API_KEY" ||
    value === "LANGGRAPH_PORT"
  );
}

function isRunningInDocker(): boolean {
  return existsSync("/.dockerenv");
}
