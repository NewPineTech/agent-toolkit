import { describe, expect, it, vi } from "vitest";
import { buildFreeChatContext } from "../free-chat.js";
import { answerHrKnowledgeQuestion } from "../hr-knowledge.js";
import { answerRecruitmentQuestion } from "../recruitment.js";

describe("intent tools", () => {
  it("builds free chat context", async () => {
    await expect(buildFreeChatContext("hello")).resolves.toContain("hello");
  });

  it("answers with HR knowledge context", async () => {
    const result = await answerHrKnowledgeQuestion("leave policy");
    expect(result.answer).toContain("Leave Policy");
  });

  it("uses RAGFlow retrieval in the HR knowledge tool when configured", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          data: {
            chunks: [
              {
                id: "chunk-1",
                document_id: "doc-1",
                document_keyword: "Don xin nghi viec",
                content_with_weight:
                  "Mau don xin nghi viec can co ngay lam viec cuoi cung.",
                origin_file_url: "https://docs.test/don-xin-nghi-viec.pdf",
                similarity: 0.82,
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );

    const result = await answerHrKnowledgeQuestion(
      'tìm tài liệu "đơn xin nghỉ việc"',
      {
        baseUrl: "https://ragflow.test",
        datasetIds: ["kb-documents"],
        env: { RAGFLOW_API_KEY: "ragflow-secret" },
        fetchImpl,
      },
    );

    expect(result.answer).toContain("Don xin nghi viec");
    expect(result.answer).toContain("Mau don xin nghi viec");
    expect(result.retrievedContext).toContain(
      "https://docs.test/don-xin-nghi-viec.pdf",
    );
    expect(result.warnings).toEqual([]);
  });

  it("routes process and form HR knowledge questions to separate retrieval profiles", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            data: {
              chunks: [
                {
                  id: "process-chunk",
                  document_keyword: "QT tuyen dung",
                  content_with_weight: "Bước 1: Đề xuất tuyển dụng.",
                  similarity: 0.82,
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
                  id: "form-chunk",
                  document_keyword: "NS-02-BM05",
                  content_with_weight: "Phiếu yêu cầu tuyển dụng.",
                  similarity: 0.83,
                },
              ],
            },
          }),
          { status: 200 },
        ),
      );

    const result = await answerHrKnowledgeQuestion(
      "Quy trình tuyển dụng gồm các bước nào và dùng biểu mẫu nào?",
      {
        baseUrl: "https://ragflow.test",
        env: { RAGFLOW_API_KEY: "ragflow-secret" },
        fetchImpl,
      },
    );

    expect(result.answer).toContain("QT tuyen dung");
    expect(result.answer).toContain("NS-02-BM05");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string),
    ).toMatchObject({
      dataset_ids: ["3c0ab6d83e0211f19f78ae4b075ab570"],
      page_size: 8,
    });
    expect(
      JSON.parse(fetchImpl.mock.calls[1]![1]!.body as string),
    ).toMatchObject({
      dataset_ids: ["3ba5a7ef3e0211f1bc59ae4b075ab570"],
      page_size: 3,
    });
  });

  it("retries process retrieval with more context when the first result looks incomplete", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 0,
            data: {
              chunks: [
                {
                  id: "process-step-1",
                  document_keyword: "QT tuyen dung",
                  content_with_weight: "Bước 1: Đề xuất tuyển dụng.",
                  similarity: 0.82,
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
                  id: "process-full",
                  document_keyword: "QT tuyen dung",
                  content_with_weight:
                    "Bước 1: Đề xuất tuyển dụng. Bước 2: Phê duyệt. Bước 3: Đăng tuyển.",
                  similarity: 0.84,
                },
              ],
            },
          }),
          { status: 200 },
        ),
      );

    const result = await answerHrKnowledgeQuestion(
      "Quy trình tuyển dụng gồm các bước nào?",
      {
        baseUrl: "https://ragflow.test",
        env: { RAGFLOW_API_KEY: "ragflow-secret" },
        fetchImpl,
      },
    );

    expect(result.answer).toContain("Bước 3");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(fetchImpl.mock.calls[1]![1]!.body as string),
    ).toMatchObject({
      dataset_ids: ["3c0ab6d83e0211f19f78ae4b075ab570"],
      page_size: 16,
    });
  });

  it("answers with recruitment context", async () => {
    const result = await answerRecruitmentQuestion("candidate interview");
    expect(result.answer).toContain("Candidate Screening");
  });

  it("answers recruitment questions with ai-recruitment MCP context when configured", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "initialize",
            result: { protocolVersion: "2025-03-26", capabilities: {} },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "search-user-guide",
            result: {
              content: [
                {
                  type: "text",
                  text: "Recruiters can search candidates by name or email in the guide.",
                },
              ],
            },
          }),
          { status: 200 },
        ),
      );

    const result = await answerRecruitmentQuestion("find candidate by email", {
      env: { AI_RECRUITMENT_MCP_AUTH_TOKEN: "mcp-secret" },
      fetchImpl,
      mcpUrl: "http://mcp.test/api/v1/mcp",
    });

    expect(result.answer).toContain(
      "Recruiters can search candidates by name or email",
    );
    expect(result.warnings).toEqual([]);
  });

  it("keeps recruitment answers alive when ai-recruitment MCP fails", async () => {
    const result = await answerRecruitmentQuestion("candidate interview", {
      env: { AI_RECRUITMENT_MCP_AUTH_TOKEN: "mcp-secret" },
      fetchImpl: vi.fn().mockRejectedValue(new Error("network down")),
      mcpUrl: "http://mcp.test/api/v1/mcp",
    });

    expect(result.answer).toContain("Candidate Screening");
    expect(result.warnings).toEqual([
      "AI_RECRUITMENT_MCP_UNAVAILABLE:network down",
    ]);
  });
});
