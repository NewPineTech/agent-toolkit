import { describe, expect, it, vi } from "vitest";
import { planRecruitmentGuideMcp } from "../../capabilities/hr-recruitment/index.js";
import {
  HR_KNOWLEDGE_CAPABILITY_IDS,
  runHrKnowledgeRetrievalPlan,
  verifyHrKnowledgeEvidence,
} from "../../capabilities/hr-knowledge/index.js";
import { retrieveRecruitmentContext } from "../../retrievers/recruitment.js";

function ragflowResponse(chunks: unknown[]) {
  return new Response(
    JSON.stringify({
      code: 0,
      data: { chunks },
    }),
    { status: 200 },
  );
}

describe("agentic golden evals", () => {
  it("repairs process-step retrieval once and keeps the answer grounded", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        ragflowResponse([
          {
            id: "process-step-1",
            document_keyword: "QT tuyen dung",
            content_with_weight: "Bước 1: Đề xuất tuyển dụng.",
            similarity: 0.82,
          },
        ]),
      )
      .mockResolvedValueOnce(
        ragflowResponse([
          {
            id: "process-full",
            document_keyword: "QT tuyen dung",
            content_with_weight:
              "Bước 1: Đề xuất tuyển dụng. Bước 2: Phê duyệt. Bước 3: Đăng tuyển.",
            similarity: 0.84,
          },
        ]),
      );

    const result = await runHrKnowledgeRetrievalPlan({
      query: "Quy trình tuyển dụng gồm các bước nào?",
      options: {
        baseUrl: "https://ragflow.test",
        env: { RAGFLOW_API_KEY: "ragflow-secret" },
        fetchImpl,
      },
    });

    expect(result.blocked).toBe(false);
    expect(result.retrievedContext).toContain("Bước 3");
    expect(result.evidence.missingEvidence).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("preserves form source evidence for form lookup answers", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      ragflowResponse([
        {
          id: "form-doc",
          document_id: "doc-form",
          document_keyword: "NS-02-BM05",
          content_with_weight: "Phiếu yêu cầu tuyển dụng.",
          origin_file_url: "https://docs.test/ns-02-bm05.pdf",
          similarity: 0.83,
        },
      ]),
    );

    const result = await runHrKnowledgeRetrievalPlan({
      query: "Cho em link biểu mẫu tuyển dụng NS-02-BM05",
      options: {
        baseUrl: "https://ragflow.test",
        env: { RAGFLOW_API_KEY: "ragflow-secret" },
        fetchImpl,
      },
    });

    expect(result.blocked).toBe(false);
    expect(result.evidence.sources).toEqual([
      expect.objectContaining({
        name: "NS-02-BM05",
        url: "https://docs.test/ns-02-bm05.pdf",
      }),
    ]);
  });

  it("blocks factual HR answers when evidence is missing", () => {
    const result = verifyHrKnowledgeEvidence({
      query: "Chính sách nghỉ phép thế nào?",
      documents: [],
      plannedCapabilityIds: [HR_KNOWLEDGE_CAPABILITY_IDS.retrieveProcess],
      repairAttempted: false,
    });

    expect(result.blocked).toBe(true);
    expect(result.warnings).toContain("HR_KNOWLEDGE_EVIDENCE_EMPTY");
  });

  it("chooses deterministic recruitment guide tools before model assistance", () => {
    expect(
      planRecruitmentGuideMcp("Liệt kê các trang hướng dẫn").steps[0],
    ).toMatchObject({
      toolName: "list_user_guide_pages",
      arguments: {},
    });
    expect(
      planRecruitmentGuideMcp("Mở trang /jd-cv-matching").steps[0],
    ).toMatchObject({
      toolName: "get_user_guide_page",
      arguments: { slug: "/jd-cv-matching" },
    });
    expect(
      planRecruitmentGuideMcp(
        "Tìm trang phù hợp rồi mở đúng section về email ứng viên",
      ),
    ).toMatchObject({
      requiresModelAssistance: true,
    });
  });

  it("falls back to local recruitment evidence when MCP is unavailable", async () => {
    const result = await retrieveRecruitmentContext("candidate interview", {
      env: { AI_RECRUITMENT_MCP_AUTH_TOKEN: "mcp-secret" },
      fetchImpl: vi.fn().mockRejectedValue(new Error("network down")),
    });

    expect(result.warnings).toEqual(["AI_RECRUITMENT_MCP_UNAVAILABLE"]);
    expect(result.documents[0]).toMatchObject({
      title: "Candidate Screening",
    });
  });
});
