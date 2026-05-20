import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import type { AdminAgenticSanitizedJsonPayload } from "@agent-toolkit/types";
import { agenticInspectorRoutes } from "./agentic-inspector.routes.js";
import type {
  AgenticRunAuditEventRecord,
  AgenticRunAuditRunRecord,
  AgenticToolCallAuditRecord,
} from "./agentic-run-audit.recorder.js";
import type { AgenticRunAuditReadStore } from "../adapters/storage/postgres-agentic-run-audit.store.js";

const ADMIN_TOKEN = "admin-token-for-tests-32-characters";

describe("agenticInspectorRoutes", () => {
  it("rejects missing, widget-like, and unconfigured admin auth", async () => {
    const app = await buildApp(createStore(), ADMIN_TOKEN);
    const missing = await app.inject({
      method: "GET",
      url: "/admin/agentic/runs",
    });
    const invalid = await app.inject({
      method: "GET",
      url: "/admin/agentic/runs",
      headers: { authorization: "Bearer widget-session-token" },
    });
    await app.close();

    const unconfigured = await buildApp(createStore(), undefined);
    const unavailable = await unconfigured.inject({
      method: "GET",
      url: "/admin/agentic/runs",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    await unconfigured.close();

    expect(missing.statusCode).toBe(401);
    expect(JSON.parse(missing.body).error.code).toBe("ADMIN_AUTH_REQUIRED");
    expect(invalid.statusCode).toBe(401);
    expect(JSON.parse(invalid.body).error.code).toBe("ADMIN_AUTH_INVALID");
    expect(unavailable.statusCode).toBe(503);
    expect(JSON.parse(unavailable.body).error.code).toBe(
      "ADMIN_AUTH_NOT_CONFIGURED",
    );
  });

  it("lists runs with pagination and filters", async () => {
    const store = createStore();
    const app = await buildApp(store, ADMIN_TOKEN);

    const response = await app.inject({
      method: "GET",
      url: "/admin/agentic/runs?workspaceId=ws_1&status=success&intent=hr_knowledge_qa&limit=1&offset=0",
      headers: authHeaders(),
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      runId: "run_success",
      threadId: "thread_1",
      workspaceId: "ws_1",
      status: "success",
    });
    expect(body.nextOffset).toBe(1);
  });

  it("returns run detail, evidence detail, and thread events from sanitized audit records", async () => {
    const app = await buildApp(createStore(), ADMIN_TOKEN);

    const detailResponse = await app.inject({
      method: "GET",
      url: "/admin/agentic/runs/run_success",
      headers: authHeaders(),
    });
    const evidenceResponse = await app.inject({
      method: "GET",
      url: "/admin/agentic/runs/run_success/evidence",
      headers: authHeaders(),
    });
    const threadResponse = await app.inject({
      method: "GET",
      url: "/admin/agentic/threads/thread_1/events",
      headers: authHeaders(),
    });
    await app.close();

    expect(detailResponse.statusCode).toBe(200);
    const detail = JSON.parse(detailResponse.body);
    expect(detail.input).toBe("Leave policy?");
    expect(detail.finalAnswer).toBe("Employees have paid leave.");
    expect(JSON.stringify(detail.rawJson.value)).not.toContain("secret");
    expect(detail.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          step: "tool_call",
          toolName: "ragflow.retrieve",
        }),
      ]),
    );

    expect(evidenceResponse.statusCode).toBe(200);
    expect(JSON.parse(evidenceResponse.body).toolCalls[0]).toMatchObject({
      toolName: "ragflow.retrieve",
      status: "executed",
      capabilityId: "hr_knowledge.retrieve_process",
    });

    expect(threadResponse.statusCode).toBe(200);
    expect(JSON.parse(threadResponse.body).items).toHaveLength(3);
  });

  it("handles empty data, malformed IDs, malformed filters, missing runs, and capability catalog", async () => {
    const app = await buildApp(createStore({ empty: true }), ADMIN_TOKEN);

    const empty = await app.inject({
      method: "GET",
      url: "/admin/agentic/runs",
      headers: authHeaders(),
    });
    const malformedRun = await app.inject({
      method: "GET",
      url: "/admin/agentic/runs/run%2Fbad",
      headers: authHeaders(),
    });
    const malformedQuery = await app.inject({
      method: "GET",
      url: "/admin/agentic/runs?limit=9999",
      headers: authHeaders(),
    });
    const missingRun = await app.inject({
      method: "GET",
      url: "/admin/agentic/runs/run_missing",
      headers: authHeaders(),
    });
    const catalog = await app.inject({
      method: "GET",
      url: "/admin/agentic/capabilities",
      headers: authHeaders(),
    });
    await app.close();

    expect(empty.statusCode).toBe(200);
    expect(JSON.parse(empty.body).items).toEqual([]);
    expect(malformedRun.statusCode).toBe(400);
    expect(JSON.parse(malformedRun.body).error.code).toBe("MALFORMED_RUN_ID");
    expect(malformedQuery.statusCode).toBe(400);
    expect(missingRun.statusCode).toBe(404);
    expect(catalog.statusCode).toBe(200);
    expect(JSON.parse(catalog.body).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "hr_recruitment.search_user_guide",
          readOnly: true,
        }),
        expect.objectContaining({
          id: "hr_recruitment.update_candidate_status",
          requiresApproval: true,
        }),
      ]),
    );
  });
});

