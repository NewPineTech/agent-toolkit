import type { RetrievalChunk } from "../events.js";
import type { Retriever } from "../runtime.js";

export interface RagflowRetrieverConfig {
  baseUrl: string;
  apiKey: string;
  datasetIds: string[];
  topK?: number;
  similarityThreshold?: number;
}

export class RagflowRetriever implements Retriever {
  constructor(
    private readonly config: RagflowRetrieverConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async retrieve(query: string): Promise<RetrievalChunk[]> {
    const response = await this.fetchImpl(
      `${normalizeBaseUrl(this.config.baseUrl)}/api/v1/retrieval`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: query,
          dataset_ids: this.config.datasetIds,
          top_k: this.config.topK ?? 5,
          ...(this.config.similarityThreshold === undefined
            ? {}
            : { similarity_threshold: this.config.similarityThreshold }),
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`RAGFlow retrieval failed: ${response.status}`);
    }

    const payload = (await response.json()) as unknown;
    return extractChunks(payload).map(normalizeChunk);
  }
}

function extractChunks(payload: unknown): Record<string, unknown>[] {
  if (!isRecord(payload)) return [];
  const data = payload["data"];
  if (Array.isArray(data)) return data.filter(isRecord);
  if (isRecord(data) && Array.isArray(data["chunks"])) {
    return data["chunks"].filter(isRecord);
  }
  if (Array.isArray(payload["chunks"]))
    return payload["chunks"].filter(isRecord);
  return [];
}

function normalizeChunk(chunk: Record<string, unknown>): RetrievalChunk {
  const content = firstString(chunk, ["content", "text", "chunk_content"]);
  const source = firstString(chunk, [
    "document_name",
    "doc_name",
    "source",
    "filename",
  ]);
  const score = firstNumber(chunk, ["score", "similarity", "similarity_score"]);

  return {
    content: content ?? "",
    ...(source === undefined ? {} : { source }),
    ...(score === undefined ? {} : { score }),
    metadata: chunk,
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function firstString(
  record: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

function firstNumber(
  record: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number") return value;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
