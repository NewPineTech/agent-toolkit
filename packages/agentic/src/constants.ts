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
