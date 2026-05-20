import { describe, expect, it, vi } from "vitest";
import { rewriteQueryFromMemory } from "../query-rewrite.js";

describe("query rewrite", () => {
  it("keeps standalone messages unchanged", async () => {
    await expect(
      rewriteQueryFromMemory({
        message: "What is leave policy?",
        messages: [],
        memorySummary: undefined,
      }),
    ).resolves.toBe("What is leave policy?");
  });

  it("uses recent memory context for follow-up messages", async () => {
    const rewritten = await rewriteQueryFromMemory({
      message: "What about approval?",
      messages: [{ role: "user", content: "Tell me about annual leave" }],
      memorySummary: undefined,
    });

    expect(rewritten).toContain("Recent conversation");
    expect(rewritten).toContain("What about approval?");
  });

  it("uses the configured model for contextual rewriting when available", async () => {
    const invoke = vi.fn().mockResolvedValue({
      content: "What is the annual leave approval flow?",
    });

    const rewritten = await rewriteQueryFromMemory(
      {
        message: "What about approval?",
        messages: [{ role: "user", content: "Tell me about annual leave" }],
        memorySummary: undefined,
      },
      {
        model: { invoke },
      },
    );

    expect(rewritten).toBe("What is the annual leave approval flow?");
    expect(invoke).toHaveBeenCalled();
  });
});
