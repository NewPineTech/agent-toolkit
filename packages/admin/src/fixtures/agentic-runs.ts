import type {
  AdminAgenticCapabilityCatalogEntry,
  AdminAgenticRunDetail,
  AdminAgenticRunSummary,
  AdminAgenticSanitizedJsonPayload,
} from "@agent-toolkit/types";

function payload(
  value: AdminAgenticSanitizedJsonPayload["value"],
): AdminAgenticSanitizedJsonPayload {
  const size = JSON.stringify(value).length;
  return {
    value,
    truncated: false,
    originalSizeBytes: size,
    sanitizedSizeBytes: size,
    maxPayloadBytes: 16_384,
    maxStringLength: 1_000,
    redactionCount: 0,
    redactedKeys: [],
  };
}

function summary(
  runId: string,
  status: AdminAgenticRunSummary["status"],
  overrides: Partial<AdminAgenticRunSummary> = {},
): AdminAgenticRunSummary {
  return {
    runId,
    threadId: `thread_${runId}`,
    workspaceId: "workspace_hr_ops",
    startedAt: "2026-05-19T09:00:00.000Z",
    completedAt: "2026-05-19T09:00:04.000Z",
    selectedIntents: ["hr_knowledge_qa"],
    status,
    warningCount: 0,
    missingEvidenceCount: 0,
    blockingMissingEvidenceCount: 0,
    toolCallCount: 1,
    ...overrides,
  };
}

export const successEvidenceRun: AdminAgenticRunDetail = {
  summary: summary("run_success_hr_001", "success"),
  input: "What is the annual leave policy?",
  standaloneQuery: "Annual leave policy for employees",
  finalAnswer: "Employees receive paid annual leave based on tenure.",
  workflowResults: [
    {
      intent: "hr_knowledge_qa",
      answer: "Employees receive paid annual leave based on tenure.",
      warnings: [],
      evidence: {
        retrievedDocuments: [],
        sources: [],
        toolCalls: [],
        missingEvidence: [],
        confidenceSignals: [],
      },
    },
  ],
  evidence: {
    retrievedDocuments: [
      {
        id: "doc_leave_policy",
        title: "Leave Policy Handbook",
        excerpt: "Annual leave is allocated per employee tenure band.",
        sourceName: "RAGFlow HR KB",
        score: 0.92,
        metadata: payload({ kb: "hr", page: 12 }),
      },
    ],
    sources: [
      {
        id: "source_leave_policy",
        kind: "document",
        name: "Leave Policy Handbook",
        retrievedDocumentIds: ["doc_leave_policy"],
        metadata: payload({ connector: "ragflow" }),
      },
    ],
    toolCalls: [
      {
        toolName: "ragflow.retrieve",
        status: "executed",
        capabilityId: "hr_knowledge.retrieve",
        serverId: "ragflow",
        inputSummary: "Search HR KB for annual leave policy",
        outputSummary: "1 policy document retrieved",
        latencyMs: 420,
        documentCount: 1,
        warningCodes: [],
        input: payload({ query: "annual leave policy" }),
        output: payload({ documentIds: ["doc_leave_policy"] }),
      },
    ],
    missingEvidence: [],
    confidenceSignals: [
      {
        label: "Policy document match",
        direction: "supports",
        score: 0.92,
        rationale: "Primary source directly answers the user question.",
      },
    ],
  },
  timeline: [
    {
      id: "step_1",
      runId: "run_success_hr_001",
      sequence: 1,
      step: "input",
      label: "Input received",
      status: "completed",
      startedAt: "2026-05-19T09:00:00.000Z",
      completedAt: "2026-05-19T09:00:00.050Z",
      durationMs: 50,
      warningCodes: [],
      evidenceRefs: [],
    },
    {
      id: "step_2",
      runId: "run_success_hr_001",
      sequence: 2,
      step: "route_intent",
      label: "Capability plan",
      status: "completed",
      intent: "hr_knowledge_qa",
      startedAt: "2026-05-19T09:00:00.050Z",
      completedAt: "2026-05-19T09:00:00.180Z",
      durationMs: 130,
      warningCodes: [],
      evidenceRefs: [],
    },
    {
      id: "step_3",
      runId: "run_success_hr_001",
      sequence: 3,
      step: "tool_call",
      label: "Retrieve HR evidence",
      status: "completed",
      capabilityId: "hr_knowledge.retrieve",
      toolName: "ragflow.retrieve",
      startedAt: "2026-05-19T09:00:00.200Z",
      completedAt: "2026-05-19T09:00:00.620Z",
      durationMs: 420,
      warningCodes: [],
      evidenceRefs: ["doc_leave_policy"],
    },
    {
      id: "step_4",
      runId: "run_success_hr_001",
      sequence: 4,
      step: "final_answer",
      label: "Final answer",
      status: "completed",
      startedAt: "2026-05-19T09:00:03.600Z",
      completedAt: "2026-05-19T09:00:04.000Z",
      durationMs: 400,
      warningCodes: [],
      evidenceRefs: ["doc_leave_policy"],
    },
  ],
  warnings: [],
  rawJson: payload({
    runId: "run_success_hr_001",
    threadId: "thread_run_success_hr_001",
    selectedIntents: ["hr_knowledge_qa"],
  }),
};

