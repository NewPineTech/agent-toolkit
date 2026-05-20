import { describe, expect, it, vi } from "vitest";
import { AGENTIC_MCP_REGISTRY } from "../../constants.js";
import { buildFreeChatContext } from "../free-chat.js";
import { answerHrKnowledgeQuestion } from "../hr-knowledge.js";
import { answerRecruitmentQuestion } from "../recruitment.js";

describe("intent tools", () => {
  function mcpJsonResponse(body: unknown) {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  function createMcpFetch(text: string) {
    return vi.fn(
      async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          id?: string | number;
          method?: string;
        };

        if (body.method === "initialize") {
          return mcpJsonResponse({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              protocolVersion: "2025-03-26",
              capabilities: { tools: {} },
              serverInfo: { name: "ai-recruitment", version: "test" },
            },
          });
        }

        if (body.method === "notifications/initialized") {
          return new Response(null, { status: 202 });
        }

        if (body.method === "tools/list") {
          return mcpJsonResponse({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              tools: [
                {
                  name: "search_user_guide",
                  inputSchema: { type: "object", properties: {} },
                },
              ],
            },
          });
        }

        if (body.method === "tools/call") {
          return mcpJsonResponse({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              content: [{ type: "text", text }],
            },
          });
        }

        return mcpJsonResponse({
          jsonrpc: "2.0",
          id: body.id,
          error: { code: -32601, message: "Unknown method" },
        });
      },
    );
  }

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
      "Quy trình tuyển dụng gồm các bước nào và dùng biểu mẫu nào?",
      {
        baseUrl: "https://ragflow.test",
        env: { RAGFLOW_API_KEY: "ragflow-secret" },
        fetchImpl,
      },
    );

    expect(result.answer).toContain("QT tuyen dung");
    expect(result.answer).toContain("Bước 3");
    expect(result.answer).toContain("NS-02-BM05");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
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
    expect(
      JSON.parse(fetchImpl.mock.calls[2]![1]!.body as string),
    ).toMatchObject({
      dataset_ids: ["3c0ab6d83e0211f19f78ae4b075ab570"],
      page_size: 32,
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
      page_size: 32,
    });
  });

  it("returns retrieval context instead of a hardcoded natural answer when process steps remain incomplete", async () => {
    const fetchImpl = vi
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
      );

    const result = await answerHrKnowledgeQuestion(
      "Quy trình tuyển dụng gồm các bước nào?",
      {
        baseUrl: "https://ragflow.test",
        env: { RAGFLOW_API_KEY: "ragflow-secret" },
        fetchImpl,
      },
    );

    expect(result.blocked).toBe(true);
    expect(result.answer).toBe("");
    expect(result.retrievedContext).toBe("");
    expect(result.documents.map((document) => document.title)).toContain(
      "QT tuyen dung",
    );
  });

  it("answers with recruitment context", async () => {
    const result = await answerRecruitmentQuestion("candidate interview");
    expect(result.answer).toContain("Candidate Screening");
    expect(result.documents[0]?.title).toBe("Candidate Screening");
  });

  it("answers recruitment questions with ai-recruitment MCP context when configured", async () => {
    const fetchImpl = createMcpFetch(
      "Recruiters can search candidates by name or email in the guide.",
    );

    const result = await answerRecruitmentQuestion("find candidate by email", {
      env: { AI_RECRUITMENT_MCP_AUTH_TOKEN: "mcp-secret" },
      fetchImpl,
    });

    expect(result.answer).toContain(
      "Recruiters can search candidates by name or email",
    );
    expect(result.documents[0]?.title).toBe("AI Recruitment MCP");
    expect(result.warnings).toEqual([]);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      AGENTIC_MCP_REGISTRY.aiRecruitment.runtimeTargets.local.endpointUrl,
    );
  });

  it("keeps recruitment answers alive when ai-recruitment MCP fails", async () => {
    const result = await answerRecruitmentQuestion("candidate interview", {
      env: { AI_RECRUITMENT_MCP_AUTH_TOKEN: "mcp-secret" },
      fetchImpl: vi.fn().mockRejectedValue(new Error("network down")),
    });

    expect(result.answer).toContain("Candidate Screening");
    expect(result.warnings).toEqual(["AI_RECRUITMENT_MCP_UNAVAILABLE"]);
  });
});
