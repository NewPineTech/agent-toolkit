import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  ChatVertexAI,
  type ChatVertexAIInput,
} from "@langchain/google-vertexai";
import { AGENTIC_DEFAULTS } from "./constants.js";

export interface AgenticModelResponse {
  content: string;
  warnings: string[];
}

export interface AgenticModelRequest {
  system: string;
  prompt: string;
}

export interface AgenticModelSettings {
  modelName?: string;
  temperature?: number;
  topP?: number | null;
  presencePenalty?: number | null;
  frequencyPenalty?: number | null;
  maxTokens?: number | null;
}

export interface CreateAgenticChatModelOptions extends AgenticModelSettings {
  env?: Record<string, string | undefined>;
  warn?: (message: string) => void;
}

export interface AgenticChatModel {
  invoke(input: [SystemMessage, HumanMessage]): Promise<{
    content: unknown;
  }>;
}

export type AgenticModelResponseOptions = CreateAgenticChatModelOptions & {
  model?: AgenticChatModel;
};

export function createAgenticChatModel(
  options: CreateAgenticChatModelOptions = {},
): {
  model: AgenticChatModel | undefined;
  warnings: string[];
} {
  const env = options.env ?? process.env;
  const apiKey = env["GEMINI_VERTEX_API_KEY"]?.trim();
  if (!apiKey) {
    options.warn?.("Vertex model is not configured; using fallback behavior.");
    return { model: undefined, warnings: ["MODEL_NOT_CONFIGURED"] };
  }

  return {
    model: new ChatVertexAI({
      ...buildVertexModelOptions(apiKey, options),
      location: "global",
    }),
    warnings: [],
  };
}

export function isAgenticModelConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(env["GEMINI_VERTEX_API_KEY"]?.trim());
}

export async function generateModelResponse(
  request: AgenticModelRequest,
  options: AgenticModelResponseOptions = {},
): Promise<AgenticModelResponse> {
  const configuredModel = options.model
    ? { model: options.model, warnings: [] }
    : createAgenticChatModel(options);

  if (!configuredModel.model) {
    return {
      content: buildDeterministicResponse(request.prompt),
      warnings: configuredModel.warnings,
    };
  }

  try {
    const message = await configuredModel.model.invoke([
      new SystemMessage(request.system),
      new HumanMessage(request.prompt),
    ]);

    return {
      content: extractTextContent(message.content),
      warnings: configuredModel.warnings,
    };
  } catch (error) {
    return {
      content: buildDeterministicResponse(request.prompt),
      warnings: [
        ...configuredModel.warnings,
        `MODEL_INVOKE_FAILED:${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
    };
  }
}

function buildVertexModelOptions(
  apiKey: string,
  settings: AgenticModelSettings,
): ChatVertexAIInput {
  const modelOptions: ChatVertexAIInput = {
    apiKey,
    model: settings.modelName?.trim() || AGENTIC_DEFAULTS.model.name,
    temperature: settings.temperature ?? AGENTIC_DEFAULTS.model.temperature,
  };

  if (settings.topP != null) modelOptions.topP = settings.topP;
  if (settings.presencePenalty != null) {
    modelOptions.presencePenalty = settings.presencePenalty;
  }
  if (settings.frequencyPenalty != null) {
    modelOptions.frequencyPenalty = settings.frequencyPenalty;
  }
  if (settings.maxTokens != null) {
    modelOptions.maxOutputTokens = settings.maxTokens;
  }

  return modelOptions;
}

function buildDeterministicResponse(prompt: string): string {
  const normalized = prompt.trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  return normalized.length > 700
    ? `${normalized.slice(0, 697)}...`
    : normalized;
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (
          part &&
          typeof part === "object" &&
          "text" in part &&
          typeof part.text === "string"
        ) {
          return part.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("");
  }
  return "";
}
