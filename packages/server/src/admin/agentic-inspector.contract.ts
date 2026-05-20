import type {
  AdminAgenticCapabilityCatalogEntry,
  AdminAgenticConfidenceDirection,
  AdminAgenticEvidenceDetail,
  AdminAgenticMissingEvidenceSeverity,
  AdminAgenticRunDetail,
  AdminAgenticRunStatus,
  AdminAgenticSanitizedJsonPayload,
  AdminAgenticSanitizedJsonValue,
  AdminAgenticSourceKind,
  AdminAgenticStepStatus,
  AdminAgenticTimelineRow,
  AdminAgenticToolCallStatus,
} from "@agent-toolkit/types";

// Server-owned contract for history/2026-05-19-draft-agentic-run-inspector/.
// Admin clients consume these DTOs after this module has redacted secrets.
const REDACTED_VALUE = "[REDACTED]";
const CIRCULAR_VALUE = "[CIRCULAR]";
const UNSUPPORTED_VALUE = "[UNSUPPORTED]";
const TRUNCATED_SUFFIX = "[TRUNCATED]";

const DEFAULT_MAX_STRING_LENGTH = 2_000;
const DEFAULT_MAX_PAYLOAD_BYTES = 32_000;

const DEFAULT_REDACTED_KEYS = new Set([
  "accesstoken",
  "apikey",
  "apitoken",
  "authorization",
  "authtoken",
  "bearer",
  "bearertoken",
  "clientsecret",
  "cookie",
  "encryptionkey",
  "geminivertexapikey",
  "headers",
  "idtoken",
  "jwtsecret",
  "mcpauthtoken",
  "password",
  "providerapikey",
  "proxyauthorization",
  "rawheaders",
  "ragflowapikey",
  "refreshtoken",
  "secret",
  "setcookie",
  "token",
  "xapikey",
]);

export interface AdminAgenticRedactionOptions {
  redactedArgumentKeys?: string[];
  maxStringLength?: number;
  maxPayloadBytes?: number;
}

export interface AdminAgenticRunRecordInput {
  runId: string;
  threadId: string;
  workspaceId?: string;
  startedAt: string;
  completedAt?: string;
  input: string;
  finalAnswer?: string;
  standaloneQuery?: string;
  selectedIntents: string[];
  status?: AdminAgenticRunStatus;
  warnings: string[];
  workflowResults: AdminAgenticWorkflowResultInput[];
  rawJson?: unknown;
}

export interface AdminAgenticWorkflowResultInput {
  intent: string;
  answer: string;
  warnings: string[];
  evidence: AdminAgenticEvidenceInput;
}

export interface AdminAgenticEvidenceInput {
  retrievedDocuments: AdminAgenticRetrievedDocumentInput[];
  sources: AdminAgenticSourceInput[];
  toolCalls: AdminAgenticToolCallInput[];
  missingEvidence: AdminAgenticMissingEvidenceInput[];
  confidenceSignals: AdminAgenticConfidenceSignalInput[];
}

