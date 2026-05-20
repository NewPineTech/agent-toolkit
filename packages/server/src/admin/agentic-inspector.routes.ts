import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { timingSafeEqual } from "node:crypto";
import type {
  AdminAgenticEvidenceDetail,
  AdminAgenticRunDetail,
  AdminAgenticRunStatus,
  AdminAgenticSanitizedJsonPayload,
  AdminAgenticTimelineRow,
  AdminAgenticToolCallDetail,
} from "@agent-toolkit/types";
import type { Config } from "../config/env.js";
import type {
  AgenticRunAuditEventRecord,
  AgenticRunAuditRunRecord,
  AgenticToolCallAuditRecord,
} from "./agentic-run-audit.recorder.js";
import type {
  AgenticRunAuditListFilters,
  AgenticRunAuditReadStore,
} from "../adapters/storage/postgres-agentic-run-audit.store.js";
import { getAgenticCapabilityCatalog } from "./agentic-capability-catalog.js";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;
const ID_PATTERN = /^[a-zA-Z0-9._:-]{1,160}$/;

export interface AgenticInspectorRoutesOptions {
  auditStore: AgenticRunAuditReadStore;
  config: Pick<Config, "ADMIN_API_TOKEN">;
}

interface RunListQuery {
  workspaceId?: string;
  threadId?: string;
  status?: AdminAgenticRunStatus;
  intent?: string;
  startedFrom?: string;
  startedTo?: string;
  limit?: string;
  offset?: string;
}

interface RunParams {
  runId: string;
}

interface ThreadParams {
  threadId: string;
}

export async function agenticInspectorRoutes(
  app: FastifyInstance,
  opts: AgenticInspectorRoutesOptions,
) {
  app.addHook("preHandler", async (request, reply) => {
    if (request.url.startsWith("/admin/agentic")) {
      return requireAdminToken(request, reply, opts.config.ADMIN_API_TOKEN);
    }
  });

  app.get<{ Querystring: RunListQuery }>(
    "/admin/agentic/runs",
    async (request, reply) => {
      const filters = parseRunListQuery(request.query);
      if (!filters.valid) {
        return reply
          .status(400)
          .send(errorBody("INVALID_QUERY", filters.error));
      }

      const runs = await opts.auditStore.listRuns(filters.value);
      return reply.status(200).send({
        items: runs.map(toRunSummary),
        limit: filters.value.limit,
        offset: filters.value.offset,
        nextOffset:
          runs.length === filters.value.limit
            ? filters.value.offset + filters.value.limit
            : null,
      });
    },
  );

  app.get<{ Params: RunParams }>(
    "/admin/agentic/runs/:runId",
    async (request, reply) => {
      if (!isValidId(request.params.runId)) {
        return reply.status(400).send(errorBody("MALFORMED_RUN_ID"));
      }

      const detail = await loadRunDetail(opts.auditStore, request.params.runId);
      if (!detail) {
        return reply.status(404).send(errorBody("RUN_NOT_FOUND"));
      }

      return reply.status(200).send(detail);
    },
  );

  app.get<{ Params: RunParams }>(
    "/admin/agentic/runs/:runId/evidence",
    async (request, reply) => {
      if (!isValidId(request.params.runId)) {
        return reply.status(400).send(errorBody("MALFORMED_RUN_ID"));
      }

      const detail = await loadRunDetail(opts.auditStore, request.params.runId);
      if (!detail) {
        return reply.status(404).send(errorBody("RUN_NOT_FOUND"));
      }

      return reply.status(200).send(detail.evidence);
    },
  );

  app.get<{ Params: ThreadParams }>(
    "/admin/agentic/threads/:threadId/events",
    async (request, reply) => {
      if (!isValidId(request.params.threadId)) {
        return reply.status(400).send(errorBody("MALFORMED_THREAD_ID"));
      }

      const events = await opts.auditStore.listEventsForThread(
        request.params.threadId,
      );
      return reply
        .status(200)
        .send({ items: events.map((event) => toTimelineRow(event)) });
    },
  );

  app.get("/admin/agentic/capabilities", async (_request, reply) => {
    return reply.status(200).send({ items: getAgenticCapabilityCatalog() });
  });
}

