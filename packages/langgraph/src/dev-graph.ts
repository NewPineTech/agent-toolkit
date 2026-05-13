import { buildLangGraphRunnableGraph } from "./graph/build-graph.js";
import { GeminiChatModelClient } from "./model/gemini.client.js";
import { RagflowRetriever } from "./retrieval/ragflow-retriever.js";
import type { Retriever } from "./runtime.js";

const geminiApiKey = process.env.GEMINI_API_KEY;

if (!geminiApiKey) {
  throw new Error("GEMINI_API_KEY is required to run LangGraph dev server");
}

export const graph = buildLangGraphRunnableGraph({
  model: new GeminiChatModelClient({ apiKey: geminiApiKey }),
  retriever: createOptionalRetriever(),
  systemPrompt: process.env.LANGGRAPH_SYSTEM_PROMPT,
});

function createOptionalRetriever(): Retriever | undefined {
  const baseUrl = process.env.LANGGRAPH_RAGFLOW_BASE_URL;
  const apiKey = process.env.LANGGRAPH_RAGFLOW_API_KEY;
  const datasetIds = parseCsv(process.env.LANGGRAPH_RAGFLOW_DATASET_IDS);

  if (!baseUrl || !apiKey || datasetIds.length === 0) {
    return undefined;
  }

  return new RagflowRetriever({
    baseUrl,
    apiKey,
    datasetIds,
    topK: parsePositiveInteger(process.env.LANGGRAPH_RAGFLOW_TOP_K, 5),
  });
}

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
