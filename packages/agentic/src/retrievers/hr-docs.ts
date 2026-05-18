import { AGENTIC_DEFAULTS, AGENTIC_RETRIEVER_PROFILES } from "../constants.js";

export interface RetrievedDocument {
  id: string;
  title: string;
  content: string;
  score: number;
  chunkId?: string;
  documentId?: string;
  sourceName?: string;
  downloadUrl?: string;
  originFileUrl?: string;
  url?: string;
  sourceUrl?: string;
  fileUrl?: string;
}

export interface HrDocumentRetrieverOptions {
  baseUrl?: string;
  datasetIds?: string[];
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  keywordSimilarityWeight?: number;
  minimumScore?: number;
  pageSize?: number;
  topK?: number;
}

interface RetrievalProfile {
  datasetIds: readonly string[];
  keywordSimilarityWeight: number;
  minimumScore: number;
  pageSize: number;
  topK: number;
}

interface RagflowRetrievalResponse {
  code?: number;
  message?: string;
  data?: {
    chunks?: RagflowChunk[];
  };
}

interface RagflowChunk {
  id?: string;
  chunk_id?: string;
  document_id?: string;
  doc_id?: string;
  file_id?: string;
  dataset_id?: string;
  document_keyword?: string;
  docnm_kwd?: string;
  document_name?: string;
  source_name?: string;
  title?: string;
  content_with_weight?: string;
  content?: string;
  download_url?: string;
  origin_file_url?: string;
  url?: string;
  source_url?: string;
  file_url?: string;
  similarity?: number;
  score?: number;
}

const hrDocuments: RetrievedDocument[] = [
  {
    id: "hr-leave-policy",
    title: "Leave Policy",
    content:
      "Employees can request annual leave through the HR system. Managers review leave requests before approval.",
    score: 0,
  },
  {
    id: "hr-benefits-policy",
    title: "Benefits Policy",
    content:
      "HR benefits include onboarding support, standard payroll guidance, and employee policy assistance.",
    score: 0,
  },
];

export async function retrieveHrProcess(
  query: string,
  options: HrDocumentRetrieverOptions = {},
): Promise<RetrievedDocument[]> {
  return retrieveHrContextWithProfile(
    query,
    AGENTIC_RETRIEVER_PROFILES.processOnly,
    options,
  );
}

export async function retrieveHrForms(
  query: string,
  options: HrDocumentRetrieverOptions = {},
): Promise<RetrievedDocument[]> {
  return retrieveHrContextWithProfile(
    query,
    AGENTIC_RETRIEVER_PROFILES.formOnly,
    options,
  );
}

async function retrieveHrContextWithProfile(
  query: string,
  profile: RetrievalProfile,
  options: HrDocumentRetrieverOptions,
): Promise<RetrievedDocument[]> {
  if (isRagflowConfigured(options)) {
    return retrieveRagflowHrContext(query, profile, options);
  }

  return rankDocuments(query, hrDocuments);
}

async function retrieveRagflowHrContext(
  query: string,
  profile: RetrievalProfile,
  options: HrDocumentRetrieverOptions,
): Promise<RetrievedDocument[]> {
  const env = options.env ?? process.env;
  const apiKey = env["RAGFLOW_API_KEY"]?.trim();
  if (!apiKey) return [];

  const baseUrl = normalizeBaseUrl(
    options.baseUrl ?? AGENTIC_DEFAULTS.retriever.ragflowBaseUrl,
  );
  const datasetIds = options.datasetIds ?? [...profile.datasetIds];
  const minimumScore = options.minimumScore ?? profile.minimumScore;

  const response = await (options.fetchImpl ?? fetch)(
    `${baseUrl}/api/v1/retrieval`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question: query,
        dataset_ids: datasetIds,
        top_k: options.topK ?? profile.topK,
        similarity_threshold: minimumScore,
        page_size: options.pageSize ?? profile.pageSize,
        keywords_similarity_weight:
          options.keywordSimilarityWeight ?? profile.keywordSimilarityWeight,
        highlight: false,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`RAGFlow retrieval failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as RagflowRetrievalResponse;
  if (payload.code !== 0) {
    throw new Error(
      `RAGFlow retrieval failed: ${payload.message ?? "unknown error"}`,
    );
  }

  return (payload.data?.chunks ?? [])
    .map(mapRagflowChunk)
    .filter((document) => document.content.length > 0)
    .filter(
      (document) => document.score >= minimumScore || document.score === 0,
    );
}

function isRagflowConfigured(options: HrDocumentRetrieverOptions): boolean {
  const env = options.env ?? process.env;
  return Boolean(env["RAGFLOW_API_KEY"]?.trim());
}

function mapRagflowChunk(
  chunk: RagflowChunk,
  index: number,
): RetrievedDocument {
  const chunkId = chunk.id ?? chunk.chunk_id;
  const documentId = chunk.document_id ?? chunk.doc_id ?? chunk.file_id;
  const sourceName =
    chunk.document_keyword ??
    chunk.docnm_kwd ??
    chunk.document_name ??
    chunk.source_name ??
    chunk.title;

  return {
    id: chunkId ?? documentId ?? `ragflow-chunk-${index + 1}`,
    title: sourceName ?? "RAGFlow document",
    content: chunk.content_with_weight ?? chunk.content ?? "",
    score: Number(chunk.similarity ?? chunk.score ?? 0),
    chunkId,
    documentId,
    sourceName,
    downloadUrl: chunk.download_url,
    originFileUrl: chunk.origin_file_url,
    url: chunk.url,
    sourceUrl: chunk.source_url,
    fileUrl: chunk.file_url,
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export function rankDocuments(
  query: string,
  documents: RetrievedDocument[],
): RetrievedDocument[] {
  const tokens = tokenize(query);
  return documents
    .map((document) => ({
      ...document,
      score: tokens.filter((token) =>
        `${document.title} ${document.content}`.toLowerCase().includes(token),
      ).length,
    }))
    .filter((document) => document.score > 0)
    .sort((left, right) => right.score - left.score);
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 3);
}
