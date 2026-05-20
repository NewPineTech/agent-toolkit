import { Annotation } from "@langchain/langgraph";
import { z } from "zod";
import type { AgenticIntent } from "./constants.js";

export type AgenticMessageRole = "user" | "assistant" | "system" | "tool";

export interface AgenticMessage {
  role: AgenticMessageRole;
  content: string;
}

export type AgenticEvidenceMetadataValue = string | number | boolean | null;
export type AgenticEvidenceMetadata = Record<
  string,
  AgenticEvidenceMetadataValue | AgenticEvidenceMetadataValue[]
>;

export type AgenticSourceKind = "document" | "retriever" | "mcp_tool" | "other";

export interface AgenticRetrievedDocument {
  id?: string;
  title: string;
  excerpt?: string;
  sourceName?: string;
  sourceUrl?: string;
  score?: number;
  metadata?: AgenticEvidenceMetadata;
}

export interface AgenticSource {
  id?: string;
  kind: AgenticSourceKind;
  name: string;
  url?: string;
  retrievedDocumentIds?: string[];
}

export type AgenticToolCallStatus =
  | "planned"
  | "executed"
  | "skipped"
  | "failed";

export interface AgenticToolCallAudit {
  toolName: string;
  status: AgenticToolCallStatus;
  capabilityId?: string;
  serverId?: string;
  inputSummary?: string;
  outputSummary?: string;
  latencyMs?: number;
  documentCount?: number;
  warningCodes?: string[];
}

export type AgenticMissingEvidenceSeverity = "info" | "warning" | "blocking";

export interface AgenticMissingEvidence {
  reason: string;
  severity: AgenticMissingEvidenceSeverity;
  expectedEvidence?: string;
}

export type AgenticConfidenceSignalDirection =
  | "supports"
  | "weakens"
  | "neutral";

export interface AgenticConfidenceSignal {
  label: string;
  direction: AgenticConfidenceSignalDirection;
  score?: number;
  rationale?: string;
}

export interface AgenticEvidence {
  retrievedDocuments: AgenticRetrievedDocument[];
  sources: AgenticSource[];
  toolCalls: AgenticToolCallAudit[];
  missingEvidence: AgenticMissingEvidence[];
  confidenceSignals: AgenticConfidenceSignal[];
}

export interface AgenticEvidenceDocumentInput {
  id?: string;
  chunkId?: string;
  documentId?: string;
  title: string;
  content?: string;
  excerpt?: string;
  sourceName?: string;
  downloadUrl?: string;
  originFileUrl?: string;
  url?: string;
  sourceUrl?: string;
  fileUrl?: string;
  score?: number;
  metadata?: AgenticEvidenceMetadata;
}

export interface CreateAgenticEvidenceFromDocumentsOptions {
  toolName: string;
  capabilityId?: string;
  warningCodes?: string[];
  missingEvidenceReason?: string;
}

export interface AgenticWorkflowResult {
  intent: AgenticIntent;
  answer: string;
  warnings: string[];
  evidence: AgenticEvidence;
}

export interface AgenticState {
  message: string;
  messages: AgenticMessage[];
  memorySummary: string | undefined;
  messagesSinceSummary: number;
  summaryBufferMessages: AgenticMessage[];
  standaloneQuery: string | undefined;
  selectedIntents: AgenticIntent[];
  workflowResults: AgenticWorkflowResult[];
  finalAnswer: string | undefined;
  warnings: string[];
}

export const AgenticStudioDefaultInput =
  "Xin chao, cho em hoi ve chinh sach nghi phep cua cong ty";

export const AgenticInputSchema = z.object({
  message: z.string().default(AgenticStudioDefaultInput),
});

export function createEmptyAgenticEvidence(): AgenticEvidence {
  return {
    retrievedDocuments: [],
    sources: [],
    toolCalls: [],
    missingEvidence: [],
    confidenceSignals: [],
  };
}