async function buildApp(
  store: AgenticRunAuditReadStore,
  adminToken: string | undefined,
) {
  const app = Fastify({ logger: false });
  await app.register(agenticInspectorRoutes, {
    auditStore: store,
    config: { ADMIN_API_TOKEN: adminToken },
  });
  await app.ready();
  return app;
}

function authHeaders() {
  return { authorization: `Bearer ${ADMIN_TOKEN}` };
}

function createStore(
  options: { empty?: boolean } = {},
): AgenticRunAuditReadStore {
  const runs = options.empty ? [] : [successRun(), warningRun()];
  const events = options.empty ? [] : successEvents();
  const toolCalls = options.empty ? [] : [successToolCall()];

  return {
    async createRun() {},
    async appendEvent() {},
    async appendToolCall() {},
    async completeRun() {},
    async failRun() {},
    async listRuns(filters) {
      return runs
        .filter(
          (run) =>
            !filters.workspaceId || run.workspaceId === filters.workspaceId,
        )
        .filter((run) => !filters.threadId || run.threadId === filters.threadId)
        .filter((run) => !filters.status || run.status === filters.status)
        .filter(
          (run) =>
            !filters.intent || run.selectedIntents.includes(filters.intent),
        )
        .slice(filters.offset, filters.offset + filters.limit);
    },
    async getRun(runId) {
      return runs.find((run) => run.runId === runId) ?? null;
    },
    async listEventsForRun(runId) {
      return events.filter((event) => event.runId === runId);
    },
    async listEventsForThread(threadId) {
      return events.filter((event) => event.threadId === threadId);
    },
    async listToolCallsForRun(runId) {
      return toolCalls.filter((toolCall) => toolCall.runId === runId);
    },
  };
}

function successRun(): AgenticRunAuditRunRecord {
  return {
    runId: "run_success",
    threadId: "thread_1",
    workspaceId: "ws_1",
    status: "success",
    startedAt: "2026-05-20T01:00:00.000Z",
    completedAt: "2026-05-20T01:00:03.000Z",
    durationMs: 3000,
    selectedIntents: ["hr_knowledge_qa"],
    warningCodes: [],
    evidenceRefs: ["doc_1"],
    stateDelta: payload({
      input: "Leave policy?",
      finalAnswer: "Employees have paid leave.",
      providerApiKey: "[REDACTED]",
    }),
    retainedUntil: "2026-08-18T01:00:00.000Z",
  };
}

function warningRun(): AgenticRunAuditRunRecord {
  return {
    ...successRun(),
    runId: "run_warning",
    threadId: "thread_2",
    status: "warning",
    warningCodes: ["MCP_TOOL_CALL_FAILED"],
  };
}

function successEvents(): AgenticRunAuditEventRecord[] {
  return [
    {
      eventId: "event_1",
      runId: "run_success",
      threadId: "thread_1",
      sequence: 1,
      eventType: "run_started",
      nodeName: "chat",
      status: "running",
      startedAt: "2026-05-20T01:00:00.000Z",
      warningCodes: [],
      evidenceRefs: [],
    },
    {
      eventId: "event_2",
      runId: "run_success",
      threadId: "thread_1",
      sequence: 2,
      eventType: "tool_call",
      nodeName: "ragflow.retrieve",
      logicalStep: "tool_call",
      status: "completed",
      durationMs: 250,
      warningCodes: [],
      evidenceRefs: ["doc_1"],
    },
    {
      eventId: "event_3",
      runId: "run_success",
      threadId: "thread_1",
      sequence: 3,
      eventType: "run_completed",
      nodeName: "chat",
      status: "completed",
      completedAt: "2026-05-20T01:00:03.000Z",
      warningCodes: [],
      evidenceRefs: ["doc_1"],
    },
  ];
}

function successToolCall(): AgenticToolCallAuditRecord {
  return {
    toolCallId: "tool_1",
    eventId: "event_2",
    runId: "run_success",
    threadId: "thread_1",
    sequence: 2,
    toolName: "ragflow.retrieve",
    status: "executed",
    capabilityId: "hr_knowledge.retrieve_process",
    serverId: "ragflow",
    durationMs: 250,
    warningCodes: [],
    evidenceRefs: ["doc_1"],
    input: payload({ query: "Leave policy?" }),
    output: payload({ documentIds: ["doc_1"] }),
  };
}

function payload(
  value: AdminAgenticSanitizedJsonPayload["value"],
): AdminAgenticSanitizedJsonPayload {
  const size = JSON.stringify(value).length;
  return {
    value,
    truncated: false,
    originalSizeBytes: size,
    sanitizedSizeBytes: size,
    maxPayloadBytes: 32_000,
    maxStringLength: 2_000,
    redactionCount: JSON.stringify(value).includes("[REDACTED]") ? 1 : 0,
    redactedKeys: JSON.stringify(value).includes("[REDACTED]")
      ? ["providerApiKey"]
      : [],
  };
}
