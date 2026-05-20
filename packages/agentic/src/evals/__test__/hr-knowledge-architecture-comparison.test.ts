import { describe, expect, it, vi } from "vitest";
import { answerHrKnowledgeQuestion } from "../../tools/hr-knowledge.js";
import type {
  HrDocumentRetrieverOptions,
  RetrievedDocument,
} from "../../retrievers/hr-docs.js";

type Chunk = {
  id: string;
  document_keyword: string;
  content_with_weight: string;
  origin_file_url?: string;
  similarity?: number;
};

type LegacyMode = "forms" | "process" | "both";

function ragflowResponse(chunks: Chunk[]) {
  return new Response(
    JSON.stringify({
      code: 0,
      data: { chunks },
    }),
    { status: 200 },
  );
}

function chunk(
  id: string,
  documentKeyword: string,
  content: string,
  extra: Partial<Chunk> = {},
): Chunk {
  return {
    id,
    document_keyword: documentKeyword,
    content_with_weight: content,
    similarity: 0.86,
    ...extra,
  };
}

async function runCurrent(query: string, responses: Chunk[][]) {
  const fetchImpl = vi.fn();
  for (const response of responses) {
    fetchImpl.mockResolvedValueOnce(ragflowResponse(response));
  }

  const result = await answerHrKnowledgeQuestion(query, {
    baseUrl: "https://ragflow.test",
    env: { RAGFLOW_API_KEY: "ragflow-secret" },
    fetchImpl,
  });

  return { fetchImpl, result };
}

function runLegacy(query: string, responses: Chunk[][]) {
  const mode = selectLegacyMode(query);
  let cursor = 0;
  const calls: { kind: "process" | "forms"; pageSize?: number }[] = [];

  const retrieveProcess = (options: HrDocumentRetrieverOptions = {}) => {
    calls.push({ kind: "process", pageSize: options.pageSize });
    return mapChunks(responses[cursor++] ?? []);
  };
  const retrieveForms = () => {
    calls.push({ kind: "forms" });
    return mapChunks(responses[cursor++] ?? []);
  };

  let documents: RetrievedDocument[];
  if (mode === "forms") {
    documents = retrieveForms();
  } else if (mode === "process") {
    documents = retrieveLegacyCompleteProcess(retrieveProcess, true);
  } else {
    const processDocuments = retrieveLegacyCompleteProcess(
      retrieveProcess,
      false,
    );
    const formDocuments = retrieveForms();
    documents = dedupeDocuments([...processDocuments, ...formDocuments]);
  }

  return {
    calls,
    documents,
    answer:
      documents.length > 0
        ? documents.map(formatLegacyDocumentContext).join("\n")
        : "Em chua tim thay noi dung HR phu hop trong nguon kien thuc hien tai.",
    warnings: documents.length > 0 ? [] : ["HR_RETRIEVER_EMPTY"],
  };
}

function retrieveLegacyCompleteProcess(
  retrieveProcess: (
    options?: HrDocumentRetrieverOptions,
  ) => RetrievedDocument[],
  allowRetry: boolean,
) {
  const documents = retrieveProcess();
  if (!allowRetry || !shouldLegacyRetryProcessRetrieval(documents)) {
    return documents;
  }

  const expandedDocuments = retrieveProcess({ pageSize: 16 });
  return expandedDocuments.length > 0 ? expandedDocuments : documents;
}

function selectLegacyMode(query: string): LegacyMode {
  const normalized = normalizeSearchText(query);
  const hasProcessSignal = includesAny(normalized, [
    "approval",
    "approver",
    "cac buoc",
    "phe duyet",
    "process",
    "procedure",
    "quy trinh",
    "sop",
    "step",
    "steps",
    "thu tuc",
  ]);
  const hasFormSignal = includesAny(normalized, [
    "bieu mau",
    "code",
    "don",
    "download",
    "form",
    "link",
    "mau",
    "phieu",
    "template",
    "url",
  ]);

  if (hasProcessSignal && hasFormSignal) return "both";
  if (hasFormSignal) return "forms";
  if (hasProcessSignal) return "process";
  return "both";
}

function shouldLegacyRetryProcessRetrieval(
  documents: RetrievedDocument[],
): boolean {
  if (documents.length === 0) return false;

  const combinedContent = documents
    .map((document) => document.content)
    .join("\n")
    .toLowerCase();
  const hasStepOne = /\b(buoc|bước|step)\s*1\b/i.test(combinedContent);
  const hasLaterStep = /\b(buoc|bước|step)\s*[2-9]\b/i.test(combinedContent);

  return documents.length <= 1 && hasStepOne && !hasLaterStep;
}

function mapChunks(chunks: Chunk[]): RetrievedDocument[] {
  return chunks.map((item) => ({
    id: item.id,
    title: item.document_keyword,
    content: item.content_with_weight,
    score: item.similarity ?? 0,
    chunkId: item.id,
    sourceName: item.document_keyword,
    originFileUrl: item.origin_file_url,
  }));
}

