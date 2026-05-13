export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";

export interface LangGraphProviderConfig {
  model: {
    provider: "gemini";
    model: typeof DEFAULT_GEMINI_MODEL;
  };
  ragflow?: {
    baseUrl: string;
    datasetIds: string[];
    topK: number;
    similarityThreshold?: number;
  };
  tools: {
    enabled: string[];
  };
  memory: {
    shortTerm: boolean;
    longTerm: boolean;
  };
  systemPrompt?: string;
}

const SECRET_KEY_PATTERN = /(api[_-]?key|secret|token|password|credential)/i;

export function parseLangGraphProviderConfig(
  input: unknown,
): LangGraphProviderConfig {
  if (!isRecord(input)) {
    throw new Error("LangGraph provider config must be an object");
  }

  rejectSecretLikeKeys(input);

  const model = isRecord(input["model"]) ? input["model"] : {};
  const provider = model["provider"] ?? "gemini";
  const modelName = model["model"] ?? DEFAULT_GEMINI_MODEL;

  if (provider !== "gemini") {
    throw new Error("LangGraph provider only supports Gemini models");
  }
  if (modelName !== DEFAULT_GEMINI_MODEL) {
    throw new Error(`LangGraph provider model must be ${DEFAULT_GEMINI_MODEL}`);
  }

  const ragflowInput = isRecord(input["ragflow"])
    ? input["ragflow"]
    : undefined;
  const ragflow = ragflowInput ? parseRagflowConfig(ragflowInput) : undefined;
  const tools = isRecord(input["tools"]) ? input["tools"] : {};
  const memory = isRecord(input["memory"]) ? input["memory"] : {};

  return {
    model: {
      provider: "gemini",
      model: DEFAULT_GEMINI_MODEL,
    },
    ...(ragflow === undefined ? {} : { ragflow }),
    tools: {
      enabled: parseEnabledTools(tools["enabled"]),
    },
    memory: {
      shortTerm: memory["shortTerm"] !== false,
      longTerm: memory["longTerm"] === true,
    },
    ...(typeof input["systemPrompt"] === "string"
      ? { systemPrompt: input["systemPrompt"] }
      : {}),
  };
}

function parseRagflowConfig(
  input: Record<string, unknown>,
): LangGraphProviderConfig["ragflow"] {
  const baseUrl = input["baseUrl"];
  if (typeof baseUrl !== "string" || baseUrl.trim().length === 0) {
    throw new Error("LangGraph provider config requires ragflow.baseUrl");
  }

  const datasetIds = input["datasetIds"];
  if (
    !Array.isArray(datasetIds) ||
    datasetIds.length === 0 ||
    datasetIds.some((datasetId) => typeof datasetId !== "string")
  ) {
    throw new Error("LangGraph provider config requires ragflow.datasetIds");
  }

  const topK = parsePositiveInteger(input["topK"], 5);
  const similarityThreshold =
    typeof input["similarityThreshold"] === "number"
      ? input["similarityThreshold"]
      : undefined;

  return {
    baseUrl,
    datasetIds,
    topK,
    ...(similarityThreshold === undefined ? {} : { similarityThreshold }),
  };
}

function parseEnabledTools(input: unknown): string[] {
  if (!Array.isArray(input)) return ["docs.search"];
  return input.filter((tool): tool is string => typeof tool === "string");
}

function parsePositiveInteger(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error("Expected a positive integer");
  }
  return value;
}

function rejectSecretLikeKeys(value: unknown, path: string[] = []): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      rejectSecretLikeKeys(entry, [...path, `${index}`]),
    );
    return;
  }
  if (!isRecord(value)) return;

  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      const keyPath = [...path, key].join(".");
      throw new Error(
        `LangGraph provider config must not contain secret-like key: ${keyPath}`,
      );
    }
    rejectSecretLikeKeys(child, [...path, key]);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
