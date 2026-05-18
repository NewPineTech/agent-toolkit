import { describe, expect, it, vi } from "vitest";
import { retrieveHrForms, retrieveHrProcess } from "../hr-docs.js";
import {
  retrieveRecruitmentContext,
  retrieveRecruitmentDocuments,
} from "../recruitment.js";

describe("HR retrievers", () => {
  it("retrieves HR process context with the process retrieval profile", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          data: {
            chunks: [
              {
                id: "process-chunk",
                document_id: "process-doc",
                document_keyword: "QT tuyen dung",
                content_with_weight: "Bước 1: Đề xuất tuyển dụng.",
                origin_file_url: "https://docs.test/qt-tuyen-dung.pdf",
                similarity: 0.82,
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );

    const results = await retrieveHrProcess("quy trinh tuyen dung", {
      baseUrl: "https://ragflow.test",
      env: { RAGFLOW_API_KEY: "ragflow-secret" },
      fetchImpl,
    });

    expect(results[0]).toMatchObject({
      id: "process-chunk",
      title: "QT tuyen dung",
      documentId: "process-doc",
      originFileUrl: "https://docs.test/qt-tuyen-dung.pdf",
    });
    expect(
      JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string),
    ).toMatchObject({
      dataset_ids: ["3c0ab6d83e0211f19f78ae4b075ab570"],
      top_k: 1024,
      page_size: 8,
      similarity_threshold: 0.3,
      keywords_similarity_weight: 0.7,
    });
  });

  it("retrieves HR forms with the forms retrieval profile", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          data: {
            chunks: [
              {
                id: "form-chunk",
                document_keyword: "NS-02-BM05",
                content_with_weight: "Phiếu yêu cầu tuyển dụng.",
                similarity: 0.82,
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );

    await retrieveHrForms("phieu yeu cau tuyen dung", {
      baseUrl: "https://ragflow.test",
      env: { RAGFLOW_API_KEY: "ragflow-secret" },
      fetchImpl,
    });

    expect(
      JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string),
    ).toMatchObject({
      dataset_ids: ["3ba5a7ef3e0211f1bc59ae4b075ab570"],
      top_k: 1024,
      page_size: 3,
      similarity_threshold: 0.3,
    });
  });

  it("retrieves recruitment documents", async () => {
    const results = await retrieveRecruitmentDocuments("candidate interview");
    expect(results.length).toBeGreaterThan(0);
  });

  it("retrieves recruitment guidance from the ai-recruitment MCP when configured", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "initialize",
            result: {
              protocolVersion: "2025-03-26",
              capabilities: {},
              serverInfo: { name: "ai-recruitment", version: "test" },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "stateless server" }), {
          status: 400,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "search-user-guide",
            result: {
              content: [
                {
                  type: "text",
                  text: "Search candidates by email from the recruitment user guide.",
                },
              ],
            },
          }),
          { status: 200 },
        ),
      );

    const result = await retrieveRecruitmentContext("find candidate by email", {
      env: { AI_RECRUITMENT_MCP_AUTH_TOKEN: "mcp-secret" },
      fetchImpl,
      mcpUrl: "http://mcp.test/api/v1/mcp",
    });

    expect(result.warnings).toEqual([]);
    expect(result.documents[0]).toMatchObject({
      id: "ai-recruitment-mcp-1",
      title: "AI Recruitment MCP",
      content: "Search candidates by email from the recruitment user guide.",
      score: 1,
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      "http://mcp.test/api/v1/mcp",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer mcp-secret",
          "Content-Type": "application/json",
        }),
        body: expect.any(String),
      }),
    );
    expect(JSON.parse(fetchImpl.mock.calls[2]![1]!.body as string)).toEqual({
      jsonrpc: "2.0",
      id: "search-user-guide",
      method: "tools/call",
      params: {
        name: "search_user_guide",
        arguments: {
          query: "find candidate by email",
          limit: 3,
        },
      },
    });
  });

  it("falls back to local recruitment documents when the ai-recruitment MCP is unavailable", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new Error("connection refused"));

    const result = await retrieveRecruitmentContext("candidate interview", {
      env: { AI_RECRUITMENT_MCP_AUTH_TOKEN: "mcp-secret" },
      fetchImpl,
      mcpUrl: "http://mcp.test/api/v1/mcp",
    });

    expect(result.documents[0]?.title).toBe("Candidate Screening");
    expect(result.warnings).toEqual([
      "AI_RECRUITMENT_MCP_UNAVAILABLE:connection refused",
    ]);
  });
});