function dedupeDocuments(documents: RetrievedDocument[]): RetrievedDocument[] {
  const seen = new Set<string>();
  const result: RetrievedDocument[] = [];

  for (const document of documents) {
    const key =
      document.documentId ??
      document.chunkId ??
      `${document.title}\n${document.content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(document);
  }

  return result;
}

function formatLegacyDocumentContext(document: RetrievedDocument): string {
  const metadata = document.originFileUrl
    ? ` (source_url=${document.originFileUrl})`
    : "";
  return `${document.title}${metadata}: ${document.content}`;
}

function includesAny(normalizedQuery: string, terms: string[]): boolean {
  return terms.some((term) => normalizedQuery.includes(term));
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

describe("HR knowledge architecture comparison evals", () => {
  it("keeps parity with the old architecture for simple policy retrieval", async () => {
    const query = "Chính sách nghỉ phép thế nào?";
    const responses = [
      [
        chunk(
          "leave-process",
          "Leave Policy",
          "Employees can request annual leave through the HR system.",
        ),
      ],
      [
        chunk(
          "leave-form",
          "Leave Policy",
          "Employees can request annual leave through the HR system.",
        ),
      ],
    ];

    const legacy = runLegacy(query, responses);
    const current = await runCurrent(query, responses);

    expect(legacy.warnings).toEqual([]);
    expect(current.result.warnings).toEqual([]);
    expect(current.result.answer).toContain("Leave Policy");
    expect(current.result.answer).toContain("annual leave");
    expect(current.result.blocked).toBe(false);
  });

  it("keeps parity with the old architecture for form lookup source evidence", async () => {
    const query = "Cho em link biểu mẫu NS-02-BM05";
    const responses = [
      [
        chunk("form-doc", "NS-02-BM05", "Phiếu yêu cầu tuyển dụng.", {
          origin_file_url: "https://docs.test/ns-02-bm05.pdf",
        }),
      ],
    ];

    const legacy = runLegacy(query, responses);
    const current = await runCurrent(query, responses);

    expect(legacy.answer).toContain(
      "source_url=https://docs.test/ns-02-bm05.pdf",
    );
    expect(current.result.answer).toContain(
      "source_url=https://docs.test/ns-02-bm05.pdf",
    );
    expect(current.result.answer).toContain("Phiếu yêu cầu tuyển dụng");
    expect(current.result.blocked).toBe(false);
  });

  it("keeps complete process answers unblocked while preserving step evidence", async () => {
    const query = "Quy trình tuyển dụng gồm các bước nào?";
    const responses = [
      [
        chunk(
          "process-full",
          "QT tuyen dung",
          "Tổng số bước: 3. Bước 1: Đề xuất tuyển dụng. Bước 2: Phê duyệt. Bước 3: Đăng tuyển.",
        ),
      ],
    ];

    const legacy = runLegacy(query, responses);
    const current = await runCurrent(query, responses);

    expect(legacy.answer).toContain("Bước 3: Đăng tuyển");
    expect(current.result.answer).toContain("Bước 3: Đăng tuyển");
    expect(current.result.warnings).not.toContain(
      "HR_KNOWLEDGE_PROCESS_INCOMPLETE",
    );
    expect(current.result.blocked).toBe(false);
  });

  it("improves over the old architecture by blocking incomplete declared process evidence without hardcoded answer text", async () => {
    const query = "Quy trình tuyển dụng gồm các bước nào?";
    const responses = [
      [
        chunk(
          "process-partial",
          "QT tuyen dung",
          "Tổng số bước: 7. Bước 1: Đề xuất tuyển dụng. Bước 2: Phê duyệt nhu cầu.",
        ),
      ],
      [
        chunk(
          "process-partial-again",
          "QT tuyen dung",
          "Tổng số bước: 7. Bước 1: Đề xuất tuyển dụng. Bước 2: Phê duyệt nhu cầu.",
        ),
      ],
    ];

    const legacy = runLegacy(query, responses);
    const current = await runCurrent(query, responses);

    expect(legacy.warnings).toEqual([]);
    expect(legacy.answer).toContain("Tổng số bước: 7");
    expect(current.result.blocked).toBe(true);
    expect(current.result.warnings).toContain(
      "HR_KNOWLEDGE_PROCESS_INCOMPLETE",
    );
    expect(current.result.answer).toBe("");
    expect(current.result.documents.map((document) => document.title)).toEqual([
      "QT tuyen dung",
      "QT tuyen dung",
    ]);
    expect(current.fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("improves over the old architecture by repairing process evidence inside mixed process and form questions", async () => {
    const query = "Quy trình tuyển dụng gồm các bước nào và dùng biểu mẫu nào?";
    const responses = [
      [
        chunk(
          "process-partial",
          "QT tuyen dung",
          "Tổng số bước: 4. Bước 1: Đề xuất tuyển dụng.",
        ),
      ],
      [chunk("form-doc", "NS-02-BM05", "Phiếu yêu cầu tuyển dụng.")],
      [
        chunk(
          "process-full",
          "QT tuyen dung",
          "Tổng số bước: 4. Bước 1: Đề xuất tuyển dụng. Bước 2: Phê duyệt. Bước 3: Đăng tuyển. Bước 4: Phỏng vấn.",
        ),
      ],
    ];

    const legacy = runLegacy(query, responses);
    const current = await runCurrent(query, responses);

    expect(legacy.calls).toEqual([{ kind: "process" }, { kind: "forms" }]);
    expect(legacy.answer).not.toContain("Bước 4: Phỏng vấn");
    expect(current.fetchImpl).toHaveBeenCalledTimes(3);
    expect(current.result.answer).toContain("Bước 4: Phỏng vấn");
    expect(current.result.answer).toContain("NS-02-BM05");
    expect(current.result.blocked).toBe(false);
  });

  it("keeps empty retrieval guarded instead of fabricating an answer", async () => {
    const query = "Quy định HR không tồn tại trong knowledge base?";
    const responses: Chunk[][] = [[], []];

    const legacy = runLegacy(query, responses);
    const current = await runCurrent(query, responses);

    expect(legacy.warnings).toEqual(["HR_RETRIEVER_EMPTY"]);
    expect(current.result.blocked).toBe(true);
    expect(current.result.warnings).toContain("HR_KNOWLEDGE_EVIDENCE_EMPTY");
    expect(current.result.answer).toBe("");
  });
});
