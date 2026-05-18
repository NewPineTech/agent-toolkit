import { describe, expect, it, vi } from "vitest";
import {
  appendFinalExchange,
  buildMemoryContext,
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
      turnsSinceSummary: 0,
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
});