export const warningEvidenceRun: AdminAgenticRunDetail = {
  ...successEvidenceRun,
  summary: summary("run_warning_hr_002", "warning", {
    warningCount: 1,
    missingEvidenceCount: 1,
  }),
  warnings: ["AI_RECRUITMENT_MCP_UNAVAILABLE:timeout"],
  evidence: {
    ...successEvidenceRun.evidence,
    missingEvidence: [
      {
        reason: "Recruitment MCP timed out before returning candidate context.",
        severity: "warning",
        expectedEvidence: "Candidate profile lookup result",
      },
    ],
  },
  rawJson: payload({
    warningCodes: ["AI_RECRUITMENT_MCP_UNAVAILABLE:timeout"],
  }),
};

export const blockedEvidenceRun: AdminAgenticRunDetail = {
  ...successEvidenceRun,
  summary: summary("run_blocked_hr_003", "blocked", {
    warningCount: 1,
    missingEvidenceCount: 1,
    blockingMissingEvidenceCount: 1,
    toolCallCount: 0,
  }),
  finalAnswer: undefined,
  warnings: ["REQUIRED_EVIDENCE_MISSING"],
  evidence: {
    retrievedDocuments: [],
    sources: [],
    toolCalls: [],
    missingEvidence: [
      {
        reason: "No approved source was available for compensation guidance.",
        severity: "blocking",
        expectedEvidence: "Compensation policy document",
      },
    ],
    confidenceSignals: [
      {
        label: "No source-backed answer",
        direction: "weakens",
        score: 0.18,
      },
    ],
  },
  timeline: [
    {
      id: "blocked_step_1",
      runId: "run_blocked_hr_003",
      sequence: 1,
      step: "verifier",
      label: "Evidence verifier",
      status: "failed",
      warningCodes: ["REQUIRED_EVIDENCE_MISSING"],
      evidenceRefs: [],
    },
  ],
  rawJson: payload({ blocked: true, reason: "missing approved evidence" }),
};

export const failedToolCallRun: AdminAgenticRunDetail = {
  ...successEvidenceRun,
  summary: summary("run_failed_hr_004", "failed", {
    warningCount: 1,
    toolCallCount: 1,
  }),
  warnings: ["MCP_TOOL_CALL_FAILED"],
  evidence: {
    ...successEvidenceRun.evidence,
    toolCalls: [
      {
        toolName: "search_user_guide",
        status: "failed",
        capabilityId: "hr_recruitment.search_user_guide",
        serverId: "ai-recruitment",
        inputSummary: "Search user guide for candidate matching flow",
        outputSummary: "HTTP 503",
        latencyMs: 250,
        warningCodes: ["MCP_TOOL_CALL_FAILED"],
      },
    ],
  },
  timeline: [
    {
      id: "failed_step_1",
      runId: "run_failed_hr_004",
      sequence: 1,
      step: "tool_call",
      label: "Guide search tool",
      status: "failed",
      toolName: "search_user_guide",
      warningCodes: ["MCP_TOOL_CALL_FAILED"],
      evidenceRefs: [],
    },
  ],
  rawJson: payload({ error: "HTTP 503" }),
};

const noEvidenceSummary = summary("run_no_evidence_hr_005", "warning", {
  warningCount: 1,
  missingEvidenceCount: 1,
  toolCallCount: 0,
});

export const inspectorRunSummaries: AdminAgenticRunSummary[] = [
  successEvidenceRun.summary,
  warningEvidenceRun.summary,
  blockedEvidenceRun.summary,
  failedToolCallRun.summary,
  noEvidenceSummary,
];

export const inspectorCapabilities: AdminAgenticCapabilityCatalogEntry[] = [
  {
    id: "hr_knowledge.retrieve_process",
    intent: "hr_knowledge_qa",
    kind: "retriever",
    displayName: "Retrieve HR Process Documents",
    readOnly: true,
    requiresApproval: false,
    redactedArgumentKeys: [],
  },
  {
    id: "hr_recruitment.search_user_guide",
    intent: "hr_recruitment",
    kind: "mcp_tool",
    displayName: "Search Recruitment Guide",
    readOnly: true,
    requiresApproval: false,
    redactedArgumentKeys: [],
  },
  {
    id: "hr_recruitment.update_candidate_status",
    intent: "hr_recruitment",
    kind: "mcp_tool",
    displayName: "Update Candidate Status",
    readOnly: false,
    requiresApproval: true,
    redactedArgumentKeys: ["candidateEmail"],
  },
];
