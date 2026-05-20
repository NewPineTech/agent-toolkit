import { describe, expect, it } from "vitest";
import type { CommandSpec } from "../command-registry.js";
import type {
  OperatorDefaultName,
  ResolvedOperatorDefault,
} from "../operator-defaults.js";
import { resolveCommandDefaults } from "./command-defaults.js";

const baseCommand: CommandSpec = {
  id: "widget.iframe",
  path: ["widget", "iframe"],
  group: "widget",
  title: "Print iframe",
  description: "Print iframe",
  args: [{ name: "workspaceId", label: "Workspace ID", required: true }],
  options: [
    {
      name: "apiUrl",
      label: "Public Agent Toolkit server URL",
      required: true,
      defaultSource: "operator:WIDGET_API_URL",
    },
    { name: "title", label: "Widget title", advanced: true },
    {
      name: "apiKey",
      label: "Provider API key",
      required: true,
      secret: true,
      type: "password",
    },
  ],
  runner: () => undefined,
};

function defaultResolver(
  value: string | undefined,
  source: ResolvedOperatorDefault["source"] = ".env.prod",
) {
  return (): ResolvedOperatorDefault => ({
    name: "WIDGET_API_URL",
    secret: false,
    source,
    value,
  });
}

function operatorDefaults(
  values: Partial<Record<OperatorDefaultName, string>>,
) {
  return (name: OperatorDefaultName): ResolvedOperatorDefault => ({
    name,
    secret: name === "LANGGRAPH_API_KEY",
    source: values[name] ? ".env.prod" : "missing",
    value: values[name],
  });
}

describe("resolveCommandDefaults", () => {
  it("fills WIDGET_API_URL from operator defaults and records its source", () => {
    const resolved = resolveCommandDefaults(baseCommand, {
      values: { workspaceId: "ws_1", apiKey: "secret" },
      resolveOperatorDefault: defaultResolver("https://api.example.com"),
    });

    expect(resolved.values).toMatchObject({
      workspaceId: "ws_1",
      apiUrl: "https://api.example.com",
      apiKey: "secret",
    });
    expect(resolved.sources.apiUrl).toEqual({
      kind: "operator-default",
      label: "WIDGET_API_URL",
      source: ".env.prod",
    });
    expect(resolved.missingRequiredFields).toEqual([]);
  });

  it("treats blank operator defaults as missing required values", () => {
    const resolved = resolveCommandDefaults(baseCommand, {
      values: { workspaceId: "ws_1", apiKey: "secret" },
      resolveOperatorDefault: defaultResolver("  "),
    });

    expect(resolved.values.apiUrl).toBeUndefined();
    expect(resolved.sources.apiUrl).toEqual({
      kind: "missing",
      label: "WIDGET_API_URL",
      source: "missing",
    });
    expect(resolved.missingRequiredFields.map((field) => field.name)).toEqual([
      "apiUrl",
    ]);
  });

  it("keeps manual values ahead of defaults and uses display-safe summaries", () => {
    const resolved = resolveCommandDefaults(baseCommand, {
      values: {
        workspaceId: "ws_1",
        apiUrl: "https://manual.example.com",
        apiKey: "super-secret-value",
      },
      resolveOperatorDefault: defaultResolver("https://api.example.com"),
    });

    expect(resolved.values.apiUrl).toBe("https://manual.example.com");
    expect(resolved.sources.apiUrl).toEqual({ kind: "manual" });
    expect(resolved.reviewItems).toContainEqual({
      name: "apiUrl",
      label: "Public Agent Toolkit server URL",
      value: "https://manual.example.com",
      sourceLabel: "manual",
      secret: false,
      advanced: false,
      missing: false,
    });
    expect(resolved.reviewItems).toContainEqual({
      name: "apiKey",
      label: "Provider API key",
      value: "[hidden]",
      sourceLabel: "manual",
      secret: true,
      advanced: false,
      missing: false,
    });
    expect(JSON.stringify(resolved.reviewItems)).not.toContain(
      "super-secret-value",
    );
  });

  it("normalizes command default values with source metadata", () => {
    const command: CommandSpec = {
      ...baseCommand,
      options: [
        { name: "format", label: "Export format", defaultValue: "csv" },
      ],
    };

    const resolved = resolveCommandDefaults(command, {
      values: {},
      resolveOperatorDefault: defaultResolver(undefined),
    });

    expect(resolved.values.format).toBe("csv");
    expect(resolved.sources.format).toEqual({ kind: "command-default" });
    expect(resolved.missingRequiredFields.map((field) => field.name)).toEqual([
      "workspaceId",
    ]);
  });

  it("applies LangGraph workspace defaults only after provider type is selected", () => {
    const command: CommandSpec = {
      id: "workspace.create",
      path: ["workspace", "create"],
      group: "workspace",
      title: "Create workspace",
      description: "Create workspace",
      args: [],
      options: [
        {
          name: "providerType",
          label: "Provider type",
          type: "select",
          choices: ["langgraph", "ragflow"],
          defaultValue: "langgraph",
          promptFirst: true,
        },
        {
          name: "baseUrl",
          label: "Provider base URL",
          required: true,
          defaultSource: "operator:LANGGRAPH_BASE_URL",
          defaultWhen: { field: "providerType", value: "langgraph" },
        },
        {
          name: "agentId",
          label: "Provider agent ID",
          required: true,
          defaultSource: "literal:LANGGRAPH_AGENT_ID",
          defaultWhen: { field: "providerType", value: "langgraph" },
        },
        {
          name: "apiKey",
          label: "Provider API key",
          required: true,
          secret: true,
          defaultSource: "operator:LANGGRAPH_API_KEY",
          defaultWhen: { field: "providerType", value: "langgraph" },
        },
      ],
      runner: () => undefined,
    };

    const langgraph = resolveCommandDefaults(command, {
      values: { providerType: "langgraph" },
      resolveOperatorDefault: operatorDefaults({
        LANGGRAPH_API_KEY: "lg-secret",
        LANGGRAPH_PORT: "2026",
      }),
    });

    expect(langgraph.values).toMatchObject({
      providerType: "langgraph",
      baseUrl: "http://localhost:2026",
      agentId: "hr_assistant",
      apiKey: "lg-secret",
    });
    expect(langgraph.sources.apiKey).toEqual({
      kind: "operator-default",
      label: "LANGGRAPH_API_KEY",
      source: ".env.prod",
    });
    expect(langgraph.missingRequiredFields).toEqual([]);
    expect(JSON.stringify(langgraph.reviewItems)).not.toContain("lg-secret");

    const ragflow = resolveCommandDefaults(command, {
      values: { providerType: "ragflow" },
      resolveOperatorDefault: operatorDefaults({
        LANGGRAPH_API_KEY: "lg-secret",
        LANGGRAPH_PORT: "2026",
      }),
    });

    expect(ragflow.values.baseUrl).toBeUndefined();
    expect(ragflow.values.agentId).toBeUndefined();
    expect(ragflow.values.apiKey).toBeUndefined();
    expect(ragflow.missingRequiredFields.map((field) => field.name)).toEqual([
      "baseUrl",
      "agentId",
      "apiKey",
    ]);
  });
});
