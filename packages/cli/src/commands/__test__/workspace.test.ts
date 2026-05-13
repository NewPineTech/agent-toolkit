import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  runWorkspaceCreate,
  runWorkspaceGet,
  runWorkspaceUpdate,
} from "../workspace.js";

const query = vi.fn();
const end = vi.fn().mockResolvedValue(undefined);

vi.mock("../../db.js", () => ({
  createPool: () => ({ query, end }),
  encryptSecret: (value: string) => `enc_${value}`,
  findWorkspace: vi.fn(),
  listWorkspaceSummaries: vi.fn(),
  parseDomains: (input?: string) =>
    input ? input.split(",").map((item) => item.trim()) : [],
  parsePositiveInteger: (value?: string, fallback?: number) =>
    value === undefined ? fallback : Number.parseInt(value, 10),
}));

const { findWorkspace } = await import("../../db.js");
const mockFindWorkspace = vi.mocked(findWorkspace);

function createContext() {
  const output: string[] = [];
  return {
    context: {
      stdout: (message: string) => output.push(message),
      stderr: vi.fn(),
    },
    output,
  };
}

describe("workspace commands", () => {
  beforeEach(() => {
    query.mockReset();
    end.mockClear();
    mockFindWorkspace.mockReset();
  });

  it("persists inline LangGraph provider config when creating a workspace", async () => {
    const { context } = createContext();

    await runWorkspaceCreate(context, {
      id: "ws_langgraph",
      providerType: "langgraph",
      agentId: "local",
      apiKey: "ragflow-key",
      baseUrl: "https://ragflow.example.com",
      providerConfig:
        '{"model":{"provider":"gemini","model":"gemini-2.5-flash-lite"},"ragflow":{"baseUrl":"https://ragflow.example.com","datasetIds":["kb_1"]}}',
    });

    const sql = String(query.mock.calls[0]?.[0]);
    const values = query.mock.calls[0]?.[1] as unknown[];

    expect(sql).toContain("provider_config");
    expect(values).toContainEqual({
      model: { provider: "gemini", model: "gemini-2.5-flash-lite" },
      ragflow: {
        baseUrl: "https://ragflow.example.com",
        datasetIds: ["kb_1"],
      },
    });
  });

  it("persists LangGraph provider config from a JSON file when updating", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "atk-workspace-"));
    const configPath = join(tempDir, "langgraph.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        model: { provider: "gemini", model: "gemini-2.5-flash-lite" },
        tools: { enabled: ["docs.search"] },
      }),
    );
    const { context } = createContext();

    query.mockResolvedValue({ rowCount: 1 });

    await runWorkspaceUpdate(context, "ws_langgraph", {
      providerConfigFile: configPath,
    });

    expect(String(query.mock.calls[0]?.[0])).toContain("provider_config = $1");
    expect(query.mock.calls[0]?.[1]).toEqual([
      {
        model: { provider: "gemini", model: "gemini-2.5-flash-lite" },
        tools: { enabled: ["docs.search"] },
      },
      "ws_langgraph",
    ]);
  });

  it("redacts secret-like values from provider config when showing a workspace", async () => {
    const { context, output } = createContext();
    mockFindWorkspace.mockResolvedValue({
      id: "ws_langgraph",
      provider_type: "langgraph",
      provider_agent_id: "local",
      provider_api_key: "enc_key",
      provider_base_url: "https://ragflow.example.com",
      provider_config: {
        ragflow: {
          baseUrl: "https://ragflow.example.com",
          apiKey: "should-redact",
        },
        webhookSecret: "should-redact",
      },
      allowed_domains: [],
      auth_mode: "anonymous",
      auth_secret: null,
      rate_limit_config: { maxRequests: 30, windowMs: 60000 },
      max_message_length: 4000,
      created_at: new Date("2026-01-01T00:00:00Z"),
      updated_at: new Date("2026-01-01T00:00:00Z"),
    });

    await runWorkspaceGet(context, "ws_langgraph");

    const parsed = JSON.parse(output.join(""));
    expect(parsed.provider_config.ragflow.apiKey).toBe("[redacted]");
    expect(parsed.provider_config.webhookSecret).toBe("[redacted]");
  });
});
