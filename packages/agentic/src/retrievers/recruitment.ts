import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { interrupt } from "@langchain/langgraph";
import type { z } from "zod";
import { AGENTIC_MCP_REGISTRY } from "../constants.js";
import { planRecruitmentGuideMcp } from "../capabilities/hr-recruitment/index.js";
import { rankDocuments, type RetrievedDocument } from "./hr-docs.js";

export type AiRecruitmentMcpToolCapability = "read" | "write" | "action";
export type AiRecruitmentMcpApprovalPolicy = "never" | "always";
export type AiRecruitmentMcpPlanSource = "code" | "model";
export type AiRecruitmentMcpApprovalDecisionType =
  | "approve"
  | "edit"
  | "reject";

export interface AiRecruitmentMcpToolDefinition {
  name: string;
  title: string;
  description: string;
  capability: AiRecruitmentMcpToolCapability;
  approvalPolicy: AiRecruitmentMcpApprovalPolicy;
  readOnly: boolean;
  argumentsSchema?: z.ZodType<Record<string, unknown>>;
  redactedArgumentKeys?: readonly string[];
}

export interface AiRecruitmentMcpActionPlan {
  toolName: string;
  arguments: Record<string, unknown>;
  proposedBy: AiRecruitmentMcpPlanSource;
  reason: string;
}

export type AiRecruitmentMcpAuthorization =
  | {
      status: "allowed";
      capability: AiRecruitmentMcpToolCapability;
      requiresApproval: false;
    }
  | {
      status: "requires_approval";
      capability: AiRecruitmentMcpToolCapability;
      requiresApproval: true;
    }
  | {
      status: "denied";
      capability?: AiRecruitmentMcpToolCapability;
      requiresApproval: false;
      reason: string;
    };

export interface AiRecruitmentMcpApprovalRequest {
  serverId: string;
  toolName: string;
  title: string;
  description: string;
  capability: AiRecruitmentMcpToolCapability;
  reason: string;
  arguments: Record<string, unknown>;
  allowedDecisions: ["approve", "edit", "reject"];
}

export type AiRecruitmentMcpApprovalDecision =
  | {
      type: "approve";
    }
  | {
      type: "edit";
      arguments: Record<string, unknown>;
    }
  | {
      type: "reject";
      reason?: string;
    };

export type AiRecruitmentMcpApprovalResult =
  | {
      status: "approved";
      plan: AiRecruitmentMcpActionPlan;
    }
  | {
      status: "rejected";
      reason: string;
    };

export type AiRecruitmentMcpExecutionResult<T> =
  | {
      status: "success";
      capability: AiRecruitmentMcpToolCapability;
      value: T;
    }
  | {
      status: "denied";
      capability?: AiRecruitmentMcpToolCapability;
      reason: string;
    }
  | {
      status: "rejected";
      capability: AiRecruitmentMcpToolCapability;
      reason: string;
    };

export interface AiRecruitmentMcpExecutionOptions {
  approvalHandler?: (
    plan: AiRecruitmentMcpActionPlan,
    tool: AiRecruitmentMcpToolDefinition,
  ) => AiRecruitmentMcpApprovalResult;
}

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

