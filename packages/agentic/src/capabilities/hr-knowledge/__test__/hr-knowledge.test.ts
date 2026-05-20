import { describe, expect, it, vi } from "vitest";
import {
  HR_KNOWLEDGE_CAPABILITY_IDS,
  planHrKnowledgeRetrieval,
  runHrKnowledgeRetrievalPlan,
  verifyHrKnowledgeEvidence,
} from "../index.js";

function ragflowResponse(chunks: unknown[]) {
  return new Response(
    JSON.stringify({
      code: 0,
      data: { chunks },
    }),
    { status: 200 },
  );
}

describe("HR Knowledge capability planner", () => {
  it("plans process and form retrieval for mixed HR knowledge questions", () => {
    const plan = planHrKnowledgeRetrieval(
      "Quy trình tuyển dụng gồm các bước nào và dùng biểu mẫu nào?",
    );

    expect(plan.steps.map((step) => step.capabilityId)).toEqual([
      HR_KNOWLEDGE_CAPABILITY_IDS.retrieveProcess,
      HR_KNOWLEDGE_CAPABILITY_IDS.retrieveForms,
    ]);
    expect(plan.requiresModelAssistance).toBe(false);
  });

  it("runs one safe process repair when retrieved steps look incomplete", async () => {
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

    expect(result.documents[0]?.content).toContain("Bước 3");
    expect(result.warnings).not.toContain("HR_KNOWLEDGE_PROCESS_INCOMPLETE");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(fetchImpl.mock.calls[1]![1]!.body as string),
    ).toMatchObject({
      dataset_ids: ["3c0ab6d83e0211f19f78ae4b075ab570"],
      page_size: 32,
    });
    expect(JSON.parse(fetchImpl.mock.calls[1]![1]!.body as string)).toEqual(
      expect.objectContaining({
        question: expect.stringContaining("Bước 7"),
      }),
    );
    expect(result.evidence.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capabilityId: HR_KNOWLEDGE_CAPABILITY_IDS.retrieveProcess,
          status: "executed",
        }),
      ]),
    );
  });

  it("repairs incomplete process evidence without dropping retrieved form evidence", async () => {
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
            id: "form-doc",
            document_keyword: "NS-02-BM05",
            content_with_weight: "Phiếu yêu cầu tuyển dụng.",
            similarity: 0.83,
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
      query: "Quy trình tuyển dụng gồm các bước nào và dùng biểu mẫu nào?",
      options: {
        baseUrl: "https://ragflow.test",
        env: { RAGFLOW_API_KEY: "ragflow-secret" },
        fetchImpl,
      },
    });

    expect(result.documents.map((document) => document.title)).toEqual([
      "QT tuyen dung",
      "QT tuyen dung",
      "NS-02-BM05",
    ]);
    expect(result.documents[0]?.content).toContain("Bước 3");
    expect(result.documents.at(-1)?.content).toContain(
      "Phiếu yêu cầu tuyển dụng",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("repairs process evidence when a declared total step count is only partially retrieved", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        ragflowResponse([
          {
            id: "process-partial",
            document_keyword: "QT tuyen dung",
            content_with_weight:
              "Tổng số bước: 7. Bước 1: Đề xuất tuyển dụng. Bước 2: Phê duyệt nhu cầu.",
            similarity: 0.86,
          },
        ]),
      )
      .mockResolvedValueOnce(
        ragflowResponse([
          {
            id: "process-full",
            document_keyword: "QT tuyen dung",
            content_with_weight:
              "Tổng số bước: 7. Bước 1: Đề xuất tuyển dụng. Bước 2: Phê duyệt nhu cầu. Bước 3: Đăng tuyển. Bước 4: Sàng lọc CV. Bước 5: Phỏng vấn. Bước 6: Duyệt offer. Bước 7: Tiếp nhận nhân sự.",
            similarity: 0.9,
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
    expect(result.retrievedContext).toContain("Bước 7");
    expect(result.warnings).not.toContain("HR_KNOWLEDGE_PROCESS_INCOMPLETE");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchImpl.mock.calls[1]![1]!.body as string)).toEqual(
      expect.objectContaining({
        page_size: 32,
        question: expect.stringContaining("Bước 7"),
      }),
    );
  });

  it("does not repair when first-pass process chunks already cover the declared steps", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      ragflowResponse([
        {
          id: "process-overview",
          document_id: "qt-tuyen-dung",
          document_keyword: "QT tuyen dung.md",
          content_with_weight: "Quy trình tuyển dụng bao gồm 7 bước chính.",
          similarity: 0.39,
        },
        {
          id: "process-step-list",
          document_id: "qt-tuyen-dung",
          document_keyword: "QT tuyen dung.md",
          content_with_weight:
            "1. Bộ phận có nhu cầu lập đề xuất tuyển dụng. 2. Phòng Nhân sự tổng hợp nhu cầu. 3. Giám đốc xét duyệt đề xuất. 4. Phòng Nhân sự lập kế hoạch tuyển dụng. 5. Phòng Nhân sự triển khai tuyển dụng. 6. Bộ phận liên quan phỏng vấn và đánh giá ứng viên. 7. Phòng Nhân sự tổng hợp kết quả tuyển dụng.",
          similarity: 0.38,
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
    expect(result.warnings).not.toContain("HR_KNOWLEDGE_PROCESS_INCOMPLETE");
    expect(result.retrievedContext).toContain(
      "7. Phòng Nhân sự tổng hợp kết quả tuyển dụng",
    );
    expect(result.documents.map((document) => document.id)).toEqual([
      "process-overview",
      "process-step-list",
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("HR Knowledge evidence verifier", () => {
  it("hard-gates factual answers when evidence is empty", () => {
    const result = verifyHrKnowledgeEvidence({
      query: "Chính sách nghỉ phép thế nào?",
      documents: [],
      plannedCapabilityIds: [HR_KNOWLEDGE_CAPABILITY_IDS.retrieveProcess],
      repairAttempted: false,
    });

    expect(result.blocked).toBe(true);
    expect(result.warnings).toContain("HR_KNOWLEDGE_EVIDENCE_EMPTY");
    expect(result.missingEvidence[0]).toMatchObject({
      severity: "blocking",
      reason: "No HR knowledge documents were retrieved for this question.",
    });
  });

  it("hard-gates incomplete process evidence after the repair budget is used", () => {
    const result = verifyHrKnowledgeEvidence({
      query: "Quy trình tuyển dụng gồm các bước nào?",
      documents: [
        {
          id: "process-step-1",
          title: "QT tuyen dung",
          content: "Bước 1: Đề xuất tuyển dụng.",
          score: 0.82,
        },
      ],
      plannedCapabilityIds: [HR_KNOWLEDGE_CAPABILITY_IDS.retrieveProcess],
      repairAttempted: true,
    });

    expect(result.blocked).toBe(true);
    expect(result.warnings).toContain("HR_KNOWLEDGE_PROCESS_INCOMPLETE");
    expect(result.needsRepair).toBe(false);
  });

  it("requests repair when total process step count is declared but not fully covered", () => {
    const result = verifyHrKnowledgeEvidence({
      query: "Quy trình tuyển dụng gồm các bước nào?",
      documents: [
        {
          id: "process-partial",
          title: "QT tuyen dung",
          content:
            "Tổng số bước: 7. Bước 1: Đề xuất tuyển dụng. Bước 2: Phê duyệt nhu cầu.",
          score: 0.86,
        },
      ],
      plannedCapabilityIds: [HR_KNOWLEDGE_CAPABILITY_IDS.retrieveProcess],
      repairAttempted: false,
    });

    expect(result.blocked).toBe(false);
    expect(result.needsRepair).toBe(true);
    expect(result.warnings).toContain("HR_KNOWLEDGE_PROCESS_INCOMPLETE");
  });

  it("accepts numbered process step lists as complete evidence", () => {
    const result = verifyHrKnowledgeEvidence({
      query: "Quy trình tuyển dụng gồm các bước nào?",
      documents: [
        {
          id: "process-overview",
          title: "QT tuyen dung.md",
          content: "Tổng số bước: 7.",
          score: 0.39,
        },
        {
          id: "process-step-list",
          title: "QT tuyen dung.md",
          content:
            "1. Đề xuất tuyển dụng. 2. Tổng hợp nhu cầu. 3. Xét duyệt đề xuất. 4. Lập kế hoạch. 5. Triển khai tuyển dụng. 6. Phỏng vấn và đánh giá. 7. Tổng hợp kết quả.",
          score: 0.38,
        },
      ],
      plannedCapabilityIds: [HR_KNOWLEDGE_CAPABILITY_IDS.retrieveProcess],
      repairAttempted: true,
    });

    expect(result.blocked).toBe(false);
    expect(result.warnings).not.toContain("HR_KNOWLEDGE_PROCESS_INCOMPLETE");
  });

  it("accepts decimal process step markers as complete evidence", () => {
    const result = verifyHrKnowledgeEvidence({
      query: "Quy trình tuyển dụng gồm các bước nào?",
      documents: [
        {
          id: "process-flow",
          title: "QT tuyen dung.md",
          content:
            "Quy trình bao gồm 3 bước chính. Bước 1.1: Đề xuất tuyển dụng. Bước 2.1: Phê duyệt nhu cầu. BƯỚC 3: Xét duyệt đề xuất.",
          score: 0.39,
        },
      ],
      plannedCapabilityIds: [HR_KNOWLEDGE_CAPABILITY_IDS.retrieveProcess],
      repairAttempted: true,
    });

    expect(result.blocked).toBe(false);
    expect(result.warnings).not.toContain("HR_KNOWLEDGE_PROCESS_INCOMPLETE");
  });
});