export interface AdminAgenticRetrievedDocumentInput {
  id?: string;
  title: string;
  excerpt?: string;
  sourceName?: string;
  sourceUrl?: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface AdminAgenticSourceInput {
  id?: string;
  kind: AdminAgenticSourceKind;
  name: string;
  url?: string;
  retrievedDocumentIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface AdminAgenticToolCallInput {
  toolName: string;
  status: AdminAgenticToolCallStatus;
  capabilityId?: string;
  serverId?: string;
  inputSummary?: string;
  outputSummary?: string;
  input?: unknown;
  output?: unknown;
  latencyMs?: number;
  documentCount?: number;
  warningCodes?: string[];
}

export interface AdminAgenticMissingEvidenceInput {
  reason: string;
  severity: AdminAgenticMissingEvidenceSeverity;
  expectedEvidence?: string;
}

export interface AdminAgenticConfidenceSignalInput {
  label: string;
  direction: AdminAgenticConfidenceDirection;
  score?: number;
  rationale?: string;
}

export interface AdminAgenticCapabilityInput {
  id: string;
  intent: string;
  kind: AdminAgenticCapabilityCatalogEntry["kind"];
  displayName?: string;
  description?: string;
  safety: {
    readOnly: boolean;
    requiresApproval: boolean;
  };
  redactedArgumentKeys?: string[];
}

interface RedactionState {
  redactedKeys: Set<string>;
  redactionCount: number;
  visited: WeakSet<object>;
}

export function mapAgenticRunToAdminDetail(
  input: AdminAgenticRunRecordInput,
  options: AdminAgenticRedactionOptions = {},
): AdminAgenticRunDetail {
  const evidence = aggregateEvidence(input.workflowResults, options);
  const warningCount = input.warnings.length + sumWorkflowWarningCount(input);
  const missingEvidenceCount = evidence.missingEvidence.length;
  const blockingMissingEvidenceCount = evidence.missingEvidence.filter(
    (item) => item.severity === "blocking",
  ).length;
  const status =
    input.status ??
    deriveRunStatus(
      warningCount,
      missingEvidenceCount,
      blockingMissingEvidenceCount,
    );

  const summary = {
    runId: input.runId,
    threadId: input.threadId,
    workspaceId: input.workspaceId,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    selectedIntents: input.selectedIntents,
    status,
    warningCount,
    missingEvidenceCount,
    blockingMissingEvidenceCount,
    toolCallCount: evidence.toolCalls.length,
  };

  return {
    summary,
    input: input.input,
    finalAnswer: input.finalAnswer,
    standaloneQuery: input.standaloneQuery,
    workflowResults: input.workflowResults.map((workflowResult) => ({
      intent: workflowResult.intent,
      answer: workflowResult.answer,
      warnings: workflowResult.warnings,
      evidence: mapEvidence(workflowResult.evidence, options),
    })),
    evidence,
    timeline: buildLogicalTimeline(input, status),
    warnings: input.warnings,
    rawJson: redactAdminAgenticPayload(input.rawJson ?? input, options),
  };
}

export function mapAgenticCapabilityCatalog(
  capabilities: AdminAgenticCapabilityInput[],
): AdminAgenticCapabilityCatalogEntry[] {
  return capabilities.map((capability) => ({
    id: capability.id,
    intent: capability.intent,
    kind: capability.kind,
    displayName: capability.displayName ?? humanizeCapabilityId(capability.id),
    description: capability.description,
    readOnly: capability.safety.readOnly,
    requiresApproval: capability.safety.requiresApproval,
    redactedArgumentKeys: capability.redactedArgumentKeys ?? [],
  }));
}

export function redactAdminAgenticPayload(
  value: unknown,
  options: AdminAgenticRedactionOptions = {},
): AdminAgenticSanitizedJsonPayload {
  const maxStringLength = options.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH;
  const maxPayloadBytes = options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
  const redactedKeys = createRedactedKeySet(options.redactedArgumentKeys ?? []);
  const state: RedactionState = {
    redactedKeys: new Set(),
    redactionCount: 0,
    visited: new WeakSet(),
  };

  const sanitizedValue = sanitizeJsonValue(
    value,
    redactedKeys,
    maxStringLength,
    state,
  );
  const boundedValue = enforcePayloadSizeLimit(sanitizedValue, maxPayloadBytes);
  const originalSizeBytes = serializedByteLength(value);
  const sanitizedSizeBytes = serializedByteLength(boundedValue);

  return {
    value: boundedValue,
    truncated:
      originalSizeBytes > maxPayloadBytes || boundedValue !== sanitizedValue,
    originalSizeBytes,
    sanitizedSizeBytes,
    maxPayloadBytes,
    maxStringLength,
    redactionCount: state.redactionCount,
    redactedKeys: [...state.redactedKeys].sort(),
  };
}

function aggregateEvidence(
  workflowResults: AdminAgenticWorkflowResultInput[],
  options: AdminAgenticRedactionOptions,
): AdminAgenticEvidenceDetail {
  const empty: AdminAgenticEvidenceDetail = {
    retrievedDocuments: [],
    sources: [],
    toolCalls: [],
    missingEvidence: [],
    confidenceSignals: [],
  };

  return workflowResults.reduce<AdminAgenticEvidenceDetail>(
    (combined, workflowResult) => {
      const detail = mapEvidence(workflowResult.evidence, options);
      return {
        retrievedDocuments: [
          ...combined.retrievedDocuments,
          ...detail.retrievedDocuments,
        ],
        sources: [...combined.sources, ...detail.sources],
        toolCalls: [...combined.toolCalls, ...detail.toolCalls],
        missingEvidence: [
          ...combined.missingEvidence,
          ...detail.missingEvidence,
        ],
        confidenceSignals: [
          ...combined.confidenceSignals,
          ...detail.confidenceSignals,
        ],
      };
    },
    empty,
  );
}

function mapEvidence(
  evidence: AdminAgenticEvidenceInput,
  options: AdminAgenticRedactionOptions,
): AdminAgenticEvidenceDetail {
  return {
    retrievedDocuments: evidence.retrievedDocuments.map((document) => ({
      id: document.id,
      title: document.title,
      excerpt: document.excerpt,
      sourceName: document.sourceName,
      sourceUrl: document.sourceUrl,
      score: document.score,
      metadata: redactAdminAgenticPayload(document.metadata ?? {}, options),
    })),
    sources: evidence.sources.map((source) => ({
      id: source.id,
      kind: source.kind,
      name: source.name,
      url: source.url,
      retrievedDocumentIds: source.retrievedDocumentIds ?? [],
      ...(source.metadata
        ? { metadata: redactAdminAgenticPayload(source.metadata, options) }
        : {}),
    })),
    toolCalls: evidence.toolCalls.map((toolCall) => ({
      toolName: toolCall.toolName,
      status: toolCall.status,
      capabilityId: toolCall.capabilityId,
      serverId: toolCall.serverId,
      inputSummary: toolCall.inputSummary,
      outputSummary: toolCall.outputSummary,
      ...(toolCall.input === undefined
        ? {}
        : { input: redactAdminAgenticPayload(toolCall.input, options) }),
      ...(toolCall.output === undefined
        ? {}
        : { output: redactAdminAgenticPayload(toolCall.output, options) }),
      latencyMs: toolCall.latencyMs,
      documentCount: toolCall.documentCount,
      warningCodes: toolCall.warningCodes ?? [],
    })),
    missingEvidence: evidence.missingEvidence.map((item) => ({
      reason: item.reason,
      severity: item.severity,
      expectedEvidence: item.expectedEvidence,
    })),
    confidenceSignals: evidence.confidenceSignals.map((signal) => ({
      label: signal.label,
      direction: signal.direction,
      score: signal.score,
      rationale: signal.rationale,
    })),
  };
}

function sumWorkflowWarningCount(input: AdminAgenticRunRecordInput): number {
  return input.workflowResults.reduce(
    (count, workflowResult) => count + workflowResult.warnings.length,
    0,
  );
}

function deriveRunStatus(
  warningCount: number,
  missingEvidenceCount: number,
  blockingMissingEvidenceCount: number,
): AdminAgenticRunStatus {
  if (blockingMissingEvidenceCount > 0) return "blocked";
  if (warningCount > 0 || missingEvidenceCount > 0) return "warning";
  return "success";
}

function buildLogicalTimeline(
  input: AdminAgenticRunRecordInput,
  status: AdminAgenticRunStatus,
): AdminAgenticTimelineRow[] {
  const rows: AdminAgenticTimelineRow[] = [
    createTimelineRow(input, 1, "input", "Input received", "completed"),
  ];

  if (input.standaloneQuery) {
    rows.push(
      createTimelineRow(
        input,
        rows.length + 1,
        "query_rewrite",
        "Query rewrite",
        "completed",
      ),
    );
  }

  rows.push(
    createTimelineRow(
      input,
      rows.length + 1,
      "route_intent",
      "Intent routing",
      "completed",
    ),
  );

  for (const workflowResult of input.workflowResults) {
    const workflowStatus = deriveWorkflowStatus(workflowResult);
    rows.push({
      ...createTimelineRow(
        input,
        rows.length + 1,
        "workflow_result",
        `Workflow: ${workflowResult.intent}`,
        workflowStatus,
      ),
      intent: workflowResult.intent,
      warningCodes: workflowResult.warnings,
      evidenceRefs: collectEvidenceRefs(workflowResult.evidence),
    });
  }

  rows.push(
    createTimelineRow(
      input,
      rows.length + 1,
      "final_answer",
      "Final answer",
      status === "failed" ? "failed" : "completed",
    ),
  );

  return rows;
}

function createTimelineRow(
  input: AdminAgenticRunRecordInput,
  sequence: number,
  step: AdminAgenticTimelineRow["step"],
  label: string,
  status: AdminAgenticStepStatus,
): AdminAgenticTimelineRow {
  return {
    id: `${input.runId}:${sequence}`,
    runId: input.runId,
    sequence,
    step,
    label,
    status,
    startedAt: sequence === 1 ? input.startedAt : undefined,
    completedAt: step === "final_answer" ? input.completedAt : undefined,
    warningCodes: [],
    evidenceRefs: [],
  };
}

function deriveWorkflowStatus(
  workflowResult: AdminAgenticWorkflowResultInput,
): AdminAgenticStepStatus {
  if (
    workflowResult.evidence.missingEvidence.some(
      (item) => item.severity === "blocking",
    )
  ) {
    return "failed";
  }

  return "completed";
}

function collectEvidenceRefs(evidence: AdminAgenticEvidenceInput): string[] {
  const documentRefs = evidence.retrievedDocuments
    .map((document) => document.id)
    .filter(isPresent);
  const capabilityRefs = evidence.toolCalls
    .map((toolCall) => toolCall.capabilityId)
    .filter(isPresent);

  return [...documentRefs, ...capabilityRefs];
}

function sanitizeJsonValue(
  value: unknown,
  redactedKeys: Set<string>,
  maxStringLength: number,
  state: RedactionState,
): AdminAgenticSanitizedJsonValue {
  if (value === null) return null;

  switch (typeof value) {
    case "string":
      return sanitizeString(value, maxStringLength, state);
    case "number":
      return Number.isFinite(value) ? value : UNSUPPORTED_VALUE;
    case "boolean":
      return value;
    case "undefined":
    case "function":
    case "symbol":
    case "bigint":
      return UNSUPPORTED_VALUE;
    case "object":
      return sanitizeObject(value, redactedKeys, maxStringLength, state);
  }

  return UNSUPPORTED_VALUE;
}

function sanitizeObject(
  value: object,
  redactedKeys: Set<string>,
  maxStringLength: number,
  state: RedactionState,
): AdminAgenticSanitizedJsonValue {
  if (state.visited.has(value)) return CIRCULAR_VALUE;
  state.visited.add(value);

  if (Array.isArray(value)) {
    return value.map((item) =>
      sanitizeJsonValue(item, redactedKeys, maxStringLength, state),
    );
  }

  const sanitized: Record<string, AdminAgenticSanitizedJsonValue> = {};

  for (const [key, entryValue] of Object.entries(value)) {
    const normalizedKey = normalizeRedactionKey(key);
    if (redactedKeys.has(normalizedKey)) {
      sanitized[key] = REDACTED_VALUE;
      state.redactionCount += 1;
      state.redactedKeys.add(key);
      continue;
    }

    sanitized[key] = sanitizeJsonValue(
      entryValue,
      redactedKeys,
      maxStringLength,
      state,
    );
  }

  return sanitized;
}

function truncateString(value: string, maxStringLength: number): string {
  if (value.length <= maxStringLength) return value;
  if (maxStringLength <= TRUNCATED_SUFFIX.length) {
    return TRUNCATED_SUFFIX.slice(0, Math.max(0, maxStringLength));
  }

  return `${value.slice(0, maxStringLength - TRUNCATED_SUFFIX.length)}${TRUNCATED_SUFFIX}`;
}

function sanitizeString(
  value: string,
  maxStringLength: number,
  state: RedactionState,
): string {
  const sanitized = value.replace(/\bBearer\s+\S+/gi, () => {
    state.redactionCount += 1;
    state.redactedKeys.add("Bearer");
    return REDACTED_VALUE;
  });
  return truncateString(sanitized, maxStringLength);
}

function enforcePayloadSizeLimit(
  value: AdminAgenticSanitizedJsonValue,
  maxPayloadBytes: number,
): AdminAgenticSanitizedJsonValue {
  if (serializedByteLength(value) <= maxPayloadBytes) return value;

  if (Array.isArray(value)) {
    const bounded: AdminAgenticSanitizedJsonValue[] = [];
    for (const item of value) {
      if (
        serializedByteLength([...bounded, item, TRUNCATED_SUFFIX]) >
        maxPayloadBytes
      ) {
        break;
      }
      bounded.push(item);
    }
    bounded.push(TRUNCATED_SUFFIX);
    return bounded;
  }

  if (typeof value === "object" && value !== null) {
    const bounded: Record<string, AdminAgenticSanitizedJsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      const next = { ...bounded, [key]: item, _truncated: true };
      if (serializedByteLength(next) > maxPayloadBytes) break;
      bounded[key] = item;
    }
    bounded["_truncated"] = true;
    if (serializedByteLength(bounded) > maxPayloadBytes) {
      return truncateString(TRUNCATED_SUFFIX, maxPayloadBytes);
    }
    return bounded;
  }

  return truncateString(String(value), Math.max(0, maxPayloadBytes));
}

function createRedactedKeySet(redactedArgumentKeys: string[]): Set<string> {
  const redactedKeys = new Set(DEFAULT_REDACTED_KEYS);
  for (const key of redactedArgumentKeys) {
    redactedKeys.add(normalizeRedactionKey(key));
  }
  return redactedKeys;
}

function normalizeRedactionKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function serializedByteLength(value: unknown): number {
  const serialized = JSON.stringify(value, circularJsonReplacer()) ?? "";
  return new TextEncoder().encode(serialized).length;
}

function circularJsonReplacer(): (key: string, value: unknown) => unknown {
  const visited = new WeakSet<object>();

  return (_key: string, value: unknown): unknown => {
    if (typeof value !== "object" || value === null) return value;
    if (visited.has(value)) return CIRCULAR_VALUE;
    visited.add(value);
    return value;
  };
}

function humanizeCapabilityId(capabilityId: string): string {
  return capabilityId
    .split(/[._:-]/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined;
}
