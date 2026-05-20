import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AGENTIC_INTENTS } from "../../constants.js";
import {
  createAgenticCapabilityRegistry,
  executeAgenticCapability,
  type AgenticCapability,
} from "../index.js";

function createTestCapability(
  overrides: Partial<
    AgenticCapability<{ query: string }, { answer: string }>
  > = {},
): AgenticCapability<{ query: string }, { answer: string }> {
  return {
    id: "hr_knowledge.retrieve_forms",
    intent: AGENTIC_INTENTS.hrKnowledgeQa,
    kind: "retriever",
    inputSchema: z.object({ query: z.string().min(1) }),
    outputSchema: z.object({ answer: z.string() }),
    safety: {
      readOnly: true,
      requiresApproval: false,
    },
    execute: vi.fn(async (input) => ({ answer: input.query })),
    ...overrides,
  };
}

describe("agentic capability registry", () => {
  it("registers assistant capabilities and filters them by intent", () => {
    const hrKnowledgeCapability = createTestCapability();
    const recruitmentCapability = createTestCapability({
      id: "hr_recruitment.search_user_guide",
      intent: AGENTIC_INTENTS.hrRecruitment,
      kind: "mcp_tool",
    });

    const registry = createAgenticCapabilityRegistry([
      hrKnowledgeCapability,
      recruitmentCapability,
    ]);

    expect(registry.get("hr_knowledge.retrieve_forms")).toBe(
      hrKnowledgeCapability,
    );
    expect(registry.listByIntent(AGENTIC_INTENTS.hrKnowledgeQa)).toEqual([
      hrKnowledgeCapability,
    ]);
  });

  it("rejects duplicate capability ids", () => {
    expect(() =>
      createAgenticCapabilityRegistry([
        createTestCapability(),
        createTestCapability(),
      ]),
    ).toThrow("Duplicate agentic capability id: hr_knowledge.retrieve_forms");
  });
});

describe("agentic capability executor", () => {
  it("executes a validated read-only capability and records audit evidence", async () => {
    const capability = createTestCapability();
    const registry = createAgenticCapabilityRegistry([capability]);

    const result = await executeAgenticCapability(registry, {
      capabilityId: capability.id,
      input: { query: "leave policy" },
      maxSteps: 1,
    });

    expect(result).toMatchObject({
      status: "success",
      capabilityId: capability.id,
      output: { answer: "leave policy" },
      warningCodes: [],
    });
    expect(capability.execute).toHaveBeenCalledWith(
      { query: "leave policy" },
      expect.objectContaining({ capabilityId: capability.id }),
    );
    expect(result.evidence.toolCalls).toEqual([
      expect.objectContaining({
        capabilityId: capability.id,
        toolName: capability.id,
        status: "executed",
      }),
    ]);
  });

  it("fails closed when input validation fails", async () => {
    const capability = createTestCapability();
    const registry = createAgenticCapabilityRegistry([capability]);

    const result = await executeAgenticCapability(registry, {
      capabilityId: capability.id,
      input: { query: "" },
      maxSteps: 1,
    });

    expect(result).toMatchObject({
      status: "failed",
      capabilityId: capability.id,
      warningCodes: ["CAPABILITY_INPUT_INVALID"],
    });
    expect(capability.execute).not.toHaveBeenCalled();
    expect(result.evidence.toolCalls[0]).toMatchObject({
      capabilityId: capability.id,
      status: "failed",
    });
  });

  it("skips capabilities that require approval when approval is not granted", async () => {
    const capability = createTestCapability({
      id: "hr_recruitment.update_candidate_status",
      safety: {
        readOnly: false,
        requiresApproval: true,
      },
    });
    const registry = createAgenticCapabilityRegistry([capability]);

    const result = await executeAgenticCapability(registry, {
      capabilityId: capability.id,
      input: { query: "move candidate" },
      maxSteps: 1,
    });

    expect(result).toMatchObject({
      status: "skipped",
      capabilityId: capability.id,
      warningCodes: ["CAPABILITY_APPROVAL_REQUIRED"],
    });
    expect(capability.execute).not.toHaveBeenCalled();
  });

  it("fails closed for non-read-only capabilities even when approval metadata is misconfigured", async () => {
    const capability = createTestCapability({
      id: "hr_recruitment.update_candidate_status",
      safety: {
        readOnly: false,
        requiresApproval: false,
      },
    });
    const registry = createAgenticCapabilityRegistry([capability]);

    const result = await executeAgenticCapability(registry, {
      capabilityId: capability.id,
      input: { query: "move candidate" },
      maxSteps: 1,
    });

    expect(result).toMatchObject({
      status: "skipped",
      capabilityId: capability.id,
      warningCodes: ["CAPABILITY_APPROVAL_REQUIRED"],
    });
    expect(capability.execute).not.toHaveBeenCalled();
  });

  it("executes non-read-only capabilities after explicit approval", async () => {
    const capability = createTestCapability({
      id: "hr_recruitment.update_candidate_status",
      safety: {
        readOnly: false,
        requiresApproval: true,
      },
    });
    const registry = createAgenticCapabilityRegistry([capability]);

    const result = await executeAgenticCapability(registry, {
      capabilityId: capability.id,
      input: { query: "move candidate" },
      maxSteps: 1,
      approvalGranted: true,
    });

    expect(result).toMatchObject({
      status: "success",
      capabilityId: capability.id,
      output: { answer: "move candidate" },
      warningCodes: [],
    });
    expect(capability.execute).toHaveBeenCalledOnce();
  });

  it("skips execution when the step budget is exhausted", async () => {
    const capability = createTestCapability();
    const registry = createAgenticCapabilityRegistry([capability]);

    const result = await executeAgenticCapability(registry, {
      capabilityId: capability.id,
      input: { query: "leave policy" },
      maxSteps: 0,
    });

    expect(result).toMatchObject({
      status: "skipped",
      capabilityId: capability.id,
      warningCodes: ["CAPABILITY_STEP_BUDGET_EXCEEDED"],
    });
    expect(capability.execute).not.toHaveBeenCalled();
  });
});
