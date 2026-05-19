import {
  retrieveRecruitmentContext,
  type RecruitmentRetrieverOptions,
} from "../retrievers/recruitment.js";

export async function answerRecruitmentQuestion(
  query: string,
  options: RecruitmentRetrieverOptions = {},
): Promise<{
  answer: string;
  warnings: string[];
}> {
  try {
    const result = await retrieveRecruitmentContext(query, options);
    const documents = result.documents;

    if (documents.length === 0) {
      return {
        answer:
          "Em chua tim thay du lieu tuyen dung phu hop trong nguon hien tai.",
        warnings: [...result.warnings, "RECRUITMENT_RETRIEVER_EMPTY"],
      };
    }

    return {
      answer: documents
        .map((document) => `${document.title}: ${document.content}`)
        .join("\n"),
      warnings: result.warnings,
    };
  } catch (error) {
    console.warn("[agentic:retriever] recruitment retrieval failed", {
      warningCode: "RECRUITMENT_RETRIEVER_UNAVAILABLE",
      detail: sanitizeRecruitmentRetrieverFailure(error),
    });
    return {
      answer: "Nguon du lieu tuyen dung hien khong san sang.",
      warnings: ["RECRUITMENT_RETRIEVER_UNAVAILABLE"],
    };
  }
}

function sanitizeRecruitmentRetrieverFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(api[_-]?key|token|secret)=([^&\s]+)/gi, "$1=[REDACTED]")
    .slice(0, 500);
}
