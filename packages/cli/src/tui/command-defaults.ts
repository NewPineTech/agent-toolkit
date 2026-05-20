import type {
  CommandField,
  CommandFieldDefaultSource,
  CommandSpec,
  CommandValues,
} from "../command-registry.js";
import type {
  OperatorDefaultName,
  ResolvedOperatorDefault,
} from "../operator-defaults.js";
import { getLangGraphBaseUrlDefault } from "../operator-defaults.js";

export type CommandValueSource =
  | { kind: "manual" }
  | { kind: "command-default" }
  | {
      kind: "operator-default";
      label: OperatorDefaultName;
      source: ResolvedOperatorDefault["source"];
    }
  | {
      kind: "missing";
      label?: OperatorDefaultName;
      source?: ResolvedOperatorDefault["source"];
    };

export interface CommandReviewItem {
  name: string;
  label: string;
  value: string;
  sourceLabel: string;
  secret: boolean;
  advanced: boolean;
  missing: boolean;
}

export interface ResolvedCommandDefaults {
  values: CommandValues;
  sources: Record<string, CommandValueSource>;
  missingRequiredFields: CommandField[];
  reviewItems: CommandReviewItem[];
}

export interface ResolveCommandDefaultsOptions {
  values: CommandValues;
  resolveOperatorDefault(name: OperatorDefaultName): ResolvedOperatorDefault;
}

export function resolveCommandDefaults(
  command: CommandSpec,
  options: ResolveCommandDefaultsOptions,
): ResolvedCommandDefaults {
  const values: CommandValues = { ...options.values };
  const sources: Record<string, CommandValueSource> = {};
  const fields = getCommandFields(command);

  for (const field of fields) {
    const manualValue = normalizeValue(values[field.name]);
    if (manualValue !== undefined) {
      values[field.name] = manualValue;
      sources[field.name] = { kind: "manual" };
      continue;
    }

    const defaultValue = resolveFieldDefault(field, options);
    if (defaultValue.value !== undefined) {
      values[field.name] = defaultValue.value;
      sources[field.name] = defaultValue.source;
      continue;
    }

    values[field.name] = undefined;
    sources[field.name] = defaultValue.source;
  }

  const missingRequiredFields = fields.filter((field) => {
    if (!field.required) return false;
    return normalizeValue(values[field.name]) === undefined;
  });

  return {
    values,
    sources,
    missingRequiredFields,
    reviewItems: fields.map((field) =>
      buildReviewItem(field, values[field.name], sources[field.name]),
    ),
  };
}

export function getCommandFields(command: CommandSpec): CommandField[] {
  return [...command.args, ...command.options];
}

export function formatCommandSource(source: CommandValueSource): string {
  if (source.kind === "manual") return "manual";
  if (source.kind === "command-default") return "command default";
  if (source.kind === "operator-default") {
    return `${source.label} from ${source.source}`;
  }
  if (source.label && source.source) {
    return `${source.label} ${source.source}`;
  }
  return "missing";
}

function resolveFieldDefault(
  field: CommandField,
  options: ResolveCommandDefaultsOptions,
): { value: string | boolean | undefined; source: CommandValueSource } {
  if (field.defaultWhen && !matchesDefaultCondition(field, options.values)) {
    return { value: undefined, source: { kind: "missing" } };
  }

  if (field.defaultSource) {
    return resolveDefaultSource(field.defaultSource, options);
  }

  const defaultValue = normalizeValue(field.defaultValue);
  return {
    value: defaultValue,
    source:
      defaultValue === undefined
        ? { kind: "missing" }
        : { kind: "command-default" },
  };
}

function resolveDefaultSource(
  defaultSource: CommandFieldDefaultSource,
  options: ResolveCommandDefaultsOptions,
): { value: string | undefined; source: CommandValueSource } {
  if (defaultSource === "operator:WIDGET_API_URL") {
    const resolved = options.resolveOperatorDefault("WIDGET_API_URL");
    const value = normalizeValue(resolved.value);
    return {
      value: typeof value === "string" ? value : undefined,
      source:
        value === undefined
          ? {
              kind: "missing",
              label: "WIDGET_API_URL",
              source: "missing",
            }
          : {
              kind: "operator-default",
              label: "WIDGET_API_URL",
              source: resolved.source,
            },
    };
  }

  if (defaultSource === "operator:LANGGRAPH_API_KEY") {
    const resolved = options.resolveOperatorDefault("LANGGRAPH_API_KEY");
    const value = normalizeValue(resolved.value);
    return {
      value: typeof value === "string" ? value : undefined,
      source:
        value === undefined
          ? {
              kind: "missing",
              label: "LANGGRAPH_API_KEY",
              source: "missing",
            }
          : {
              kind: "operator-default",
              label: "LANGGRAPH_API_KEY",
              source: resolved.source,
            },
    };
  }

  if (defaultSource === "operator:LANGGRAPH_BASE_URL") {
    const port = options.resolveOperatorDefault("LANGGRAPH_PORT");
    const resolved = getLangGraphBaseUrlDefault({
      runningInDocker: false,
      port,
    });
    return {
      value: resolved.value,
      source: { kind: "command-default" },
    };
  }

  if (defaultSource === "literal:LANGGRAPH_AGENT_ID") {
    return {
      value: "hr_assistant",
      source: { kind: "command-default" },
    };
  }

  return { value: undefined, source: { kind: "missing" } };
}

function matchesDefaultCondition(
  field: CommandField,
  values: CommandValues,
): boolean {
  const condition = field.defaultWhen;
  if (!condition) return true;
  return normalizeValue(values[condition.field]) === condition.value;
}

function buildReviewItem(
  field: CommandField,
  value: string | boolean | undefined,
  source: CommandValueSource | undefined,
): CommandReviewItem {
  const missing = normalizeValue(value) === undefined;
  return {
    name: field.name,
    label: field.reviewLabel ?? field.label,
    value: field.secret
      ? missing
        ? "(not set)"
        : "[hidden]"
      : missing
        ? "(not set)"
        : String(value),
    sourceLabel: formatCommandSource(source ?? { kind: "missing" }),
    secret: Boolean(field.secret),
    advanced: Boolean(field.advanced),
    missing,
  };
}

function normalizeValue<T extends string | boolean | undefined>(
  value: T,
): T | undefined {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed ? (trimmed as T) : undefined;
}
