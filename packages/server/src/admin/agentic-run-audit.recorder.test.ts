import { describe, expect, it, vi } from "vitest";
import {
  AgenticRunAuditRecorder,
  getAgenticRunAuditStoragePlan,
  type AgenticRunAuditStore,
} from "./agentic-run-audit.recorder.js";

function createStore(): AgenticRunAuditStore {
  return {
    createRun: vi.fn().mockResolvedValue(undefined),
    appendEvent: vi.fn().mockResolvedValue(undefined),
    appendToolCall: vi.fn().mockResolvedValue(undefined),
    completeRun: vi.fn().mockResolvedValue(undefined),
    failRun: vi.fn().mockResolvedValue(undefined),
  };
}

describe("AgenticRunAuditRecorder", () => {
  it("persists a successful run with ordered logical step events and duration", async () => {
    const store = createStore();
    const recorder = new AgenticRunAuditRecorder(store, {
      now: () => new Date("2026-05-19T10:00:00.000Z"),
      idFactory: (prefix) => `${prefix}_1`,
      retentionDays: 90,
    });

    const run = await recorder.startRun({
      threadId: "thread_1",
      workspaceId: "workspace_1",
      stateDelta: { message: "Leave policy?" },
    });

    await recorder.recordStep(run, {
      nodeName: "route_intent",
      logicalStep: "route_intent",
      status: "completed",
      startedAt: "2026-05-19T10:00:01.000Z",
      completedAt: "2026-05-19T10:00:01.125Z",
      stateDelta: { selectedIntents: ["hr_knowledge_qa"] },
    });

    await recorder.completeRun(run, {
      completedAt: "2026-05-19T10:00:03.500Z",
      selectedIntents: ["hr_knowledge_qa"],
      evidenceRefs: ["doc_1"],
      stateDelta: { finalAnswer: "Employees have paid leave." },
    });

    expect(store.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run_1",
        threadId: "thread_1",
        workspaceId: "workspace_1",
        status: "running",
        retainedUntil: "2026-08-17T10:00:00.000Z",
      }),
    );
    expect(store.appendEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        sequence: 1,
        eventType: "run_started",
        nodeName: "chat",
        status: "running",
      }),
    );
    expect(store.appendEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sequence: 2,
        eventType: "step_completed",
        nodeName: "route_intent",
        logicalStep: "route_intent",
        status: "completed",
        durationMs: 125,
      }),
    );
    expect(store.completeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run_1",
        status: "success",
        durationMs: 3500,
        selectedIntents: ["hr_knowledge_qa"],
      }),
    );
  });

  it("marks a completed run as warning when warning codes are recorded", async () => {
    const store = createStore();
    const recorder = new AgenticRunAuditRecorder(store, {
      now: () => new Date("2026-05-19T10:00:00.000Z"),
      idFactory: (prefix) => `${prefix}_warning`,
    });

    const run = await recorder.startRun({ threadId: "thread_warning" });
    await recorder.recordStep(run, {
      nodeName: "load_context",
      logicalStep: "retrieval",
      status: "completed",
      warningCodes: ["AI_RECRUITMENT_MCP_UNAVAILABLE:timeout"],
    });
    await recorder.completeRun(run, {
      selectedIntents: ["hr_recruitment"],
    });

    expect(store.completeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "warning",
        warningCodes: ["AI_RECRUITMENT_MCP_UNAVAILABLE:timeout"],
      }),
    );
  });

  it("persists failed tool calls without requiring write approvals", async () => {
    const store = createStore();
    const recorder = new AgenticRunAuditRecorder(store, {
      now: () => new Date("2026-05-19T10:00:00.000Z"),
      idFactory: (prefix) => `${prefix}_failed_tool`,
    });

    const run = await recorder.startRun({ threadId: "thread_tool" });
    await recorder.recordToolCall(run, {
      toolName: "search_user_guide",
      capabilityId: "hr_recruitment.search_user_guide",
      serverId: "ai-recruitment",
      status: "failed",
      startedAt: "2026-05-19T10:00:01.000Z",
      completedAt: "2026-05-19T10:00:01.250Z",
      warningCodes: ["MCP_TOOL_CALL_FAILED"],
      errorMessage: "HTTP 503",
    });
    await recorder.failRun(run, {
      completedAt: "2026-05-19T10:00:02.000Z",
      warningCodes: ["MCP_TOOL_CALL_FAILED"],
      stateDelta: { finalAnswer: "Unable to retrieve guide context." },
    });

    expect(store.appendToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "search_user_guide",
        status: "failed",
        durationMs: 250,
        errorMessage: "HTTP 503",
      }),
    );
    expect(store.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "tool_call",
        status: "failed",
        warningCodes: ["MCP_TOOL_CALL_FAILED"],
      }),
    );
    expect(store.failRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        durationMs: 2000,
      }),
    );
  });

  it("redacts sensitive state deltas and tool payloads before persistence", async () => {
    const store = createStore();
    const recorder = new AgenticRunAuditRecorder(store, {
      now: () => new Date("2026-05-19T10:00:00.000Z"),
      idFactory: (prefix) => `${prefix}_redacted`,
      redactedArgumentKeys: ["candidateEmail"],
    });

    const run = await recorder.startRun({
      threadId: "thread_redacted",
      stateDelta: {
        providerApiKey: "secret-key",
        candidateEmail: "candidate@example.test",
      },
    });
    await recorder.recordToolCall(run, {
      toolName: "resolve_candidate",
      status: "executed",
      input: {
        candidateEmail: "candidate@example.test",
        authorization: "Bearer secret-token",
      },
      output: { candidateId: "candidate_1" },
    });

    expect(store.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        stateDelta: expect.objectContaining({
          value: {
            providerApiKey: "[REDACTED]",
            candidateEmail: "[REDACTED]",
          },
          redactionCount: 2,
        }),
      }),
    );
    expect(store.appendToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          value: {
            candidateEmail: "[REDACTED]",
            authorization: "[REDACTED]",
          },
        }),
      }),
    );
  });

  it("documents retention and indexes needed by future admin run queries", () => {
    expect(getAgenticRunAuditStoragePlan()).toMatchObject({
      retentionDays: 90,
      tables: {
        runs: "agentic_run_audits",
        events: "agentic_run_events",
        toolCalls: "agentic_tool_call_audits",
      },
      indexedQueryPatterns: [
        "runId detail lookup",
        "threadId ordered run history",
        "runId ordered event timeline",
        "threadId ordered event timeline",
        "retention cleanup by retainedUntil",
        "tool call lookup by runId and sequence",
      ],
    });
  });
});
