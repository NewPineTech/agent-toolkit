import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { AGENTIC_MCP_REGISTRY } from "../constants.js";
import { rankDocuments, type RetrievedDocument } from "./hr-docs.js";

export interface RecruitmentRetrieverOptions {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  onMcpEvent?: (event: AgenticMcpAuditEvent) => void;
}

export interface AgenticMcpAuditEvent {
  serverId: string;
  toolName: string;
  status: "success" | "failure";
  latencyMs: number;
  documentCount?: number;
  warningCode?: string;
}

export interface RecruitmentRetrievalResult {
  documents: RetrievedDocument[];
  warnings: string[];
}

const recruitmentDocuments: RetrievedDocument[] = [
  {
    id: "recruitment-screening",
    title: "Candidate Screening",
    content:
      "Recruitment teams screen candidate profiles, compare CVs with job descriptions, and prepare interview notes.",
    score: 0,
  },
  {
    id: "recruitment-interview",
    title: "Interview Coordination",
    content:
      "Recruiters coordinate interview schedules, collect feedback, and track candidate status through the hiring process.",
    score: 0,
  },
];

const AI_RECRUITMENT_MCP_UNAVAILABLE = "AI_RECRUITMENT_MCP_UNAVAILABLE";

export async function retrieveRecruitmentDocuments(
  query: string,
  options: RecruitmentRetrieverOptions = {},
): Promise<RetrievedDocument[]> {
  const result = await retrieveRecruitmentContext(query, options);
  return result.documents;
}

export async function retrieveRecruitmentContext(
  query: string,
  options: RecruitmentRetrieverOptions = {},
): Promise<RecruitmentRetrievalResult> {
  const localDocuments = rankDocuments(query, recruitmentDocuments);
  const config = getAiRecruitmentMcpConfig(options);

  if (!config) {
    return {
      documents: localDocuments,
      warnings: [],
    };
  }

  const startedAt = Date.now();
  try {
    const mcpDocuments = await retrieveAiRecruitmentMcpDocuments(
      query,
      config,
      options,
    );
    emitMcpAuditEvent(options, {
      serverId: config.serverId,
      toolName: config.toolName,
      status: "success",
      latencyMs: Date.now() - startedAt,
      documentCount: mcpDocuments.length,
    });

    return {
      documents: [...mcpDocuments, ...localDocuments],
      warnings: [],
    };
  } catch (error) {
    emitMcpAuditEvent(
      options,
      {
        serverId: config.serverId,
        toolName: config.toolName,
        status: "failure",
        latencyMs: Date.now() - startedAt,
        warningCode: AI_RECRUITMENT_MCP_UNAVAILABLE,
      },
      sanitizeMcpFailureForLog(error),
    );
    return {
      documents: localDocuments,
      warnings: [AI_RECRUITMENT_MCP_UNAVAILABLE],
    };
  }
}

async function retrieveAiRecruitmentMcpDocuments(
  query: string,
  config: {
    serverId: string;
    token: string;
    url: string;
    protocolVersion: string;
    toolName: string;
    searchLimit: number;
    timeoutMs: number;
    maxContentChars: number;
  },
  options: RecruitmentRetrieverOptions,
): Promise<RetrievedDocument[]> {
  const transport = new StreamableHTTPClientTransport(new URL(config.url), {
    fetch: options.fetchImpl,
    requestInit: {
      headers: {
        Authorization: `Bearer ${config.token}`,
      },
    },
  });
  transport.setProtocolVersion(config.protocolVersion);
  const client = new Client(
    {
      name: "agent-toolkit-agentic",
      version: "0.1.0",
    },
    { capabilities: {} },
  );
  try {
    await client.connect(transport, { timeout: config.timeoutMs });
    const toolsResponse = await client.listTools(
      {},
      { timeout: config.timeoutMs },
    );
    assertMcpToolAvailable(toolsResponse.tools, config.toolName);

    const toolResponse = await client.callTool(
      {
        name: config.toolName,
        arguments: {
          query,
          limit: config.searchLimit,
        },
      },
      undefined,
      { timeout: config.timeoutMs },
    );

    if ("isError" in toolResponse && toolResponse.isError) {
      throw new Error("MCP tool call failed");
    }

    return extractMcpTextResults(
      normalizeMcpToolResponse(toolResponse),
      config.maxContentChars,
    ).map((content, index) => ({
      id: `ai-recruitment-mcp-${index + 1}`,
      title: "AI Recruitment MCP",
      content,
      score: 1,
    }));
  } finally {
    await transport.terminateSession().catch(() => undefined);
    await client.close().catch(() => undefined);
  }
}

