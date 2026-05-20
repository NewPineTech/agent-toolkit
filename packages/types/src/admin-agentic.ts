export type AdminAgenticRunStatus =
  | "success"
  | "warning"
  | "blocked"
  | "failed"
  | "running";

export type AdminAgenticStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export type AdminAgenticTimelineStep =
  | "input"
  | "query_rewrite"
  | "route_intent"
  | "workflow_result"
  | "tool_call"
  | "retrieval"
  | "verifier"
  | "final_answer";

export type AdminAgenticCapabilityKind =
  | "retriever"
  | "mcp_tool"
  | "resolver"
  | "verifier";

export type AdminAgenticToolCallStatus =
  | "planned"
  | "executed"
  | "skipped"
  | "failed";

export type AdminAgenticMissingEvidenceSeverity =
  | "info"
  | "warning"
  | "blocking";

export type AdminAgenticConfidenceDirection =
  | "supports"
  | "weakens"
  | "neutral";

export type AdminAgenticSourceKind =
  | "document"
  | "retriever"
  | "mcp_tool"
  | "other";

export type AdminAgenticSanitizedJsonPrimitive =
  | string
  | number
  | boolean
  | null;

export type AdminAgenticSanitizedJsonValue =
  | AdminAgenticSanitizedJsonPrimitive
  | AdminAgenticSanitizedJsonObject
  | AdminAgenticSanitizedJsonValue[];

export interface AdminAgenticSanitizedJsonObject {
  [key: string]: AdminAgenticSanitizedJsonValue;
}

export interface AdminAgenticSanitizedJsonPayload {
  value: AdminAgenticSanitizedJsonValue;
  truncated: boolean;
  originalSizeBytes: number;
  sanitizedSizeBytes: number;
  maxPayloadBytes: number;
  maxStringLength: number;
  redactionCount: number;
  redactedKeys: string[];
}

export interface AdminAgenticRunSummary {
  runId: string;
  threadId: string;
  workspaceId?: string;
  startedAt: string;
  completedAt?: string;
  selectedIntents: string[];
  status: AdminAgenticRunStatus;
  warningCount: number;
  missingEvidenceCount: number;
  blockingMissingEvidenceCount: number;
  toolCallCount: number;
}

export interface AdminAgenticRunDetail {
  summary: AdminAgenticRunSummary;
  input: string;
  finalAnswer?: string;
  standaloneQuery?: string;
  workflowResults: AdminAgenticWorkflowResultDetail[];
  evidence: AdminAgenticEvidenceDetail;
  timeline: AdminAgenticTimelineRow[];
  warnings: string[];
  rawJson: AdminAgenticSanitizedJsonPayload;
}

export interface AdminAgenticWorkflowResultDetail {
  intent: string;
  answer: string;
  warnings: string[];
  evidence: AdminAgenticEvidenceDetail;
}

export interface AdminAgenticEvidenceDetail {
  retrievedDocuments: AdminAgenticRetrievedDocumentDetail[];
  sources: AdminAgenticSourceDetail[];
  toolCalls: AdminAgenticToolCallDetail[];
  missingEvidence: AdminAgenticMissingEvidenceDetail[];
  confidenceSignals: AdminAgenticConfidenceSignalDetail[];
}

export interface AdminAgenticRetrievedDocumentDetail {
  id?: string;
  title: string;
  excerpt?: string;
  sourceName?: string;
  sourceUrl?: string;
  score?: number;
  metadata: AdminAgenticSanitizedJsonPayload;
}

export interface AdminAgenticSourceDetail {
  id?: string;
  kind: AdminAgenticSourceKind;
  name: string;
  url?: string;
  retrievedDocumentIds: string[];
  metadata?: AdminAgenticSanitizedJsonPayload;
}

export interface AdminAgenticToolCallDetail {
  toolName: string;
  status: AdminAgenticToolCallStatus;
  capabilityId?: string;
  serverId?: string;
  inputSummary?: string;
  outputSummary?: string;
  input?: AdminAgenticSanitizedJsonPayload;
  output?: AdminAgenticSanitizedJsonPayload;
  latencyMs?: number;
  documentCount?: number;
  warningCodes: string[];
}

export interface AdminAgenticMissingEvidenceDetail {
  reason: string;
  severity: AdminAgenticMissingEvidenceSeverity;
  expectedEvidence?: string;
}

export interface AdminAgenticConfidenceSignalDetail {
  label: string;
  direction: AdminAgenticConfidenceDirection;
  score?: number;
  rationale?: string;
}

export interface AdminAgenticCapabilityCatalogEntry {
  id: string;
  intent: string;
  kind: AdminAgenticCapabilityKind;
  displayName: string;
  description?: string;
  readOnly: boolean;
  requiresApproval: boolean;
  redactedArgumentKeys: string[];
}

export interface AdminAgenticTimelineRow {
  id: string;
  runId: string;
  sequence: number;
  step: AdminAgenticTimelineStep;
  label: string;
  status: AdminAgenticStepStatus;
  intent?: string;
  capabilityId?: string;
  toolName?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  warningCodes: string[];
  evidenceRefs: string[];
}
