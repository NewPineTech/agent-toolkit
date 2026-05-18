import { afterEach, describe, expect, it, vi } from "vitest";
import { AGENTIC_INTENTS } from "../../constants.js";
import * as modelModule from "../../model.js";
import { freeChatGraph } from "../free-chat.js";
import { hrKnowledgeQaGraph } from "../hr-knowledge-qa.js";
import { hrRecruitmentGraph } from "../hr-recruitment.js";

describe("intent subgraphs", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs free chat subgraph", async () => {
    const result = await freeChatGraph.invoke({
      message: "hello",
      standaloneQuery: "hello",
    });

    expect(result.workflowResults[0]?.intent).toBe(AGENTIC_INTENTS.freeChat);
  });

  it("passes memory context to free chat prompt", async () => {
    const generateModelResponse = vi
      .spyOn(modelModule, "generateModelResponse")
      .mockResolvedValue({ content: "ok", warnings: [] });

    await freeChatGraph.invoke({
      message: "what about that?",
      standaloneQuery: "what about that?",
      memorySummary: "The user asked about onboarding.",
      messages: [
        { role: "user", content: "Tell me about probation." },
        { role: "assistant", content: "Probation is 2 months." },
      ],
    });

    expect(generateModelResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          "Memory summary:\nThe user asked about onboarding.",
        ),
      }),
      expect.anything(),
    );
    expect(generateModelResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          "Recent conversation:\nuser: Tell me about probation.\nassistant: Probation is 2 months.",
        ),
      }),
      expect.anything(),
    );
  });

  it("passes personal identity guard to free chat model", async () => {
    const generateModelResponse = vi
      .spyOn(modelModule, "generateModelResponse")
      .mockResolvedValue({
        content:
          "Minh chua co du thong tin trong phien chat nay de xac dinh ban la ai.",
        warnings: [],
      });

    await freeChatGraph.invoke({
      message: "tôi là ai",
      standaloneQuery: "tôi là ai",
    });

    expect(generateModelResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("Personal Identity Questions"),
        prompt: expect.stringContaining("Current message:\ntôi là ai"),
      }),
      expect.anything(),
    );
  });

  it("runs HR knowledge QA subgraph", async () => {
    const result = await hrKnowledgeQaGraph.invoke({
      message: "leave policy",
      standaloneQuery: "leave policy",
    });

    expect(result.workflowResults[0]?.intent).toBe(
      AGENTIC_INTENTS.hrKnowledgeQa,
    );
    expect(result.workflowResults[0]?.answer).toContain("Retrieved context");
    expect(result.workflowResults[0]?.answer).toContain("Leave Policy");
  });

  it("passes memory context to HR knowledge QA prompt", async () => {
    const generateModelResponse = vi
      .spyOn(modelModule, "generateModelResponse")
      .mockResolvedValue({ content: "ok", warnings: [] });

    await hrKnowledgeQaGraph.invoke({
      message: "what is the approval step?",
      standaloneQuery: "what is the approval step?",
      memorySummary: "The user asked about leave policy.",
      messages: [
        { role: "user", content: "Tell me about annual leave." },
        { role: "assistant", content: "Managers approve leave requests." },
      ],
    });

    expect(generateModelResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          "Memory summary:\nThe user asked about leave policy.",
        ),
      }),
      expect.anything(),
    );
    expect(generateModelResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          "Recent conversation:\nuser: Tell me about annual leave.\nassistant: Managers approve leave requests.",
        ),
      }),
      expect.anything(),
    );
  });

  it("runs recruitment subgraph", async () => {
    const result = await hrRecruitmentGraph.invoke({
      message: "candidate interview",
      standaloneQuery: "candidate interview",
    });

    expect(result.workflowResults[0]?.intent).toBe(
      AGENTIC_INTENTS.hrRecruitment,
    );
    expect(result.workflowResults[0]?.answer).toContain("Recruitment context");
    expect(result.workflowResults[0]?.answer).toContain("Candidate Screening");
  });

  it("passes memory context to HR recruitment prompt", async () => {
    const generateModelResponse = vi
      .spyOn(modelModule, "generateModelResponse")
      .mockResolvedValue({ content: "ok", warnings: [] });

    await hrRecruitmentGraph.invoke({
      message: "what about interview notes?",
      standaloneQuery: "what about interview notes?",
      memorySummary: "The user asked about a candidate interview.",
      messages: [
        { role: "user", content: "Find candidate screening guidance." },
        { role: "assistant", content: "Use the screening checklist." },
      ],
    });

    expect(generateModelResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          "Memory summary:\nThe user asked about a candidate interview.",
        ),
      }),
      expect.anything(),
    );
    expect(generateModelResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          "Recent conversation:\nuser: Find candidate screening guidance.\nassistant: Use the screening checklist.",
        ),
      }),
      expect.anything(),
    );
  });
});