function extractMcpTextResults(
  payload:
    | {
        content?: Array<{
          type?: string;
          text?: string;
        }>;
        structuredContent?: unknown;
      }
    | undefined,
  maxContentChars: number,
): string[] {
  const contentResults = (payload?.content ?? [])
    .filter((item) => item.type === "text")
    .map((item) => sanitizeMcpText(item.text ?? "", maxContentChars))
    .filter((content) => content.length > 0);

  if (contentResults.length > 0) return contentResults;

  if (payload?.structuredContent) {
    return [
      sanitizeMcpText(
        JSON.stringify(payload.structuredContent),
        maxContentChars,
      ),
    ];
  }

  return [];
}

function normalizeMcpToolResponse(payload: unknown):
  | {
      content?: Array<{
        type?: string;
        text?: string;
      }>;
      structuredContent?: unknown;
    }
  | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;

  if ("content" in payload || "structuredContent" in payload) {
    return payload as {
      content?: Array<{
        type?: string;
        text?: string;
      }>;
      structuredContent?: unknown;
    };
  }

  if ("toolResult" in payload) {
    return { structuredContent: payload.toolResult };
  }

  return undefined;
}

function assertMcpToolAvailable(
  tools:
    | Array<{
        name?: string;
        inputSchema?: unknown;
      }>
    | undefined,
  toolName: string,
): void {
  if (!Array.isArray(tools)) {
    throw new Error("MCP tools/list did not return a tools array");
  }

  const tool = tools.find((candidate) => candidate.name === toolName);
  if (!tool) {
    throw new Error(`MCP tool ${toolName} is not available`);
  }

  if (
    tool.inputSchema !== undefined &&
    (typeof tool.inputSchema !== "object" || tool.inputSchema === null)
  ) {
    throw new Error(`MCP tool ${toolName} returned an invalid input schema`);
  }
}

function sanitizeMcpText(content: string, maxContentChars: number): string {
  const normalized = content
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxContentChars);

  if (!normalized) return "";

  return [
    "[Untrusted MCP retrieved context from ai-recruitment/search_user_guide]",
    normalized,
  ].join("\n");
}

function getAiRecruitmentMcpConfig(options: RecruitmentRetrieverOptions):
  | {
      serverId: string;
      token: string;
      url: string;
      protocolVersion: string;
      toolName: string;
      searchLimit: number;
      timeoutMs: number;
      maxContentChars: number;
    }
  | undefined {
  const env = options.env ?? process.env;
  const token =
    env["AI_RECRUITMENT_MCP_AUTH_TOKEN"]?.trim() ||
    env["MCP_AUTH_TOKEN"]?.trim();
  const registry = AGENTIC_MCP_REGISTRY.aiRecruitment;
  const url =
    registry.runtimeTargets[registry.defaultRuntimeTarget].endpointUrl.trim();

  if (!token || !url) return undefined;

  return {
    serverId: registry.id,
    token,
    protocolVersion: registry.protocolVersion,
    url,
    toolName: registry.allowedTools.searchUserGuide.name,
    searchLimit: registry.searchLimit,
    timeoutMs: registry.timeoutMs,
    maxContentChars: registry.maxContentChars,
  };
}

function sanitizeMcpFailureForLog(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(api[_-]?key|token|secret)=([^&\s]+)/gi, "$1=[REDACTED]")
    .slice(0, 500);
}

function emitMcpAuditEvent(
  options: RecruitmentRetrieverOptions,
  event: AgenticMcpAuditEvent,
  detail?: string,
): void {
  options.onMcpEvent?.(event);
  const payload = detail ? { ...event, detail } : event;
  const logger = event.status === "failure" ? console.warn : console.info;
  logger("[agentic:mcp] ai-recruitment retrieval", payload);
}
