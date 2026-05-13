import { describe, expect, it } from "vitest";
import { RagflowRetriever } from "../ragflow-retriever.js";

describe("RagflowRetriever", () => {
  it("retrieves and normalizes chunks from RAGFlow", async () => {
    const requests: Request[] = [];
    const retriever = new RagflowRetriever(
      {
        baseUrl: "https://ragflow.example.com/",
        apiKey: "ragflow-key",
        datasetIds: ["kb_1"],
        topK: 3,
        similarityThreshold: 0.2,
      },
      async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json({
          data: {
            chunks: [
              {
                content: "A policy chunk",
                document_name: "policy.md",
                similarity_score: 0.87,
                extra: "kept",
              },
            ],
          },
        });
      },
    );

    await expect(retriever.retrieve("policy")).resolves.toEqual([
      {
        content: "A policy chunk",
        source: "policy.md",
        score: 0.87,
        metadata: {
          content: "A policy chunk",
          document_name: "policy.md",
          similarity_score: 0.87,
          extra: "kept",
        },
      },
    ]);

    expect(requests[0]?.url).toBe(
      "https://ragflow.example.com/api/v1/retrieval",
    );
    expect(requests[0]?.headers.get("Authorization")).toBe(
      "Bearer ragflow-key",
    );
    await expect(requests[0]?.json()).resolves.toEqual({
      question: "policy",
      dataset_ids: ["kb_1"],
      top_k: 3,
      similarity_threshold: 0.2,
    });
  });

  it("throws a typed retrieval error on failed RAGFlow responses", async () => {
    const retriever = new RagflowRetriever(
      {
        baseUrl: "https://ragflow.example.com",
        apiKey: "ragflow-key",
        datasetIds: ["kb_1"],
      },
      async () => new Response("bad", { status: 500 }),
    );

    await expect(retriever.retrieve("policy")).rejects.toThrow(
      "RAGFlow retrieval failed: 500",
    );
  });
});
