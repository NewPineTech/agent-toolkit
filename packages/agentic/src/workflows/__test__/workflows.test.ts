import { afterEach, describe, expect, it, vi } from "vitest";
import { AGENTIC_INTENTS, AGENTIC_MCP_REGISTRY } from "../../constants.js";
import * as modelModule from "../../model.js";
import { freeChatGraph } from "../free-chat.js";
import { hrKnowledgeQaGraph } from "../hr-knowledge-qa.js";
import { hrRecruitmentGraph } from "../hr-recruitment.js";

describe("intent subgraphs", () => {
  const emptyEvidence = {
    retrievedDocuments: [],
    sources: [],
    toolCalls: [],
    missingEvidence: [],
    confidenceSignals: [],
  };

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

  afterEach(() => {
    delete process.env.AI_RECRUITMENT_MCP_AUTH_TOKEN;
    delete process.env.RAGFLOW_API_KEY;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("runs free chat subgraph", async () => {
    const result = await freeChatGraph.invoke({
      message: "hello",
      standaloneQuery: "hello",
    });

    expect(result.workflowResults[0]?.intent).toBe(AGENTIC_INTENTS.freeChat);
    expect(result.workflowResults[0]?.evidence).toEqual(emptyEvidence);
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
    expect(result.workflowResults[0]?.evidence).toMatchObject({
      retrievedDocuments: expect.arrayContaining([
        expect.objectContaining({
          title: "Leave Policy",
        }),
      ]),
      sources: expect.arrayContaining([
        expect.objectContaining({
          name: "Leave Policy",
        }),
      ]),
      toolCalls: expect.arrayContaining([
        expect.objectContaining({
          toolName: "hr_knowledge_retriever",
          status: "executed",
          documentCount: 2,
        }),
        expect.objectContaining({
          capabilityId: "hr_knowledge.retrieve_process",
          status: "executed",
        }),
        expect.objectContaining({
          capabilityId: "hr_knowledge.retrieve_forms",
          status: "executed",
        }),
      ]),
      missingEvidence: [],
    });
  });

  it("uses the HR knowledge prompt for no-evidence answers instead of hardcoded text", async () => {
    process.env.RAGFLOW_API_KEY = "ragflow-secret";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 0, data: { chunks: [] } }), {
          status: 200,
        }),
      ),
    );
    const generateModelResponse = vi
      .spyOn(modelModule, "generateModelResponse")
      .mockResolvedValue({
        content: "model-generated no evidence answer",
        warnings: [],
      });

    const result = await hrKnowledgeQaGraph.invoke({
      message: "Quy trình không tồn tại gồm các bước nào?",
      standaloneQuery: "Quy trình không tồn tại gồm các bước nào?",
    });

    expect(generateModelResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Retriever warnings:"),
      }),
      expect.anything(),
    );
    expect(result.workflowResults[0]?.answer).toBe(
      "model-generated no evidence answer",
    );
    expect(result.workflowResults[0]?.warnings).toContain(
      "HR_KNOWLEDGE_EVIDENCE_EMPTY",
    );
    expect(result.workflowResults[0]?.evidence.missingEvidence).toEqual([
      expect.objectContaining({
        severity: "blocking",
      }),
    ]);
  });

  it("uses the HR knowledge prompt for incomplete process evidence instead of hardcoded text", async () => {
    process.env.RAGFLOW_API_KEY = "ragflow-secret";
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
      .mockResolvedValue({
        content: "model-generated incomplete process answer",
        warnings: [],
      });

    const result = await hrKnowledgeQaGraph.invoke({
      message: "Quy trình tuyển dụng gồm các bước nào?",
      standaloneQuery: "Quy trình tuyển dụng gồm các bước nào?",
    });

    expect(generateModelResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("HR_KNOWLEDGE_PROCESS_INCOMPLETE"),
      }),
      expect.anything(),
    );
    expect(result.workflowResults[0]?.warnings).toContain(
      "HR_KNOWLEDGE_PROCESS_INCOMPLETE",
    );
    expect(result.workflowResults[0]?.answer).toBe(
      "model-generated incomplete process answer",
    );
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
    expect(result.workflowResults[0]?.evidence).toMatchObject({
      retrievedDocuments: expect.arrayContaining([
        expect.objectContaining({
          title: "Candidate Screening",
        }),
      ]),
      sources: expect.arrayContaining([
        expect.objectContaining({
          name: "Candidate Screening",
        }),
      ]),
      toolCalls: [
        expect.objectContaining({
          toolName: "hr_recruitment_retriever",
          status: "executed",
          documentCount: 2,
        }),
      ],
      missingEvidence: [],
    });
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

  it("passes sanitized MCP retrieval context through the HR recruitment graph boundary", async () => {
    process.env.AI_RECRUITMENT_MCP_AUTH_TOKEN = "mcp-secret";
    const fetchImpl = createMcpFetch(
      "Candidates can be searched by name or email.",
    );
    vi.stubGlobal("fetch", fetchImpl);
    const generateModelResponse = vi
      .spyOn(modelModule, "generateModelResponse")
      .mockResolvedValue({ content: "ok", warnings: [] });

    await hrRecruitmentGraph.invoke({
      message: "find candidate by email",
      standaloneQuery: "find candidate by email",
    });

    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      AGENTIC_MCP_REGISTRY.aiRecruitment.runtimeTargets.local.endpointUrl,
    );
    expect(generateModelResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Untrusted MCP retrieved context"),
      }),
      expect.anything(),
    );
    expect(generateModelResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          "Candidates can be searched by name or email.",
        ),
      }),
      expect.anything(),
    );
  });
});
