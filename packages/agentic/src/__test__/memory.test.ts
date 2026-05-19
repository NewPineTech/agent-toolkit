import { describe, expect, it, vi } from "vitest";
import {
  appendFinalExchange,
  buildMemoryContext,
  buildSavedMemoryState,
  summarizeConversation,
  trimConversationMessages,
  validateInput,
} from "../memory.js";

describe("short memory", () => {
  it("rejects empty input before graph work starts", () => {
    expect(() => validateInput({ message: "   " })).toThrow(
      "Message is required",
    );
  });

  it("keeps a short thread-scoped message window", () => {
    const messages = Array.from({ length: 10 }, (_, index) => ({
      role: "user" as const,
      content: `message ${index}`,
    }));

    expect(trimConversationMessages(messages)).toHaveLength(6);
    expect(trimConversationMessages(messages)[0]?.content).toBe("message 4");
  });

  it("appends the final exchange exactly once", () => {
    const messages = appendFinalExchange({
      message: "hello",
      messages: [],
      memorySummary: undefined,
      messagesSinceSummary: 0,
      summaryBufferMessages: [],
      standaloneQuery: "hello",
      selectedIntents: [],
      workflowResults: [],
      finalAnswer: "hi",
      warnings: [],
    });

    expect(messages).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ]);
  });

  it("summarizes only after the trigger window", async () => {
    await expect(summarizeConversation([])).resolves.toBeUndefined();
  });

  it("uses the model output as the conversation summary", async () => {
    const messages = Array.from({ length: 7 }, (_, index) => ({
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `raw turn ${index}`,
    }));
    const invoke = vi
      .fn()
      .mockResolvedValue({ content: "User discussed leave approval." });

    await expect(
      summarizeConversation(messages, { model: { invoke } }),
    ).resolves.toBe("User discussed leave approval.");
    expect(invoke).toHaveBeenCalled();
  });

  it("does not store raw conversation content when no model is configured", async () => {
    const messages = Array.from({ length: 7 }, (_, index) => ({
      role: "user" as const,
      content: `raw private turn ${index}`,
    }));

    await expect(
      summarizeConversation(messages, { env: {} }),
    ).resolves.toBeUndefined();
  });

  it("does not store fallback prompt text when summary model fails", async () => {
    const messages = Array.from({ length: 7 }, (_, index) => ({
      role: "user" as const,
      content: `raw failure turn ${index}`,
    }));
    const invoke = vi.fn().mockRejectedValue(new Error("summary model down"));

    await expect(
      summarizeConversation(messages, { model: { invoke } }),
    ).resolves.toBeUndefined();
  });

  it("formats the already-loaded memory context without trimming messages", () => {
    const context = buildMemoryContext({
      memorySummary: "The user asked about onboarding.",
      messages: [
        { role: "user", content: "Tell me about probation." },
        { role: "assistant", content: "Probation is 2 months." },
        { role: "user", content: "And the paperwork?" },
        { role: "assistant", content: "Use the onboarding checklist." },
      ],
    });

    expect(context).toBe(
      [
        "Memory summary:\nThe user asked about onboarding.",
        "Recent conversation:\nuser: Tell me about probation.\nassistant: Probation is 2 months.\nuser: And the paperwork?\nassistant: Use the onboarding checklist.",
      ].join("\n\n"),
    );
  });

  it("buffers new messages until six messages are ready to summarize", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValue({ content: "should not be called" });

    const saved = await buildSavedMemoryState(
      {
        message: "new question",
        messages: [],
        memorySummary: "Existing summary.",
        messagesSinceSummary: 3,
        summaryBufferMessages: [
          { role: "user", content: "old buffered 1" },
          { role: "assistant", content: "old buffered 2" },
          { role: "user", content: "old buffered 3" },
        ],
        standaloneQuery: "new question",
        selectedIntents: [],
        workflowResults: [],
        finalAnswer: "new answer",
        warnings: [],
      },
      { model: { invoke } },
    );

    expect(saved.memorySummary).toBe("Existing summary.");
    expect(saved.messagesSinceSummary).toBe(5);
    expect(saved.summaryBufferMessages).toHaveLength(5);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("re-summarizes from the old summary and six latest messages", async () => {
    const invoke = vi.fn().mockResolvedValue({
      content: "Updated summary from latest six messages.",
    });

    const saved = await buildSavedMemoryState(
      {
        message: "latest user",
        messages: [],
        memorySummary: "Existing summary.",
        messagesSinceSummary: 4,
        summaryBufferMessages: [
          { role: "user", content: "buffered user 1" },
          { role: "assistant", content: "buffered assistant 2" },
          { role: "user", content: "buffered user 3" },
          { role: "assistant", content: "buffered assistant 4" },
        ],
        standaloneQuery: "latest user",
        selectedIntents: [],
        workflowResults: [],
        finalAnswer: "latest assistant",
        warnings: [],
      },
      { model: { invoke } },
    );

    expect(saved.memorySummary).toBe(
      "Updated summary from latest six messages.",
    );
    expect(saved.messagesSinceSummary).toBe(0);
    expect(saved.summaryBufferMessages).toEqual([]);
    const humanMessage = invoke.mock.calls[0]?.[0]?.[1];
    expect(humanMessage?.content).toContain(
      "Previous summary:\nExisting summary.",
    );
    expect(humanMessage?.content).toContain("user: buffered user 1");
    expect(humanMessage?.content).toContain("assistant: buffered assistant 4");
    expect(humanMessage?.content).toContain("user: latest user");
    expect(humanMessage?.content).toContain("assistant: latest assistant");
  });

  it("keeps only six latest buffered messages when summary is unavailable", async () => {
    const invoke = vi.fn().mockRejectedValue(new Error("summary unavailable"));

    const saved = await buildSavedMemoryState(
      {
        message: "latest user",
        messages: [],
        memorySummary: "Existing summary.",
        messagesSinceSummary: 6,
        summaryBufferMessages: Array.from({ length: 6 }, (_, index) => ({
          role: "user" as const,
          content: `buffered ${index}`,
        })),
        standaloneQuery: "latest user",
        selectedIntents: [],
        workflowResults: [],
        finalAnswer: "latest assistant",
        warnings: [],
      },
      { model: { invoke } },
    );

    expect(saved.memorySummary).toBe("Existing summary.");
    expect(saved.messagesSinceSummary).toBe(8);
    expect(saved.summaryBufferMessages).toHaveLength(6);
    expect(saved.summaryBufferMessages[0]?.content).toBe("buffered 2");
    expect(saved.summaryBufferMessages.at(-1)?.content).toBe(
      "latest assistant",
    );
  });
});
