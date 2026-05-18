import { describe, expect, it } from "vitest";
import { hrAssistantGraph } from "../graph.js";

describe("HR assistant parent graph", () => {
  it("uses the Studio default input when no message is provided", async () => {
    const result = await hrAssistantGraph.invoke(
      {},
      { configurable: { thread_id: "studio-default-input-test" } },
    );

    expect(result.message).toContain("chinh sach nghi phep");
    expect(result.finalAnswer).toBeTruthy();
  });

  it("rejects invalid input", async () => {
    await expect(
      hrAssistantGraph.invoke(
        { message: " " },
        { configurable: { thread_id: "invalid-input-test" } },
      ),
    ).rejects.toThrow("Message is required");
  });

  it("runs a single intent workflow", async () => {
    const result = await hrAssistantGraph.invoke(
      { message: "leave policy" },
      { configurable: { thread_id: "single-intent-test" } },
    );

    expect(result.selectedIntents).toEqual(["hr_knowledge_qa"]);
    expect(result.finalAnswer).toContain("Leave Policy");
    expect(result.messages).toHaveLength(2);
  });

  it("uses short memory across thread turns", async () => {
    const config = { configurable: { thread_id: "memory-thread-test" } };

    await hrAssistantGraph.invoke({ message: "leave policy" }, config);
    const result = await hrAssistantGraph.invoke(
      { message: "what about approval?" },
      config,
    );

    expect(result.standaloneQuery).toContain("Recent conversation");
    expect(result.messages).toHaveLength(4);
  });
});