async function requireAdminToken(
  request: FastifyRequest,
  reply: FastifyReply,
  configuredToken: string | undefined,
) {
  if (!configuredToken) {
    return reply.status(503).send(errorBody("ADMIN_AUTH_NOT_CONFIGURED"));
  }

  const authHeader = request.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    return reply.status(401).send(errorBody("ADMIN_AUTH_REQUIRED"));
  }

  if (!constantTimeEqual(authHeader.slice(7), configuredToken)) {
    return reply.status(401).send(errorBody("ADMIN_AUTH_INVALID"));
  }
}

function constantTimeEqual(candidate: string, expected: string): boolean {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return (
    candidateBuffer.length === expectedBuffer.length &&
    timingSafeEqual(candidateBuffer, expectedBuffer)
  );
}

function parseRunListQuery(
  query: RunListQuery,
):
  | { valid: true; value: AgenticRunAuditListFilters }
  | { valid: false; error?: string } {
  const limit = parseBoundedInteger(query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = parseBoundedInteger(query.offset, 0, 0, 100_000);
  if (limit === null || offset === null) {
    return { valid: false, error: "limit and offset must be bounded integers" };
  }
  if (query.workspaceId && !isValidId(query.workspaceId)) {
    return { valid: false, error: "workspaceId is malformed" };
  }
  if (query.threadId && !isValidId(query.threadId)) {
    return { valid: false, error: "threadId is malformed" };
  }
  if (query.status && !isValidStatus(query.status)) {
    return { valid: false, error: "status is unsupported" };
  }
  if (query.intent && !isValidId(query.intent)) {
    return { valid: false, error: "intent is malformed" };
  }
  if (
    !isValidOptionalDate(query.startedFrom) ||
    !isValidOptionalDate(query.startedTo)
  ) {
    return { valid: false, error: "date filters must be ISO timestamps" };
  }

  return {
    valid: true,
    value: {
      limit,
      offset,
      workspaceId: query.workspaceId,
      threadId: query.threadId,
      status: query.status,
      intent: query.intent,
      startedFrom: query.startedFrom,
      startedTo: query.startedTo,
    },
  };
}

function parseBoundedInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number | null {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

async function loadRunDetail(
  auditStore: AgenticRunAuditReadStore,
  runId: string,
): Promise<AdminAgenticRunDetail | null> {
  const run = await auditStore.getRun(runId);
  if (!run) return null;

  const [events, toolCalls] = await Promise.all([
    auditStore.listEventsForRun(runId),
    auditStore.listToolCallsForRun(runId),
  ]);

  return toRunDetail(run, events, toolCalls);
}

function toRunDetail(
  run: AgenticRunAuditRunRecord,
  events: AgenticRunAuditEventRecord[],
  toolCalls: AgenticToolCallAuditRecord[],
): AdminAgenticRunDetail {
  const evidence = toEvidence(toolCalls);
  const rawJson = run.stateDelta ?? emptyPayload({ runId: run.runId });
  const summary = toRunSummary(run);
  return {
    summary: {
      ...summary,
      toolCallCount: toolCalls.length,
    },
    input: extractString(rawJson, ["input", "message", "query"]) ?? "",
    finalAnswer: extractString(rawJson, ["finalAnswer", "answer"]),
    standaloneQuery: extractString(rawJson, ["standaloneQuery"]),
    workflowResults: [],
    evidence,
    timeline: events.map((event) => toTimelineRow(event, toolCalls)),
    warnings: run.warningCodes,
    rawJson,
  };
}

function toRunSummary(run: AgenticRunAuditRunRecord) {
  return {
    runId: run.runId,
    threadId: run.threadId,
    workspaceId: run.workspaceId,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    selectedIntents: run.selectedIntents,
    status: run.status as AdminAgenticRunStatus,
    warningCount: run.warningCodes.length,
    missingEvidenceCount: 0,
    blockingMissingEvidenceCount: 0,
    toolCallCount: 0,
  };
}

function toEvidence(
  toolCalls: AgenticToolCallAuditRecord[],
): AdminAgenticEvidenceDetail {
  return {
    retrievedDocuments: [],
    sources: [],
    toolCalls: toolCalls.map(toToolCallDetail),
    missingEvidence: [],
    confidenceSignals: [],
  };
}

function toToolCallDetail(
  toolCall: AgenticToolCallAuditRecord,
): AdminAgenticToolCallDetail {
  return {
    toolName: toolCall.toolName,
    status: toolCall.status,
    capabilityId: toolCall.capabilityId,
    serverId: toolCall.serverId,
    inputSummary: toolCall.input
      ? `Sanitized input ${toolCall.input.sanitizedSizeBytes} bytes`
      : undefined,
    outputSummary:
      toolCall.errorMessage ??
      (toolCall.output
        ? `Sanitized output ${toolCall.output.sanitizedSizeBytes} bytes`
        : undefined),
    input: toolCall.input,
    output: toolCall.output,
    latencyMs: toolCall.durationMs,
    warningCodes: toolCall.warningCodes,
  };
}

function toTimelineRow(
  event: AgenticRunAuditEventRecord,
  toolCalls: AgenticToolCallAuditRecord[] = [],
): AdminAgenticTimelineRow {
  const linkedToolCall = toolCalls.find(
    (toolCall) => toolCall.eventId === event.eventId,
  );
  return {
    id: event.eventId,
    runId: event.runId,
    sequence: event.sequence,
    step: event.logicalStep ?? stepForEventType(event.eventType),
    label: labelForEvent(event),
    status: event.status,
    capabilityId: linkedToolCall?.capabilityId,
    toolName: linkedToolCall?.toolName,
    startedAt: event.startedAt,
    completedAt: event.completedAt,
    durationMs: event.durationMs,
    warningCodes: event.warningCodes,
    evidenceRefs: event.evidenceRefs,
  };
}

function stepForEventType(
  eventType: AgenticRunAuditEventRecord["eventType"],
): AdminAgenticTimelineRow["step"] {
  if (eventType === "tool_call") return "tool_call";
  if (eventType === "run_started") return "input";
  if (eventType === "run_completed" || eventType === "run_failed") {
    return "final_answer";
  }
  return "workflow_result";
}

function labelForEvent(event: AgenticRunAuditEventRecord): string {
  if (event.logicalStep) return humanize(event.logicalStep);
  return humanize(event.nodeName);
}

function humanize(value: string): string {
  return value
    .split(/[._:-]/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function extractString(
  payload: AdminAgenticSanitizedJsonPayload,
  keys: string[],
): string | undefined {
  if (
    !payload.value ||
    typeof payload.value !== "object" ||
    Array.isArray(payload.value)
  ) {
    return undefined;
  }

  for (const key of keys) {
    const value = payload.value[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

function emptyPayload(value: AdminAgenticSanitizedJsonPayload["value"]) {
  const size = JSON.stringify(value).length;
  return {
    value,
    truncated: false,
    originalSizeBytes: size,
    sanitizedSizeBytes: size,
    maxPayloadBytes: size,
    maxStringLength: size,
    redactionCount: 0,
    redactedKeys: [],
  };
}

function isValidId(value: string): boolean {
  return ID_PATTERN.test(value);
}

function isValidStatus(value: string): value is AdminAgenticRunStatus {
  return ["success", "warning", "blocked", "failed", "running"].includes(value);
}

function isValidOptionalDate(value: string | undefined): boolean {
  return value === undefined || !Number.isNaN(Date.parse(value));
}

function errorBody(code: string, message: string = code) {
  return { error: { code, message } };
}