export function createAgenticEvidenceFromDocuments(
  documents: AgenticEvidenceDocumentInput[],
  options: CreateAgenticEvidenceFromDocumentsOptions,
): AgenticEvidence {
  const retrievedDocuments = documents.map((document, index) => {
    const id = document.id ?? document.chunkId ?? document.documentId;
    const sourceUrl = firstEvidenceSourceUrl(document);
    return {
      ...(id ? { id } : {}),
      title: document.title,
      ...(document.excerpt || document.content
        ? {
            excerpt: (document.excerpt ?? document.content ?? "").slice(
              0,
              1000,
            ),
          }
        : {}),
      ...(document.sourceName ? { sourceName: document.sourceName } : {}),
      ...(sourceUrl ? { sourceUrl } : {}),
      ...(document.score != null ? { score: document.score } : {}),
      ...(document.metadata ? { metadata: document.metadata } : {}),
      ...(!id ? { id: `retrieved-document-${index + 1}` } : {}),
    };
  });

  const sources = dedupeEvidenceSources(
    documents.map((document, index) => {
      const id = document.id ?? document.chunkId ?? document.documentId;
      return {
        id: id ?? `retrieved-document-${index + 1}`,
        kind: "document" as const,
        name: document.sourceName ?? document.title,
        url: firstEvidenceSourceUrl(document),
        retrievedDocumentIds: [id ?? `retrieved-document-${index + 1}`],
      };
    }),
  );

  const missingEvidence =
    documents.length === 0
      ? [
          {
            reason:
              options.missingEvidenceReason ??
              "No retrieved documents were available for this workflow.",
            severity: "warning" as const,
          },
        ]
      : [];

  const confidenceSignals =
    documents.length > 0
      ? [
          {
            label: "retrieved_documents_available",
            direction: "supports" as const,
            score: documents.length,
            rationale: `${documents.length} retrieved document(s) were available for grounding.`,
          },
        ]
      : [
          {
            label: "no_retrieved_documents",
            direction: "weakens" as const,
            score: 0,
            rationale: "No retrieved documents were available for grounding.",
          },
        ];

  return {
    retrievedDocuments,
    sources,
    toolCalls: [
      {
        toolName: options.toolName,
        status: "executed",
        ...(options.capabilityId ? { capabilityId: options.capabilityId } : {}),
        documentCount: documents.length,
        ...(options.warningCodes && options.warningCodes.length > 0
          ? { warningCodes: options.warningCodes }
          : {}),
      },
    ],
    missingEvidence,
    confidenceSignals,
  };
}

function firstEvidenceSourceUrl(
  document: Pick<
    AgenticEvidenceDocumentInput,
    "downloadUrl" | "originFileUrl" | "url" | "sourceUrl" | "fileUrl"
  >,
): string | undefined {
  return (
    document.downloadUrl ??
    document.originFileUrl ??
    document.url ??
    document.sourceUrl ??
    document.fileUrl
  );
}

function dedupeEvidenceSources(sources: AgenticSource[]): AgenticSource[] {
  const seen = new Set<string>();
  const result: AgenticSource[] = [];

  for (const source of sources) {
    const key = source.url ?? source.name;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(source);
  }

  return result;
}

function overwriteWithDefault<T>(defaultValue: () => T) {
  return {
    reducer: (_left: T, right: T): T => right,
    default: defaultValue,
  };
}

export const AgenticStateAnnotation = Annotation.Root({
  message: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => "",
  }),
  messages: Annotation<AgenticMessage[]>(
    overwriteWithDefault<AgenticMessage[]>(() => []),
  ),
  memorySummary: Annotation<string | undefined>(
    overwriteWithDefault<string | undefined>(() => undefined),
  ),
  messagesSinceSummary: Annotation<number>(
    overwriteWithDefault<number>(() => 0),
  ),
  summaryBufferMessages: Annotation<AgenticMessage[]>(
    overwriteWithDefault<AgenticMessage[]>(() => []),
  ),
  standaloneQuery: Annotation<string | undefined>(
    overwriteWithDefault<string | undefined>(() => undefined),
  ),
  selectedIntents: Annotation<AgenticIntent[]>(
    overwriteWithDefault<AgenticIntent[]>(() => []),
  ),
  workflowResults: Annotation<AgenticWorkflowResult[]>(
    overwriteWithDefault<AgenticWorkflowResult[]>(() => []),
  ),
  finalAnswer: Annotation<string | undefined>(
    overwriteWithDefault<string | undefined>(() => undefined),
  ),
  warnings: Annotation<string[]>(overwriteWithDefault<string[]>(() => [])),
});

export function createInitialAgenticState(message: string): AgenticState {
  return {
    message,
    messages: [],
    memorySummary: undefined,
    messagesSinceSummary: 0,
    summaryBufferMessages: [],
    standaloneQuery: undefined,
    selectedIntents: [],
    workflowResults: [],
    finalAnswer: undefined,
    warnings: [],
  };
}
