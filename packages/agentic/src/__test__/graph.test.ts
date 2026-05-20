import { afterEach, describe, expect, it, vi } from "vitest";
import { hrAssistantGraph } from "../graph.js";
import * as modelModule from "../model.js";

describe("HR assistant parent graph", () => {
  afterEach(() => {
    delete process.env.RAGFLOW_API_KEY;
    delete process.env.GEMINI_VERTEX_API_KEY;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

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

  it("does not synthesize over a blocking HR knowledge workflow result", async () => {
    process.env.RAGFLOW_API_KEY = "ragflow-secret";
    process.env.GEMINI_VERTEX_API_KEY = "vertex-secret";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              code: 0,
              data: {
                chunks: [
                  {
                    id: "process-partial",
                    document_keyword: "QT tuyen dung",
                    content_with_weight:
                      "Tổng số bước: 7. Bước 1: Đề xuất tuyển dụng. Bước 2: Phê duyệt nhu cầu.",
                    similarity: 0.86,
                  },
                ],
              },
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              code: 0,
              data: {
                chunks: [
                  {
                    id: "process-partial-again",
                    document_keyword: "QT tuyen dung",
                    content_with_weight:
                      "Tổng số bước: 7. Bước 1: Đề xuất tuyển dụng. Bước 2: Phê duyệt nhu cầu.",
                    similarity: 0.86,
                  },
                ],
              },
            }),
            { status: 200 },
          ),
        ),
    );
    const generateModelResponse = vi
      .spyOn(modelModule, "generateModelResponse")
      .mockImplementation(async (request) => {
        if (request.prompt.includes("Standalone query:")) {
          return { content: "hr_knowledge_qa", warnings: [] };
        }

        if (request.prompt.includes("Question:")) {
          return {
            content: "model-generated incomplete process answer",
            warnings: [],
          };
        }

        return {
          content: "BAD_SYNTHESIZED_INSUFFICIENT_CONTEXT_ANSWER",
          warnings: [],
        };
      });

    const result = await hrAssistantGraph.invoke(
      { message: "Quy trình tuyển dụng gồm các bước nào?" },
      { configurable: { thread_id: "blocking-hr-knowledge-test" } },
    );

    expect(result.warnings).toContain("HR_KNOWLEDGE_PROCESS_INCOMPLETE");
    expect(result.finalAnswer).not.toContain("BAD_SYNTHESIZED");
    expect(result.finalAnswer).toBe(
      "model-generated incomplete process answer",
    );
    expect(generateModelResponse).not.toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Workflow results:"),
      }),
      expect.anything(),
    );
  });
});
