import { describe, expect, it } from "vitest";
import {
  mapAgenticRunToAdminDetail,
  redactAdminAgenticPayload,
} from "./agentic-inspector.contract.js";

describe("Agentic inspector admin contract", () => {
  it("maps workflow evidence into run detail, evidence detail, and logical timeline rows", () => {
    const detail = mapAgenticRunToAdminDetail({
      runId: "run_1",
      threadId: "thread_1",
      workspaceId: "workspace_1",
      startedAt: "2026-05-19T08:00:00.000Z",
      completedAt: "2026-05-19T08:00:03.000Z",
      input: "What is the leave policy?",
      finalAnswer: "Employees have paid leave.",
      standaloneQuery: "company leave policy",
      selectedIntents: ["hr_knowledge_qa"],
      warnings: ["LOW_CONFIDENCE"],
      workflowResults: [
        {
          intent: "hr_knowledge_qa",
          answer: "Employees have paid leave.",
          warnings: ["LOW_CONFIDENCE"],
          evidence: {
            retrievedDocuments: [
              {
                id: "doc_1",
                title: "Leave Policy",
                excerpt: "Paid leave rules",
                sourceName: "HR KB",
                sourceUrl: "https://kb.test/leave",
                score: 0.91,
                metadata: { authorization: "Bearer secret-token" },
              },
            ],
            sources: [
              {
                id: "source_1",
                kind: "document",
                name: "HR KB",
                url: "https://kb.test/leave",
                retrievedDocumentIds: ["doc_1"],
              },
            ],
            toolCalls: [
              {
                toolName: "hr-docs.search",
                status: "executed",
                capabilityId: "hr_knowledge.search_policy",
                serverId: "mcp_hr",
                inputSummary: "leave policy",
                outputSummary: "1 document",
                latencyMs: 42,
                documentCount: 1,
                warningCodes: ["LOW_CONFIDENCE"],
              },
            ],
            missingEvidence: [
              {
                reason: "Policy effective date was not retrieved.",
                severity: "warning",
                expectedEvidence: "effective date",
              },
            ],
            confidenceSignals: [
              {
                label: "retrieved_documents_available",
                direction: "supports",
                score: 1,
                rationale: "One document was available.",
              },
            ],
          },
        },
      ],
      rawJson: {
        providerApiKey: "provider-secret",
        workflowResults: [{ headers: { authorization: "Bearer raw-token" } }],
      },
    });

    expect(detail.summary).toMatchObject({
      runId: "run_1",
      threadId: "thread_1",
      workspaceId: "workspace_1",
      status: "warning",
      warningCount: 2,
      missingEvidenceCount: 1,
      blockingMissingEvidenceCount: 0,
      toolCallCount: 1,
    });
    expect(detail.evidence.toolCalls[0]).toMatchObject({
      toolName: "hr-docs.search",
      status: "executed",
      capabilityId: "hr_knowledge.search_policy",
      warningCodes: ["LOW_CONFIDENCE"],
    });
    expect(detail.evidence.retrievedDocuments[0]?.metadata.value).toEqual({
      authorization: "[REDACTED]",
    });
    expect(detail.timeline.map((row) => row.step)).toEqual([
      "input",
      "query_rewrite",
      "route_intent",
      "workflow_result",
      "final_answer",
    ]);
    expect(detail.rawJson.value).toEqual({
      providerApiKey: "[REDACTED]",
      workflowResults: [{ headers: "[REDACTED]" }],
    });
  });

  it("redacts provider keys, bearer tokens, auth secrets, raw headers, configured MCP keys, and truncates large payloads", () => {
    const payload = redactAdminAgenticPayload(
      {
        providerApiKey: "gemini-secret",
        Authorization: "Bearer abc.def",
        jwtSecret: "jwt-secret",
        rawHeaders: ["authorization", "Bearer hidden"],
        trace: "Bearer should-hide",
        nested: {
          candidateEmail: "person@example.test",
          notes: "x".repeat(80),
        },
      },
      {
        redactedArgumentKeys: ["candidateEmail"],
        maxStringLength: 24,
        maxPayloadBytes: 240,
      },
    );

    expect(payload.redactionCount).toBe(6);
    expect(payload.value).toMatchObject({
      providerApiKey: "[REDACTED]",
      Authorization: "[REDACTED]",
      jwtSecret: "[REDACTED]",
      rawHeaders: "[REDACTED]",
    });
    expect(JSON.stringify(payload.value)).not.toContain("should-hide");
    expect(JSON.stringify(payload.value)).not.toContain("person@example.test");
    expect(payload.truncated).toBe(true);
    expect(payload.originalSizeBytes).toBeGreaterThan(payload.maxPayloadBytes);
    expect(payload.sanitizedSizeBytes).toBeLessThanOrEqual(
      payload.maxPayloadBytes,
    );
  });
});