interface AiRecruitmentMcpConfig {
  serverId: string;
  token: string;
  url: string;
  protocolVersion: string;
  tools: AiRecruitmentMcpToolDefinition[];
  searchLimit: number;
  timeoutMs: number;
  maxContentChars: number;
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
  const plan = createAiRecruitmentGuideMcpPlan(query, config.searchLimit);
  try {
    const mcpDocuments = await retrieveAiRecruitmentMcpDocuments(
      plan,
      config,
      options,
    );
    emitMcpAuditEvent(options, {
      serverId: config.serverId,
      toolName: plan.toolName,
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
        toolName: plan.toolName,
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
  plan: AiRecruitmentMcpActionPlan,
  config: AiRecruitmentMcpConfig,
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
    const tool = findAiRecruitmentMcpTool(config.tools, plan.toolName);
    const execution = await executeAiRecruitmentMcpAction(
      plan,
      tool,
      async (approvedPlan) => {
        const toolsResponse = await client.listTools(
          {},
          { timeout: config.timeoutMs },
        );
        assertMcpToolAvailable(toolsResponse.tools, approvedPlan.toolName);

        const toolResponse = await client.callTool(
          {
            name: approvedPlan.toolName,
            arguments: approvedPlan.arguments,
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
          approvedPlan.toolName,
        ).map((content, index) => ({
          id: `ai-recruitment-mcp-${index + 1}`,
          title: "AI Recruitment MCP",
          content,
          score: 1,
        }));
      },
    );

    if (execution.status !== "success") {
      throw new Error(`MCP action ${execution.status}: ${execution.reason}`);
    }

    return execution.value;
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
  toolName: string,
): string[] {
  const contentResults = (payload?.content ?? [])
    .filter((item) => item.type === "text")
    .map((item) => sanitizeMcpText(item.text ?? "", maxContentChars, toolName))
    .filter((content) => content.length > 0);

  if (contentResults.length > 0) return contentResults;

  if (payload?.structuredContent) {
    return [
      sanitizeMcpText(
        JSON.stringify(payload.structuredContent),
        maxContentChars,
        toolName,
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

export function createAiRecruitmentGuideSearchPlan(
  query: string,
  limit: number = AGENTIC_MCP_REGISTRY.aiRecruitment.searchLimit,
): AiRecruitmentMcpActionPlan {
  return {
    toolName:
      AGENTIC_MCP_REGISTRY.aiRecruitment.allowedTools.searchUserGuide.name,
    arguments: {
      query,
      limit,
    },
    proposedBy: "code",
    reason: "Default recruitment guide retrieval.",
  };
}

export function createAiRecruitmentGuideMcpPlan(
  query: string,
  limit: number = AGENTIC_MCP_REGISTRY.aiRecruitment.searchLimit,
): AiRecruitmentMcpActionPlan {
  const step = planRecruitmentGuideMcp(query, limit).steps[0];
  if (!step) {
    throw new Error("Recruitment guide MCP planner returned no steps");
  }

  const searchTool =
    AGENTIC_MCP_REGISTRY.aiRecruitment.allowedTools.searchUserGuide.name;

  return {
    toolName: step.toolName,
    arguments: step.arguments,
    proposedBy: "code",
    reason:
      step.toolName === searchTool
        ? "Default recruitment guide retrieval."
        : "Recruitment guide MCP planner selected a read-only tool.",
  };
}

export function authorizeAiRecruitmentMcpAction(
  plan: AiRecruitmentMcpActionPlan,
  tool: AiRecruitmentMcpToolDefinition | undefined,
): AiRecruitmentMcpAuthorization {
  if (!tool) {
    return {
      status: "denied",
      requiresApproval: false,
      reason: `MCP tool ${plan.toolName} is not registered`,
    };
  }

  if (tool.name !== plan.toolName) {
    return {
      status: "denied",
      capability: tool.capability,
      requiresApproval: false,
      reason: `MCP tool plan ${plan.toolName} does not match policy tool ${tool.name}`,
    };
  }

  const argumentValidation = validateAiRecruitmentMcpArguments(plan, tool);
  if (argumentValidation) {
    return {
      status: "denied",
      capability: tool.capability,
      requiresApproval: false,
      reason: argumentValidation,
    };
  }

  if (tool.approvalPolicy === "always" || tool.capability !== "read") {
    return {
      status: "requires_approval",
      capability: tool.capability,
      requiresApproval: true,
    };
  }

  if (!tool.readOnly) {
    return {
      status: "denied",
      capability: tool.capability,
      requiresApproval: false,
      reason: `MCP tool ${tool.name} is not marked read-only`,
    };
  }

  return {
    status: "allowed",
    capability: tool.capability,
    requiresApproval: false,
  };
}

export async function executeAiRecruitmentMcpAction<T>(
  plan: AiRecruitmentMcpActionPlan,
  tool: AiRecruitmentMcpToolDefinition,
  execute: (approvedPlan: AiRecruitmentMcpActionPlan) => Promise<T>,
  options: AiRecruitmentMcpExecutionOptions = {},
): Promise<AiRecruitmentMcpExecutionResult<T>> {
  const authorization = authorizeAiRecruitmentMcpAction(plan, tool);

  if (authorization.status === "denied") {
    return {
      status: "denied",
      capability: authorization.capability,
      reason: authorization.reason,
    };
  }

  if (authorization.status === "allowed") {
    return {
      status: "success",
      capability: authorization.capability,
      value: await execute(plan),
    };
  }

  const approval =
    options.approvalHandler?.(plan, tool) ??
    requestAiRecruitmentMcpApproval(plan, tool);

  if (approval.status === "rejected") {
    return {
      status: "rejected",
      capability: authorization.capability,
      reason: approval.reason,
    };
  }

  const approvedAuthorization = authorizeAiRecruitmentMcpAction(
    approval.plan,
    tool,
  );

  if (approvedAuthorization.status === "denied") {
    return {
      status: "denied",
      capability: approvedAuthorization.capability,
      reason: approvedAuthorization.reason,
    };
  }

  return {
    status: "success",
    capability: authorization.capability,
    value: await execute(approval.plan),
  };
}

export function createAiRecruitmentMcpApprovalRequest(
  plan: AiRecruitmentMcpActionPlan,
  tool: AiRecruitmentMcpToolDefinition,
): AiRecruitmentMcpApprovalRequest {
  return {
    serverId: AGENTIC_MCP_REGISTRY.aiRecruitment.id,
    toolName: tool.name,
    title: tool.title,
    description: tool.description,
    capability: tool.capability,
    reason: plan.reason,
    arguments: plan.arguments,
    allowedDecisions: ["approve", "edit", "reject"],
  };
}

export function resolveAiRecruitmentMcpApprovalDecision(
  plan: AiRecruitmentMcpActionPlan,
  tool: AiRecruitmentMcpToolDefinition,
  decision: AiRecruitmentMcpApprovalDecision,
): AiRecruitmentMcpApprovalResult {
  if (tool.name !== plan.toolName) {
    return {
      status: "rejected",
      reason: `MCP tool plan ${plan.toolName} does not match approval tool ${tool.name}`,
    };
  }

  if (decision.type === "reject") {
    return {
      status: "rejected",
      reason: decision.reason ?? "MCP action rejected by reviewer",
    };
  }

  if (decision.type === "edit") {
    return {
      status: "approved",
      plan: {
        ...plan,
        arguments: decision.arguments,
      },
    };
  }

  return {
    status: "approved",
    plan,
  };
}

export function requestAiRecruitmentMcpApproval(
  plan: AiRecruitmentMcpActionPlan,
  tool: AiRecruitmentMcpToolDefinition,
): AiRecruitmentMcpApprovalResult {
  const decision = interrupt(
    createAiRecruitmentMcpApprovalRequest(plan, tool),
  ) as AiRecruitmentMcpApprovalDecision;
  return resolveAiRecruitmentMcpApprovalDecision(plan, tool, decision);
}

function validateAiRecruitmentMcpArguments(
  plan: AiRecruitmentMcpActionPlan,
  tool: AiRecruitmentMcpToolDefinition,
): string | undefined {
  if (!tool.argumentsSchema) {
    return `MCP tool ${tool.name} does not define an argument policy schema`;
  }

  const parsed = tool.argumentsSchema.safeParse(plan.arguments);
  if (parsed.success) return undefined;

  const paths = parsed.error.issues
    .map((issue) => issue.path.join(".") || "<root>")
    .filter(Boolean);
  const uniquePaths = [...new Set(paths)];
  return `MCP tool ${tool.name} arguments failed policy validation at ${uniquePaths.join(", ")}`;
}

function sanitizeMcpText(
  content: string,
  maxContentChars: number,
  toolName: string,
): string {
  const normalized = content
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxContentChars);

  if (!normalized) return "";

  return [
    `[Untrusted MCP retrieved context from ai-recruitment/${toolName}]`,
    normalized,
  ].join("\n");
}

function getAiRecruitmentMcpConfig(
  options: RecruitmentRetrieverOptions,
): AiRecruitmentMcpConfig | undefined {
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
    tools: Object.values(registry.allowedTools),
    searchLimit: registry.searchLimit,
    timeoutMs: registry.timeoutMs,
    maxContentChars: registry.maxContentChars,
  };
}

function findAiRecruitmentMcpTool(
  tools: AiRecruitmentMcpToolDefinition[],
  toolName: string,
): AiRecruitmentMcpToolDefinition {
  const tool = tools.find((candidate) => candidate.name === toolName);
  if (!tool) {
    throw new Error(`MCP tool ${toolName} is not registered`);
  }
  return tool;
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
