import { z } from "zod";

export const AGENTIC_MODEL_PROVIDER_TYPES = {
  googleVertexAI: "google_vertexai",
} as const;

export const AGENTIC_INTENTS = {
  freeChat: "free_chat",
  hrKnowledgeQa: "hr_knowledge_qa",
  hrRecruitment: "hr_recruitment",
} as const;

export type AgenticIntent =
  (typeof AGENTIC_INTENTS)[keyof typeof AGENTIC_INTENTS];

export const AGENTIC_RETRIEVER_PROFILES = {
  processOnly: {
    datasetIds: ["3c0ab6d83e0211f19f78ae4b075ab570"],
    topK: 1024,
    pageSize: 8,
    minimumScore: 0.3,
    keywordSimilarityWeight: 0.7,
  },
  formOnly: {
    datasetIds: ["3ba5a7ef3e0211f1bc59ae4b075ab570"],
    topK: 1024,
    pageSize: 3,
    minimumScore: 0.3,
    keywordSimilarityWeight: 0.7,
  },
} as const;

export const AGENTIC_MCP_USAGE_MODES = {
  retrievalContext: "retrieval_context",
  langGraphToolLoop: "langgraph_tool_loop",
} as const;

export const AGENTIC_MCP_RUNTIME_TARGETS = {
  local: "local",
  docker: "docker",
} as const;

export const AGENTIC_MCP_TOOL_CAPABILITIES = {
  read: "read",
  write: "write",
  action: "action",
} as const;

export const AGENTIC_MCP_APPROVAL_POLICIES = {
  never: "never",
  always: "always",
} as const;

const EmptyMcpArgumentsSchema = z.object({}).strict();
const UserGuideSlugSchema = z.string().min(1).max(160);
const UserGuideHeadingSchema = z.string().min(1).max(240);
const UserGuideSearchQuerySchema = z.string().min(1).max(1000);

export const AGENTIC_MCP_REGISTRY = {
  aiRecruitment: {
    id: "ai-recruitment",
    transport: "streamable_http",
    mode: AGENTIC_MCP_USAGE_MODES.retrievalContext,
    defaultRuntimeTarget: AGENTIC_MCP_RUNTIME_TARGETS.local,
    runtimeTargets: {
      local: {
        endpointUrl: "http://localhost:3005/api/v1/mcp",
      },
      docker: {
        endpointUrl: "http://host.docker.internal:3005/api/v1/mcp",
      },
    },
    protocolVersion: "2025-11-25",
    searchLimit: 3,
    timeoutMs: 4000,
    maxContentChars: 1200,
    allowedTools: {
      listUserGuidePages: {
        name: "list_user_guide_pages",
        title: "List AI Recruitment Platform guide pages",
        description:
          "List available AI Recruitment Platform guide pages with headings and citations.",
        capability: AGENTIC_MCP_TOOL_CAPABILITIES.read,
        approvalPolicy: AGENTIC_MCP_APPROVAL_POLICIES.never,
        readOnly: true,
        argumentsSchema: EmptyMcpArgumentsSchema,
        redactedArgumentKeys: [],
      },
      getUserGuidePage: {
        name: "get_user_guide_page",
        title: "Get AI Recruitment Platform guide page",
        description:
          "Return the complete markdown body for one AI Recruitment Platform guide page by slug.",
        capability: AGENTIC_MCP_TOOL_CAPABILITIES.read,
        approvalPolicy: AGENTIC_MCP_APPROVAL_POLICIES.never,
        readOnly: true,
        argumentsSchema: z
          .object({
            slug: UserGuideSlugSchema,
          })
          .strict(),
        redactedArgumentKeys: [],
      },
      searchUserGuide: {
        name: "search_user_guide",
        title: "Search AI Recruitment Platform guide",
        description:
          "Search the Vietnamese AI Recruitment Platform guide and return section-level results with citations.",
        capability: AGENTIC_MCP_TOOL_CAPABILITIES.read,
        approvalPolicy: AGENTIC_MCP_APPROVAL_POLICIES.never,
        readOnly: true,
        argumentsSchema: z
          .object({
            query: UserGuideSearchQuerySchema,
            limit: z.number().int().min(1).max(10),
          })
          .strict(),
        redactedArgumentKeys: [],
      },
      getUserGuideSection: {
        name: "get_user_guide_section",
        title: "Get AI Recruitment Platform guide section",
        description:
          "Return one section from an AI Recruitment Platform guide page by slug and heading.",
        capability: AGENTIC_MCP_TOOL_CAPABILITIES.read,
        approvalPolicy: AGENTIC_MCP_APPROVAL_POLICIES.never,
        readOnly: true,
        argumentsSchema: z
          .object({
            slug: UserGuideSlugSchema,
            heading: UserGuideHeadingSchema,
          })
          .strict(),
        redactedArgumentKeys: [],
      },
    },
  },
} as const;

export const AGENTIC_DEFAULTS = {
  model: {
    provider: AGENTIC_MODEL_PROVIDER_TYPES.googleVertexAI,
    name: "gemini-3.1-flash-lite",
    temperature: 0.2,
  },
  retriever: {
    ragflowBaseUrl: "https://cortex.pinetech.vn",
    recruitmentDatasetId: "hr-recruitment",
  },
  memory: {
    messageWindowSize: 6,
    summaryTriggerMessages: 6,
  },
} as const;
