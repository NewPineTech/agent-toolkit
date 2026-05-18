import { rankDocuments, type RetrievedDocument } from "./hr-docs.js";

export interface RecruitmentRetrieverOptions {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  mcpUrl?: string;
  searchLimit?: number;
  timeoutMs?: number;
}

export interface RecruitmentRetrievalResult {
  documents: RetrievedDocument[];
  warnings: string[];
}

interface McpJsonRpcResponse {
  error?: {
    message?: string;
  };
  result?: {
    content?: Array<{
      type?: string;
      text?: string;
    }>;
    structuredContent?: unknown;
  };
}

interface McpPostResult {
  payload?: McpJsonRpcResponse;
  sessionId?: string;
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

const DEFAULT_AI_RECRUITMENT_MCP_SEARCH_LIMIT = 3;
const DEFAULT_AI_RECRUITMENT_MCP_TIMEOUT_MS = 4000;

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

  try {
    const mcpDocuments = await retrieveAiRecruitmentMcpDocuments(
      query,
      config,
      options,
    );

    return {
      documents: [...mcpDocuments, ...localDocuments],
      warnings: [],
    };
  } catch (error) {
    return {
      documents: localDocuments,
      warnings: [
        `AI_RECRUITMENT_MCP_UNAVAILABLE:${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
    };
  }
}

async function retrieveAiRecruitmentMcpDocuments(
  query: string,
  config: {
    token: string;
    url: string;
    searchLimit: number;
    timeoutMs: number;
  },
  options: RecruitmentRetrieverOptions,
): Promise<RetrievedDocument[]> {
  const initialize = await postMcpJson(
    config.url,
    config.token,
    {
      jsonrpc: "2.0",
      id: "initialize",
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: {
          name: "agent-toolkit-agentic",
          version: "0.1.0",
        },
      },
    },
    config.timeoutMs,
    options.fetchImpl,
  );

  try {
    await postMcpJson(
      config.url,
      config.token,
      {
        jsonrpc: "2.0",
        method: "notifications/initialized",
      },
      config.timeoutMs,
      options.fetchImpl,
      initialize.sessionId,
    );
  } catch {
    // Some stateless Streamable HTTP servers accept direct tool calls after initialize.
  }

  const toolResponse = await postMcpJson(
    config.url,
    config.token,
    {
      jsonrpc: "2.0",
      id: "search-user-guide",
      method: "tools/call",
      params: {
        name: "search_user_guide",
        arguments: {
          query,
          limit: config.searchLimit,
        },
      },
    },
    config.timeoutMs,
    options.fetchImpl,
    initialize.sessionId,
  );

  const payload = toolResponse.payload;
  if (payload?.error) {
    throw new Error(payload.error.message ?? "MCP tool call failed");
  }

  return extractMcpTextResults(payload).map((content, index) => ({
    id: `ai-recruitment-mcp-${index + 1}`,
    title: "AI Recruitment MCP",
    content,
    score: 1,
  }));
}

async function postMcpJson(
  url: string,
  token: string,
  body: unknown,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
  sessionId?: string,
): Promise<McpPostResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    if (sessionId) {
      headers["Mcp-Session-Id"] = sessionId;
    }

    const response = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`MCP request failed with HTTP ${response.status}`);
    }

    return {
      payload: await readMcpPayload(response),
      sessionId: response.headers.get("mcp-session-id") ?? sessionId,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("MCP request timed out");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readMcpPayload(
  response: Response,
): Promise<McpJsonRpcResponse | undefined> {
  const text = await response.text();
  if (!text.trim()) return undefined;

  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const payloads = parseSseJsonPayloads(text);
    return (
      payloads.find(
        (payload): payload is McpJsonRpcResponse =>
          isMcpJsonRpcResponse(payload) &&
          ("result" in payload || "error" in payload),
      ) ?? payloads.find(isMcpJsonRpcResponse)
    );
  }

  const payload = JSON.parse(text) as unknown;
  if (!isMcpJsonRpcResponse(payload)) return undefined;

  return payload;
}

function parseSseJsonPayloads(text: string): unknown[] {
  return text
    .split(/\n\n+/)
    .flatMap((event) =>
      event
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trim())
        .filter((line) => line.length > 0 && line !== "[DONE]"),
    )
    .map((line) => JSON.parse(line) as unknown);
}

function extractMcpTextResults(
  payload: McpJsonRpcResponse | undefined,
): string[] {
  const contentResults = (payload?.result?.content ?? [])
    .filter((item) => item.type === "text")
    .map((item) => item.text?.trim() ?? "")
    .filter((content) => content.length > 0);

  if (contentResults.length > 0) return contentResults;

  if (payload?.result?.structuredContent) {
    return [JSON.stringify(payload.result.structuredContent)];
  }

  return [];
}

function isMcpJsonRpcResponse(value: unknown): value is McpJsonRpcResponse {
  return typeof value === "object" && value !== null;
}

function getAiRecruitmentMcpConfig(options: RecruitmentRetrieverOptions):
  | {
      token: string;
      url: string;
      searchLimit: number;
      timeoutMs: number;
    }
  | undefined {
  const env = options.env ?? process.env;
  const token =
    env["AI_RECRUITMENT_MCP_AUTH_TOKEN"]?.trim() ||
    env["MCP_AUTH_TOKEN"]?.trim();
  const url = (options.mcpUrl ?? env["AI_RECRUITMENT_MCP_URL"])?.trim();

  if (!token || !url) return undefined;

  return {
    token,
    url,
    searchLimit: positiveInteger(
      options.searchLimit ?? env["AI_RECRUITMENT_MCP_SEARCH_LIMIT"],
      DEFAULT_AI_RECRUITMENT_MCP_SEARCH_LIMIT,
    ),
    timeoutMs: positiveInteger(
      options.timeoutMs ?? env["AI_RECRUITMENT_MCP_TIMEOUT_MS"],
      DEFAULT_AI_RECRUITMENT_MCP_TIMEOUT_MS,
    ),
  };
}

function positiveInteger(value: string | number | undefined, fallback: number) {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
